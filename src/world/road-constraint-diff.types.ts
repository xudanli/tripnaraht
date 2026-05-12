import type { CanonicalRoadWorldState } from './road-canonical.types';

/**
 * Iceland graph（或其它路网计算器）→ World SSOT 的唯一推荐载荷。
 * 不包含 TripPlan：行程槽位解析在 `applyRoadDiff`（SSOT 写入侧）用当前计划完成。
 */
export interface RoadConstraintDiff {
  readonly roadId: string;
  readonly state: CanonicalRoadWorldState;
  /** 0–100 */
  readonly severity: number;
  readonly impactedEntities: {
    readonly poiIds: readonly string[];
    readonly blockedRoadIds: readonly string[];
  };
  readonly requiresReplan: boolean;
}
