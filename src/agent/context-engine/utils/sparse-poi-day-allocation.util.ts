import { resolveSparseRegionProfile } from '../../../planning-policy/profiles/sparse-region.profile';

/**
 * 长日程 + 少量 POI 证据时，块状铺开（前 N 天同点）对「沿路用餐/停留」类需求体验差；
 * 此类意图下改用按日轮替，使相邻日更易交替到不同参考点。
 */
const RHYTHM_OR_DINING_PLANNING_RE =
  /用餐|餐[饮厅]|吃饭|美食|料理|咖啡|小酌|meal|dining|restaurant|cafe|eatery|\beat\b|节奏|松紧|停留|歇|worth\s+(a\s+)?stop|stopover|break\b/i;

/** 环岛/一号公路：少量 POI 证据时用块状铺开，避免 round_robin 把同一瀑布写满 7 天 */
const RING_ROAD_SPARSE_RE = /环岛|環島|一号公路|ring\s*road|绕岛|繞島/i;

export function detectRhythmOrDiningPlanningIntent(
  text: string | null | undefined,
): boolean {
  const t = String(text ?? '').trim();
  return t.length > 0 && RHYTHM_OR_DINING_PLANNING_RE.test(t);
}

export type SparsePoiDayAllocation = 'block' | 'round_robin' | 'intentional_slack';

export interface ResolveSparsePoiDayAllocationOptions {
  countryCode?: string;
  destinationHint?: string;
}

/**
 * intentional_slack：极地稀疏区 / 显式 forced — 每点最多落 1 次，其余日留白并提示补检索。
 * round_robin：用餐/节奏意图；block：环岛或默认。
 */
export function resolveSparsePoiDayAllocation(
  text: string | null | undefined,
  forced?: SparsePoiDayAllocation,
  opts?: ResolveSparsePoiDayAllocationOptions,
): SparsePoiDayAllocation {
  if (forced === 'intentional_slack' || forced === 'round_robin' || forced === 'block') {
    return forced;
  }
  const t = String(text ?? '').trim();
  const destHint = String(opts?.destinationHint ?? t).trim();
  const sparse = resolveSparseRegionProfile({
    countryCode: opts?.countryCode,
    destinationHint: destHint || undefined,
  });
  if (sparse?.defaultDayAllocation === 'intentional_slack') {
    return 'intentional_slack';
  }
  if (t && RING_ROAD_SPARSE_RE.test(t)) return 'block';
  return detectRhythmOrDiningPlanningIntent(text) ? 'round_robin' : 'block';
}

/** intentional_slack 每点 1 次；其余模式允许有限复用（避免 2 点写满 7 天） */
export function maxGlobalPoiPlacementsForAllocation(
  allocation: SparsePoiDayAllocation,
): number {
  return allocation === 'intentional_slack' ? 1 : 2;
}
