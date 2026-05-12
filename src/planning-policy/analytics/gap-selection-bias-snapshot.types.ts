import type { ItineraryGapType } from '../types/itinerary-gap.types';

/**
 * P1：单 gap 桶的「选择结果」统计投影（只读观测；不参与检索 / 排序 / query 生成）。
 */
export interface GapSelectionBiasRow {
  primaryGap: ItineraryGapType;
  episodeCount: number;
  /** 与 drift cohort 一致：按选中数加权的品类 mix，前 5 */
  categoryMixTop: Array<{ category: string; share: number }>;
  meanIndoorishShare: number;
  categoryEntropy: number;
  meanSelectedCount: number;
}

/**
 * P1：全量 episode 的全局参照（用于肉眼对比各 gap 的 system bias，非因果、不控参）。
 */
export interface GapSelectionBiasSnapshotReport {
  generatedAtIso: string;
  totalEpisodeCount: number;
  globalCategoryMixTop: Array<{ category: string; share: number }>;
  globalMeanIndoorishShare: number;
  globalMeanSelectedCount: number;
  globalCategoryEntropy: number;
  gaps: GapSelectionBiasRow[];
}
