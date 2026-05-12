import type { ItineraryGapType } from '../types/itinerary-gap.types';
import type {
  GapBehaviorDriftReport,
  GapBehaviorEpisodeRecord,
  GapCohortSummary,
  GapDriftFlag,
} from './gap-behavior-drift.types';

const INDOOR_SHARE_DRIFT = 0.12;
const EVENING_SHARE_DRIFT = 0.15;

function mergeWeightedCategoryMix(
  episodes: GapBehaviorEpisodeRecord[],
): Map<string, number> {
  const w = new Map<string, number>();
  let total = 0;
  for (const ep of episodes) {
    const sel = ep.selectedCount;
    if (sel <= 0) continue;
    for (const row of ep.categoryHistogram) {
      const c = row.category;
      const add = row.count;
      w.set(c, (w.get(c) ?? 0) + add);
      total += add;
    }
  }
  if (total <= 0) return w;
  return w;
}

function entropyFromShares(shares: number[]): number {
  let h = 0;
  for (const p of shares) {
    if (p <= 0 || !Number.isFinite(p)) continue;
    h -= p * Math.log2(p);
  }
  return h;
}

function summarizeCohort(gap: ItineraryGapType, episodes: GapBehaviorEpisodeRecord[]): GapCohortSummary {
  const shares: number[] = [];
  let sumIndoor = 0;
  let nIndoor = 0;
  let sumEvening = 0;
  let nEvening = 0;
  for (const ep of episodes) {
    if (ep.selectedCount > 0) {
      sumIndoor += ep.indoorishSelectedCount / ep.selectedCount;
      nIndoor += 1;
    }
    const e = ep.eveningLikeSelectedCount ?? 0;
    const m = ep.morningLikeSelectedCount ?? 0;
    if (e + m > 0) {
      sumEvening += e / (e + m);
      nEvening += 1;
    }
  }
  const mix = mergeWeightedCategoryMix(episodes);
  const totalW = [...mix.values()].reduce((a, b) => a + b, 0);
  const top = [...mix.entries()]
    .map(([category, count]) => ({
      category,
      share: totalW > 0 ? count / totalW : 0,
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);
  const allShares = totalW > 0 ? [...mix.values()].map((c) => c / totalW).filter((p) => p > 0) : [];
  const ent = entropyFromShares(allShares);
  const meanSelectedCount =
    episodes.length > 0 ? episodes.reduce((s, e) => s + e.selectedCount, 0) / episodes.length : 0;
  const out: GapCohortSummary = {
    primaryGap: gap,
    episodeCount: episodes.length,
    meanIndoorishShare: nIndoor > 0 ? sumIndoor / nIndoor : 0,
    categoryMixTop: top,
    categoryEntropy: Number.isFinite(ent) ? ent : 0,
    meanSelectedCount,
  };
  if (nEvening > 0) {
    out.meanEveningSlotShare = sumEvening / nEvening;
  }
  return out;
}

function groupByPrimaryGap(episodes: GapBehaviorEpisodeRecord[]): Map<ItineraryGapType, GapBehaviorEpisodeRecord[]> {
  const m = new Map<ItineraryGapType, GapBehaviorEpisodeRecord[]>();
  for (const ep of episodes) {
    const g = ep.primaryGap;
    if (!m.has(g)) m.set(g, []);
    m.get(g)!.push(ep);
  }
  return m;
}

function cohortsFromEpisodes(episodes: GapBehaviorEpisodeRecord[]): GapCohortSummary[] {
  const g = groupByPrimaryGap(episodes);
  return [...g.entries()]
    .map(([gap, eps]) => summarizeCohort(gap, eps))
    .sort((a, b) => a.primaryGap.localeCompare(b.primaryGap));
}

function topCategory(summary: GapCohortSummary): string | undefined {
  return summary.categoryMixTop[0]?.category;
}

function compareCohorts(
  before: GapCohortSummary[],
  after: GapCohortSummary[],
): GapDriftFlag[] {
  const flags: GapDriftFlag[] = [];
  const afterBy = new Map(after.map((c) => [c.primaryGap, c]));
  for (const b of before) {
    const a = afterBy.get(b.primaryGap);
    if (!a || b.episodeCount < 1 || a.episodeCount < 1) continue;
    const dIndoor = Math.abs(a.meanIndoorishShare - b.meanIndoorishShare);
    if (dIndoor >= INDOOR_SHARE_DRIFT) {
      flags.push({
        primaryGap: b.primaryGap,
        signal: 'indoor_share_shift',
        detail: `mean indoorish share moved ${b.meanIndoorishShare.toFixed(3)} → ${a.meanIndoorishShare.toFixed(3)}`,
        beforeMean: b.meanIndoorishShare,
        afterMean: a.meanIndoorishShare,
      });
    }
    const tb = topCategory(b);
    const ta = topCategory(a);
    if (tb && ta && tb !== ta) {
      flags.push({
        primaryGap: b.primaryGap,
        signal: 'top_category_shift',
        detail: `top category ${tb} → ${ta}`,
      });
    }
    if (
      b.meanEveningSlotShare != null &&
      a.meanEveningSlotShare != null &&
      Math.abs(a.meanEveningSlotShare - b.meanEveningSlotShare) >= EVENING_SHARE_DRIFT
    ) {
      flags.push({
        primaryGap: b.primaryGap,
        signal: 'evening_slot_shift',
        detail: `mean evening slot share ${b.meanEveningSlotShare.toFixed(3)} → ${a.meanEveningSlotShare.toFixed(3)}`,
        beforeMean: b.meanEveningSlotShare,
        afterMean: a.meanEveningSlotShare,
      });
    }
  }
  return flags;
}

/**
 * P0：只读 — 由 `gap_behavior_observation` 等导出行聚合，回答「按 gap 分桶后行为是否稳定 / 是否漂移」。
 * 不参与任何执行路径；无外部 I/O。
 */
export function buildGapBehaviorDriftReport(input: {
  episodes: GapBehaviorEpisodeRecord[];
  /** 若提供：按 `ts` 拆分前后两半 cohort 并输出 driftFlags */
  temporalSplitIso?: string;
}): GapBehaviorDriftReport {
  const generatedAtIso = new Date().toISOString();
  const cohorts = cohortsFromEpisodes(input.episodes);
  let beforeCohorts: GapCohortSummary[] | undefined;
  let afterCohorts: GapCohortSummary[] | undefined;
  let driftFlags: GapDriftFlag[] = [];
  const split = input.temporalSplitIso?.trim();
  if (split && input.episodes.length > 0) {
    const before: GapBehaviorEpisodeRecord[] = [];
    const after: GapBehaviorEpisodeRecord[] = [];
    for (const ep of input.episodes) {
      const t = ep.ts?.trim();
      if (!t) {
        after.push(ep);
        continue;
      }
      if (t < split) before.push(ep);
      else after.push(ep);
    }
    beforeCohorts = cohortsFromEpisodes(before);
    afterCohorts = cohortsFromEpisodes(after);
    driftFlags = compareCohorts(beforeCohorts, afterCohorts);
  }
  return {
    generatedAtIso,
    cohorts,
    ...(beforeCohorts && afterCohorts ? { beforeCohorts, afterCohorts } : {}),
    driftFlags,
  };
}
