import type { GovernancePressureField } from '../governance-activation.types';

/** Narrow shape compatible with {@link AgentTurnPreferenceWeightsV1} (avoid agent↔governance import cycle). */
export type GovernancePreferenceWeightsLike = {
  max_extra_cost_usd?: number;
  max_delay_minutes?: number;
  cost_sensitivity?: number;
  time_sensitivity?: number;
  effort_sensitivity?: number;
};

/**
 * Heuristic v1: high world/weather pressure down-weights aggressive pacing preferences
 * (proxy for long-distance / night / heavy-vehicle bias without new preference fields).
 */
export function applyGovernancePressureToPreferenceWeights(
  weights: GovernancePreferenceWeightsLike | null,
  pressure: GovernancePressureField,
): GovernancePreferenceWeightsLike | null {
  if (!weights) return null;
  const weather = pressure.weather ?? pressure.worldPressure;
  const blend = Math.max(pressure.executionPressure, pressure.policyPressure) * 0.25 + weather * 0.75;
  const dampen = 1 - 0.35 * blend;
  const nightCamperDampen = 1 - 0.2 * blend;
  return {
    ...weights,
    time_sensitivity: scale01(weights.time_sensitivity, dampen),
    effort_sensitivity: scale01(weights.effort_sensitivity, nightCamperDampen),
    cost_sensitivity: scale01(weights.cost_sensitivity, 1 - 0.12 * blend),
  };
}

function scale01(v: number | undefined, factor: number): number | undefined {
  if (v === undefined) return undefined;
  return Math.max(0, Math.min(1, v * factor));
}
