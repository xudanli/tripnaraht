import type { ItineraryGapType } from './itinerary-gap.types';

/**
 * 单次 POI_SELECTION 后的「gap → 行为」观测投影（只读；不参与决策、不反写检索）。
 * 供日志 / cohort / drift 分析；与 `gapStats` 同源 primaryGap。
 */
export interface GapBehaviorObservation {
  /** ISO-8601，写入方可填 */
  ts?: string;
  primaryGap: ItineraryGapType;
  /**
   * 本次 episode 涉及的缺口类型列表。
   * 有 `gapStats.allGaps` 时与其一致；否则为 `[primaryGap]`，便于统一消费。
   */
  allGapTypes: ItineraryGapType[];
  selectedCount: number;
  /** 选中集合中启发式「室内/雨天友好」项数量 */
  indoorishSelectedCount: number;
  /** category 直方图（upper，按 count 降序，最多 8 类） */
  categoryHistogram: Array<{ category: string; count: number }>;
}
