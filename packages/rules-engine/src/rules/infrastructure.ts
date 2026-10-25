import type { RuleResult } from '../types.js';
function area(value: number | undefined, min: number, id: string, label: string): RuleResult {
  if (!value) return { ruleId: id, status: 'FAIL', severity: 'WARNING', trustState: 'UNGROUNDED_NEEDS_REVIEW', explanation: `${label} area not found.`, suggestion: 'Upload a clearly labelled floor plan.' };
  if (value < min) return { ruleId: id, status: 'FAIL', severity: 'CRITICAL', trustState: 'MISMATCH_DETECTED', explanation: `${label} area is ${value} sq.m; minimum is ${min}.`, suggestion: 'Provide an updated architect-certified floor plan.' };
  return { ruleId: id, status: 'PASS', severity: 'INFO', trustState: 'VERIFIED_OFFICIAL', explanation: `${label} meets the ${min} sq.m requirement.`, suggestion: '' };
}
export const evaluateComputerLab = (facts: { computer_lab_area_sqm?: number }) => area(facts.computer_lab_area_sqm, 66, 'APH_2024_CH2_R4.1', 'Computer lab');
export const evaluateLibrary = (facts: { library_area_sqm?: number }) => area(facts.library_area_sqm, 75, 'APH_2024_CH2_R4.2', 'Library');
