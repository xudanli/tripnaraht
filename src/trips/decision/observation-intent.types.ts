/**
 * 概率型观测意图（与 deterministic POI 活动相对）。
 */

export type ObservationIntentTarget = 'AURORA' | 'NIGHT_SKY' | 'WILDLIFE' | 'OTHER';

export interface ObservationIntent {
  target: ObservationIntentTarget;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 是否允许走廊级迁移（Neptune） */
  flexibility: 'FIXED' | 'MOVEABLE' | 'CHASE';
  /** 触发观测所需条件标签（与 signals 域对齐，由上层填充） */
  requiredConditions?: string[];
}
