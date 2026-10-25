import type { RuleResult } from '../types.js';
export function evaluateFireSafety(facts: { expiry_date?: string }): RuleResult {
  if (!facts.expiry_date) return { ruleId: 'APH_2024_CH5_R1.1', status: 'FAIL', severity: 'CRITICAL', trustState: 'UNGROUNDED_NEEDS_REVIEW', explanation: 'Fire Safety expiry date not found.', suggestion: 'Upload a valid current certificate.' };
  const expiry = new Date(facts.expiry_date);
  return expiry < new Date() ? { ruleId: 'APH_2024_CH5_R1.1', status: 'FAIL', severity: 'CRITICAL', trustState: 'MISMATCH_DETECTED', explanation: `Certificate expired on ${expiry.toDateString()}.`, suggestion: 'Renew the certificate.' } : { ruleId: 'APH_2024_CH5_R1.1', status: 'PASS', severity: 'INFO', trustState: 'VERIFIED_OFFICIAL', explanation: `Certificate valid until ${expiry.toDateString()}.`, suggestion: '' };
}
export function evaluateNoc(facts: { noc_date?: string }): RuleResult {
  if (!facts.noc_date) return { ruleId: 'APH_2024_CH5_R1.2', status: 'FAIL', severity: 'CRITICAL', trustState: 'UNGROUNDED_NEEDS_REVIEW', explanation: 'NOC date not found.', suggestion: 'Upload a current State Government NOC.' };
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  return new Date(facts.noc_date) < cutoff ? { ruleId: 'APH_2024_CH5_R1.2', status: 'FAIL', severity: 'CRITICAL', trustState: 'MISMATCH_DETECTED', explanation: 'NOC is older than 12 months.', suggestion: 'Obtain a renewed NOC.' } : { ruleId: 'APH_2024_CH5_R1.2', status: 'PASS', severity: 'INFO', trustState: 'VERIFIED_OFFICIAL', explanation: 'NOC is within the required window.', suggestion: '' };
}
