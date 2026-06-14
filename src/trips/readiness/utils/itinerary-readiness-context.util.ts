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

function placeLabels(name: string, nameCN?: string): string {
  return `${name} ${nameCN ?? ''}`.trim();
}

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

function matchesRoadHazard(ct: string, category: string, name: string): boolean {
  const n = name.toLowerCase();
  const c = category.toLowerCase();

  if (
    ct.includes('RESTAURANT') ||
    ct.includes('CAFE') ||
    ct.includes('SPA') ||
    ct.includes('HOTEL') ||
    ct.includes('SHOP') ||
    ct.includes('MUSEUM') ||
    c.includes('restaurant') ||
    c.includes('accommodation')
  ) {
    return false;
  }

  const roadRemoteTypes = [
    'HIGHLAND',
    'F_ROAD',
    'FROAD',
    'GLACIER',
    'TRAILHEAD',
    'CAMPING',
    'REMOTE',
    'MOUNTAIN_PASS',
    'MOUNTAIN',
  ];
  if (roadRemoteTypes.some((t) => ct.includes(t))) return true;
  if (matchesTerrain(ct, name)) return true;

  if (ct.includes('NATIONAL_PARK') || ct.includes('NATURE_RESERVE')) {
    return /highland|内陆|斯卡夫|skaftafell|瓦特纳|vatnaj[oö]kull|snæfell|snaefell|westfjord|fjord|高地|荒原|remote/i.test(n);
  }

  if (/f[\s.-]?road|f路|高地|山口|pass|内陆/i.test(n)) return true;

  return false;
}

function isRoadHazardType(hazardType: string): boolean {
  const t = hazardType.toLowerCase();
  return (
    t === 'road' ||
    t.includes('road_closure') ||
    t.includes('winter_road') ||
    t.includes('driving_conditions') ||
    t.includes('driving_ice_road') ||
    (t.includes('driving') && t.includes('road'))
  );
}

/** 无 Pack 自带 affectedPois 时，按风险类型推断行程中的相关地点 id */
export function inferPlaceIdsForHazardType(hazardType: string, places: TripPlaceRef[]): number[] {
  if (places.length === 0) return [];
  const t = hazardType.toLowerCase();
  const capped = (ids: number[]) => (ids.length > 0 ? ids.slice(0, 18) : []);

  if (isRoadHazardType(hazardType)) {
    const ids = places
      .filter((p) =>
        matchesRoadHazard(CT(p.canonicalType), p.category || '', placeLabels(p.name, p.nameCN)),
      )
      .map((p) => p.placeId);
    return capped(ids);
  }
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

  if (isVolcanicHazardType(hazardType)) {
    const ids = places
      .filter((p) =>
        matchesVolcanic(CT(p.canonicalType), placeLabels(p.name, p.nameCN)),
      )
      .map((p) => p.placeId);
    return capped(ids);
  }

  if (isColdHazardType(hazardType)) {
    const ids = places
      .filter((p) =>
        matchesColdExposure(CT(p.canonicalType), p.category || '', placeLabels(p.name, p.nameCN)),
      )
      .map((p) => p.placeId);
    return capped(ids);
  }

  if (isSupplyShortageType(hazardType)) {
    const ids = places
      .filter((p) =>
        matchesRemote(CT(p.canonicalType), p.category || '', placeLabels(p.name, p.nameCN)),
      )
      .map((p) => p.placeId);
    return capped(ids.length > 0 ? ids : []);
  }

  return capped(places.map((p) => p.placeId));
}

/** 正文下方已有 affectedPois 时，去掉括号内的 POI 列表 */
export function stripItineraryPlaceSuffix(text: string): string {
  if (!text?.trim()) return '';
  return splitMustTripInvolvesMessage(text).lead;
}

export function isItineraryPlaceOnlyMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const { lead, involves } = splitMustTripInvolvesMessage(t);
  return !lead && !!involves;
}

