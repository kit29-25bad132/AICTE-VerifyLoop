import type { FindingDTO } from '@aicte-verifyloop/shared-types';

export interface RuleInput {
  ruleId: string;
  explanation: string;
  suggestion: string;
}

export { evaluateFacultyRatio } from './rules/faculty-ratio.js';
export { evaluateLandArea } from './rules/land-area.js';
export { evaluateComputerLab, evaluateLibrary } from './rules/infrastructure.js';
export { evaluateFireSafety, evaluateNoc } from './rules/compliance-docs.js';
export { detectGhostFaculty } from './ghost-faculty.js';
export { crossCheckInstitutionName } from './cross-document.js';
export { updateSLAStatuses } from './sla-tracker.js';
export type { RuleResult } from './types.js';
