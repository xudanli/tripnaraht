/**
 * P0 frozen product contract — cross backend / Copilot / Web / Mobile.
 *
 * Ontology → World State → Causal WM → Decision Runtime → Solver → Verification
 * → Plan Version → Ledger → Outcome Reconciliation
 *
 * This is the single read model for the decision card surface.
 */

import type { TemporalImpact } from './temporal-impact.types';
import type { DecisionOutcome, SimulatedOutcomeSnapshot } from './decision-outcome.types';

export const TRAVEL_CAUSAL_DECISION_SCHEMA = 'tripnara.travel_causal_decision@v1' as const;

export type TravelCausalNodeType =
  | 'WEATHER'
  | 'ROUTE'
  | 'ROAD'
  | 'FUEL'
  | 'TEMPORAL'
  | 'HUMAN'
  | 'ACTIVITY'
  | 'BOOKING'
  | 'AGENT_ACTION';

export interface TravelCausalNode {
  id: string;
  type: TravelCausalNodeType;
  label: string;
  state?: Record<string, unknown>;
}

export interface TravelCausalEffectLink {
  effectId: string;
  fromNodeId: string;
  toNodeId: string;
  relation: 'CAUSES' | 'CONSTRAINS' | 'AMPLIFIES';
  /** User-facing step in the chain (zh/en ok as opaque string for P0). */
  summary: string;
  predictedValue?: unknown;
  confidence?: number;
  ruleId?: string;
  ruleVersion?: string;
}

export interface ProposedChange {
  changeType: string;
  targetEntityType: string;
  targetEntityId: string;
  description: string;
  patch?: Record<string, unknown>;
}

export interface Tradeoff {
  dimension: 'TIME' | 'COST' | 'RISK' | 'EXPERIENCE' | 'FATIGUE' | 'FLEXIBILITY';
  direction: 'BETTER' | 'WORSE' | 'NEUTRAL';
  summary: string;
  magnitude?: number;
}

export type ValidationCheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED';

export interface ValidationCheck {
  checkId: string;
  label: string;
  status: ValidationCheckStatus;
  detail?: string;
}

export interface ValidationResult {
  overall: ValidationCheckStatus;
  checks: ValidationCheck[];
  verifiedAt?: string;
}

export interface TravelCausalInterventionOption {
  optionId: string;
  title: string;
  changes: ProposedChange[];
  expectedOutcome: SimulatedOutcomeSnapshot;
  tradeoffs: Tradeoff[];
  validation: ValidationResult;
  recommended?: boolean;
}

export interface TravelCausalRecommendation {
  optionId: string;
  rationale: string[];
}

/**
 * Unified causal decision envelope.
 * Frontend decision card projects from this object only.
 */
export interface TravelCausalDecision {
  schema: typeof TRAVEL_CAUSAL_DECISION_SCHEMA;
  decisionId: string;
  tripId: string;

  /** Short observation for the card ("南岸强风将在下午增强"). */
  observationSummary: string;

  rootCause: TravelCausalNode;
  causalChain: TravelCausalEffectLink[];
  evidenceRefs: string[];

  temporalForecast: TemporalImpact;

  /** Outcome if no intervention is taken. */
  baselineOutcome: SimulatedOutcomeSnapshot;
  /** Narrative of do-nothing consequence (card "什么都不做"). */
  doNothingSummary?: string;

  interventions: TravelCausalInterventionOption[];
  recommendation?: TravelCausalRecommendation;

  /** Optional attached reconciliation record (may be PENDING). */
  outcome?: DecisionOutcome;

  contextHash: string;
  ruleVersion: string;
  modelVersion: string;
  ledgerRef?: string;
  canonicalTraceId?: string;

  createdAt: string;
  worldStateVersion?: string;
}
