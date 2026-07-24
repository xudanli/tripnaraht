/**
 * SOFT 约束 ↔ compiledWeights 同源 — priority 驱动 canonical 权重 boost
 */

import type { CanonicalObjectiveId } from '../../../decision-runtime/contracts/objective-definition';
import type { TripConstraint } from '../types/trip-constraint.types';
import type { CompiledObjectiveWeights } from '../types/travel-decision-contract.types';
import { softConstraintWeight } from './soft-constraint-priority.util';

const TEMPLATE_CANONICAL_BOOST: Partial<
  Record<string, Partial<Record<CanonicalObjectiveId, number>>>
> = {
  minimize_hotel_changes: { buffer_time: 0.5, total_travel_time: 0.3 },
  budget_soft: { budget_deviation: 1.0 },
  allow_budget_overrun: { budget_deviation: 0.6 },
  elderly_rest: { daily_physical_load: 0.6, buffer_time: 0.4 },
  lunch_time_window: { time_window_satisfaction: 0.7 },
  max_major_pois_per_day: { daily_physical_load: 0.5 },
  daily_free_time: { buffer_time: 0.9 },
  avoid_early: { time_window_satisfaction: 0.5 },
  avoid_backtracking: { total_travel_time: 0.4 },
  prefer_nature_scenery: { interest_match: 0.6 },
  less_shopping: { interest_match: 0.35 },
  sunset_photography: { time_window_satisfaction: 0.85, interest_match: 0.5 },
  aurora_photo: { time_window_satisfaction: 0.85, interest_match: 0.5 },
  prefer_local_food: { interest_match: 0.5 },
  avoid_crowds: { interest_match: 0.35 },
  attractions_over_shopping: { interest_match: 0.45 },
};

function templateIdOf(c: TripConstraint): string | undefined {
  if (c.source.templateId) return c.source.templateId;
  if (c.value && typeof c.value === 'object') {
    const tid = (c.value as Record<string, unknown>).templateId;
    if (typeof tid === 'string' && tid.length > 0) return tid;
  }
  return undefined;
}

function normalizeCanonical(
  raw: Partial<Record<CanonicalObjectiveId, number>>,
): Partial<Record<CanonicalObjectiveId, number>> {
  const entries = Object.entries(raw) as [CanonicalObjectiveId, number][];
  const sum = entries.reduce((acc, [, v]) => acc + v, 0);
  if (sum <= 0) return raw;
  const out: Partial<Record<CanonicalObjectiveId, number>> = {};
  for (const [k, v] of entries) {
    out[k] = Math.round((v / sum) * 1000) / 1000;
  }
  return out;
}

export function mergeSoftConstraintsIntoCompiledWeights(
  base: CompiledObjectiveWeights,
  constraints: TripConstraint[],
): CompiledObjectiveWeights {
  const canonical: Partial<Record<CanonicalObjectiveId, number>> = { ...base.canonical };
  const softPreferences: Record<string, number> = {};

  for (const c of constraints) {
    if (c.type !== 'SOFT' || c.status === 'DISABLED') continue;
    const weight = softConstraintWeight(c.priority ?? 5);
    softPreferences[c.id] = weight;
    const tid = templateIdOf(c);
    if (tid) softPreferences[tid] = weight;
    const boost = tid ? TEMPLATE_CANONICAL_BOOST[tid] : undefined;
    if (!boost) continue;
    for (const [key, factor] of Object.entries(boost)) {
      const id = key as CanonicalObjectiveId;
      canonical[id] = (canonical[id] ?? 0) + weight * (factor as number);
    }
  }

  return {
    legacy: base.legacy,
    canonical: normalizeCanonical(canonical),
    ...(Object.keys(softPreferences).length > 0 ? { softPreferences } : {}),
  };
}