function splitMustTripInvolvesMessage(message: string): { lead: string; involves?: string } {
  const m = message.trim();
  if (!m) return { lead: '' };

  const tripContextMarkers = [
    '本行程涉及',
    '本行程相关地点',
    'This itinerary involves',
    'Places on this itinerary',
    'Trip-related places',
    'Trip involves',
  ];

  for (const marker of tripContextMarkers) {
    const markerIdx = m.indexOf(marker);
    if (markerIdx === -1) continue;

    const openParenIdx = Math.max(m.lastIndexOf('（', markerIdx), m.lastIndexOf('(', markerIdx));
    if (openParenIdx === -1) continue;

    const closeParenIdx = Math.max(m.lastIndexOf('）'), m.lastIndexOf(')'));
    if (closeParenIdx <= openParenIdx) continue;

    const lead = m.slice(0, openParenIdx).trim();
    let involves = m.slice(openParenIdx + 1, closeParenIdx).trim();
    involves = involves
      .replace(/^本行程涉及[：:]\s*/, '')
      .replace(/^本行程相关地点[：:]\s*/, '')
      .replace(/^(?:This itinerary involves|Places on this itinerary|Trip-related places|Trip involves)[^:]*:\s*/i, '')
      .trim();

    if (lead) {
      return { lead, involves: involves || undefined };
    }
    if (involves) {
      return { lead: '', involves };
    }
  }

  return { lead: m };
}

function matchesVolcanic(ct: string, name: string): boolean {
  const n = placeLabels(name, '').toLowerCase();
  return (
    ct.includes('VOLCANO') ||
    ct.includes('GEOTHERMAL') ||
    ct.includes('GEYSER') ||
    ct.includes('HOT_SPRING') ||
    /火山|地热|间歇泉|geyser|volcano|geothermal|kerid|krýsuvík|krysuvik/i.test(n)
  );
}

function matchesColdExposure(ct: string, category: string, name: string): boolean {
  const n = placeLabels(name, '').toLowerCase();
  const c = category.toLowerCase();
  if (
    ct.includes('RESTAURANT') ||
    ct.includes('CAFE') ||
    ct.includes('SPA') ||
    ct.includes('HOTEL') ||
    c.includes('restaurant') ||
    c.includes('accommodation')
  ) {
    return false;
  }
  return (
    matchesTerrain(ct, name) ||
    ct.includes('NATIONAL_PARK') ||
    ct.includes('WATERFALL') ||
    ct.includes('BEACH') ||
    ct.includes('GLACIER') ||
    /瀑布|海滩|冰川|国家公园|高地|峡谷/i.test(n) ||
    /nature|outdoor|hiking/i.test(c)
  );
}

function isSupplyShortageType(hazardType: string): boolean {
  const t = hazardType.toLowerCase();
  return t.includes('supply_shortage') || t.includes('supply') && t.includes('short');
}

function isVolcanicHazardType(hazardType: string): boolean {
  const t = hazardType.toLowerCase();
  return t === 'volcanic' || t.includes('volcano') || t.includes('geothermal');
}

function isColdHazardType(hazardType: string): boolean {
  const t = hazardType.toLowerCase();
  return t === 'cold' || t.includes('cold') || t === 'heat' || t.includes('heat') || t === 'uv';
}

/**
 * 所有必须项统一追加「本行程涉及…」时使用：按天排序后的行程点（用于展示，可截断）
 */
export function getTripPlacesOrdered(places: TripPlaceRef[]): TripPlaceRef[] {
  return [...places].sort((a, b) => a.day - b.day || a.placeId - b.placeId);
}

export function placeDisplayName(ref: TripPlaceRef, lang: 'en' | 'zh'): string {
  if (lang === 'zh') {
    return ref.nameCN?.trim() || ref.name;
  }
  return ref.name || ref.nameCN?.trim() || `POI ${ref.placeId}`;
}

export function formatItineraryRiskSuffix(
  enrichedPois: Array<{ id?: string; name?: string; nameCN?: string; day?: number }>,
  lang: 'en' | 'zh',
): string {
  if (!enrichedPois?.length) return '';
  const parts = enrichedPois
    .filter((p) => p.day != null && (p.name || p.nameCN || p.id))
    .slice(0, 10)
    .map((p) => {
      const label =
        lang === 'zh'
          ? p.nameCN?.trim() || p.name || `POI ${p.id}`
          : p.name || p.nameCN?.trim() || `POI ${p.id}`;
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
  maxShown = 4,
): string {
  if (places.length === 0) return '';
  const sorted = getTripPlacesOrdered(places);
  const shown = sorted.slice(0, maxShown);
  const parts = shown.map((p) => {
    const label = placeDisplayName(p, lang);
    return lang === 'zh' ? `第${p.day}天 · ${label}` : `Day ${p.day}: ${label}`;
  });
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
