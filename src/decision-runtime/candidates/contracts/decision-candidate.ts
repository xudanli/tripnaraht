/**
 * Canonical planning candidate — produced by generators, consumed by Decision Core.
 * @see ADR-006-Unified-Decision-Runtime.md
 */

import type { TripPlan } from '../../../trips/decision/plan-model';
import type { PlanVariant } from '../../../trips/decision/services/multi-plan-generator.service';

export type DecisionCandidateSource =
  | 'LEGACY_TRIP_PLANNING'
  | 'NEPTUNE_REPAIR'
  | 'RULE_BASED_REPAIR'
  /** Mapped from SolverResponse — never authoritative write source */
  | 'OR_TOOLS_REPAIR';

export interface DecisionCandidate {
  candidateId: string;
  label: string;
  source: DecisionCandidateSource;
  plan: TripPlan;
  /** Legacy variant metadata when sourced from MultiPlanGenerator */
  legacyVariant?: Pick<PlanVariant, 'id' | 'score' | 'tradeoffs' | 'feasibility'>;
  utilityHint?: number;
  createdAt: string;
}

export interface PlanningContext {
  tripId: string;
  /** When absent, adapter uses minimal DSL from world state dates/budget */
  constraintDsl?: import('../../../trips/decision/constraints/constraint-dsl.types').ConstraintDSL;
  basePlanVersionId?: string;
  worldStateSnapshotId?: string;
  preferenceSnapshotId?: string;
  /** Skip legacy feasibility pre-filter; canonical Gateway owns rejection */
  retainAllCandidates?: boolean;
  /** Guide accept: map TripPlan → ADD_ITEM operations for execute materialization */
  materializeFromTripPlan?: boolean;
  /** Staging HTTP runner — correlate shadow dashboard events */
  experimentRunId?: string;
  experimentId?: string;
  scenarioId?: string;
  /** DECISION_LAB_ENABLED=1 — shadow fault injection for Task D failure scenarios */
  stagingShadowOptions?: {
    shadowError?: string;
    shadowTimeLimitMs?: number;
    inputMismatch?: boolean;
  };
  /** trip.metadata — feeds travel-decision-contract objective weights */
  tripMetadata?: unknown;
  /** trip.pacingConfig — default objective / automation inference */
  pacingConfig?: unknown;
}
