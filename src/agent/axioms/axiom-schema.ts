import type { ClarificationAnswer } from '../interfaces/clarification.interface';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

export type AxiomSeverity = 'P0' | 'P1' | 'P2';

export type AxiomMatchSource = 'INTENT_SIGNAL' | 'HEURISTIC' | 'CLARIFICATION';

export interface AxiomMetricDetails {
  actual: number;
  limit: number;
  unit: string;
  cmp: 'GEQ' | 'LEQ' | 'EQ';
  slack: number;
}

export interface AxiomUtilityAnchor {
  /** Expected penalty from simulation side (negative number). */
  expected_penalty: number;
  /** Actual penalty from real side (negative number). */
  actual_penalty: number;
  /** Allowed absolute difference between expected and actual. */
  tolerance: number;
}

export interface AxiomSchema {
  axiom_id: string;
  /** Constraint id used for dominant_cid attribution and L3 evidence. */
  cid: string;
  /** Label that should appear in simulated reasons set. */
  sim_label: string;
  /** Label that should appear in real reasons set. */
  real_label: string;
  severity: AxiomSeverity;
  /** Evidence fields required to consider this axiom “proof-carrying”. */
  evidence_schema: string[];
  utility_anchor: AxiomUtilityAnchor;
}

export type AxiomId = 'TERRAIN_F_ROAD_UNFIT' | 'FATIGUE_OVERLOAD' | 'ETA_INFEASIBLE';

/** Per-axiom evidence contract enforced by axiom-evidence-validator (dev warn / test throw). */
export interface AxiomSchemaValidationRule {
  /** Fields required on evidence.metric_details. */
  requiredMetricFields: Array<keyof AxiomMetricDetails | string>;
  /** Fields required on evidence.proof_payload. */
  requiredPayloadFields: string[];
}

export const AXIOM_VALIDATION_REGISTRY: Record<AxiomId, AxiomSchemaValidationRule> = {
  TERRAIN_F_ROAD_UNFIT: {
    requiredMetricFields: ['actual', 'limit', 'unit'],
    requiredPayloadFields: ['vehicle_type_actual', 'froad_signals'],
  },
  FATIGUE_OVERLOAD: {
    requiredMetricFields: ['actual', 'limit', 'unit'],
    requiredPayloadFields: [
      'pure_driving_minutes',
      'max_single_day_driving_minutes',
      'trigger_reason',
    ],
  },
  ETA_INFEASIBLE: {
    requiredMetricFields: ['actual', 'limit', 'unit'],
    requiredPayloadFields: ['trigger_reason'],
  },
};

/** Normalized evidence on a match result (flat for JSON logs + L3 proof). */
export interface AxiomMatchEvidence {
  match_source: AxiomMatchSource;
  metric_details: AxiomMetricDetails;
  proof_payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export type { ClarificationAnswer, TripPlanRequest };
