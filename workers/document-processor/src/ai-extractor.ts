import axios from 'axios';
import { getSchemaForDocType } from './extraction-schemas.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
const URL = process.env.ORCHESTRATOR_SERVICE_URL ?? 'http://localhost:8001';
export interface ExtractedFacts {
  [key: string]: unknown;
  evidence: Array<{ field: string; page: number; quote: string; grounded?: boolean }>;
  faculty_total?: number;
  student_intake_total?: number;
  land_area_acres?: number;
  stamp_purchase_date?: string;
  deed_execution_date?: string;
  computer_lab_area_sqm?: number;
  library_area_sqm?: number;
  expiry_date?: string;
  noc_date?: string;
}

function classifyExtractionError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'client_timeout';
    const status = error.response?.status;
    if (status === 429) return 'rate_limited';
    if (status !== undefined && status >= 500) return 'bridge_or_provider_failure';
    if (status !== undefined) return 'http_error';
    return 'connection_error';
  }
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
    let candidate: unknown;
    try {
      candidate = JSON.parse(jsonText);
    } catch {
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
    throw error instanceof Error ? error : new Error(message);
  }
}
