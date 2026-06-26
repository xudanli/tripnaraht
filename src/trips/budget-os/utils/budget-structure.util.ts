import {
  ALLOCATION_SUM_TOLERANCE,
  CategoryAllocations,
  CategoryPercentages,
  PERCENT_SUM_TOLERANCE,
  PutBudgetStructureInput,
  TripBudgetIntent,
} from '../types/trip-budget-os.types';

const ALLOCATION_KEYS: (keyof CategoryAllocations)[] = [
  'transportation',
  'accommodation',
  'experience',
  'food',
  'other',
];

export function normalizeAllocations(
  input: Partial<CategoryAllocations>,
): CategoryAllocations {
  return {
    transportation: input.transportation ?? 0,
    accommodation: input.accommodation ?? 0,
    experience: input.experience ?? 0,
    food: input.food ?? 0,
    other: input.other ?? 0,
  };
}

export function sumAllocations(allocations: CategoryAllocations): number {
  return ALLOCATION_KEYS.reduce((sum, key) => sum + (allocations[key] ?? 0), 0);
}

export function allocationsFromPercentages(
  percentages: CategoryPercentages,
  total: number,
): CategoryAllocations {
  const normalized: CategoryAllocations = {
    transportation: Math.round((percentages.transportation / 100) * total),
    accommodation: Math.round((percentages.accommodation / 100) * total),
    experience: Math.round((percentages.experience / 100) * total),
    food: Math.round((percentages.food / 100) * total),
    other: Math.round(((percentages.other ?? 0) / 100) * total),
  };

  const diff = total - sumAllocations(normalized);
  if (Math.abs(diff) > 0 && Math.abs(diff) <= ALLOCATION_SUM_TOLERANCE) {
    normalized.experience += diff;
  }

  return normalized;
}

export function sumPercentages(percentages: CategoryPercentages): number {
  return (
    percentages.transportation +
    percentages.accommodation +
    percentages.experience +
    percentages.food +
    (percentages.other ?? 0)
  );
}

export function resolveStructureAllocations(
  input: PutBudgetStructureInput,
  intent: TripBudgetIntent,
): { allocations: CategoryAllocations; percentages?: CategoryPercentages } {
  if (input.mode === 'percent') {
    if (!input.percentages) {
      throw new Error('percent 模式需要提供 percentages');
    }
    const pctSum = sumPercentages(input.percentages);
    if (Math.abs(pctSum - 100) > PERCENT_SUM_TOLERANCE) {
      throw new Error(`分类百分比之和必须为 100，当前为 ${pctSum}`);
    }
    return {
      allocations: allocationsFromPercentages(input.percentages, intent.total),
      percentages: input.percentages,
    };
  }

  if (!input.allocations) {
    throw new Error('absolute 模式需要提供 allocations');
  }
  const allocations = normalizeAllocations(input.allocations);
  const sum = sumAllocations(allocations);
  if (Math.abs(sum - intent.total) > ALLOCATION_SUM_TOLERANCE) {
    throw new Error(
      `分类分配之和必须等于总预算 ${intent.total}，当前为 ${sum}`,
    );
  }
  return { allocations };
}

/** Map L2 experience field to evaluate/actuals activities key */
export function experienceToActivitiesAlias(
  allocations: CategoryAllocations,
): Record<string, number> {
  return {
    transportation: allocations.transportation,
    accommodation: allocations.accommodation,
    experience: allocations.experience,
    activities: allocations.experience,
    food: allocations.food,
    other: allocations.other ?? 0,
  };
}

/** Legacy categoryLimits → L2 allocations (read migration) */
export function categoryLimitsToAllocations(
  limits: Record<string, number | undefined>,
): CategoryAllocations | null {
  const hasAny = Object.values(limits).some((v) => v != null && v > 0);
  if (!hasAny) return null;
  return normalizeAllocations({
    transportation: limits.transportation ?? 0,
    accommodation: limits.accommodation ?? 0,
    experience: limits.activities ?? limits.experience ?? 0,
    food: limits.food ?? 0,
    other: limits.other ?? 0,
  });
}
