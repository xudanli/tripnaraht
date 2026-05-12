/**
 * Slot repair 类型 SSOT（避免 semantic-delta ↔ repair.engine 循环依赖）
 */

export type SlotRepairAction =
  | 'REMOVE'
  | 'SHIFT_TIME'
  | 'REPLACE_POI'
  | 'REORDER'
  | 'NOOP';

export interface SlotRepairPlan {
  readonly slotId: string;
  readonly action: SlotRepairAction;
  readonly payload?: {
    readonly newPoiId?: string;
    readonly deltaMinutes?: number;
    readonly orderedSlotIds?: readonly string[];
  };
  readonly confidence: number;
}
