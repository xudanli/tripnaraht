/** Phase 3：每个必选锚点在 TopN 中的来源（校准 / 回归用） */
export type AnchorOutcomeSourceKind = 'retrieved' | 'matched_existing' | 'fallback';

export interface AnchorOutcomeSourceRow {
  slug: string;
  source: AnchorOutcomeSourceKind;
  matchedPoiId?: string;
  matchedPoiName?: string;
}

/**
 * 从最终选中的 POI 行解析锚点来源（依赖 merge / enforce 写入的 `poi_planning_anchor_slug`）。
 */
export function computeAnchorOutcomeSources(
  required: string[],
  scoredPois: unknown[],
): AnchorOutcomeSourceRow[] {
  const rows: AnchorOutcomeSourceRow[] = [];
  for (const raw of required) {
    const key = raw.trim().toLowerCase();
    const poi = scoredPois.find((p) => {
      const ps = String((p as { poi_planning_anchor_slug?: string })?.poi_planning_anchor_slug ?? '')
        .trim()
        .toLowerCase();
      return ps === key;
    });
    if (!poi || typeof poi !== 'object') {
      rows.push({ slug: raw, source: 'fallback' });
      continue;
    }
    const p = poi as Record<string, unknown>;
    const explicit = String(p.poi_planning_anchor_source ?? '').trim();
    let source: AnchorOutcomeSourceKind = 'matched_existing';
    if (explicit === 'retrieved') source = 'retrieved';
    else if (explicit === 'matched_existing') source = 'matched_existing';
    else if (String(p.source ?? '') === 'poi_planning_fallback') source = 'fallback';
    else if (explicit === 'fallback') source = 'fallback';

    const id = p.place_id ?? p.poi_id ?? p.id;
    rows.push({
      slug: raw,
      source,
      matchedPoiId: id !== undefined && id !== null ? String(id) : undefined,
      matchedPoiName: String(p.name ?? p.nameCN ?? ''),
    });
  }
  return rows;
}
