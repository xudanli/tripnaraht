/**
 * 最小约束依赖图：用于下游 cascade（日照 / 预订窗 / 疲劳）的拓扑基础
 */

export type SlotDependencyKind =
  /** 同日按开始时间排序的相邻槽位（默认整条 timeline） */
  | 'TIMELINE_FOLLOW'
  /** 标记为驾驶/转移语义（可与 TIMELINE_FOLLOW 并存） */
  | 'DRIVE_SEGMENT'
  /** 前一日末槽 → 次日首槽（跨日 handoff 拓扑） */
  | 'CROSS_DAY_HANDOFF';

export interface ConstraintDependencyEdge {
  id: string;
  fromSlotId: string;
  toSlotId: string;
  date: string;
  kind: SlotDependencyKind;
}
