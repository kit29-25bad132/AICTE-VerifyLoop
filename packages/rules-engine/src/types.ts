export interface RuleResult {
  ruleId: string;
  status: 'PASS' | 'FAIL';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  trustState: string;
  explanation: string;
  suggestion: string;
  pageNumber?: number;
  quote?: string;
}
