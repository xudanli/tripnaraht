import type { ItineraryGapType } from '../types/itinerary-gap.types';

/**
 * 由 cohort 级 `meanEveningSlotShare`（evening/(evening+morning) 跨 episode 均值）派生的时段结构标签。
 * 无 slot 字段的 episode 不参与该均值 → 可能为 `no_slot_data`。
 */
export type GapTimeSlotStructureLabel =
  | 'evening_leaning'
  | 'morning_leaning'
  | 'balanced_slot'
  | 'no_slot_data';

/**
 * P2：单行「gap × 主导品类 × 时段结构」——只读摘要，便于表格 / 热力图消费。
 */
export interface GapStabilityMapRow {
  primaryGap: ItineraryGapType;
  episodeCount: number;
  /** 按选中数加权的 cohort 内第一大类 */
  dominantCategory: string;
  dominantCategoryShare: number;
  /** 第二大类（可选对比漂移 / 双峰） */
  runnerUpCategory?: string;
  runnerUpCategoryShare?: number;
  meanIndoorishShare: number;
  categoryEntropy: number;
  meanSelectedCount: number;
  timeSlotStructure: GapTimeSlotStructureLabel;
  /** cohort 有 slot 样本时的原始均值，便于复核阈值 */
  meanEveningSlotShare?: number;
}

export interface GapStabilityMapReport {
  generatedAtIso: string;
  rows: GapStabilityMapRow[];
}
