/**
 * 统一世界约束字段 — 所有域写入同一形状（SSOT 条目）
 */

/** ISO 8601 日期或日期时间字符串 */
export interface WorldTimeRange {
  readonly start: string;
  readonly end: string;
}

export type ConstraintDomain = 'ROAD' | 'WEATHER' | 'BOOKING';

export type WorldConstraintState =
  | 'OPEN'
  | 'CLOSED'
  | 'DEGRADED'
  /** 路网：四驱/限行等（与 CanonicalRoadWorldState 对齐） */
  | 'RESTRICTED'
  | 'UNKNOWN';

/**
 * 单条世界约束（非事件 log；`version` 与全局 store 代际对齐）
 */
export interface ConstraintField {
  readonly id: string;
  readonly type: ConstraintDomain;
  readonly state: WorldConstraintState;
  /** 0–100 归一化严重度，供 diff 聚类与下游评分 */
  readonly severity: number;
  readonly temporalScope: WorldTimeRange;
  /** 0–1 对 replan/Neptune 的相对权重 */
  readonly impactWeight: number;
  readonly version: number;
  /**
   * 管线在提供 TripPlan 时解析的受影响槽位（路网/预订等）；
   * 天气域可用日期反推，未必预填。
   */
  readonly affectedSlotIds?: readonly string[];
  readonly affectedPoiIds?: readonly string[];
  /**
   * 人机共创策略（写入 BOOKING 域下的合成 id，如 `USER_POLICY_*`）
   */
  readonly userPolicy?: {
    readonly kind: 'POI_LOCK' | 'DRIVING_SOFT_CAP' | string;
    readonly maxMountainRoadRatio?: number;
    readonly lockedPoiId?: string;
  };
}
