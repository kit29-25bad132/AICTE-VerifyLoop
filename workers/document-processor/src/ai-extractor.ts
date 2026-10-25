import axios from 'axios';
<<<<<<< HEAD
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  FACT_FIELDS_BY_DOCUMENT_TYPE,
  getSchemaForDocumentType,
  type ExtractedFacultyMember,
} from './extraction-schemas.js';
import { buildExtractionPrompt } from './extraction-prompt.js';
import { applyGroundingFlags, verifyEvidenceGrounding, type GroundingReport } from './grounding.js';
import { logOperation } from './trace.js';

/**
 * Worker -> orchestrator bridge client for fact extraction.
 *
 * Boundary rules enforced here:
 * - The prompt is built only by `extraction-prompt.ts` (no compliance logic).
 * - Provider output is parsed defensively and validated with Zod *before* it can
 *   reach persistence; any failure throws, so the job fails rather than being
 *   recorded as a successful empty extraction.
 * - Evidence is verified against the source pages by the deterministic grounding
 *   verifier; the extractor never marks evidence grounded itself.
 */

/** Resolved per call so the endpoint can be overridden without re-importing. */
function bridgeUrl(): string {
  return process.env.ORCHESTRATOR_SERVICE_URL ?? 'http://localhost:8001';
}

/**
 * Request timeout. Defaults to 300s, which stays below the BullMQ lock duration
 * (360s). `EXTRACTION_TIMEOUT_MS` exists so failure/timeout paths can be
 * exercised by tests without waiting minutes.
 */
