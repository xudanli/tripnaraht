import type { GapBehaviorEpisodeRecord } from './gap-behavior-drift.types';
import { buildGapBehaviorDriftReport } from './gap-behavior-drift.util';
import type { GapStabilityMapReport, GapStabilityMapRow, GapTimeSlotStructureLabel } from './gap-stability-map.types';

/** evening 占比高于该阈值 → `evening_leaning` */
const EVENING_LEAN_THRESHOLD = 0.55;
/** evening 占比低于该阈值 → `morning_leaning` */
const MORNING_LEAN_THRESHOLD = 0.45;

function classifyTimeSlotStructure(meanEveningSlotShare: number | undefined): GapTimeSlotStructureLabel {
  if (meanEveningSlotShare == null || !Number.isFinite(meanEveningSlotShare)) {
    return 'no_slot_data';
  }
  if (meanEveningSlotShare >= EVENING_LEAN_THRESHOLD) return 'evening_leaning';
  if (meanEveningSlotShare <= MORNING_LEAN_THRESHOLD) return 'morning_leaning';
  return 'balanced_slot';
}

/**
 * P2：只读 — 在 `GapBehaviorEpisodeRecord[]` 上生成「gap × 主导品类 × 时段结构」轻量表。
 * 复用 `buildGapBehaviorDriftReport` 的 cohort 聚合；不参与检索 / 排序 / query。
 */
export function buildGapStabilityMap(input: { episodes: GapBehaviorEpisodeRecord[] }): GapStabilityMapReport {
  const base = buildGapBehaviorDriftReport({ episodes: input.episodes });
  const rows: GapStabilityMapRow[] = base.cohorts.map((c) => {
    const top0 = c.categoryMixTop[0];
    const top1 = c.categoryMixTop[1];
    const meanEvening = c.meanEveningSlotShare;
    return {
      primaryGap: c.primaryGap,
      episodeCount: c.episodeCount,
      dominantCategory: top0?.category ?? 'UNKNOWN',
      dominantCategoryShare: top0?.share ?? 0,
      ...(top1
        ? { runnerUpCategory: top1.category, runnerUpCategoryShare: top1.share }
        : {}),
      meanIndoorishShare: c.meanIndoorishShare,
      categoryEntropy: c.categoryEntropy,
      meanSelectedCount: c.meanSelectedCount,
      timeSlotStructure: classifyTimeSlotStructure(meanEvening),
      ...(meanEvening != null ? { meanEveningSlotShare: meanEvening } : {}),
    };
  });
  return { generatedAtIso: base.generatedAtIso, rows };
}
