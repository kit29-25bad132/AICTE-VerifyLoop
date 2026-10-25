export type ApplicationStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'REVIEW_READY'
  | 'DEFICIENCY_OPEN'
  | 'DEFICIENCY_DEADLINE_EXCEEDED'
  | 'RESOLVED_PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type TrustState =
  | 'VERIFIED_OFFICIAL'
  | 'MISMATCH_DETECTED'
  | 'SOURCE_UNAVAILABLE'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'UNGROUNDED_NEEDS_REVIEW';

export type SLAStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

export interface BoundingCoords {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FindingDTO {
  id: string;
  ruleId: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  trustState: TrustState;
  explanation: string;
  suggestion: string;
  pageNumber?: number;
  boundingCoords?: BoundingCoords;
  isResolved: boolean;
  quote?: string;
}
