/**
 * Incremental diff — 判断「本次约束更新是否改变了槽位上的有效世界状态」
 */

import type { ConstraintStateStore } from './constraint-state.store';
import type {
  ConstraintDiff,
  NormalizedConstraintEvent,
} from './constraint-stream.types';

export function computeConstraintDiff(
  store: ConstraintStateStore,
  event: NormalizedConstraintEvent,
): ConstraintDiff {
  const prevBySlot = new Map<string, string | undefined>();
  for (const sid of event.affectedSlotIds) {
    prevBySlot.set(sid, store.getSlotFingerprint(sid));
  }

  store.apply(event);

  const changedSlots: string[] = [];
  for (const sid of event.affectedSlotIds) {
    const next = store.getSlotFingerprint(sid);
    if (prevBySlot.get(sid) !== next) {
      changedSlots.push(sid);
    }
  }

  const requiresReplan = changedSlots.length > 0;

  return {
    changedSlots,
    severity: event.severity,
    requiresReplan,
    isMeaningfulChange: requiresReplan,
  };
}
