import type { RuleResult } from '../types.js';
export function evaluateFacultyRatio(facts: { faculty_total?: number; student_intake_total?: number }): RuleResult {
  if (!facts.faculty_total || !facts.student_intake_total) return { ruleId: 'APH_2024_CH2_R2.1', status: 'FAIL', severity: 'CRITICAL', trustState: 'UNGROUNDED_NEEDS_REVIEW', explanation: 'Faculty total or student intake could not be extracted.', suggestion: 'Provide faculty strength and approved intake.' };
  const ratio = facts.student_intake_total / facts.faculty_total;
  return ratio > 20
    ? { ruleId: 'APH_2024_CH2_R2.1', status: 'FAIL', severity: 'CRITICAL', trustState: 'MISMATCH_DETECTED', explanation: `Faculty-Student Ratio is 1:${ratio.toFixed(1)}, exceeding 1:20.`, suggestion: 'Add qualified faculty or reduce intake.' }
    : { ruleId: 'APH_2024_CH2_R2.1', status: 'PASS', severity: 'INFO', trustState: 'VERIFIED_OFFICIAL', explanation: `Faculty-Student Ratio is 1:${ratio.toFixed(1)} — within the 1:20 limit.`, suggestion: '' };
}
