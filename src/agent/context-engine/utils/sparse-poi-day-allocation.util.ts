/**
 * 长日程 + 少量 POI 证据时，块状铺开（前 N 天同点）对「沿路用餐/停留」类需求体验差；
 * 此类意图下改用按日轮替，使相邻日更易交替到不同参考点。
 */
const RHYTHM_OR_DINING_PLANNING_RE =
  /用餐|餐[饮厅]|吃饭|美食|料理|咖啡|小酌|meal|dining|restaurant|cafe|eatery|\beat\b|节奏|松紧|停留|歇|worth\s+(a\s+)?stop|stopover|break\b/i;

export function detectRhythmOrDiningPlanningIntent(
  text: string | null | undefined,
): boolean {
  const t = String(text ?? '').trim();
  return t.length > 0 && RHYTHM_OR_DINING_PLANNING_RE.test(t);
}

export type SparsePoiDayAllocation = 'block' | 'round_robin';

export function resolveSparsePoiDayAllocation(
  text: string | null | undefined,
): SparsePoiDayAllocation {
  return detectRhythmOrDiningPlanningIntent(text) ? 'round_robin' : 'block';
}