function extractionTimeoutMs(): number {
  const configured = Number(process.env.EXTRACTION_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 300_000;
}

=======
import { getSchemaForDocType } from './extraction-schemas.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
const URL = process.env.ORCHESTRATOR_SERVICE_URL ?? 'http://localhost:8001';
>>>>>>> origin/dev
export interface ExtractedFacts {
  [key: string]: unknown;
  evidence: Array<{ field: string; page: number; quote: string; grounded?: boolean }>;
  institution_name?: string;
  faculty_total?: number;
  student_intake_total?: number;
  faculty_members?: ExtractedFacultyMember[];
  land_area_acres?: number;
  land_area_sq_meters?: number;
  survey_number?: string;
  lessor_name?: string;
  stamp_purchase_date?: string;
  deed_execution_date?: string;
  total_built_area_sqm?: number;
  computer_lab_area_sqm?: number;
  library_area_sqm?: number;
  expiry_date?: string;
  noc_date?: string;
}

<<<<<<< HEAD
export interface ExtractionResult {
  facts: ExtractedFacts;
  grounding: GroundingReport;
}

/**
 * A provider payload that passed the transport but failed our contract.
 *
 * Carrying the category on the error keeps the failure distinguishable in logs
 * from an unexpected crash, without parsing message strings.
 */
export class ExtractionContractError extends Error {
  constructor(
    message: string,
    readonly category: 'empty_payload' | 'non_json_payload' | 'schema_validation_failed',
  ) {
    super(message);
    this.name = 'ExtractionContractError';
  }
}

/** Whitelisted failure categories; these are the only values ever logged. */
export type ExtractionFailureCategory =
  | 'client_timeout'
  | 'rate_limited'
  | 'bridge_or_provider_failure'
  | 'http_error'
  | 'connection_error'
  | 'empty_payload'
  | 'non_json_payload'
  | 'schema_validation_failed'
  | 'unexpected_error';

function classifyExtractionError(error: unknown): ExtractionFailureCategory {
  if (error instanceof ExtractionContractError) return error.category;
=======
function classifyExtractionError(error: unknown): string {
>>>>>>> origin/dev
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'client_timeout';
    const status = error.response?.status;
    if (status === 429) return 'rate_limited';
    if (status !== undefined && status >= 500) return 'bridge_or_provider_failure';
    if (status !== undefined) return 'http_error';
    return 'connection_error';
  }
<<<<<<< HEAD
  if (error instanceof z.ZodError) return 'schema_validation_failed';
  return 'unexpected_error';
}

/** Strips an optional markdown code fence around a JSON payload. */
export function stripJsonFence(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

/**
 * Extracts facts for one document and grounds the evidence against `pages`.
 *
 * @throws when the document type is unsupported, the document has no text, the
 * bridge fails, the payload is not JSON, or the payload violates the schema.
 */
export async function extractWithAI(pages: readonly string[], docType: string): Promise<ExtractionResult> {
  const schema = getSchemaForDocumentType(docType);
  if (!schema) throw new Error(`No extraction schema configured for document type: ${docType}`);

  const documentType = docType as keyof typeof FACT_FIELDS_BY_DOCUMENT_TYPE;
  const prompt = buildExtractionPrompt(documentType, pages);
  const startedAt = Date.now();

  try {
    const response = await axios.post(
      `${bridgeUrl()}/extract`,
      {
        system_prompt: prompt.systemPrompt,
        user_prompt: prompt.userPrompt,
        output_schema: zodToJsonSchema(schema),
      },
      { timeout: extractionTimeoutMs() },
    );

    const raw = String((response.data as { data?: { raw?: unknown } })?.data?.raw ?? '');
    const jsonText = stripJsonFence(raw);
    if (jsonText.length === 0) {
      throw new ExtractionContractError('Provider returned an empty extraction payload', 'empty_payload');
    }

=======
  return 'unexpected_error';
}

export async function extractWithAI(text: string, docType: string): Promise<ExtractedFacts> {
  const schema = getSchemaForDocType(docType);
  if (!schema) throw new Error(`No extraction schema configured for document type: ${docType}`);
  const startedAt = Date.now();
  try {
    const result = await axios.post(`${URL}/extract`, {
      system_prompt: 'Extract structured facts only. Do not evaluate compliance. Include exact evidence quotes.',
      user_prompt: `Document text:\n${text.slice(0, 15000)}`,
      output_schema: zodToJsonSchema(schema),
    }, { timeout: 300000 });
    const raw = String(result.data?.data?.raw ?? result.data?.text ?? '');
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
>>>>>>> origin/dev
    let candidate: unknown;
    try {
      candidate = JSON.parse(jsonText);
    } catch {
<<<<<<< HEAD
      throw new ExtractionContractError('Provider returned non-JSON extraction content', 'non_json_payload');
    }

    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      throw new ExtractionContractError(
        'Provider extraction did not match the requested schema',
        'schema_validation_failed',
      );
    }
    const facts = parsed.data as ExtractedFacts;

    const grounding = verifyEvidenceGrounding(
      facts.evidence,
      pages,
      FACT_FIELDS_BY_DOCUMENT_TYPE[documentType],
    );
    facts.evidence = applyGroundingFlags(facts.evidence, grounding);

    const durationMs = Date.now() - startedAt;
    console.info(
      `[ai-extractor] extraction succeeded elapsed_ms=${durationMs} evidence=${grounding.grounded}/${grounding.total}`,
    );
    logOperation({
      operation: 'document.extract',
      documentType,
      outcome: 'success',
      durationMs,
      evidenceTotal: grounding.total,
      evidenceGrounded: grounding.grounded,
    });

    return { facts, grounding };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const category = classifyExtractionError(error);
    const message = error instanceof Error ? error.message : 'Extraction failed';
    // Only a numeric HTTP status is reported. Provider/bridge response bodies are
    // never logged: an upstream may echo document text, quotations or personal
    // data back in its error payload, and a log line is not a safe place for it.
    const status = axios.isAxiosError(error) ? (error.response?.status ?? 'none') : 'none';
    console.error(
      `[ai-extractor] extraction failed category=${category} status=${status} elapsed_ms=${durationMs}: ${message}`,
    );
    logOperation({
      operation: 'document.extract',
      documentType,
      outcome: 'failure',
      durationMs,
      category,
    });
=======
      throw new Error('Provider returned non-JSON extraction content');
    }
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error('Provider extraction did not match the requested schema');
    }
    const facts = parsed.data as ExtractedFacts;
    for (const evidence of facts.evidence ?? []) evidence.grounded = text.includes(evidence.quote.trim());
    console.info(`[ai-extractor] extraction succeeded elapsed_ms=${Date.now() - startedAt}`);
    return facts;
  } catch (error) {
    const category = classifyExtractionError(error);
    const message = error instanceof Error ? error.message : 'Extraction failed';
    // The bridge returns a fixed, non-sensitive reason string (e.g. "all configured
    // providers failed"); logging it separates a provider-side failure from a
    // request-contract rejection without exposing provider error bodies.
    const rawDetail = axios.isAxiosError(error) ? (error.response?.data as { detail?: unknown } | undefined)?.detail : undefined;
    const detail = typeof rawDetail === 'string' ? ` detail=${rawDetail.slice(0, 200)}` : '';
    console.error(`[ai-extractor] extraction failed category=${category} elapsed_ms=${Date.now() - startedAt}${detail}: ${message}`);
>>>>>>> origin/dev
    throw error instanceof Error ? error : new Error(message);
  }
}
