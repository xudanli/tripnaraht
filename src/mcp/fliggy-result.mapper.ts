/**
 * 飞猪 FlyAI CLI 结果 → TripNARA 住宿/活动/机票/租车/餐厅卡片字段。
 * 预订主链：官方 https（H5）；不再透传 App Scheme（唤端不稳定）。
 */

import { resolveFliggyOpenLinks } from './fliggy-app-link.util';
import { normalizeFliggyPhotoUrl } from './fliggy-photo-url.util';

export type FliggyBookingLink = {
  provider: string;
  /** 浏览器回落：https 官方链 */
  url: string;
  /** 飞猪 / 淘宝旅行 Scheme（客户端应优先尝试） */
  appUrl?: string;
  /** 手淘 tbopen 唤端 */
  tbOpenUrl?: string;
  /** 与 url 相同的 https，兼容旧客户端 */
  webUrl?: string;
  /** 默认 web（H5）；不再优先唤端 */
  openStrategy?: 'web' | 'app_then_web';
  labelZh: string;
};

export type FliggyHotelCard = {
  id: string;
  placeId: string;
  name: string;
  address?: string;
  /** 浏览器回落：https 官方 detailUrl */
  url: string;
  /** 飞猪 Scheme（有 shId 时为 market 详情，减少中间页） */
  appUrl?: string;
  /** 手淘 tbopen */
  tbOpenUrl?: string;
  /** https（同 url） */
  webUrl?: string;
  openStrategy?: 'web' | 'app_then_web';
  photoUrl?: string;
  /** 与 overview / 部分客户端字段对齐 */
  imageUrl?: string;
  photos?: string[];
  priceLabel?: string;
  rating?: number;
  listing_lat?: number;
  listing_lng?: number;
  provider: 'fliggy';
  bookingProvider: 'fliggy';
  bookingCtaLabelZh: string;
  bookingLinks: FliggyBookingLink[];
  inventoryVerified: boolean;
  inventoryMode: 'stay_priced' | 'poi_catalog';
  availabilityDisclaimerZh: string;
  source: 'fliggy';
};

export type FliggyActivityCard = {
  id: string;
  nameZh: string;
  nameEn?: string;
  category: 'ATTRACTION_TICKET' | 'SPECIAL_EXPERIENCE';
  url: string;
  appUrl?: string;
  webUrl?: string;
  priceLabel?: string;
  cta_zh: string;
  bookingProvider: 'fliggy';
  bookingLinks: FliggyBookingLink[];
  source: 'fliggy';
  inventoryMode: 'fliggy_live';
  availabilityDisclaimerZh: string;
  reasonZh: string;
  urgencyZh: string;
  /** OTA 外键；apply 时按此幂等 upsert Place */
  otaRef?: { provider: 'fliggy'; externalId: string };
  listing_lat?: number;
  listing_lng?: number;
  address?: string;
};

/** 飞猪机票卡（供 flight_inventory_snapshot / 聊天摘要） */
export type FliggyFlightCard = {
  id: string;
  title: string;
  titleZh: string;
  priceLabel?: string;
  durationLabel?: string;
  airlineZh?: string;
  flightNo?: string;
  depLabelZh?: string;
  arrLabelZh?: string;
  /** 推荐原因（供 iOS `reasonZh` / `fields_zh` 直接渲染） */
  reasonZh?: string;
  url: string;
  appUrl?: string;
  webUrl?: string;
  tbOpenUrl?: string;
  cta_zh: string;
  bookingProvider: 'fliggy';
  source: 'fliggy';
  availabilityDisclaimerZh: string;
  summaryLineZh: string;
};

/** 飞猪租车 / 餐厅等泛品类卡（keyword-search） */
export type FliggyCommerceCard = {
  id: string;
  nameZh: string;
  title: string;
  url: string;
  appUrl?: string;
  webUrl?: string;
  photoUrl?: string;
  priceLabel?: string;
  rating?: number;
  cta_zh: string;
  bookingProvider: 'fliggy';
  source: 'fliggy';
  category: 'car_rental' | 'restaurant' | 'other';
  reasonZh: string;
  availabilityDisclaimerZh: string;
};

