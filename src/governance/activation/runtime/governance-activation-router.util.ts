import type { HydratedGovernanceRuntimeContext, GovernanceActivation } from '../governance-activation.types';
import { hasActiveExecutionBlockWithReplanningIntent } from './has-active-execution-block.util';
import type { RuntimeBranchDirective } from './runtime-branch-directive.types';

function activationHandle(a: GovernanceActivation, idx: number): string {
  const head = a.sourceEventIds[0];
  return `${a.activationType}:${head ?? idx}`;
}

/**
 * Precedence: NEED_USER_CONFIRM > suppress execution > replanning (only with open blocks) > normal.
 */
export function routeGovernanceActivationsToRuntimeBranch(
  hydrated: HydratedGovernanceRuntimeContext,
): RuntimeBranchDirective {
  const acts = hydrated.activations;
  const req = acts.find((a) => a.activationType === 'require_confirmation');
  if (req) {
    return {
      branchType: 'needs_confirmation',
      sourceActivationIds: [activationHandle(req, acts.indexOf(req))],
    };
  }
  const sup = acts.find((a) => a.activationType === 'suppress_execution');
  if (sup) {
    return {
      branchType: 'halted',
      sourceActivationIds: [activationHandle(sup, acts.indexOf(sup))],
    };
  }
  const replan = acts.find((a) => a.activationType === 'trigger_replanning');
  if (replan && hasActiveExecutionBlockWithReplanningIntent(hydrated.snapshot, acts)) {
    return {
      branchType: 'replanning',
      sourceActivationIds: [activationHandle(replan, acts.indexOf(replan))],
      replanningIntent: replan.replanningIntent,
    };
  }
  return { branchType: 'normal_execution', sourceActivationIds: [] };
}
