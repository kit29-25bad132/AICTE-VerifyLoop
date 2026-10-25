import assert from 'node:assert/strict';
import test from 'node:test';
import { logOperation } from '../trace.js';

/** Captures the console channels the trace writer uses. */
function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  return {
    lines,
    restore: () => {
      console.info = originalInfo;
      console.error = originalError;
    },
  };
}

test('a trace line is single-line JSON with only whitelisted fields', () => {
  const captured = captureConsole();
  try {
    logOperation({
      operation: 'document.extract',
      documentType: 'FACULTY_LIST',
      outcome: 'success',
      durationMs: 1234.7,
      evidenceTotal: 2,
      evidenceGrounded: 2,
    });
  } finally {
    captured.restore();
  }

  assert.equal(captured.lines.length, 1);
  assert.equal(captured.lines[0].includes('\n'), false, 'a trace must be one line');
  const record = JSON.parse(captured.lines[0]);
  assert.deepEqual(
    Object.keys(record).sort(),
    ['at', 'documentType', 'durationMs', 'evidenceGrounded', 'evidenceTotal', 'operation', 'outcome', 'trace'].sort(),
  );
  assert.equal(record.durationMs, 1235, 'duration is rounded');
  assert.equal(record.outcome, 'success');
  assert.equal(Number.isNaN(Date.parse(record.at)), false);
});

test('sensitive material cannot ride along on a trace record', () => {
  const captured = captureConsole();
  try {
    // Callers cannot smuggle extra properties through: only the declared,
    // sanitized shape is serialized.
    logOperation({
      operation: 'document.extract',
      documentType: 'FACULTY_LIST',
      outcome: 'failure',
      durationMs: 5,
      category: 'rate_limited',
      // @ts-expect-error deliberately attempting to smuggle fields
      quote: 'Total faculty strength: 9 — SYNTHETIC PAN ABCDE1234F',
      documentText: 'full source text',
      apiKey: 'sk-test-do-not-log',
      authorization: 'Bearer token',
      error: new Error('raw orm error with query metadata'),
    });
  } finally {
    captured.restore();
  }

  assert.equal(captured.lines.length, 1);
  const line = captured.lines[0];
  const record = JSON.parse(line);
  assert.deepEqual(
    Object.keys(record).sort(),
    ['at', 'category', 'documentType', 'durationMs', 'operation', 'outcome', 'trace'].sort(),
  );
  for (const forbidden of ['Total faculty', 'ABCDE1234F', 'full source text', 'sk-test', 'Bearer', 'orm error']) {
    assert.equal(line.includes(forbidden), false, `trace must not contain ${forbidden}`);
  }
});

test('failures use the error channel and successes the info channel', () => {
  const infoLines: string[] = [];
  const errorLines: string[] = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args: unknown[]) => void infoLines.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => void errorLines.push(args.map(String).join(' '));
  try {
    logOperation({ operation: 'document.process', outcome: 'success', durationMs: 1 });
    logOperation({ operation: 'document.process', outcome: 'failure', durationMs: 1, category: 'terminal_failure' });
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
  assert.equal(infoLines.length, 1);
  assert.equal(errorLines.length, 1);
  assert.equal(JSON.parse(errorLines[0]).category, 'terminal_failure');
});

test('numbers that cannot be represented do not break tracing', () => {
  const captured = captureConsole();
  try {
    logOperation({ operation: 'document.process', outcome: 'success', durationMs: Number.NaN });
    logOperation({ operation: 'document.process', outcome: 'failure', durationMs: -50, category: 'unexpected_error' });
  } finally {
    captured.restore();
  }
  assert.equal(captured.lines.length, 2, 'an unrepresentable duration must not break tracing');
  // JSON has no NaN literal, so it serializes as null rather than throwing.
  assert.equal(JSON.parse(captured.lines[0]).durationMs, null);
  assert.equal(Number.isFinite(JSON.parse(captured.lines[1]).durationMs), true);
  assert.equal(JSON.parse(captured.lines[1]).durationMs, 0, 'negative durations are clamped');
});

test('a hostile trace argument never throws out of the logger', () => {
  const captured = captureConsole();
  try {
    const hostile = {
      operation: 'document.process',
      outcome: 'success' as const,
      get durationMs(): number {
        throw new Error('boom');
      },
    };
    assert.doesNotThrow(() => logOperation(hostile));
  } finally {
    captured.restore();
  }
});
