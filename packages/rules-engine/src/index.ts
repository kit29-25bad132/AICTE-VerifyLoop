import type { FindingDTO } from '@aicte-verifyloop/shared-types';

export interface RuleInput {
  ruleId: string;
  explanation: string;
  suggestion: string;
}

export function evaluateRule(input: RuleInput): FindingDTO {
  return {
    id: `${input.ruleId}-finding`,
    ruleId: input.ruleId,
    severity: 'INFO',
    trustState: 'MANUAL_REVIEW_REQUIRED',
    explanation: input.explanation,
    suggestion: input.suggestion,
    isResolved: false,
  };
}