export type MapFliggyRowsOptions = {
  checkInDate?: string | null;
  checkOutDate?: string | null;
  limit?: number;
};

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function pickNum(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.replace(/[^\d.]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function extractRows(data: unknown): Record<string, unknown>[] {
  const normalize = (rows: Record<string, unknown>[]) =>
    rows.map((r) => unwrapRowInfo(r));

  if (Array.isArray(data)) {
    return normalize(
      data.map(asRecord).filter((x): x is Record<string, unknown> => !!x),
    );
  }
  const root = asRecord(data);
  if (!root) return [];
  for (const key of [
    'itemList',
    'data',
    'results',
    'hotels',
    'hotelList',
    'items',
    'list',
    'pois',
    'poiList',
    'products',
  ]) {
    const v = root[key];
    if (Array.isArray(v) && v.length) {
      return normalize(
        v.map(asRecord).filter((x): x is Record<string, unknown> => !!x),
      );
    }
    const nested = asRecord(v);
    if (nested) {
      for (const nk of [
        'itemList',
        'list',
        'items',
        'hotels',
        'pois',
        'results',
      ]) {
        const arr = nested[nk];
        if (Array.isArray(arr) && arr.length) {
          return normalize(
            arr.map(asRecord).filter((x): x is Record<string, unknown> => !!x),
          );
        }
      }
    }
  }
  return [];
}

function fliggyBookingLinks(webUrl: string): FliggyBookingLink[] {
  return [
    {
      provider: 'fliggy',
      url: webUrl,
      webUrl,
      openStrategy: 'web',
      labelZh: '飞猪',
    },
  ];
}

function formatPriceLabel(priceRaw: string): string {
  const t = String(priceRaw ?? '').trim();
  if (!t) return t;
  if (/¥|￥|元/.test(t)) return t;
  // "600.00" → ¥600
  const n = Number(t.replace(/,/g, ''));
  if (Number.isFinite(n)) {
    return Number.isInteger(n) ? `¥${n}` : `¥${n.toFixed(0)}`;
  }
  return `¥${t}`;
}

/** 飞猪机票时常给分钟数（如 "185"），格式化为「约 3小时5分」 */
export function formatFlightDurationLabel(raw: string | number | undefined): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/小时|分钟|h|m|时|分/i.test(s) && !/^\d+(\.\d+)?$/.test(s)) return s;
  const mins = Number(s);
  if (!Number.isFinite(mins) || mins <= 0) return s;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h <= 0) return `约 ${m} 分钟`;
  if (m <= 0) return `约 ${h} 小时`;
  return `约 ${h}小时${m}分`;
}

function buildFlightReasonZh(input: {
  airlineZh?: string;
  flightNo?: string;
  durationLabel?: string;
  priceLabel?: string;
  journeyType?: string;
  seatClassName?: string;
}): string {
  const bits: string[] = [];
  if (input.journeyType) bits.push(input.journeyType);
  if (input.airlineZh) bits.push(`${input.airlineZh}执飞`);
  if (input.flightNo) bits.push(`航班 ${input.flightNo}`);
  if (input.seatClassName) bits.push(input.seatClassName);
  if (input.durationLabel) bits.push(`航程 ${input.durationLabel}`);
  if (input.priceLabel) bits.push(`参考价 ${input.priceLabel}`);
  if (!bits.length) bits.push('飞猪实时可查机票');
  bits.push('点开核对舱位、行李与退改规则');
  return bits.join('；');
}

/** 飞猪 keyword-search 常把 price 置 null，价格只写在标题里（如「日均66元起」） */
export function extractPriceHintFromTitle(title: string): string | undefined {
  const t = String(title ?? '');
  const daily = t.match(/日均\s*¥?\s*(\d+(?:\.\d+)?)\s*元?起?/);
  if (daily?.[1]) return `日均约 ¥${daily[1]} 起`;
  const yen = t.match(/(?:低至|低价|仅)?\s*¥\s*(\d+(?:\.\d+)?)\s*起?/);
  if (yen?.[1]) return `约 ¥${yen[1]} 起`;
  const cny = t.match(/(?:低至|低价|仅)?\s*(\d+(?:\.\d+)?)\s*元起/);
  if (cny?.[1]) return `约 ¥${cny[1]} 起`;
  return undefined;
}

