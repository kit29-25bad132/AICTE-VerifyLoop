import axios from 'axios';
import { getSchemaForDocType } from './extraction-schemas.js';
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
export async function extractWithAI(text: string, docType: string): Promise<ExtractedFacts | null> {
  const schema = getSchemaForDocType(docType); if (!schema) return null;
  try {
    const result = await axios.post(`${URL}/extract`, { system_prompt: 'Extract structured facts only. Do not evaluate compliance. Include exact evidence quotes.', user_prompt: `Document text:\n${text.slice(0, 15000)}`, output_schema: {} }, { timeout: 120000 });
    const facts = (result.data?.data ?? result.data) as ExtractedFacts;
    for (const evidence of facts.evidence ?? []) evidence.grounded = text.includes(evidence.quote.trim());
    return facts;
  } catch (error) { console.error('[ai-extractor] extraction failed', error); return null; }
}
