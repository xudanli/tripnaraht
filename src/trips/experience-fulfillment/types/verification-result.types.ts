/**
 * Verification Result — PRD §11
 */

export type VerificationStatus =
  | 'PASS'
  | 'PASS_WITH_WARNING'
  | 'REPAIR_REQUIRED'
  | 'BLOCKED'
  | 'UNKNOWN';

export type VerificationScope = 'CANDIDATE' | 'DAY' | 'TRIP';

export type ViolationSeverity = 'HARD' | 'SOFT';

export interface Violation {
  code: string;
  severity: ViolationSeverity;
  message: string;
  entityRef?: { type: string; id?: string };
  evidenceRefs?: string[];
}

export interface Risk {
  code: string;
  message: string;
  likelihood?: number;
  evidenceRefs?: string[];
}

export interface UnknownIssue {
  code: string;
  message: string;
  missingData?: string[];
  evidenceRefs?: string[];
}

export interface VerificationMetrics {
  /** 可行性得分 — 必须与 experience / evidence 分开计算 */
  feasibilityScore?: number;
  evidenceConfidence?: number;
  experienceFulfillmentEstimate?: number;
  scheduleRobustness?: number;
}

export interface RepairInstruction {
  action: string;
  targetId?: string;
  detail?: string;
}

export interface DecisionRequest {
  question: string;
  options?: string[];
  reason: string;
  correlationId?: string;
}

export interface VerificationResult {
  verificationRunId: string;
  status: VerificationStatus;
  scope: VerificationScope;
  hardViolations: Violation[];
  softRisks: Risk[];
  unknowns: UnknownIssue[];
  metrics: VerificationMetrics;
  repairInstructions: RepairInstruction[];
  userDecisionsRequired: DecisionRequest[];
  evidenceRefs: string[];
}
