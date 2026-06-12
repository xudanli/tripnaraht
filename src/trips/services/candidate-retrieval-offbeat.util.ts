/**
 * 反热门 / 小众 POI 配额工具（CandidateRetrieval diversity 采样）。
 */

import type { CandidatePlace } from './candidate-retrieval.engine';
import { POI_PLANNING_SCORE_REASON } from '../../planning-policy/constants/poi-planning-score-reasons';

export const DEFAULT_OFF_BEAT_RATIO = 0.2;

const OFF_BEAT_TAG_RE = /小众|hidden|off[- ]?beaten|local.?secret|秘境|私藏|冷门/i;

export function isOffBeatCandidate(
  place: Pick<CandidatePlace, 'tags' | 'popularity' | 'rating'>,
  medianPopularity: number,
): boolean {
  const tags = (place.tags ?? []).join(' ');
  if (OFF_BEAT_TAG_RE.test(tags)) return true;
  const pop = place.popularity ?? (place.rating != null ? place.rating * 2 : 0);
  if (pop > 0 && medianPopularity > 0 && pop <= medianPopularity * 0.65) return true;
  return false;
}

export function medianPopularity(
  places: Array<Pick<CandidatePlace, 'popularity' | 'rating'>>,
): number {
  const vals = places
    .map((p) => p.popularity ?? (p.rating != null ? p.rating * 2 : 0))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (!vals.length) return 0;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
}

/** 保证最终选中池里至少 `minCount` 个小众候选；不足时从 offBeatPool 替换非 protected 热门项 */
export function enforceOffBeatQuota<T extends CandidatePlace & { compositeScore?: number }>(
  selected: T[],
  offBeatPool: T[],
  minCount: number,
): T[] {
  if (minCount <= 0 || !offBeatPool.length) return selected;

  const median = medianPopularity(selected.length ? selected : offBeatPool);
  const tagged = (p: T) => {
    const reasons = p.poiPlanningScoreReasons ?? [];
    if (!reasons.includes(POI_PLANNING_SCORE_REASON.OFF_BEATEN_PATH)) {
      p.poiPlanningScoreReasons = [...reasons, POI_PLANNING_SCORE_REASON.OFF_BEATEN_PATH];
    }
    return p;
  };

  let offBeatInSelected = selected.filter((p) => isOffBeatCandidate(p, median));
  if (offBeatInSelected.length >= minCount) {
    return selected.map((p) => (isOffBeatCandidate(p, median) ? tagged(p) : p));
  }

  const selectedIds = new Set(selected.map((p) => p.id));
  const replacements = offBeatPool.filter((p) => !selectedIds.has(p.id));
  const out = [...selected];
  let need = minCount - offBeatInSelected.length;

  for (const candidate of replacements) {
    if (need <= 0) break;
    const swapIdx = out.findIndex(
      (p) => !p.poiPlanningAdmissionProtected && !isOffBeatCandidate(p, median),
    );
    if (swapIdx < 0) break;
    out[swapIdx] = tagged({ ...candidate });
    need -= 1;
  }

  return out;
}

export function resolveOffBeatMinCount(totalSelected: number, ratio: number): number {
  if (ratio <= 0 || totalSelected <= 0) return 0;
  return Math.max(1, Math.ceil(totalSelected * ratio));
}
