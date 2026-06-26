import type { CategoryAllocations, SpendingPersona } from '../types/trip-budget-os.types';

export interface SpendingPersonaResult {
  spendingPersona: SpendingPersona;
  personaConfidence: number;
}

/**
 * Infer spending persona from L2 allocation ratios (v1 heuristic per PRD §4.2.4).
 */
export function inferSpendingPersona(
  allocations: CategoryAllocations,
  total: number,
): SpendingPersonaResult {
  if (total <= 0) {
    return { spendingPersona: 'balanced', personaConfidence: 0 };
  }

  const other = allocations.other ?? 0;
  const denom = total || 1;
  const pct = {
    transportation: allocations.transportation / denom,
    accommodation: allocations.accommodation / denom,
    experience: allocations.experience / denom,
    food: allocations.food / denom,
    other: other / denom,
  };

  const ranked = Object.entries(pct)
    .filter(([k]) => k !== 'other')
    .sort((a, b) => b[1] - a[1]);

  const top1 = ranked[0];
  const top2 = ranked[1];
  const confidence = Math.min(1, Math.max(0, (top1[1] - (top2?.[1] ?? 0)) * 2));

  if (pct.experience >= 0.35 && pct.experience >= pct.accommodation && pct.experience >= pct.transportation) {
    return { spendingPersona: 'experience', personaConfidence: confidence };
  }
  if (pct.accommodation >= 0.35 && pct.accommodation >= pct.experience && pct.accommodation >= pct.transportation) {
    return { spendingPersona: 'quality', personaConfidence: confidence };
  }
  if (pct.accommodation <= 0.15 && pct.experience <= 0.2) {
    return { spendingPersona: 'frugal', personaConfidence: confidence };
  }
  if (pct.transportation >= 0.3 && pct.experience <= 0.25) {
    return { spendingPersona: 'efficiency', personaConfidence: confidence };
  }

  return { spendingPersona: 'balanced', personaConfidence: confidence };
}
