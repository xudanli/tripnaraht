/**
 * Gate staging shadow fault-injection options on canonical-plan-selection HTTP requests.
 * Allowed in Decision Lab or when full-plan shadow comparison is active (SHADOW / DUAL_RUN).
 */

import type { PlanningContext } from '../candidates/contracts/decision-candidate';
import {
  isDecisionLabEnabled,
  shouldRunFullPlanOptimizationShadow,
} from '../constraints/constraint-evaluation.config';

export type StagingShadowOptionsInput = NonNullable<
  PlanningContext['stagingShadowOptions']
>;

export function resolveStagingShadowOptionsForRequest(
  body?: StagingShadowOptionsInput | null,
): StagingShadowOptionsInput | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const allowed =
    isDecisionLabEnabled() || shouldRunFullPlanOptimizationShadow();
  return allowed ? body : undefined;
}
