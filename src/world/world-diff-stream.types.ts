/**
 * World Diff Stream — 驱动 Map / Timeline / Narrative 的单一事件形状（产品层）
 *
 * 与引擎层 `WorldConstraintDiff` 分离：引擎回答「影响了什么」，
 * 流层额外携带「谁改的、一句因果、UI 分类」。
 */

import type { ConstraintDomain } from './constraint-field.interface';

export type WorldDiffSource = 'USER' | 'SYSTEM' | 'PROPAGATION';

/**
 * UI 侧稳定分类（与约束域相关但不 1:1：BOOKING 下可细分策略）
 */
export type WorldDiffUiType =
  | 'ROAD_BLOCK'
  | 'WEATHER_SHIFT'
  | 'BOOKING_CHANGE'
  /** 用户驾驶/疲劳等策略注入（通常落在 BOOKING 合成字段） */
  | 'DRIVING_POLICY'
  /** 其它或未归类 */
  | 'GENERIC';

/**
 * 三种核心用户操作范式（交互意图，非引擎事件）
 */
export type WorldEditingUserOperation =
  /** 直接改世界：点路/区域/预订 → WorldCommand */
  | 'DIRECT_CONSTRAINT_EDIT'
  /** 语义约束：更轻松 / 少山路 → intent → WorldCommand */
  | 'INTENT_INJECTION'
  /** 时间轴探查：为什么变慢 → 展示 WorldDiff + 传播链 */
  | 'TIMELINE_CAUSALITY';

/** UI / Narrative 流条目（与物理合约 `WorldDiff` 区分） */
export interface WorldDiffStreamEvent {
  readonly id: string;
  readonly type: WorldDiffUiType;
  readonly affectedSlots: readonly string[];
  /** 0–100，便于条带强度与排序 */
  readonly severity: number;
  readonly explanation: string;
  readonly source: WorldDiffSource;
  readonly emittedAtMs: number;
  /** 可选：约束域（引擎侧 domains） */
  readonly domains?: readonly ConstraintDomain[];
}
