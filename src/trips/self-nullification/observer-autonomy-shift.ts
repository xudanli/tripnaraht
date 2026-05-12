import type { ObserverState } from '../observer-rewrite/observer-rewrite-kernel.types';

export interface ObserverAutonomyRoles {
  systemRole: 'ADVISORY_ONLY';
  executionRole: 'PASSIVE_MONITOR';
}

export function shiftToObserverAutonomy(
  observerState: ObserverState,
): ObserverAutonomyRoles | undefined {
  if (observerState.driftResistance > 0.9) {
    return {
      systemRole: 'ADVISORY_ONLY',
      executionRole: 'PASSIVE_MONITOR',
    };
  }
  return undefined;
}
