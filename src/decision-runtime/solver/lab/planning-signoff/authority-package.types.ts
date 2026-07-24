/**
 * M4-RA-01 Product Approval Package — restricted authoritative scope.
 */

export type AuthorityPackageStatus =
  | 'WAIT'
  | 'DRAFT'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED'
  | 'REVOKED'
  | 'PASS'
  | 'FAIL';

export type AuthorityRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type CanaryTripSelectionMode =
  | 'shadow'
  | 'selected_trips'
  | '5%'
  | '20%'
  | '50%'
  | '100%';

/** First-wave ops only — MOVE_DAY / REPLACE / AUTO_ARRANGE stay excluded. */
export const M4_RA01_DEFAULT_OPERATIONS = [
  'SHIFT',
  'SWAP',
  'SHORTEN',
  'REROUTE',
] as const;

export const M4_RA01_EXCLUDED_OPERATIONS = [
  'MOVE_DAY',
  'REPLACE',
  'AUTO_ARRANGE',
] as const;

export interface AuthorityScope {
  operations: string[];
  excludedOperations: string[];
  tripSelectionMode: CanaryTripSelectionMode;
  destinations: string[];
  maxRiskLevel: AuthorityRiskLevel;
  requiresUserConfirmation: boolean;
  /** Explicit freeze list for pilot */
  forbiddenBehaviors?: string[];
}

export interface AuthorityEvidenceRefs {
  stability: string;
  locality: string;
  gateway: string;
  rollback: string;
}

/**
 * Product-facing approval record (planning-signoff/<date>/authority.json).
 * Gate treats APPROVED|PASS + approved:true as product signoff.
 */
export interface AuthorityApprovalPackage {
  schemaId: 'tripnara.planning_signoff.authority@v1';
  kind: 'authority';
  status: AuthorityPackageStatus;
  approved: boolean;
  approvedAt?: string;
  approvedBy?: string;
  signoffId: string;
  authorityScope: AuthorityScope;
  rollbackProvider: 'neptune-repair';
  evidenceArtifactRefs: AuthorityEvidenceRefs;
  /** Human answers: who owns failure / how to fall back */
  accountability?: {
    failureOwner: string;
    escalation: string;
    rollbackOwner: string;
  };
  detail?: string;
  summary?: string;
}
