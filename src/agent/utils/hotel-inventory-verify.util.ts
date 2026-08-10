/**
 * 住宿库存语义：区分「按日期可订示意」与「仅 POI 地点参考」。
 */

import { resolveChinaHotelOtaLinks } from '../../trips/utils/china-ota-booking-link.util';

export type HotelInventoryMode =
  | 'detail_verified'
  | 'stay_priced'
  | 'poi_catalog'
  | 'unverified';

export type HotelInventoryMeta = {
  inventory_verified: boolean;
  inventory_mode: HotelInventoryMode;
  verified_count?: number;
  dropped_unavailable?: number;
  probed_count?: number;
  disclaimer_zh?: string;
};

const UNAVAILABLE_RE =
  /those dates are not available|dates not available|not available for these dates|sold out|no availability|unavailable for your dates|选择的日期不可订|这些日期不可用|该日期不可订|所选日期无空房/i;

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** 搜索结果是否带有该入住窗的价签（Airbnb 带日期搜索的常见可订信号） */
export function listingHasStayPriceHint(listing: unknown): boolean {
  const r = asRecord(listing);
  if (!r) return false;
  const sdp = asRecord(r.structuredDisplayPrice);
  const pl = asRecord(sdp?.primaryLine);
  if (typeof pl?.accessibilityLabel === 'string' && pl.accessibilityLabel.trim()) return true;
  if (typeof pl?.discountedLabel === 'string' && pl.discountedLabel.trim()) return true;
  if (typeof r.priceLabel === 'string' && r.priceLabel.trim()) return true;
  if (r.price != null && String(r.price).trim()) return true;
  if (r.total != null && String(r.total).trim()) return true;
  return false;
}

export function htmlSuggestsStayUnavailable(html: string): boolean {
  const t = String(html || '');
  if (!t) return false;
  return UNAVAILABLE_RE.test(t);
}

export function htmlSuggestsStayBookable(html: string): boolean {
  const t = String(html || '');
  if (!t) return false;
  if (UNAVAILABLE_RE.test(t)) return false;
  return (
    /bookItButton|Reserve|立即预订|Reserve\s*this\s*place|structuredDisplayPrice|availabilityCalendar/i.test(
      t,
    ) || /\"bookability\"\s*:\s*\"BOOKABLE\"/i.test(t)
  );
}

export function stampPoiCatalogInventory<T extends Record<string, unknown>>(
  results: T[],
  source: 'hotel' | 'amap',
): { results: T[]; inventory_meta: HotelInventoryMeta } {
  const disclaimer_zh =
    source === 'amap'
      ? '以下为高德地点参考，未核验所选日期是否有房；可跳转携程/飞猪/去哪儿确认可订性。'
      : '以下为地图地点参考（非实时房态），未核验所选日期是否有房，请点开后确认可订性。';
  const stamped = results.map((row) => {
    const base = {
      ...row,
      inventoryVerified: false,
      inventoryMode: 'poi_catalog' as const,
      availabilityDisclaimerZh: disclaimer_zh,
    };
    if (source !== 'amap') return base;
    const name = String(row.name ?? row.nameZh ?? row.nameCN ?? '').trim();
    if (!name) return base;
    const existingUrl = String(row.url ?? '').trim();
    if (existingUrl) return base;
    const ota = resolveChinaHotelOtaLinks({
      nameZh: name,
      cityHint:
        typeof row.address === 'string'
          ? String(row.address).slice(0, 24)
          : undefined,
    });
    if (!ota) return base;
    return {
      ...base,
      url: ota.bookingUrl,
      bookingProvider: ota.bookingProvider,
      bookingCtaLabelZh: ota.bookingCtaLabelZh,
      bookingLinks: ota.bookingLinks,
    };
  });
  return {
    results: stamped,
    inventory_meta: {
      inventory_verified: false,
      inventory_mode: 'poi_catalog',
      disclaimer_zh,
    },
  };
}

/**
 * 有入住窗时优先保留带价签的 Airbnb 结果；若带价过少则保留原序。
 */
export function preferStayPricedAirbnbListings<T>(
  listings: T[],
  hasStayDates: boolean,
): T[] {
  if (!hasStayDates || listings.length === 0) return listings;
  const priced = listings.filter((l) => listingHasStayPriceHint(l));
  if (priced.length >= Math.min(3, listings.length)) return priced;
  if (priced.length === 0) return listings;
  const pricedSet = new Set(priced as unknown[]);
  const rest = listings.filter((l) => !pricedSet.has(l as unknown));
  return [...priced, ...rest];
}

export function tagAirbnbInventoryFields(
  listing: Record<string, unknown>,
  mode: HotelInventoryMode,
  verified: boolean,
): Record<string, unknown> {
  return {
    ...listing,
    inventoryVerified: verified,
    inventoryMode: mode,
    ...(verified
      ? {}
      : {
          availabilityDisclaimerZh:
            mode === 'stay_priced'
              ? '搜索页带价示意，下单前请再确认所选日期是否可订。'
              : '未完成房态核验，下单前请确认所选日期是否可订。',
        }),
  };
}
