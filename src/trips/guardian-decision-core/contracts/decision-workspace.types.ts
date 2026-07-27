/**
 * RFC-001 Phase 0 — short-lived decision workspace (not execution truth).
 */

import type { Rfc001ConstraintAssertion } from './guardian-outputs.types';
import type { Rfc001LoadAssessment } from './guardian-outputs.types';
import type { Rfc001RepairCandidate } from './guardian-outputs.types';
import type { RoadTraversabilityAssessment } from '../assessment/road-traversability.types';
import type { OrtToolsEvaluateShadowAttachment } from '../../../decision-runtime/solver/bridge/ortools-road-evaluate-shadow.bridge';

export type DecisionWorkspaceStatus =
  | 'COLLECTING'
  | 'READY_FOR_FINALIZE'
  | 'FINALIZED'
  | 'STALE'
  | 'ABANDONED';

export interface RoadTraversabilityWorkspaceSnapshot {
  roadId: string;
  segmentId?: string;
  assessment: RoadTraversabilityAssessment;
  assessorVersion: string;
  evaluatedAt: string;
}

export interface DecisionWorkspace {
  workspaceId: string;
  problemId: string;
  basePlanVersionId: string;
  worldStateSnapshotId: string;
  preferenceSnapshotId: string;
  constraintAssertions: Rfc001ConstraintAssertion[];
  loadAssessments: Rfc001LoadAssessment[];
  repairCandidates: Rfc001RepairCandidate[];
  /**
   * ADR-008 — OR-Tools shadow on evaluate path (never authoritative).
   * Neptune remains the authority repairCandidates set.
   */
  ortoolsShadow?: OrtToolsEvaluateShadowAttachment;
  /**
   * Authority Consistency — DecisionScope bound to worldStateSnapshotId.
   * Optional; Gateway / Verification consume when present.
   */
  decisionScope?: import('../../../decision-runtime/contracts/decision-scope.types').DecisionScope;
  /** T1 — frozen traversability verdict for causal lineage / impact chain */
  roadTraversability?: RoadTraversabilityWorkspaceSnapshot;
  createdAt: string;
  expiresAt?: string;
  revision: number;
  status: DecisionWorkspaceStatus;
}
