import type { SelfNullificationState } from './self-nullification-kernel.types';
import type { ObserverState } from '../observer-rewrite/observer-rewrite-kernel.types';
import type { SystemTerminalMode } from './self-nullification-kernel.types';

export function explainNullification(
  state: SelfNullificationState,
  observerState: ObserverState,
  mode: SystemTerminalMode,
): string[] {
  return [
    `Nullification pressure=${state.nullificationPressure.toFixed(3)} systemActivity=${state.systemActivityLevel.toFixed(
      3,
    )} autonomy=${state.autonomySufficiencyScore.toFixed(3)}.`,
    `Observer driftResistance=${observerState.driftResistance.toFixed(3)} → terminal mode=${mode}.`,
    'Interpretation: elevated autonomy/stability reduces required system mediation; DAG/IR/VM become archival traces when mode approaches NULL.',
  ];
}
