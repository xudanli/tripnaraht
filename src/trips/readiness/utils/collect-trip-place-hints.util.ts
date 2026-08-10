/**
 * 从行程日程提取地名/城市名提示，供 CN 区域 pack 与限行匹配使用。
 */

export type PlaceHintSource = {
  nameCN?: string | null;
  nameEN?: string | null;
  address?: string | null;
  City?: {
    name?: string | null;
    nameCN?: string | null;
    nameEN?: string | null;
  } | null;
  District?: {
    name?: string | null;
    nameCN?: string | null;
    nameEN?: string | null;
  } | null;
};

export type TripDayHintSource = {
  ItineraryItem?: Array<{
    note?: string | null;
    Place?: PlaceHintSource | null;
  }> | null;
};

/**
 * 去重收集 Place / City / District 名称（中英），上限默认 40。
 */
export function collectTripPlaceNameHints(
  tripDays: TripDayHintSource[] | null | undefined,
  opts?: { max?: number },
): string[] {
  const max = opts?.max ?? 40;
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (s?: string | null) => {
    const t = String(s || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const day of tripDays ?? []) {
    for (const item of day.ItineraryItem ?? []) {
      const p = item.Place;
      if (p) {
        push(p.nameCN);
        push(p.nameEN);
        push(p.City?.nameCN);
        push(p.City?.nameEN);
        push(p.City?.name);
        push(p.District?.nameCN);
        push(p.District?.nameEN);
        push(p.District?.name);
      }
      if (out.length >= max) return out.slice(0, max);
    }
  }
  return out;
}
