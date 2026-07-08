/**
 * OptimizationProblem — assembler output consumed by Decision Core and strategies.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { CanonicalWorldStateSnapshot } from './world-state-snapshot';
import type { ObjectiveProfile } from './objective-definition';
import type { ConstraintEvaluation } from './constraint-evaluation';

export type OptimizationPhase = 'PLANNING' | 'EXECUTION';

export type DisruptionScope = 'LOCAL' | 'STRUCTURAL';

export interface OptimizationProblemProfile {
  phase: OptimizationPhase;
  poiCount: number;
  dayCount: number;
  memberCount: number;
  enabledObjectiveCount: number;
  disruptionScope?: DisruptionScope;
  /** 0–1 aggregate data completeness score */
  dataCompleteness: number;
}

export interface SolverBudget {
  timeLimitMs: number;
  maxCandidates?: number;
  maxRepairDepth?: number;
  proveOptimality?: boolean;
}

export interface OptimizationProblem {
  schemaId: 'tripnara.optimization_problem@v1';
  problemId: string;
  tripId: string;
  snapshotId: string;
  createdAt: string;

  snapshot: CanonicalWorldStateSnapshot;
  profile: OptimizationProblemProfile;
  objectiveProfile: ObjectiveProfile;

  /** Base plan + repair candidates — generators only, not authoritative */
  candidates: DecisionCandidate[];
  baseCandidateId?: string;

  /** Pre-optimization constraint report (primary / aggregate) */
  constraintReport: CanonicalConstraintReport;

  /** Per-candidate reports when available */
  constraintReportsByCandidateId?: Record<string, CanonicalConstraintReport>;

  /** L1 mandatory evaluations — must pass before L2–L5 optimization */
  mandatoryEvaluations: ConstraintEvaluation[];

  /** Pinned for reproducibility (decision-lab + production) */
  objectiveRegistryVersion: string;
  constraintPolicyVersion: string;

  /** Guide accept / execute materialization path */
  materializeFromTripPlan?: boolean;
}
