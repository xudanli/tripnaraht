/** hard exclude：从检索合并列表中剔除 rejected id（place_id / poi_id 大小写不敏感） */
export function filterPoisByRejectedIds<T extends { poi_id?: unknown; id?: unknown; place_id?: unknown }>(
  pois: T[],
  rejectedPoiIds: string[] | undefined,
): T[] {
  if (!rejectedPoiIds?.length) return pois;
  const rej = new Set(rejectedPoiIds.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
  if (!rej.size) return pois;
  return pois.filter((p) => {
    const k = String(p.poi_id ?? p.id ?? p.place_id ?? '')
      .trim()
      .toLowerCase();
    return !k || !rej.has(k);
  });
}
