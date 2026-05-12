import type { ExecutionResourceState, ExecutionValue } from './execution-resource.types';

const EPS = 1e-9;

/**
 * Ratio of total realized value over total resource burn (higher is better).
 * Adds `opportunityCost` to denominator per {@link ExecutionResourceState}.
 */
export function computeExecutionUtility(
  value: ExecutionValue,
  cost: ExecutionResourceState,
): number {
  const numerator =
    value.auroraValue +
    value.experienceValue +
    value.stabilityValue +
    value.completionValue;

  const denominator =
    cost.timeCost +
    cost.moneyCost +
    cost.energyCost +
    cost.riskCost +
    cost.opportunityCost;

  if (denominator <= EPS) {
    return numerator > EPS ? Number.POSITIVE_INFINITY : 0;
  }

  return numerator / denominator;
}
