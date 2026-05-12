/**
 * POI_SELECTION：符号化 diversity + 已选点惩罚（不引入 embedding rerank）。
 */

export interface PoiScoreRow {
  poi: any;
  idx: number;
  localityScore: number;
  openingHoursBonus: number;
  dataCompletenessBonus: number;
  riskPenalty: number;
  score: number;
}

export function normalizePoiDiversityTag(poi: any): string {
  const c = String(poi?.category ?? poi?.type ?? 'UNKNOWN').toUpperCase();
  if (c && c !== 'UNKNOWN') return c;
  const name = `${poi?.name ?? ''} ${poi?.nameCN ?? ''}`.toLowerCase();
  if (/museum|博物馆/.test(name)) return 'MUSEUM';
  if (/temple|寺|神社|宫/.test(name)) return 'TEMPLE_SHRINE';
  if (/waterfall|瀑布|cascade/.test(name)) return 'WATERFALL';
  if (/beach|海滩|沙滩|黑沙/.test(name)) return 'BEACH';
  if (/cafe|咖啡|茶/.test(name)) return 'CAFE';
  if (/trail|徒步|hike|步行道/.test(name)) return 'HIKE';
  return 'OTHER';
}

function poiStableKey(poi: any): string {
  return String(poi?.poi_id ?? poi?.id ?? poi?.place_id ?? '')
    .trim()
    .toLowerCase();
}

/** 同标签超过 2 个后每个额外扣 0.25（按当前 score 降序依次应用） */
export function applyDiversityPenaltyToSortedRows(rows: PoiScoreRow[]): PoiScoreRow[] {
  const tagCounts = new Map<string, number>();
  return rows.map((row) => {
    const tag = normalizePoiDiversityTag(row.poi);
    const n = (tagCounts.get(tag) ?? 0) + 1;
    tagCounts.set(tag, n);
    let divPen = 0;
    if (n > 2) {
      divPen = 0.25 * (n - 2);
    }
    return { ...row, score: row.score - divPen };
  });
}

/** 对已出现在行程草案中的点降权，避免「失忆式」重复推荐 */
export function applySelectedPoiPenalty(
  rows: PoiScoreRow[],
  selectedPoiIds: string[] | undefined,
  penalty = 1.2,
): PoiScoreRow[] {
  if (!selectedPoiIds?.length) return rows;
  const sel = new Set(selectedPoiIds.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
  if (!sel.size) return rows;
  return rows.map((row) => {
    const k = poiStableKey(row.poi);
    if (k && sel.has(k)) {
      return { ...row, score: row.score - penalty };
    }
    return row;
  });
}

export function sortPoiScoreRowsDesc(rows: PoiScoreRow[]): PoiScoreRow[] {
  return [...rows].sort((a, b) => b.score - a.score);
}