function buildCarRentalReasonZh(nameZh: string): string {
  const bits: string[] = [];
  if (/川藏|拉萨|林芝|康定|稻城|阿里|滇藏/i.test(nameZh)) {
    bits.push('覆盖川藏/藏区自驾取还场景');
  }
  if (/成都.*拉萨|拉萨.*成都|异地还|通兑|随心租/i.test(nameZh)) {
    bits.push('标题含异地还车或通兑线索');
  }
  if (/SUV|普拉多|越野|四驱|牧马人|坦克/i.test(nameZh)) {
    bits.push('车型偏越野/SUV，更适合高原路况');
  }
  if (/经济型|日均|含基础保障/i.test(nameZh)) {
    bits.push('偏经济型套餐，适合先比价');
  }
  if (/机场/i.test(nameZh)) bits.push('含机场取还线索');
  if (!bits.length) bits.push('飞猪实时可查租车商品');
  bits.push('点开核对取还点、总价与异地还车政策');
  return bits.join('；');
}

export function mapFliggyHotelRows(
  data: unknown,
  limitOrOpts: number | MapFliggyRowsOptions = 12,
): FliggyHotelCard[] {
  const opts: MapFliggyRowsOptions =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts ?? {};
  const limit = opts.limit ?? 12;
  const rows = extractRows(data);
  const out: FliggyHotelCard[] = [];
  for (let i = 0; i < rows.length && out.length < limit; i++) {
    const r = rows[i]!;
    const name = pickStr(r, ['name', 'hotelName', 'title', 'nameZh', 'hotel_name']);
    const rawUrl = pickStr(r, [
      'detailUrl',
      'jumpUrl',
      'url',
      'bookingUrl',
      'h5Url',
      'pcUrl',
    ]);
    const shId = pickStr(r, ['shId', 'hotelId', 'shid', 'id', 'itemId']);
    const open = resolveFliggyOpenLinks({
      detailOrJumpUrl: rawUrl,
      shId,
      checkInDate: opts.checkInDate,
      checkOutDate: opts.checkOutDate,
    });
    if (!name || !open) continue;
    const id = shId || `fliggy-hotel-${i}`;
    const photo = normalizeFliggyPhotoUrl(
      pickStr(r, ['mainPic', 'picUrl', 'image', 'cover', 'pic']),
    );
    const priceRaw = pickStr(r, [
      'price',
      'priceLabel',
      'priceText',
      'lowestPrice',
      'priceWithTax',
    ]);
    const rating = pickNum(r, ['rating', 'score', 'rate', 'commentScore']);
    const address =
      pickStr(r, ['address', 'addr', 'location', 'area', 'interestsPoi']) ||
      undefined;
    const lat = pickNum(r, ['latitude', 'lat']);
    const lng = pickNum(r, ['longitude', 'lng', 'lon']);
    const hasPrice = Boolean(priceRaw);
    out.push({
      id: String(id),
      placeId: String(id),
      name,
      ...(address ? { address } : {}),
      url: open.webUrl,
      webUrl: open.webUrl,
      openStrategy: 'web',
      ...(photo
        ? { photoUrl: photo, imageUrl: photo, photos: [photo] }
        : {}),
      ...(priceRaw ? { priceLabel: formatPriceLabel(priceRaw) } : {}),
      ...(rating != null ? { rating } : {}),
      ...(lat != null && lng != null
        ? { listing_lat: lat, listing_lng: lng }
        : {}),
      provider: 'fliggy',
      bookingProvider: 'fliggy',
      bookingCtaLabelZh: '去飞猪查看',
      // bookingLinks 仅保留 https，避免客户端误走 Scheme
      bookingLinks: fliggyBookingLinks(open.webUrl),
      inventoryVerified: hasPrice,
      inventoryMode: hasPrice ? 'stay_priced' : 'poi_catalog',
      availabilityDisclaimerZh: hasPrice
        ? '飞猪实时结果（含参考价），下单前请以飞猪页为准。'
        : '飞猪搜索结果，未确认所选日期房态，请点开后核验。',
      source: 'fliggy',
    });
  }
  return out;
}

