/**
 * 将 Pack 级风险/必须项与具体行程 POI 对齐（天、地点名称）
 */

export interface TripPlaceRef {
  placeId: number;
  day: number;
  name: string;
  nameCN?: string;
  canonicalType?: string;
  category?: string;
}

const CT = (s?: string) => (s || '').toUpperCase();

function matchesTerrain(ct: string, name: string): boolean {
  const n = name.toLowerCase();
  return (
    ct.includes('TRAIL') ||
    ct.includes('VOLCANO') ||
    ct.includes('GLACIER') ||
    ct.includes('MOUNTAIN') ||
    ct.includes('FJORD') ||
    ct.includes('HIGHLAND') ||
    ct.includes('PASS') ||
    /f[\s.-]?road|f路|高地|内陆|徒步|冰川|火山/i.test(n)
  );
}

function matchesWater(ct: string, name: string): boolean {
  const n = name.toLowerCase();
  return (
    ct.includes('BEACH') ||
    ct.includes('WATERFALL') ||
    ct.includes('HOT_SPRING') ||
    ct.includes('LAKE') ||
    ct.includes('RIVER') ||
    ct.includes('GEYSER') ||
    ct.includes('SPA') ||
    /瀑布|温泉|海滩|湖|河|泳|漂流/i.test(n)
  );
}

function matchesRemote(ct: string, category: string, name: string): boolean {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  return (
    matchesTerrain(ct, name) ||
    ct.includes('TRAILHEAD') ||
    ct.includes('CAMPING') ||
    /偏远|内陆|高地|荒原|无人|加油|f.?路/i.test(n) ||
    /nature|trail|hiking|outdoor/i.test(c)
  );
}

/** 无 Pack 自带 affectedPois 时，按风险类型推断行程中的相关地点 id */
export function inferPlaceIdsForHazardType(hazardType: string, places: TripPlaceRef[]): number[] {
  if (places.length === 0) return [];
  const t = hazardType.toLowerCase();
  const capped = (ids: number[]) => (ids.length > 0 ? ids.slice(0, 18) : []);

  if (
    t.includes('weather') ||
    t === 'weather_extreme' ||
    t === 'wea'
  ) {
    return capped(places.map((p) => p.placeId));
  }

  if (t.includes('terrain') || t === 'terrain') {
    const ids = places.filter((p) => matchesTerrain(CT(p.canonicalType), p.name)).map((p) => p.placeId);
    return capped(ids.length > 0 ? ids : places.map((p) => p.placeId));
  }

  if (t.includes('water') || t === 'water_safety') {
    const ids = places.filter((p) => matchesWater(CT(p.canonicalType), p.name)).map((p) => p.placeId);
    return capped(ids.length > 0 ? ids : places.map((p) => p.placeId));
  }

  if (t.includes('logistics_remote') || t.includes('remote')) {
    const ids = places
      .filter((p) => matchesRemote(CT(p.canonicalType), p.category || '', p.name))
      .map((p) => p.placeId);
    return capped(ids.length > 0 ? ids : places.map((p) => p.placeId));
  }

  if (t.includes('wildlife')) {
    const ids = places
      .filter((p) => /wildlife|观鲸|海鹦|动物|保护区|national.?park/i.test(p.name.toLowerCase()))
      .map((p) => p.placeId);
    return capped(ids.length > 0 ? ids : places.map((p) => p.placeId));
  }

  return capped(places.map((p) => p.placeId));
}

/**
 * 所有必须项统一追加「本行程涉及…」时使用：按天排序后的行程点（用于展示，可截断）
 */
export function getTripPlacesOrdered(places: TripPlaceRef[]): TripPlaceRef[] {
  return [...places].sort((a, b) => a.day - b.day || a.placeId - b.placeId);
}

export function formatItineraryRiskSuffix(
  enrichedPois: Array<{ id?: string; name?: string; day?: number }>,
  lang: 'en' | 'zh',
): string {
  if (!enrichedPois?.length) return '';
  const parts = enrichedPois
    .filter((p) => p.day != null && (p.name || p.id))
    .slice(0, 10)
    .map((p) => {
      const label = p.name || `POI ${p.id}`;
      return lang === 'zh' ? `第${p.day}天 · ${label}` : `Day ${p.day}: ${label}`;
    });
  if (parts.length === 0) return '';
  const prefix =
    lang === 'zh' ? '（本行程相关地点：' : '(Places on this itinerary: ';
  const suffix = lang === 'zh' ? '）' : ')';
  return `${prefix}${parts.join(lang === 'zh' ? '；' : '; ')}${suffix}`;
}

/**
 * 必须项后缀：所有 must 均附带，无行程点时返回空字符串
 * @param maxShown 列表过长时只展示前 N 个，并注明总数
 */
export function formatMustItinerarySuffix(
  places: TripPlaceRef[],
  lang: 'en' | 'zh',
  maxShown = 15,
): string {
  if (places.length === 0) return '';
  const sorted = getTripPlacesOrdered(places);
  const shown = sorted.slice(0, maxShown);
  const parts = shown.map((p) =>
    lang === 'zh' ? `第${p.day}天 · ${p.name}` : `Day ${p.day}: ${p.name}`,
  );
  const overflow =
    sorted.length > maxShown
      ? lang === 'zh'
        ? ` …（行程共 ${sorted.length} 处地点，此处列出前 ${maxShown} 处）`
        : ` … (${sorted.length} places on itinerary; showing first ${maxShown})`
      : '';
  const prefix = lang === 'zh' ? '\n（本行程涉及：' : '\n(This itinerary involves: ';
  const closing = lang === 'zh' ? '）' : ')';
  return `${prefix}${parts.join(lang === 'zh' ? '；' : '; ')}${overflow}${closing}`;
}
