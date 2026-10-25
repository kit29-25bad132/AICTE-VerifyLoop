# Extraction pipeline (Phase 4)

This document describes the document-extraction path, its component boundaries,
and the guarantees each boundary is responsible for. It is deliberately
descriptive: it states what the code does and does not do, including the points
where a limitation is inherent rather than a defect.

## 1. Flow

```
client ──upload──▶ API route ──enqueue──▶ BullMQ ──▶ worker
                                                     │
                          parser service ◀───────────┤ (page-aware text)
                                                     │
                          orchestrator bridge ◀──────┤ (LLM call, provider policy)
                                                     │
    ai-extractor: parse payload → Zod validation ────┤
    grounding: verify quotations per page ───────────┤
    rules-engine: PASS/FAIL + severity ──────────────┤
    finding-trust: evidence gate on trust state ─────┤
                                                     ▼
                                      Postgres (document, finding)
```

| Component | File | Responsibility |
|---|---|---|
| Supported types | `packages/shared-types/src/document-types.ts` | Authoritative list shared by API and worker |
| API guard | `apps/api/src/documents/doc-type.ts` | Rejects unsupported types before queueing |
| Upload cleanup | `apps/api/src/documents/upload-cleanup.ts` | Removes only the rejecting request's temp files |
| Schemas | `workers/document-processor/src/extraction-schemas.ts` | Per-type Zod contract, fact-field vocabulary |
| Prompt | `workers/document-processor/src/extraction-prompt.ts` | Fact-only, injection-resistant prompt |
| Extractor | `workers/document-processor/src/ai-extractor.ts` | Bridge call, defensive parse, Zod, grounding, trace |
| Grounding | `workers/document-processor/src/grounding.ts` | Deterministic quotation verification |
| Trust gate | `workers/document-processor/src/finding-trust.ts` | Withdraws unsupported `VERIFIED_OFFICIAL` claims |
| Rules | `packages/rules-engine` | PASS/FAIL, severity, mismatch classification |
| Trace | `workers/document-processor/src/trace.ts` | Whitelisted structured log lines |

## 2. Supported document types

`FACULTY_LIST`, `LAND_DEED`, `FLOOR_PLAN`, `FIRE_SAFETY`, `NOC`.

The schema map is exhaustive at compile time: `satisfies Record<SupportedDocumentType, …>`
means adding a type without a schema fails the build. The worker re-checks the
type even though the API already rejected unsupported values, so a direct queue
write cannot bypass validation.

Validation boundaries are deliberate:

- Dates must be real `YYYY-MM-DD` calendar dates. Unparseable printed formats are
  left to the evidence quotation rather than coerced.
- Areas must be positive numbers; counts must be integers.
- Free-text identifiers (for example `PAN`, `survey_number`) keep **no format
  validation**: the authoritative requirements do not define a pattern, and
  rejecting a genuine document for a cosmetic mismatch would be worse than
  passing it to a human reviewer.
- Unknown keys are stripped by the schema object, so a provider cannot inject
  fields into persisted JSON.

## 3. Prompt security

The system prompt is fixed, shared across document types, and contains no
thresholds, rule identifiers, severity levels, or trust labels. Document text is
placed in a delimited data region:

```
<document_text>
<page number="1">
…content with tag-shaped sequences escaped…
</page>
</document_text>
```

Tag-shaped content (`<page …>`, `</document_text>`, including uppercase and
attributed variants) is escaped before insertion, so a document cannot close the
region early or fabricate page markers. Tests cover override instructions, fake
closing delimiters, nested delimiters, fabricated page markers, control
characters, and very long input.

**Limitation:** this is mitigation, not proof. The model still reads adversarial
text; a sufficiently persuasive injection can alter what it *extracts*. The
pipeline is designed so that the damage is bounded — schema validation, page
verification, and the trust gate all run afterwards, and none of them can be
persuaded.

## 4. Grounding semantics

For each evidence record the verifier checks, in order:

1. `field` and `page` are present and well-typed; `page` is an integer.
2. `field`'s **root** segment is a declared fact field for the document type
   (`faculty_members.0.name` and `faculty_members[0].name` are accepted; the
   remaining segments must be identifiers or indices).
3. `quote` is a non-empty string.
4. `1 ≤ page ≤ pages.length`, and that page has non-empty text.
5. The quote occurs in **that page's** text.

