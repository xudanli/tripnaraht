/**
 * Constraint Evaluation Gateway inputs.
 */

import type { TripPlan } from '../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../trips/decision/world-model';
import type { Rfc001ConstraintAssertion } from '../../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import type { PackRuleConstraintInput } from '../../packs/rules/pack-rule-constraint.types';
import type { WorldStateDataAvailability } from './world-state-completeness';
import type { ConstraintEvaluationMode } from './constraint-assessment.types';
import type { WorldFact } from '../../../travel-context/domain/travel-context.types';
import type { TravelWorldFact } from '../../../travel-ontology/contracts/travel-world-fact.types';
import type {
  DecisionScope,
  ScopeMutationCandidate,
} from '../../contracts/decision-scope.types';

export interface EvaluatePlanInput {
  tripId: string;
  plan: TripPlan;
  worldState: TripWorldState;
  candidateId?: string;
  countryCode?: string;
  /** Optional user id for Trip Constraints SSOT facts */
  userId?: string;
  /** Explicit data-availability markers (Legacy empty arrays default NOT_LOADED). */
  dataAvailability?: WorldStateDataAvailability;
  /** Pre-collected Guardian assertions for this candidate/workspace tick */
  guardianAssertions?: Rfc001ConstraintAssertion[];
  /** Optional pack rule evaluation context */
  packContext?: PackRuleConstraintInput;
  /** Phase 2 — evaluation intent (same kernel, different persistence side-effects) */
  evaluationMode?: ConstraintEvaluationMode;
  /** Phase 2 — skip legacy checker when PLAN_VERIFY projection owns domain rules */
  skipLegacyChecker?: boolean;
  /** Travel Ontology 事实（显式）或 Snapshot world.facts 解析输入 */
  travelWorldFacts?: TravelWorldFact[];
  snapshotWorldFacts?: WorldFact[];
  /**
   * Authority Consistency — DecisionScope for this Decision Run.
   * When set, Gateway verifies shared snapshotId + optional candidate ⊆ scope.
   */
  decisionScope?: DecisionScope;
  /** Explicit snapshotId for Decision / Solver / Verification binding. */
  worldStateSnapshotId?: string;
  /** Candidate mutation under verification (Solver / Verification). */
  scopeMutationCandidate?: ScopeMutationCandidate;
}

export interface EvaluateCandidateInput extends EvaluatePlanInput {
  candidateId: string;
}

export interface EvaluateIssueInput {
  tripId: string;
  problemId: string;
  semanticKey?: string;
  worldState: TripWorldState;
  guardianAssertions?: Rfc001ConstraintAssertion[];
  dataAvailability?: WorldStateDataAvailability;
}
