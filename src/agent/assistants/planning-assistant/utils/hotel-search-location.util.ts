/**
 * hotel.search 位置解析（Airbnb 优先用「地点, 国家」，避免仅用首都映射）。
 */

/**
 * 景点末站 → 附近宜住城镇（Airbnb 对纯景点名常漂到雷克雅未克）。
 */
export function lodgingTownAliasForAirbnb(placeName: string): string {
  const raw = String(placeName || '').trim();
  if (!raw) return raw;
  const n = raw.toLowerCase();
  if (
    /diamond\s*beach|钻石沙滩|jökulsárlón|jokulsarlon|冰河湖|杰古沙龙/.test(n) ||
    /钻石/.test(raw)
  ) {
    return 'Höfn';
  }
  if (/skaftafell|斯卡夫塔/.test(n)) {
    return 'Kirkjubæjarklaustur';
  }
  if (/vik|维克/.test(n) && !/reykjavik|雷克雅/.test(n)) {
    return 'Vík';
  }
  if (/dyrhólaey|dyrholaey|迪霍拉里/.test(n)) {
    return 'Vík';
  }
  if (/selfoss|塞尔福斯|塞耳福斯/.test(n)) {
    return 'Selfoss';
  }
  if (/seljalandsfoss|塞里雅兰/.test(n)) {
    return 'Selfoss';
  }
  return raw;
}

export function resolveAirbnbSearchLocation(input: {
  countryCode?: string | null;
  countryName?: string | null;
  /** Day 走廊 / 上游 naturalLanguage，如「杰古沙龙冰河湖」 */
  placeHint?: string | null;
  itineraryPlaceName?: string | null;
  query?: string | null;
  countryCapitalFallback?: string | null;
  latLngFallback?: { lat: number; lng: number } | null;
  /** 有行程锚点时禁止首都兜底（避免南岸晚漂到雷克雅未克） */
  preferLatLngOverCapital?: boolean;
}): string {
  const countryName = (input.countryName || '').trim();
  const placeRaw =
    cleanPlaceHint(input.placeHint) ||
    cleanPlaceHint(input.itineraryPlaceName) ||
    cleanPlaceHint(extractPlaceishFromQuery(input.query));
  const place = placeRaw ? lodgingTownAliasForAirbnb(placeRaw) : null;

  if (place && countryName) return `${place}, ${countryName}`;
  if (place) return place;
  if (input.preferLatLngOverCapital && input.latLngFallback) {
    return `${input.latLngFallback.lat},${input.latLngFallback.lng}`;
  }
  if (input.countryCapitalFallback?.trim()) return input.countryCapitalFallback.trim();
  if (input.latLngFallback) {
    return `${input.latLngFallback.lat},${input.latLngFallback.lng}`;
  }
  return countryName || 'Iceland';
}

export function isChinaHotelSearchScope(input: {
  countryCode?: string | null;
  destination?: string | null;
  placeHint?: string | null;
}): boolean {
  const code = String(input.countryCode || '').toUpperCase();
  if (code === 'CN' || code === 'HK' || code === 'MO') return true;
  const blob = `${input.destination || ''} ${input.placeHint || ''}`;
  return /中国|国内|北京|上海|广州|深圳|杭州|成都|重庆|西安|南京|苏州|三亚|厦门|青岛|香港|澳门|台湾/.test(
    blob,
  );
}

function cleanPlaceHint(raw?: string | null): string | null {
  const t = String(raw || '')
    .replace(/推荐|酒店|旅馆|宾馆|民宿|住宿|午餐|晚餐|早餐|帮我|可以|吗|的|和|与/g, ' ')
    .replace(/\blodging\b/gi, ' ')
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\d{1,2}\s*[.．/]\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length < 2) return null;
  if (/^[\d.,\s-]+$/.test(t)) return null;
  /**
   * Day 走廊合成名（含箭头/「走廊」）对 Airbnb URL 无效，易漂到错误国家；
   * 交由 itineraryPlaceName 或 lat/lng 承接。
   */
  if (/[→⟶]|走廊/.test(t)) return null;
  return t.slice(0, 80);
}

function extractPlaceishFromQuery(query?: string | null): string | null {
  return cleanPlaceHint(query);
}
