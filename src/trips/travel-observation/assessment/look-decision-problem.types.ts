/**
 * S4 — Look-local DecisionProblem projection.
 * Aligns with Decision Semantics V1.5 types; does not write PlanVersion.
 */

import type {
  AssessmentStatus,
  DecisionProblemKind,
  VerificationStatus,
} from '../observation.types';

export type LookPreviewCorridor =
  | 'DECISION'
  | 'REPAIR'
  | 'ARRANGE_UWC'
  | 'NAVIGATION'
  | 'UNSUPPORTED';

export interface LookDecisionProblem {
  problemId: string;
  tripId: string;
  observationId: string;
  assessmentId: string;
  assessmentRevision: number;
  type: DecisionProblemKind;
  semanticKey: string;
  title: string;
  description: string;
  status: 'OPEN' | 'WAITING_DECISION' | 'DISMISSED' | 'RESOLVED';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** detectedBy = USER for field observations */
  detectedBy: 'USER';
  detectedAt: string;
  assessmentStatus: AssessmentStatus;
  verificationStatus: VerificationStatus;
  evidenceIds: string[];
  /** Opaque preview entry — never an Apply command */
  preview: {
    corridor: LookPreviewCorridor;
    previewRef: string;
    label: string;
  };
  /** Maps toward OFFICIAL_IS_FROAD_2WD / etc. when applicable */
  constraintBridgeKey?: string;
  writesPlanVersion: false;
}

export interface LookDecisionProblemUpsertInput {
  tripId: string;
  observationId: string;
  assessmentId: string;
  assessmentRevision: number;
  type: DecisionProblemKind;
  semanticKey: string;
  title: string;
  description: string;
  assessmentStatus: AssessmentStatus;
  verificationStatus: VerificationStatus;
  evidenceIds: string[];
  urgency?: LookDecisionProblem['urgency'];
  constraintBridgeKey?: string;
  preview: LookDecisionProblem['preview'];
  /** Prefer RFC/idempotent id when projecting into Decision Gateway */
  preferredProblemId?: string;
}
