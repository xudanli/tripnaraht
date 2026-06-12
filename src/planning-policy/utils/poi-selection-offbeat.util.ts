/**
 * POI_SELECTION / RESEARCH：小众 POI 识别、打分加成与 TopN 配额。
 */

import { DEFAULT_OFF_BEAT_RATIO, resolveOffBeatMinCount } from '../../trips/services/candidate-retrieval-offbeat.util';
import { POI_PLANNING_SCORE_REASON } from '../constants/poi-planning-score-reasons';
import type { PoiScoreRow } from './poi-selection-diversity.util';

const OFF_BEAT_TEXT_RE = /小众|hidden|off[- ]?beaten|local.?secret|秘境|私藏|冷门|secret.?spot/i;

export function isOffBeatResearchPoi(poi: Record<string, unknown>): boolean {
  const hay = [
    poi?.name,
    poi?.nameCN,
    ...(Array.isArray(poi?.tags) ? poi.tags : []),
    ...(Array.isArray((poi?.metadata as Record<string, unknown>)?.rawTags)
      ? ((poi.metadata as Record<string, unknown>).rawTags as string[])
      : []),
  ]
    .filter(Boolean)
    .join(' ');
  if (OFF_BEAT_TEXT_RE.test(hay)) return true;

  const rating = typeof poi?.rating === 'number' ? poi.rating : undefined;
  const pop =
    typeof poi?.popularity === 'number'
      ? poi.popularity
      : rating != null
        ? rating * 2
        : undefined;
  if (pop != null && pop > 0 && pop <= 4.5) return true;
  return false;
}

/** 对小众候选 +1.8 分并打标（POI_SELECTION 排序前） */
export function applyOffBeatBoostToScoreRows(
  rows: PoiScoreRow[],
  preferOffbeat: boolean,
): PoiScoreRow[] {
  if (!preferOffbeat) return rows;
  return rows.map((row) => {
    if (!isOffBeatResearchPoi(row.poi as Record<string, unknown>)) return row;
    const poi = row.poi as Record<string, unknown>;
    const reasons = Array.isArray(poi.poi_planning_score_reasons)
      ? [...(poi.poi_planning_score_reasons as string[])]
      : [];
    if (!reasons.includes(POI_PLANNING_SCORE_REASON.OFF_BEATEN_PATH)) {
      reasons.push(POI_PLANNING_SCORE_REASON.OFF_BEATEN_PATH);
      poi.poi_planning_score_reasons = reasons;
    }
    return { ...row, score: row.score + 1.8 };
  });
}

function poiKey(poi: unknown): string {
  const p = poi as Record<string, unknown>;
  return String(p?.poi_id ?? p?.id ?? p?.place_id ?? '')
    .trim()
    .toLowerCase();
}

/**
 * TopN 结果中强制保留至少 ratio 比例的小众 POI（从 rankedPool 替换非锚点项）。
 */
export function enforceOffBeatQuotaInTopN<T>(
  selected: T[],
  rankedPool: T[],
  topN: number,
  ratio: number = DEFAULT_OFF_BEAT_RATIO,
): T[] {
  const minOffBeat = resolveOffBeatMinCount(Math.min(topN, selected.length || topN), ratio);
  if (minOffBeat <= 0 || !selected.length) return selected.slice(0, topN);

  const out = selected.slice(0, topN);
  const selectedKeys = new Set(out.map(poiKey).filter(Boolean));
  let offBeatCount = out.filter((p) => isOffBeatResearchPoi(p as Record<string, unknown>)).length;

  if (offBeatCount >= minOffBeat) return out;

  const replacements = rankedPool.filter((p) => {
    const k = poiKey(p);
    return k && !selectedKeys.has(k) && isOffBeatResearchPoi(p as Record<string, unknown>);
  });

  for (const candidate of replacements) {
    if (offBeatCount >= minOffBeat) break;
    const swapIdx = out.findIndex(
      (p) =>
        !isOffBeatResearchPoi(p as Record<string, unknown>) &&
        !(p as Record<string, unknown>)?.poi_planning_anchor_slug,
    );
    if (swapIdx < 0) break;
    const ck = poiKey(candidate);
    out[swapIdx] = candidate;
    if (ck) selectedKeys.add(ck);
    offBeatCount += 1;
  }

  return out;
}
