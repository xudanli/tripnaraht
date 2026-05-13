import type { GovernanceDriftSignal } from './governance-drift.types';

/**
 * Advisory only: orchestrator may call `applyGovernanceRuntimeTransition` with this event.
 * Hydration never applies transitions.
 */
export function deriveAdvisoryEscalationEventFromDrift(
  signals: readonly GovernanceDriftSignal[],
  opts?: { confidenceFloor?: number },
): 'world_escalated' | 'execution_blocked' | undefined {
  const floor = opts?.confidenceFloor ?? 0.78;
  const strong = signals.filter((s) => s.confidence >= floor);
  if (!strong.length) return undefined;
  if (strong.some((s) => s.type === 'world_regression')) return 'world_escalated';
  if (strong.some((s) => s.type === 'recurring_block' || s.type === 'policy_insufficient')) {
    return 'world_escalated';
  }
  return undefined;
}
