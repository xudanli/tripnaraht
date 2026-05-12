import type { ItineraryGapType } from '../types/itinerary-gap.types';

/**
 * 单行 episode：与 `gap_behavior_observation`（+ 可选时间槽）对齐，供批处理 / 日志管道喂入。
 */
export interface GapBehaviorEpisodeRecord {
  ts?: string;
  primaryGap: ItineraryGapType;
  allGapTypes?: ItineraryGapType[];
  selectedCount: number;
  indoorishSelectedCount: number;
  categoryHistogram: Array<{ category: string; count: number }>;
  /** 可选：若上游能区分时段选中 POI，可填以做 P0 时间结构分析 */
  eveningLikeSelectedCount?: number;
  morningLikeSelectedCount?: number;
}

export interface GapCohortSummary {
  primaryGap: ItineraryGapType;
  episodeCount: number;
  /** 各 episode 内 indoorish/selected 的均值（selected=0 的 episode 跳过） */
  meanIndoorishShare: number;
  /** 按选中数加权的 category 占比，取前 5 */
  categoryMixTop: Array<{ category: string; share: number }>;
  /** 类别分布熵（越高越散） */
  categoryEntropy: number;
  /** 各 episode `selectedCount` 的算术均值（弱信号：密度 / 选中条数偏好，P1 观察用） */
  meanSelectedCount: number;
  /** 有 slot 数据时：evening/(evening+morning) 的跨 episode 均值 */
  meanEveningSlotShare?: number;
}

export interface GapDriftFlag {
  primaryGap: ItineraryGapType;
  signal: 'indoor_share_shift' | 'top_category_shift' | 'evening_slot_shift';
  detail: string;
  beforeMean?: number;
  afterMean?: number;
}

export interface GapBehaviorDriftReport {
  generatedAtIso: string;
  /** 全量 cohort（不拆时间） */
  cohorts: GapCohortSummary[];
  /** 仅当提供 `temporalSplitIso` 且前后均有样本时填充 */
  beforeCohorts?: GapCohortSummary[];
  afterCohorts?: GapCohortSummary[];
  driftFlags: GapDriftFlag[];
}
