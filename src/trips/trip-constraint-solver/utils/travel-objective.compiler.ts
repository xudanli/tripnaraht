/**
 * 旅行原则排序 → 多目标优化权重编译器
 */

import type { CanonicalObjectiveId } from '../../../decision-runtime/contracts/objective-definition';
import {
  DEFAULT_OBJECTIVE_WEIGHTS,
  type ObjectiveFunctionWeights,
} from '../../decision/optimization/objective-function.interface';
import {
  TRAVEL_PRINCIPLE_KEYS,
  type TravelObjectiveProfile,
  type TravelPrincipleKey,
  type CompiledObjectiveWeights,
} from '../types/travel-decision-contract.types';

const PRINCIPLE_TO_LEGACY: Record<
  TravelPrincipleKey,
  Partial<ObjectiveFunctionWeights>
> = {
  SAFETY: { safety: 1.0, weatherRisk: 0.6 },
  PACE: { fatigueRisk: 0.8, pacingVariance: 0.7, timeSlack: 0.9 },
  CORE_EXPERIENCE: { experienceDensity: 1.0, philosophyAlignment: 0.8 },
  BUDGET: { budgetOverrun: 1.0 },
  FEWER_HOTEL_CHANGES: { pacingVariance: 0.5, philosophyAlignment: 0.4 },
  FLEXIBILITY: { timeSlack: 1.0, pacingVariance: 0.3 },
  COVERAGE: { experienceDensity: 0.9, philosophyAlignment: 0.5 },
  PHOTOGRAPHY: { experienceDensity: 0.7, philosophyAlignment: 0.9 },
  FAMILY_COMFORT: { safety: 0.5, fatigueRisk: 0.9, timeSlack: 0.6 },
};

const PRINCIPLE_TO_CANONICAL: Record<
  TravelPrincipleKey,
  Partial<Record<CanonicalObjectiveId, number>>
> = {
  SAFETY: { daily_driving_load: 0.6, daily_physical_load: 0.5 },
  PACE: { daily_physical_load: 0.9, buffer_time: 0.8, daily_driving_load: 0.5 },
  CORE_EXPERIENCE: {
    must_visit_poi_completion: 1.0,
    interest_match: 0.8,
    time_window_satisfaction: 0.4,
  },
  BUDGET: { budget_deviation: 1.0 },
  FEWER_HOTEL_CHANGES: { total_travel_time: 0.3, buffer_time: 0.4 },
  FLEXIBILITY: { buffer_time: 1.0, time_window_satisfaction: 0.5 },
  COVERAGE: { must_visit_poi_completion: 0.8, interest_match: 0.6 },
  PHOTOGRAPHY: { interest_match: 0.9, time_window_satisfaction: 0.7 },
  FAMILY_COMFORT: {
    min_member_utility: 1.0,
    daily_physical_load: 0.8,
    buffer_time: 0.5,
  },
};

function normalizeLegacyWeights(raw: ObjectiveFunctionWeights): ObjectiveFunctionWeights {
  const keys = Object.keys(DEFAULT_OBJECTIVE_WEIGHTS) as (keyof ObjectiveFunctionWeights)[];
  const sum = keys.reduce((acc, k) => acc + raw[k], 0);
  if (sum <= 0) return { ...DEFAULT_OBJECTIVE_WEIGHTS };
  const out = { ...raw };
  for (const k of keys) {
    out[k] = Math.round((out[k] / sum) * 1000) / 1000;
  }
  return out;
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

export function compileObjectiveWeights(
  profile: TravelObjectiveProfile,
): CompiledObjectiveWeights {
  const ranked = profile.rankedPrinciples.filter((p) =>
    (TRAVEL_PRINCIPLE_KEYS as readonly string[]).includes(p),
  );
  if (ranked.length === 0) {
    return {
      legacy: { ...DEFAULT_OBJECTIVE_WEIGHTS },
      canonical: {},
    };
  }

  const legacyAcc: ObjectiveFunctionWeights = {
    safety: 0,
    experienceDensity: 0,
    philosophyAlignment: 0,
    timeSlack: 0,
    fatigueRisk: 0,
    weatherRisk: 0,
    budgetOverrun: 0,
    pacingVariance: 0,
  };
  const canonicalAcc: Partial<Record<CanonicalObjectiveId, number>> = {};

  ranked.forEach((principle, index) => {
    const rankBoost = ranked.length - index;
    for (const [k, v] of Object.entries(PRINCIPLE_TO_LEGACY[principle] ?? {})) {
      legacyAcc[k as keyof ObjectiveFunctionWeights] += rankBoost * (v as number);
    }
    for (const [k, v] of Object.entries(PRINCIPLE_TO_CANONICAL[principle] ?? {})) {
      const key = k as CanonicalObjectiveId;
      canonicalAcc[key] = (canonicalAcc[key] ?? 0) + rankBoost * v;
    }
  });

  return {
    legacy: normalizeLegacyWeights(legacyAcc),
    canonical: normalizeCanonical(canonicalAcc),
  };
}

export function inferDefaultRankedPrinciples(input: {
  pacingLevel?: string;
  planningPolicy?: string;
  hasBudget?: boolean;
  hasMustPlaces?: boolean;
}): TravelPrincipleKey[] {
  const base: TravelPrincipleKey[] = ['SAFETY', 'PACE', 'CORE_EXPERIENCE', 'FLEXIBILITY'];

  if (input.hasBudget) {
    base.splice(3, 0, 'BUDGET');
  }
  if (input.hasMustPlaces) {
    const idx = base.indexOf('CORE_EXPERIENCE');
    if (idx >= 0) base.splice(idx, 0, 'COVERAGE');
  }
  if (input.pacingLevel === 'relaxed' || input.pacingLevel === 'slow') {
    base.unshift('PACE');
  }
  if (input.planningPolicy === 'CONSERVATIVE') {
    return ['SAFETY', 'PACE', 'FLEXIBILITY', 'BUDGET', 'CORE_EXPERIENCE'];
  }
  if (input.planningPolicy === 'EXPLORATORY') {
    return ['COVERAGE', 'CORE_EXPERIENCE', 'FLEXIBILITY', 'SAFETY', 'PACE'];
  }

  return [...new Set(base)];
}

export function buildDefaultTravelObjectiveProfile(input: {
  pacingLevel?: string;
  planningPolicy?: string;
  hasBudget?: boolean;
  hasMustPlaces?: boolean;
}): TravelObjectiveProfile {
  return {
    rankedPrinciples: inferDefaultRankedPrinciples(input),
    version: 1,
  };
}
