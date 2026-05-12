import type { SelfNullificationState } from './self-nullification-kernel.types';
import type { ObserverState } from '../observer-rewrite/observer-rewrite-kernel.types';
import type { SystemTerminalMode } from './self-nullification-kernel.types';

export function classifyTerminalMode(
  state: SelfNullificationState,
  observerState: ObserverState,
): SystemTerminalMode {
  if (state.nullificationPressure >= 0.92 && state.systemActivityLevel <= 0.08) {
    return 'NULL';
  }
  if (state.nullificationPressure > 0.85 || observerState.driftResistance > 0.9) {
    return 'ADVISORY_ONLY';
  }
  if (state.systemActivityLevel < 0.2 || state.nullificationPressure > 0.75) {
    return 'DORMANT';
  }
  return 'ACTIVE';
}