Normalization is whitespace-only: runs of whitespace collapse to one space and
ends are trimmed. Comparison is case-sensitive, punctuation-sensitive, and
Unicode-exact (no NFC/NFD folding, no fuzzy or semantic matching). A quote that
spans a page boundary is ungrounded. Diagnostics carry counts and lengths only,
never quotations.

Grounding establishes *textual support only*. A quotation being present proves
nothing about whether the document is authentic, legally valid, or compliant.

## 5. Trust-state transitions

| From (rules engine) | Gate may produce | Condition |
|---|---|---|
| `VERIFIED_OFFICIAL` | unchanged | every fact the rule consumed has a grounded quotation |
| `VERIFIED_OFFICIAL` | `UNGROUNDED_NEEDS_REVIEW` | any consumed fact lacks one, or the rule is unknown and no evidence grounded |
| `MISMATCH_DETECTED` | unchanged | never downgraded or upgraded |
| `SOURCE_UNAVAILABLE` | unchanged | never downgraded or upgraded |
| any other | unchanged | gate is a no-op |

The gate is monotone: it only ever withdraws an unearned `VERIFIED_OFFICIAL`
label. PASS/FAIL and severity are never touched. Rule-to-fact mapping lives in
`RULE_FACT_FIELDS`; an unknown rule falls back to requiring at least one grounded
field, which fails conservatively.

## 6. Failure and retry behaviour

- The extractor makes exactly one bridge call per attempt; BullMQ owns retries
  (`attempts: 3`, exponential backoff from 2s).
- Worker concurrency is 1 with a 360s lock; the extraction timeout defaults to
  300s (`EXTRACTION_TIMEOUT_MS` overrides it) so a call cannot outlive the lock.
- Failure categories are whitelisted: `client_timeout`, `rate_limited`,
  `bridge_or_provider_failure`, `http_error`, `connection_error`, `empty_payload`,
  `non_json_payload`, `schema_validation_failed`, `unexpected_error`.
- A failed extraction throws, so no partial or empty `extractedData` is persisted
  as a successful extraction.
- Findings are written in a single transaction that first deletes this document's
  previous findings, then inserts fresh ones, then sets `PROCESSED`. A retry, a
  stalled-job replay, or a duplicate enqueue therefore cannot accumulate
  duplicate findings, and status never advances without its findings.
- Terminal failure sets `PROCESSING_FAILED`; failed jobs are not retried further.

## 7. Logging and privacy

`logOperation` emits one JSON line with a fixed shape: `operation`,
`documentType`, `outcome`, `durationMs`, `category`, `evidenceTotal`,
`evidenceGrounded`, `at`. Extra properties passed by a caller are dropped. The
writer never throws.

Never logged: document text, quotations, extracted values, PAN or other personal
data, credentials or authorization headers, request bodies, ORM error objects, or
provider/bridge response bodies. Provider failures log a numeric HTTP status and
a category only — an upstream that echoes source text in its error payload
therefore cannot leak it into logs.

Tracing is **log-only**. `langsmith` is declared in the worker package but no
tracing backend is configured or called; nothing depends on a network collector.

## 8. Running the checks

```bash
# unit / contract tests (Node's built-in runner via tsx)
pnpm --filter document-processor test
pnpm --filter @aicte-verifyloop/api test

# typechecks
npx tsc -p packages/shared-types/tsconfig.json --noEmit
npx tsc -p packages/database/tsconfig.json --noEmit
npx tsc -p packages/rules-engine/tsconfig.json --noEmit
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p workers/document-processor/tsconfig.json --noEmit

# web build
pnpm --filter web build
```

Local end-to-end verification needs Postgres, Redis, and the parser service
(`docker compose up -d postgres redis parser`). Set `ORCHESTRATOR_SERVICE_URL` to
the bridge, or to a local stub that returns the documented
`{ data: { raw: "<json string>" } }` shape for deterministic runs. A stub-based
run exercises the real API, queue, worker, parser, validation, grounding and
persistence path, but it is **not** a live-model result and must not be reported
as one.

## 9. External limitation

The configured provider (Gemini free tier) can return `429 RESOURCE_EXHAUSTED`
when its quota is spent, and `503 UNAVAILABLE` under high demand. The protected
orchestrator bridge currently uses `max_attempts=1` and `max_fallbacks=0`, so a
transient upstream error becomes an immediate `502` to the worker, which the
queue then retries. Changing that policy is out of scope without explicit
authorization.
