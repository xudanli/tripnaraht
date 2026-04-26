import type { Itinerary } from '../interfaces/trip-plan.interface';

export interface FeasibilityResult {
  is_feasible: boolean;
  blocking_reason?: string;
  /** 0..100 (higher = riskier) */
  risk_level: number;
  /** 0..100 (higher = more fatigue) */
  fatigue_score: number;
}

/**
 * L3 proof-carrying violation payload.
 *
 * Slack convention (for downstream reward / pruning):
 * - cmp = 'LEQ' means actual <= limit is required, so slack = limit - actual (negative => violation).
 * - cmp = 'GEQ' means actual >= limit is required, so slack = actual - limit (negative => violation).
 */
export type ConstraintComparator = 'LEQ' | 'GEQ';

export type ConstraintMetric = {
  cmp: ConstraintComparator;
  actual: number;
  limit: number;
  unit: string;
  slack: number;
  /**
   * Optional: physiological→physical mapping parameters (v1).
   * Used when a physical tolerance is dynamically scaled by fatigue/fitness.
   */
  fatigue_weight?: number;
  /** Optional: post-scaling effective limit (same unit as `limit` unless otherwise specified). */
  effective_limit?: number;
};

export type ConstraintEntityRef = {
  type: 'POI' | 'DAY' | 'SEGMENT' | 'BUDGET' | 'DESTINATION' | 'OTHER';
  id?: string;
};

export type ConstraintProofAnchor = {
  /** Stable lemma/policy id (namespace recommended: terrain.*, wind.*, opening_hours.*, visibility.*) */
  constraintId: string;
  /** Optional: specific rule key inside a rule engine */
  ruleId?: string;
  /** Optional: policy pack or version id */
  policyId?: string;
};

export type ConstraintProofEvidence = {
  source: 'DEM' | 'WEATHER' | 'TRANSPORT' | 'OPENING_HOURS' | 'RULE' | 'MODEL';
  refIds?: string[];
  quality?: { confidence01?: number; coverage01?: number; freshnessSec?: number };
};

export type ConstraintViolation = {
  anchor: ConstraintProofAnchor;
  entityRef?: ConstraintEntityRef;
  metric?: ConstraintMetric;
  evidence?: ConstraintProofEvidence;
  scope?: 'LOCAL' | 'GLOBAL';
  suggestedActions?: Array<{ action: 'REPLACE' | 'REORDER' | 'RELAX' | 'ASK_USER' | 'BLOCK'; detail?: string }>;
};

/**
 * Strongly-typed reason codes for repair decisions.
 * Goal: zero-string parsing in offline attribution / RL.
 */
export type RepairReason =
  | 'SUCCESS_APPLIED'
  | 'PATCH_MISSING'
  | 'FATIGUE_SUPPRESSION'
  | 'FATIGUE_EXHAUSTION'
  | 'TERRAIN_F_ROAD_UNFIT'
  | 'COST_EXCEEDS_HARD_LIMIT'
  | 'OSCILLATION_PREVENTION'
  /** Deterministic intake / gate-style block from historical boundary replay (no free-text reason). */
  | 'HISTORICAL_BOUNDARY_HIT';

/**
 * Strongly-typed repair trace for RL / audit / proof observability.
 * v1 focus: tactic-local causal metrics (fatigue→effective_limit scaling).
 */
export type RepairTrace = {
  tacticId: string;
  targetEntity: ConstraintEntityRef;
  applied: boolean;
  metrics: {
    fatigue_score01?: number;
    fatigue_weight: number;
    base_limit: number;
    effective_limit: number;
    actual_cost: number;
    unit: string;
    /** Optional: heuristic experience utility change (negative = loss). RL / clarification gating. */
    utility_delta?: number;
  };
  reason: RepairReason;
  evidence?: { path_fingerprint?: string; segment_id?: string; patch_id?: string; refIds?: string[] };
};

/**
 * Virtual repair trace produced before any itinerary exists (INTAKE simulation).
 * Same shape as RepairTrace plus explicit simulation provenance for RL / audit.
 */
export type SimulatedRepairTrace = RepairTrace & {
  simulation: {
    kind: 'HISTORICAL_BOUNDARY';
    boundary_id: 'fatigue_high_risk' | 'terrain_high_risk' | string;
  };
  /**
   * V1.5 静默：与 REPAIR 启发式对齐的预估体验分变动（通常 ≤0）。
   * 与 `metrics.utility_delta` 同步写入供离线 `utility_prediction_error` 校准；UI 需等误差分布达标后再用。
   */
  estimated_utility_delta?: number;
};

export type FeasibilityFinding = {
  source: 'ITINERARY_VERIFY' | 'EXPERIENCE_EXECUTABILITY' | 'EXPERIENCE_FATIGUE' | 'TERRAIN' | 'EXTREME_RULES';
  severity: 'INFO' | 'WARNING' | 'BLOCK';
  code: string;
  message: string;
  data?: Record<string, unknown>;
  /** Optional proof-carrying payload (avoid lossy text middle-layer). */
  violation?: ConstraintViolation;
};

export interface RouteFeasibilityEngineInput {
  itinerary: Itinerary;
  userProfile?: {
    fitness_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  /**
   * Research evidence / world context from upstream stages.
   * Expected (best-effort):
   * - opening_hours_evidence, transport_evidence (used by itinerary.verify)
   * - world.physical.demEvidence[] (from world.buildContext)
   */
  researchData?: Record<string, unknown>;
  environment?: {
    /** Month 1..12 */
    month?: number;
    /** Optional quantitative weather facts */
    weather?: {
      wind_speed_mps?: number;
    };
  };
}

export interface RouteFeasibilityEngineOutput {
  result: FeasibilityResult;
  findings: FeasibilityFinding[];
  /** Convenient human-readable issues, stable for existing VERIFY output */
  issues: string[];
  /** Optional enriched itinerary (risk tags may be applied in-place) */
  itinerary: Itinerary;
}

