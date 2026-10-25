import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { extractWithAI, stripJsonFence } from '../ai-extractor.js';
import { applyGroundingGate } from '../finding-trust.js';
import type { RuleResult } from '@aicte/rules-engine';

const PAGES = ['SYNTHETIC PILOT INSTITUTE. Total faculty strength: 9. Total sanctioned student intake: 480.'];

interface Stub {
  url: string;
  requests: number;
  lastBody: any;
  close: () => Promise<void>;
}

/** Local stand-in for the orchestrator bridge (no provider calls, no cost). */
async function startStub(handler: (res: http.ServerResponse) => void): Promise<Stub> {
  const state = { requests: 0, lastBody: undefined as unknown };
  const server = http.createServer((req, res) => {
    state.requests += 1;
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      try {
        state.lastBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        state.lastBody = null;
      }
      handler(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    get requests() {
      return state.requests;
    },
    get lastBody() {
      return state.lastBody;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function replyJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function withStub<T>(handler: (res: http.ServerResponse) => void, run: (stub: Stub) => Promise<T>): Promise<T> {
  const stub = await startStub(handler);
  const previous = process.env.ORCHESTRATOR_SERVICE_URL;
  process.env.ORCHESTRATOR_SERVICE_URL = stub.url;
  try {
    return await run(stub);
  } finally {
    if (previous === undefined) delete process.env.ORCHESTRATOR_SERVICE_URL;
    else process.env.ORCHESTRATOR_SERVICE_URL = previous;
    delete process.env.EXTRACTION_TIMEOUT_MS;
    await stub.close();
  }
}

test('fenced JSON from the bridge is parsed, validated and grounded', async () => {
  const raw = '```json\n' + JSON.stringify({
    institution_name: 'SYNTHETIC PILOT INSTITUTE',
    faculty_total: 9,
    student_intake_total: 480,
    evidence: [
      { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 9.' },
      { field: 'student_intake_total', page: 1, quote: 'Total sanctioned student intake: 480.' },
    ],
  }) + '\n```';

  await withStub(
    (res) => replyJson(res, 200, { data: { raw }, provider: 'gemini', model: 'stub' }),
    async (stub) => {
      const { facts, grounding } = await extractWithAI(PAGES, 'FACULTY_LIST');
      assert.equal(facts.faculty_total, 9);
      assert.equal(grounding.total, 2);
      assert.equal(grounding.grounded, 2);
      assert.deepEqual(facts.evidence.map((item) => item.grounded), [true, true]);
      // The bridge contract received only the documented fields.
      assert.deepEqual(Object.keys(stub.lastBody).sort(), ['output_schema', 'system_prompt', 'user_prompt']);
      assert.match(stub.lastBody.system_prompt, /fact-extraction component/i);
      assert.ok(stub.lastBody.output_schema.properties.evidence, 'output schema must be transmitted');
    },
  );
});

test('non-JSON provider output is rejected', async () => {
  await withStub(
    (res) => replyJson(res, 200, { data: { raw: 'Here are the facts you asked for.' } }),
    async () => {
      await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /non-JSON/i);
    },
  );
});

test('an empty provider payload is rejected instead of persisted as an empty success', async () => {
  await withStub(
    (res) => replyJson(res, 200, { data: { raw: '   ' } }),
    async () => {
      await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /empty extraction payload/i);
    },
  );
});

test('schema violations are rejected before persistence', async () => {
  const raw = JSON.stringify({
    faculty_total: 'nine hundred',
    evidence: [{ field: 'faculty_total', page: 1, quote: 'Total faculty strength: 9.' }],
  });
  await withStub(
    (res) => replyJson(res, 200, { data: { raw } }),
    async () => {
      await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /did not match the requested schema/i);
    },
  );
});

test('a provider/bridge failure propagates as a thrown error', async () => {
  await withStub(
    (res) => replyJson(res, 502, { detail: 'all configured providers failed' }),
    async () => {
      await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /502/);
    },
  );
});

test('a provider timeout propagates as a thrown error', async () => {
  process.env.EXTRACTION_TIMEOUT_MS = '120';
  await withStub(
    (res) => {
      setTimeout(() => replyJson(res, 200, { data: { raw: '{}' } }), 600);
    },
    async () => {
      await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /timeout/i);
    },
  );
});

test('unsupported document types fail before any provider request', async () => {
  await withStub(
    (res) => replyJson(res, 200, { data: { raw: '{}' } }),
    async (stub) => {
      await assert.rejects(extractWithAI(PAGES, 'UNSUPPORTED_TYPE'), /No extraction schema configured/i);
      assert.equal(stub.requests, 0, 'no provider call may be made for an unsupported type');
    },
  );
});

test('a fabricated quotation is ungrounded and cannot yield VERIFIED_OFFICIAL', async () => {
  const raw = JSON.stringify({
    faculty_total: 9,
    student_intake_total: 480,
    evidence: [
      { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 9.' },
      { field: 'student_intake_total', page: 1, quote: 'Total sanctioned student intake: 4800' },
    ],
  });
  await withStub(
    (res) => replyJson(res, 200, { data: { raw } }),
    async () => {
      const { facts, grounding } = await extractWithAI(PAGES, 'FACULTY_LIST');
      assert.equal(grounding.grounded, 1);
      assert.equal(grounding.ungrounded, 1);
      assert.deepEqual(facts.evidence.map((item) => item.grounded), [true, false]);

      const engineVerdict: RuleResult = {
        ruleId: 'APH_2024_CH2_R2.1',
        status: 'PASS',
        severity: 'INFO',
        trustState: 'VERIFIED_OFFICIAL',
        explanation: 'Faculty-Student Ratio is 1:53.3',
        suggestion: '',
      };
      const gated = applyGroundingGate(engineVerdict, new Set(grounding.groundedFields));
      assert.equal(gated.trustState, 'UNGROUNDED_NEEDS_REVIEW', 'ungrounded intake input must block VERIFIED_OFFICIAL');
    },
  );
});

test('a rate-limit response is classified without retrying inside the extractor', async () => {
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => void messages.push(args.map(String).join(' '));
  try {
    await withStub(
      (res) => replyJson(res, 429, { detail: 'quota exhausted' }),
      async (stub) => {
        await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /429/);
        assert.equal(stub.requests, 1, 'the extractor makes exactly one attempt; queue policy owns retries');
      },
    );
  } finally {
    console.error = originalError;
  }
  const failureLine = messages.find((line) => line.includes('extraction failed')) ?? '';
  assert.match(failureLine, /category=rate_limited/);
  for (const forbidden of ['Total faculty', 'SYNTHETIC PILOT INSTITUTE.', 'quota exhausted']) {
    assert.equal(failureLine.includes(forbidden), false, `failure log must not contain ${forbidden}`);
  }
});

test('an upstream 503 is classified as a bridge/provider failure', async () => {
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => void messages.push(args.map(String).join(' '));
  try {
    await withStub(
      (res) => replyJson(res, 503, { detail: 'This model is currently experiencing high demand' }),
      async () => {
        await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /503/);
      },
    );
  } finally {
    console.error = originalError;
  }
  const failureLine = messages.find((line) => line.includes('extraction failed')) ?? '';
  assert.match(failureLine, /category=bridge_or_provider_failure/);
  assert.equal(failureLine.includes('Total faculty'), false);
});

