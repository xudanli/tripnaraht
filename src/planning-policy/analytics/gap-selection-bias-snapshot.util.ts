import type { ItineraryGapType } from '../types/itinerary-gap.types';
import type { GapBehaviorEpisodeRecord } from './gap-behavior-drift.types';
import { buildGapBehaviorDriftReport } from './gap-behavior-drift.util';
import type { GapSelectionBiasSnapshotReport, GapSelectionBiasRow } from './gap-selection-bias-snapshot.types';

function mergeWeightedCategoryMix(episodes: GapBehaviorEpisodeRecord[]): Map<string, number> {
  const w = new Map<string, number>();
  for (const ep of episodes) {
    if (ep.selectedCount <= 0) continue;
    for (const row of ep.categoryHistogram) {
      const c = row.category;
      const add = row.count;
      w.set(c, (w.get(c) ?? 0) + add);
    }
  }
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

function topCategoryMix(mix: Map<string, number>, limit: number): Array<{ category: string; share: number }> {
  const totalW = [...mix.values()].reduce((a, b) => a + b, 0);
  if (totalW <= 0) return [];
  return [...mix.entries()]
    .map(([category, count]) => ({
      category,
      share: count / totalW,
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, limit);
}

function globalIndoorAndSelected(episodes: GapBehaviorEpisodeRecord[]): {
  globalMeanIndoorishShare: number;
  globalMeanSelectedCount: number;
} {
  let sumIndoor = 0;
  let nIndoor = 0;
  let sumSel = 0;
  for (const ep of episodes) {
    sumSel += ep.selectedCount;
    if (ep.selectedCount > 0) {
      sumIndoor += ep.indoorishSelectedCount / ep.selectedCount;
      nIndoor += 1;
    }
  }
  return {
    globalMeanIndoorishShare: nIndoor > 0 ? sumIndoor / nIndoor : 0,
    globalMeanSelectedCount: episodes.length > 0 ? sumSel / episodes.length : 0,
  };
}

/**
 * P1：只读 — 记录 gap → 选择结果分布偏置 + 全局参照；不写入任何执行路径。
 */
export function buildGapSelectionBiasSnapshot(input: {
  episodes: GapBehaviorEpisodeRecord[];
}): GapSelectionBiasSnapshotReport {
  const episodes = input.episodes;
  const base = buildGapBehaviorDriftReport({ episodes });
  const mix = mergeWeightedCategoryMix(episodes);
  const totalW = [...mix.values()].reduce((a, b) => a + b, 0);
  const allShares = totalW > 0 ? [...mix.values()].map((c) => c / totalW).filter((p) => p > 0) : [];
  const globalCategoryEntropy = Number.isFinite(entropyFromShares(allShares)) ? entropyFromShares(allShares) : 0;
  const { globalMeanIndoorishShare, globalMeanSelectedCount } = globalIndoorAndSelected(episodes);

  const gaps: GapSelectionBiasRow[] = base.cohorts.map(
    (c): GapSelectionBiasRow => ({
      primaryGap: c.primaryGap,
      episodeCount: c.episodeCount,
      categoryMixTop: c.categoryMixTop,
      meanIndoorishShare: c.meanIndoorishShare,
      categoryEntropy: c.categoryEntropy,
      meanSelectedCount: c.meanSelectedCount,
    }),
  );

  return {
    generatedAtIso: base.generatedAtIso,
    totalEpisodeCount: episodes.length,
    globalCategoryMixTop: topCategoryMix(mix, 5),
    globalMeanIndoorishShare,
    globalMeanSelectedCount,
    globalCategoryEntropy,
    gaps,
  };
}
