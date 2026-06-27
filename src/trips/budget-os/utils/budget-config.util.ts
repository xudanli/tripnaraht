import type {
  BudgetStructure,
  TripBudgetConfigJson,
  TripBudgetIntent,
} from '../types/trip-budget-os.types';
import { categoryLimitsToAllocations } from './budget-structure.util';

export function parseBudgetConfig(raw: unknown): TripBudgetConfigJson {
  if (!raw || typeof raw !== 'object') return {};
  return raw as TripBudgetConfigJson;
}

export function resolveBudgetIntent(config: TripBudgetConfigJson): TripBudgetIntent | null {
  const intentTotal = config.budgetIntent?.total;
  if (intentTotal != null && intentTotal > 0) {
    return config.budgetIntent!;
  }

  const total = config.totalBudget ?? config.total;
  if (total == null || total <= 0) return null;

  return {
    total,
    currency: config.currency ?? config.budgetIntent?.currency ?? 'CNY',
    dailyBudget: config.dailyBudget ?? config.budgetIntent?.dailyBudget ?? undefined,
    source: config.budgetIntent?.source ?? 'user',
    setAt: config.budgetIntent?.setAt ?? config.updatedAt ?? config.createdAt ?? new Date().toISOString(),
  };
}

export function resolveBudgetStructure(
  config: TripBudgetConfigJson,
  intent: TripBudgetIntent | null,
): BudgetStructure | null {
  if (config.budgetStructure?.allocations) {
    return config.budgetStructure;
  }

  if (!config.categoryLimits || !intent) return null;
  const allocations = categoryLimitsToAllocations(config.categoryLimits);
  if (!allocations) return null;

  return {
    mode: 'absolute',
    allocations,
    updatedAt: config.updatedAt ?? new Date().toISOString(),
  };
}

export function dualWriteLegacyTotals(
  config: TripBudgetConfigJson,
  intent: TripBudgetIntent,
): TripBudgetConfigJson {
  return {
    ...config,
    budgetIntent: intent,
    totalBudget: intent.total,
    total: intent.total,
    currency: intent.currency,
    dailyBudget: intent.dailyBudget ?? config.dailyBudget,
    updatedAt: new Date().toISOString(),
  };
}
