/**
 * Deterministic evidence grounding.
 *
 * Purpose: check that each extracted evidence record is actually supported by
 * the source text the extractor was given, and that its page and field
 * references are valid. This is a *text-support* check only. It does not, and
 * must not, establish document authenticity, legal validity, or regulatory
 * compliance — a quotation being present in a PDF proves nothing about whether
 * that PDF is genuine.
 *
 * Normalization policy (deliberately minimal and exact):
 * - Whitespace runs are collapsed to a single space and the ends trimmed. This
 *   exists only because the parser emits text as separate spans whose joining
 *   introduces spacing differences.
 * - Nothing else is normalized: comparison is case-sensitive, punctuation is
 *   significant, and there is no fuzzy, partial-word, embedding, or semantic
 *   matching. Text that is not present in the source is reported ungrounded.
 */

export type GroundingReason =
  | 'exact_match'
  | 'whitespace_normalized_match'
  | 'quote_not_found'
  | 'page_out_of_range'
  | 'no_page_text'
  | 'unknown_field'
  | 'empty_quote'
  | 'malformed_record';

export interface EvidenceCandidate {
  field?: unknown;
  page?: unknown;
  quote?: unknown;
}

export interface GroundedEvidenceResult {
  field: string;
  page: number;
  quoteLength: number;
  grounded: boolean;
  reason: GroundingReason;
}

export interface GroundingReport {
  results: GroundedEvidenceResult[];
  /** Distinct fact fields with at least one grounded quotation. */
  groundedFields: string[];
  /** Distinct fact fields referenced by evidence that failed grounding. */
  ungroundedFields: string[];
  total: number;
  grounded: number;
  ungrounded: number;
  /** True only when at least one evidence record is grounded. */
  hasGroundedEvidence: boolean;
}

/** Collapse whitespace runs; see the module-level normalization policy. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Top-level field name of an evidence reference.
 *
 * Models naturally cite nested values as `faculty_members.0.name` or
 * `faculty_members[0].name`. Evidence is validated against the schema's
 * top-level field list, so the *root* segment is what must be a declared field;
 * the remaining segments must still be well-formed identifiers or indices.
 */
export function rootFieldName(field: string): string {
  const normalized = field.replace(/\[(\d+)\]/g, '.$1');
  return normalized.split('.')[0]?.trim() ?? '';
}

/** Validates that an evidence field references a declared fact field. */
export function isValidEvidenceField(field: string, allowedFields: readonly string[]): boolean {
  const normalized = field.replace(/\[(\d+)\]/g, '.$1');
  const [root, ...rest] = normalized.split('.');
  if (!root || !allowedFields.includes(root)) return false;
  return rest.every((segment) => /^(?:\d+|[A-Za-z_][A-Za-z0-9_]*)$/.test(segment));
}

function asPageNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value;
}

/**
 * Verifies one evidence record against the source pages.
 *
 * `allowedFields` is the fact-field list for the document type, so evidence
 * cannot cite a field the extraction contract does not define.
 */
export function verifyEvidenceRecord(
  candidate: EvidenceCandidate,
  pages: readonly string[],
  allowedFields: readonly string[],
): GroundedEvidenceResult {
  const field = typeof candidate.field === 'string' ? candidate.field.trim() : '';
  const quote = typeof candidate.quote === 'string' ? candidate.quote : '';
  const page = asPageNumber(candidate.page);
  const base = { field, page: page ?? 0, quoteLength: quote.trim().length };

  if (field.length === 0 || page === null) {
    return { ...base, grounded: false, reason: 'malformed_record' };
  }
  if (!isValidEvidenceField(field, allowedFields)) {
    return { ...base, grounded: false, reason: 'unknown_field' };
  }
  if (typeof candidate.quote !== 'string') {
    return { ...base, grounded: false, reason: 'malformed_record' };
  }
  if (quote.trim().length === 0) {
    return { ...base, grounded: false, reason: 'empty_quote' };
  }
  if (pages.length === 0) {
    return { ...base, grounded: false, reason: 'no_page_text' };
  }
  if (page < 1 || page > pages.length) {
    return { ...base, grounded: false, reason: 'page_out_of_range' };
  }

  const pageText = pages[page - 1] ?? '';
  if (pageText.trim().length === 0) {
    return { ...base, grounded: false, reason: 'no_page_text' };
  }

  const trimmedQuote = quote.trim();
  if (pageText.includes(trimmedQuote)) {
    return { ...base, grounded: true, reason: 'exact_match' };
  }
  if (normalizeWhitespace(pageText).includes(normalizeWhitespace(trimmedQuote))) {
    return { ...base, grounded: true, reason: 'whitespace_normalized_match' };
  }
  return { ...base, grounded: false, reason: 'quote_not_found' };
}

/** Verifies every evidence record and summarizes support per fact field. */
export function verifyEvidenceGrounding(
  evidence: readonly EvidenceCandidate[],
  pages: readonly string[],
  allowedFields: readonly string[],
): GroundingReport {
  const results = evidence.map((candidate) => verifyEvidenceRecord(candidate, pages, allowedFields));
  // Field names are reported by their top-level root so rule lookups (which use
  // schema field names such as `faculty_members`) match nested references too.
  const groundedFields = [...new Set(results.filter((r) => r.grounded).map((r) => rootFieldName(r.field)))].sort();
  const ungroundedFields = [
    ...new Set(results.filter((r) => !r.grounded && r.field.length > 0).map((r) => rootFieldName(r.field))),
  ].sort();
  const grounded = results.filter((r) => r.grounded).length;
  return {
    results,
    groundedFields,
    ungroundedFields,
    total: results.length,
    grounded,
    ungrounded: results.length - grounded,
    hasGroundedEvidence: grounded > 0,
  };
}

/**
 * Returns copies of the evidence records with the verifier's `grounded` flag
 * applied. A flag can only ever be set from the verifier's own result; callers
 * cannot assert grounding themselves.
 */
export function applyGroundingFlags<T extends EvidenceCandidate>(
  evidence: readonly T[],
  report: GroundingReport,
): Array<T & { grounded: boolean }> {
  return evidence.map((record, index) => ({
    ...record,
    grounded: report.results[index]?.grounded === true,
  }));
}
