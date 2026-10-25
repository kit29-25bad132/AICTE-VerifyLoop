import type { RuleResult } from './types.js';
export function crossCheckInstitutionName(docs: Record<string, { institution_name?: string } | undefined>): RuleResult[] {
  const names = Object.values(docs).map((doc) => doc?.institution_name).filter(Boolean);
  return new Set(names).size > 1 ? [{ ruleId: 'CROSS_DOC_NAME_MISMATCH', status: 'FAIL', severity: 'CRITICAL', trustState: 'MISMATCH_DETECTED', explanation: 'Institution name differs across documents.', suggestion: 'Use an identical institution name across all documents.' }] : [];
}
