/**
 * World Constraint Feasibility — 多域输入 → 单一 ALLOW | DEGRADE | BLOCK（执行裁决占位）
 *
 * 与 `trips/reality-kernel/reality-policy-engine.ts`（快照时效 / world_read 边界）正交：
 * 此处面向「世界约束是否允许继续执行」，后续合并 overlay / objective 的重复判断。
 */

import type { RoadImpact } from '../iceland-road/road-impact.types';
import type { WorldConstraintStoreSnapshot } from './world-snapshot';

export type ConstraintFeasibilityVerdict = 'ALLOW' | 'DEGRADE' | 'BLOCK';

export type ConstraintFeasibilityCode =
  | 'MVP_STUB_ALLOW'
  | 'ROAD_CLOSED_HARD'
  | 'ROAD_CLOSED_GLOBAL_OR_UNKNOWN'
  | 'WEATHER_HARD'
  | 'BOOKING_HARD';

export interface WorldConstraintFeasibilityInput {
  readonly snapshot: WorldConstraintStoreSnapshot;
  /** 图传播建议层（非 SSOT） */
  readonly roadImpact?: RoadImpact;
  /** 预留：天气域摘要、POI 风险、预订冲突等 */
}

export interface ConstraintFeasibilityResult {
  readonly verdict: ConstraintFeasibilityVerdict;
  readonly codes: readonly ConstraintFeasibilityCode[];
  readonly reasons: readonly string[];
}