export function mapFliggyActivityRows(
  data: unknown,
  limitOrOpts: number | MapFliggyRowsOptions = 6,
): FliggyActivityCard[] {
  const opts: MapFliggyRowsOptions =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts ?? {};
  const limit = opts.limit ?? 6;
  const rows = extractRows(data);
  const out: FliggyActivityCard[] = [];
  for (let i = 0; i < rows.length && out.length < limit; i++) {
    const r = rows[i]!;
    const nameZh = pickStr(r, [
      'name',
      'title',
      'poiName',
      'nameZh',
      'productName',
    ]);
    const rawUrl = pickStr(r, [
      'jumpUrl',
      'detailUrl',
      'url',
      'bookingUrl',
      'h5Url',
    ]);
    const open = resolveFliggyOpenLinks({ detailOrJumpUrl: rawUrl });
    if (!nameZh || !open) continue;
    const id = pickStr(r, ['poiId', 'id', 'itemId', 'productId']) || `fliggy-poi-${i}`;
    const priceRaw = pickStr(r, ['price', 'priceLabel', 'ticketPrice', 'lowestPrice']);
    const lat = pickNum(r, ['latitude', 'lat']);
    const lng = pickNum(r, ['longitude', 'lng', 'lon']);
    const address = pickStr(r, ['address', 'addr', 'location']);
    out.push({
      id: String(id),
      nameZh,
      category: 'ATTRACTION_TICKET',
      url: open.webUrl,
      webUrl: open.webUrl,
      ...(priceRaw ? { priceLabel: formatPriceLabel(priceRaw) } : {}),
      cta_zh: '去飞猪预订',
      bookingProvider: 'fliggy',
      bookingLinks: fliggyBookingLinks(open.webUrl),
      source: 'fliggy',
      inventoryMode: 'fliggy_live',
      availabilityDisclaimerZh: '飞猪实时结果，下单前请以飞猪页为准。',
      reasonZh: '飞猪可订门票/体验（Based on fly.ai real-time results）',
      urgencyZh: 'HIGH',
      otaRef: { provider: 'fliggy', externalId: String(id) },
      ...(lat != null && lng != null ? { listing_lat: lat, listing_lng: lng } : {}),
      ...(address ? { address } : {}),
    });
  }
  return out;
}

function unwrapRowInfo(r: Record<string, unknown>): Record<string, unknown> {
  const info = asRecord(r.info);
  return info ? { ...r, ...info } : r;
}

