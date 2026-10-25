import type { RuleResult } from '../types.js';
export function evaluateLandArea(facts: { land_area_acres?: number; stamp_purchase_date?: string; deed_execution_date?: string }): RuleResult {
  if (!facts.land_area_acres) return { ruleId: 'APH_2024_CH2_R3.1', status: 'FAIL', severity: 'CRITICAL', trustState: 'UNGROUNDED_NEEDS_REVIEW', explanation: 'Land area could not be extracted.', suggestion: 'Provide a deed with clearly stated area.' };
  if (facts.land_area_acres < 2.5) return { ruleId: 'APH_2024_CH2_R3.1', status: 'FAIL', severity: 'CRITICAL', trustState: 'MISMATCH_DETECTED', explanation: `Land area is ${facts.land_area_acres} acres; minimum is 2.5 acres.`, suggestion: 'Acquire additional land or provide a corrected deed.' };
  if (facts.stamp_purchase_date && facts.deed_execution_date && new Date(facts.stamp_purchase_date) > new Date(facts.deed_execution_date)) return { ruleId: 'APH_2024_CH2_R1.1', status: 'FAIL', severity: 'CRITICAL', trustState: 'MISMATCH_DETECTED', explanation: 'Stamp purchase date is after deed execution date.', suggestion: 'Submit a correctly dated registered deed.' };
  return { ruleId: 'APH_2024_CH2_R3.1', status: 'PASS', severity: 'INFO', trustState: 'VERIFIED_OFFICIAL', explanation: `Land area is ${facts.land_area_acres} acres.`, suggestion: '' };
}
