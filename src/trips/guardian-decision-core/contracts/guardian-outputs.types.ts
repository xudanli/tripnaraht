/**
 * RFC-001 Phase 0 — Guardian structured outputs (propose only; never finalize).
 */

import type {
  AdjustmentRequirement,
  EntityRef,
  Money,
  RecoveryCondition,
} from './entity-ref.types';
import type { PlanOperation } from './plan-operation.types';

export type GuardianActor = 'ABU' | 'DRDRE' | 'NEPTUNE';

export type ConstraintVerdict = 'PASS' | 'WARNING' | 'BLOCK' | 'UNKNOWN';

/** Guardian constraint critic envelope (Abu feasibility / Dr.Dre schedule load) */
export interface Rfc001ConstraintAssertion {
  assertionId: string;
  workspaceId: string;
  actor: Extract<GuardianActor, 'ABU' | 'DRDRE'>;
  targetCandidateId?: string;
  affectedEntityRefs: EntityRef[];
  affectedPlanItemIds: string[];
  verdict: ConstraintVerdict;
  constraintCode: string;
  reasonCodes: string[];
  evidenceRefs: string[];
  ruleVersion: string;
  confidence: number;
  overridable: boolean;
  recoveryConditions?: RecoveryCondition[];
  /** RFC-002 semantic capability when evaluated via pack runtime */
  semanticKey?: string;
  /** Dr.Dre load metrics when actor is DRDRE */
  physicalLoad?: number;
  scheduleStress?: number;
  createdAt: string;
}

/** Dr.Dre — execution cost critic */
export interface Rfc001LoadAssessment {
  assessmentId: string;
  workspaceId: string;
  actor: 'DRDRE';
  targetCandidateId: string;
  affectedTravelerIds: string[];
  physicalLoad: number;
  scheduleStress: number;
  recoveryDeficit: number;
  cognitiveLoad?: number;
  missedWindowProbability?: number;
  weakestMemberScore?: number;
  adjustmentRequirements: AdjustmentRequirement[];
  modelVersion: string;
  inputSnapshotRef: string;
  confidence: number;
  createdAt: string;
}

export type RepairCandidateGenerationMethod =
  | 'ONTOLOGY_EQUIVALENCE'
  | 'ROUTE_REPAIR'
  | 'LOCAL_SUBSTITUTION'
  | 'TEMPLATE'
  | 'LLM_ASSISTED'
  | 'SPLIT_DAY';

export type RepairCandidateStatus =
  | 'PROPOSED'
  | 'VALIDATING'
  | 'VALID'
  | 'INVALID';

/** Neptune — intent-preserving repair candidate (≠ PlanVersion) */
export interface Rfc001RepairCandidate {
  candidateId: string;
  workspaceId: string;
  actor: 'NEPTUNE';
  basePlanVersionId: string;
  replacesPlanItemIds: string[];
  proposedOperations: PlanOperation[];
  preservedIntentRefs: string[];
  degradedIntentRefs: string[];
  lostIntentRefs: string[];
  estimatedIntentPreservation: number;
  estimatedAddedCost: Money;
  estimatedAddedDurationMinutes: number;
  generationMethod: RepairCandidateGenerationMethod;
  evidenceRefs: string[];
  generatorVersion: string;
  status: RepairCandidateStatus;
  createdAt: string;
}
