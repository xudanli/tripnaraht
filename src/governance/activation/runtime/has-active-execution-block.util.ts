import type { GovernanceSnapshot } from '../../snapshot/compact-governance-snapshot.util';
import type { GovernanceActivation } from '../governance-activation.types';

/** Open execution governance blocks (unresolved halt/block ledger anchors). */
export function hasActiveExecutionGovernanceBlock(snapshot: GovernanceSnapshot): boolean {
  return snapshot.unresolvedBlocks.some((b) => b.resolvedAt == null);
}

/** @alias {@link hasActiveExecutionGovernanceBlock} */
export const hasActiveExecutionBlock = hasActiveExecutionGovernanceBlock;

/** True when governance asks for replanning AND there is still an open block (runtime gate). */
export function hasActiveExecutionBlockWithReplanningIntent(
  snapshot: GovernanceSnapshot,
  activations: readonly GovernanceActivation[],
): boolean {
  const replan = activations.some((a) => a.activationType === 'trigger_replanning');
  return replan && hasActiveExecutionGovernanceBlock(snapshot);
}