export function mapFliggyFlightRows(
  data: unknown,
  limitOrOpts: number | MapFliggyRowsOptions = 6,
): FliggyFlightCard[] {
  const opts: MapFliggyRowsOptions =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts ?? {};
  const limit = opts.limit ?? 6;
  const rows = extractRows(data);
  const out: FliggyFlightCard[] = [];
  for (let i = 0; i < rows.length && out.length < limit; i++) {
    const r = unwrapRowInfo(rows[i]!);
    const journeys = Array.isArray(r.journeys) ? r.journeys : [];
    const firstJourney = asRecord(journeys[0]);
    const segs = Array.isArray(firstJourney?.segments)
      ? (firstJourney!.segments as unknown[])
      : [];
    const firstSeg = asRecord(segs[0]);
    const lastSeg = asRecord(segs[segs.length - 1] ?? segs[0]);
    const airlineZh =
      pickStr(firstSeg ?? {}, ['marketingTransportName', 'airline', 'carrier']) ||
      pickStr(r, ['airline', 'airlineName']);
    const flightNo =
      pickStr(firstSeg ?? {}, ['marketingTransportNo', 'flightNo', 'transportNo']) ||
      pickStr(r, ['flightNo']);
    const depCity =
      pickStr(firstSeg ?? {}, ['depCityName', 'depStationShortName', 'depStationName']) ||
      '';
    const arrCity =
      pickStr(lastSeg ?? {}, ['arrCityName', 'arrStationShortName', 'arrStationName']) ||
      '';
    const depTime = pickStr(firstSeg ?? {}, ['depDateTime', 'depTime']);
    const arrTime = pickStr(lastSeg ?? {}, ['arrDateTime', 'arrTime']);
    const durationRaw =
      pickStr(r, ['totalDuration', 'duration']) ||
      pickStr(firstJourney ?? {}, ['totalDuration', 'duration']);
    const durationLabel = formatFlightDurationLabel(durationRaw);
    const journeyType = pickStr(firstJourney ?? {}, ['journeyType', 'transferType']);
    const seatClassName = pickStr(firstSeg ?? {}, ['seatClassName', 'cabinClass', 'cabin']);
    // 飞猪 search-flight 实参字段为 ticketPrice（非 adultPrice）
    const priceRaw =
      pickStr(r, [
        'ticketPrice',
        'adultPrice',
        'price',
        'priceLabel',
        'lowestPrice',
        'totalPrice',
        'salePrice',
        'discountPrice',
      ]) ||
      (() => {
        const priceObj = asRecord(r.priceInfo) || asRecord(r.price);
        if (!priceObj) return undefined;
        return pickStr(priceObj, [
          'ticketPrice',
          'adultPrice',
          'price',
          'lowestPrice',
          'totalPrice',
          'amount',
        ]);
      })() ||
      undefined;
    const priceLabel = priceRaw ? formatPriceLabel(priceRaw) : undefined;
    const rawUrl = pickStr(r, ['jumpUrl', 'detailUrl', 'url', 'bookingUrl', 'h5Url']);
    const open = resolveFliggyOpenLinks({ detailOrJumpUrl: rawUrl });
    const titleBits = [airlineZh, flightNo, depCity && arrCity ? `${depCity}→${arrCity}` : '']
      .filter(Boolean)
      .join(' ');
    const title =
      titleBits ||
      pickStr(r, ['title', 'name', 'nameZh']) ||
      `飞猪航班 ${i + 1}`;
    if (!open) continue;
    const id =
      pickStr(r, ['id', 'itemId', 'offerId']) ||
      `fliggy-flight-${flightNo || i}-${String(depTime ?? '').slice(0, 10)}`;
    const reasonZh = buildFlightReasonZh({
      airlineZh,
      flightNo,
      durationLabel,
      priceLabel,
      journeyType,
      seatClassName,
    });
    const summaryLineZh = [
      title,
      priceLabel || null,
      durationLabel || null,
      depTime ? `起飞 ${depTime}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    out.push({
      id: String(id),
      title,
      titleZh: title,
      ...(priceLabel ? { priceLabel } : {}),
      ...(durationLabel ? { durationLabel } : {}),
      ...(airlineZh ? { airlineZh } : {}),
      ...(flightNo ? { flightNo } : {}),
      ...(depCity || depTime
        ? { depLabelZh: [depCity, depTime].filter(Boolean).join(' ') }
        : {}),
      ...(arrCity || arrTime
        ? { arrLabelZh: [arrCity, arrTime].filter(Boolean).join(' ') }
        : {}),
      reasonZh,
      url: open.webUrl,
      webUrl: open.webUrl,
      // 不写 appUrl/tbOpenUrl：客户端按 H5 打开，避免误走唤端
      cta_zh: '去飞猪订票',
      bookingProvider: 'fliggy',
      source: 'fliggy',
      availabilityDisclaimerZh: '飞猪实时机票结果，舱位与价格以下单页为准。',
      summaryLineZh,
    });
  }
  return out;
}

function classifyCommerceCategory(
  text: string,
): FliggyCommerceCard['category'] {
  if (/租车|取车|还车|车行|自驾|SUV|轿车|网约车/i.test(text)) return 'car_rental';
  if (/餐|美食|饭店|火锅|料理|米其林|私房菜|小吃|咖啡|食堂/i.test(text)) {
    return 'restaurant';
  }
  return 'other';
}

/** keyword-search 结果按品类过滤为租车/餐厅卡 */
export function mapFliggyCommerceRows(
  data: unknown,
  opts?: { limit?: number; category?: FliggyCommerceCard['category'] },
): FliggyCommerceCard[] {
  const limit = opts?.limit ?? 6;
  const want = opts?.category;
  const rows = extractRows(data);
  const out: FliggyCommerceCard[] = [];
  for (let i = 0; i < rows.length && out.length < limit; i++) {
    const r = unwrapRowInfo(rows[i]!);
    const nameZh =
      pickStr(r, ['title', 'name', 'nameZh', 'productName', 'poiName']) || '';
    const tags = Array.isArray(r.tags)
      ? r.tags.map((t) => String(t)).join(' ')
      : pickStr(r, ['tags', 'tag', 'category', 'scoreDesc']) || '';
    const blob = `${nameZh} ${tags}`;
    const category = classifyCommerceCategory(blob);
    // 租车：勿把民宿/酒店等「其他」结果灌进 car_rentals（iOS 会当成租车卡）
    if (want === 'car_rental') {
      if (/民宿|酒店|宾馆|客栈|青旅|公寓|旅馆|客栈|度假村/i.test(nameZh)) continue;
      if (category !== 'car_rental') continue;
    } else if (want && category !== want && want !== 'other') {
      // 餐厅等：无标签时仍可少量接受「其他」带跳转结果
      if (category !== 'other' || out.length >= Math.min(2, limit)) continue;
    }
    const rawUrl = pickStr(r, ['jumpUrl', 'detailUrl', 'url', 'bookingUrl', 'h5Url']);
    const open = resolveFliggyOpenLinks({ detailOrJumpUrl: rawUrl });
    if (!nameZh || !open) continue;
    const priceRaw =
      pickStr(r, [
        'price',
        'priceLabel',
        'adultPrice',
        'lowestPrice',
        'commissionMoneyYuan',
        'discountPrice',
        'salePrice',
      ]) || extractPriceHintFromTitle(nameZh);
    const photo = normalizeFliggyPhotoUrl(
      pickStr(r, ['picUrl', 'mainPic', 'photoUrl', 'image', 'cover']),
    );
    const rating = pickNum(r, ['score', 'rating', 'star']);
    const id = pickStr(r, ['id', 'itemId', 'productId']) || `fliggy-commerce-${i}`;
    const resolvedCategory = want && category === 'other' ? want : category;
    const cta =
      resolvedCategory === 'car_rental'
        ? '去飞猪租车'
        : resolvedCategory === 'restaurant'
          ? '去飞猪查看'
          : '去飞猪打开';
    const reasonZh =
      resolvedCategory === 'car_rental'
        ? buildCarRentalReasonZh(nameZh)
        : resolvedCategory === 'restaurant'
          ? '飞猪可查餐饮/美食结果；到店前请再确认营业与排队'
          : '飞猪可订/可查结果；详情以飞猪页为准';
    const priceLabel = priceRaw
      ? /日均|约 ¥|元起/.test(priceRaw)
        ? priceRaw
        : formatPriceLabel(priceRaw)
      : undefined;
    out.push({
      id: String(id),
      nameZh,
      title: nameZh,
      url: open.webUrl,
      webUrl: open.webUrl,
      ...(photo ? { photoUrl: photo } : {}),
      ...(priceLabel ? { priceLabel } : {}),
      ...(rating != null ? { rating } : {}),
      cta_zh: cta,
      bookingProvider: 'fliggy',
      source: 'fliggy',
      category: resolvedCategory,
      reasonZh,
      availabilityDisclaimerZh:
        resolvedCategory === 'car_rental'
          ? '飞猪列表价可能不全；总价与异地还车费以飞猪下单页为准。'
          : '飞猪实时结果，下单前请以飞猪页为准。',
    });
  }
  return out;
}