test('a schema mismatch is classified separately from a transport failure', async () => {
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => void messages.push(args.map(String).join(' '));
  try {
    await withStub(
      (res) => replyJson(res, 200, { data: { raw: JSON.stringify({ evidence: 'not-an-array' }) } }),
      async () => {
        await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /did not match the requested schema/i);
      },
    );
  } finally {
    console.error = originalError;
  }
  const failureLine = messages.find((line) => line.includes('extraction failed')) ?? '';
  assert.match(failureLine, /category=schema_validation_failed/);
});

test('a transient failure recovers on the next attempt', async () => {
  const good = JSON.stringify({
    faculty_total: 9,
    student_intake_total: 480,
    evidence: [
      { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 9.' },
      { field: 'student_intake_total', page: 1, quote: 'Total sanctioned student intake: 480.' },
    ],
  });
  let attempt = 0;
  await withStub(
    (res) => {
      attempt += 1;
      if (attempt === 1) replyJson(res, 503, { detail: 'high demand' });
      else replyJson(res, 200, { data: { raw: good } });
    },
    async (stub) => {
      await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'), /503/, 'first attempt fails');
      const recovered = await extractWithAI(PAGES, 'FACULTY_LIST');
      assert.equal(stub.requests, 2);
      assert.equal(recovered.grounding.grounded, 2);
      assert.equal(recovered.facts.faculty_total, 9);
      assert.deepEqual(recovered.facts.evidence.map((item) => item.grounded), [true, true]);
    },
  );
});

test('provider bodies are not echoed into failure logs', async () => {
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => void messages.push(args.map(String).join(' '));
  try {
    await withStub(
      (res) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        // A hostile/buggy upstream echoing source text back.
        res.end(JSON.stringify({ detail: 'failed', echo: PAGES[0], quote: 'SYNTHETIC PAN ABCDE1234F' }));
      },
      async () => {
        await assert.rejects(extractWithAI(PAGES, 'FACULTY_LIST'));
      },
    );
  } finally {
    console.error = originalError;
  }
  const joined = messages.join('\n');
  assert.equal(joined.includes('Total faculty strength'), false, 'source text must not be logged');
  assert.equal(joined.includes('ABCDE1234F'), false, 'personal data must not be logged');
});

test('stripJsonFence handles plain, fenced and BOM-prefixed payloads', () => {
  assert.equal(stripJsonFence('{"a":1}'), '{"a":1}');
  assert.equal(stripJsonFence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripJsonFence('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripJsonFence('\uFEFF{"a":1}'), '{"a":1}');
});
