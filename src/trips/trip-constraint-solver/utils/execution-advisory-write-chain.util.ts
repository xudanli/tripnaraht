import { assertDirectEffectivePlanWriteBlocked } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';

/** @deprecated Prefer assertDirectEffectivePlanWriteBlocked — kept as alias for W3 parity. */
export function assertExecutionAdvisoryDirectApplyAllowed(
  caller = 'ExecutionAdvisoryApplyService',
): void {
  assertDirectEffectivePlanWriteBlocked(caller);
}
