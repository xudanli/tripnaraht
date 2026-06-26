import type { TripInterventionExpectedEffect } from './trip-intervention.types';

/** Single edge in the causal chain exposed to UI / trust-surface. */
export interface CausalVariableBinding {
  variable: string;
  label: string;
  baseValue?: number;
  projectedValue?: number;
  unit?: string;
}

/** Structured causal narrative for a What-If candidate. */
export interface WhatIfCausalProjection {
  /** Ordered chain, e.g. departure_time → travel_duration → miss_probability */
  causalChain: string[];
  bindings: CausalVariableBinding[];
  primaryDriver?: 'MISS' | 'WAIT' | 'COMPLETION_P10' | 'ONTIME';
}

export type TrustInterventionEffect = TripInterventionExpectedEffect & {
  targetVariable: string;
  label?: string;
};

/** Gate1 Plan B — store in `impactSummary` when JSON-encoded. */
export const PLAN_B_INTERVENTION_PAYLOAD_SCHEMA = 'tripnara/plan-b-intervention/v1' as const;

export interface PlanBInterventionPayloadV1 {
  schema: typeof PLAN_B_INTERVENTION_PAYLOAD_SCHEMA;
  intervention: import('./trip-intervention.types').TripIntervention;
  causalProjection?: WhatIfCausalProjection;
}
