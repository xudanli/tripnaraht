/**
 * 聊天租车推荐卡片：Booking MCP / Guidance / 目录 → summary_json.car_rental_cards
 */

import {
  ICELAND_CAR_RENTAL_CATALOG,
  matchCarRentalCatalogEntries,
  type IcelandCarRentalCatalogEntry,
} from '../../mcp/iceland-car-rental-catalog';

export const CAR_RENTAL_CARDS_SCHEMA = 'tripnara/chat_car_rental_cards@v1' as const;

export type CarRentalChatCard = {
  id: string;
  name: string;
  nameZh: string;
  nameEn?: string;
  company?: string;
  vehicleType?: string;
  url?: string;
  priceLabel?: string;
  pickupLabelZh?: string;
  dropoffLabelZh?: string;
  reasonZh?: string;
  cta_zh: string;
  actions: Array<{
    action: string;
    label: string;
    labelCN: string;
    params?: Record<string, unknown>;
  }>;
  fields_zh: Array<{ key: string; label: string; value: string }>;
  field_labels_zh: Record<string, string>;
  source:
    | 'booking_com'
    | 'iceland_rental_guidance'
    | 'catalog_fallback'
    | 'browserbase'
    | 'fliggy';
  availabilityDisclaimerZh?: string;
};

export function isCarRentalChatCardQuery(message: string): boolean {
  const msg = String(message ?? '').trim();
  if (!msg) return false;
  return (
    /我要租车|想租车|需要租车|推荐租车|租一辆车|租一辆|租辆|租越野|租台|查询租车|租车公司|车行推荐|哪家租车|车型报价|取车|还车|异地还|自驾租车|\bcar\s+rental\b|\brent\s+a\s+car\b|\brental\s+car\b/i.test(
      msg,
    ) ||
    // 「成都租车」「拉萨租车」等城市锚点话术
    /[\u4e00-\u9fff]{2,8}\s*租车/.test(msg) ||
    // 「我想在康定租一辆越野车」：有租+车型词但未必出现连续「租车」
    (/租/.test(msg) && /越野|SUV|四驱|轿车|车型/.test(msg)) ||
    (/租车/.test(msg) && /推荐|比价|公司|车行|报价|SUV|四驱|保险|拉萨|成都|北京|上海|康定|理塘/.test(msg))
  );
}

function extractPriceFromTitle(text: string): string | undefined {
  const t = String(text ?? '');
  const daily = t.match(/日均\s*¥?\s*(\d+(?:\.\d+)?)\s*元?起?/);
  if (daily?.[1]) return `日均约 ¥${daily[1]} 起`;
  const cny = t.match(/(?:低至|低价|仅)?\s*(\d+(?:\.\d+)?)\s*元起/);
  if (cny?.[1]) return `约 ¥${cny[1]} 起`;
  const yen = t.match(/¥\s*(\d+(?:\.\d+)?)\s*起?/);
  if (yen?.[1]) return `约 ¥${yen[1]} 起`;
  return undefined;
}

function formatPrice(row: Record<string, unknown>): string | undefined {
  const priceObj = row.price as Record<string, unknown> | undefined;
  if (priceObj && typeof priceObj === 'object') {
    const amount = priceObj.amount ?? priceObj.total;
    const currency = priceObj.currency ?? priceObj.currency_code ?? '';
    if (amount != null && String(amount).trim()) {
      return `${currency ? `${currency} ` : ''}${amount}`.trim();
    }
  }
  const raw = row.priceLabel ?? row.price_text ?? row.totalPrice;
  if (raw != null && String(raw).trim()) return String(raw).trim();
  // 飞猪 keyword-search 常无结构化价，从标题抽「日均66元起」等
  return (
    extractPriceFromTitle(String(row.nameZh ?? row.name ?? row.title ?? '')) ||
    undefined
  );
}

function buildFliggyCarReasonZh(row: Record<string, unknown>): string {
  const existing = String(row.reasonZh ?? '').trim();
  if (existing && !/Based on fly\.ai/i.test(existing)) return existing;
  const nameZh = String(row.nameZh ?? row.name ?? row.title ?? '');
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
  if (!bits.length) bits.push('飞猪实时可查租车商品');
  bits.push('点开核对取还点、总价与异地还车政策');
  return bits.join('；');
}

function locLabel(loc: unknown): string | undefined {
  if (!loc || typeof loc !== 'object') return undefined;
  const o = loc as Record<string, unknown>;
  const addr = String(o.address ?? o.name ?? o.label ?? '').trim();
  return addr || undefined;
}

function toCardFromCatalog(entry: IcelandCarRentalCatalogEntry): CarRentalChatCard {
  const fields_zh: CarRentalChatCard['fields_zh'] = [
    { key: 'kind', label: '类型', value: entry.kind === 'aggregation' ? '比价入口' : '本地车行' },
    { key: 'reason', label: '推荐原因', value: entry.reasonZh },
  ];
  if (entry.tagsZh?.length) {
    fields_zh.push({ key: 'tags', label: '标签', value: entry.tagsZh.join('、') });
  }
  fields_zh.push({ key: 'link', label: '官网', value: '点击打开' });

  return {
    id: entry.id,
    name: entry.nameZh,
    nameZh: entry.nameZh,
    nameEn: entry.nameEn,
    company: entry.nameEn,
    url: entry.url,
    reasonZh: entry.reasonZh,
    cta_zh: entry.kind === 'aggregation' ? '去比价' : '打开官网',
    actions: [
      {
        action: 'open_car_rental_url',
        label: 'Open',
        labelCN: entry.kind === 'aggregation' ? '去比价' : '打开官网',
        params: { url: entry.url },
      },
    ],
    fields_zh,
    field_labels_zh: {
      kind: '类型',
      reason: '推荐原因',
      tags: '标签',
      link: '官网',
    },
    source: 'catalog_fallback',
    availabilityDisclaimerZh: '目录参考；实时报价与可订性以官网 / Booking 为准',
  };
}

/** Booking.com / 飞猪 MCP `car_rentals[]` → 聊天卡 */
export function mapBookingCarRentalsToChatCards(
  rows: Array<Record<string, unknown>>,
  opts?: {
    pickUpDate?: string;
    dropOffDate?: string;
    fallbackDatesUsed?: boolean;
  },
): CarRentalChatCard[] {
  return rows.slice(0, 6).map((row, i) => {
    const fromFliggy = String(row.source ?? '') === 'fliggy';
    const company = String(
      row.company ?? row.supplier ?? row.nameZh ?? row.name ?? `租车 ${i + 1}`,
    ).trim();
    const vehicleType = String(
      row.vehicle_type ?? row.vehicleType ?? row.car_class ?? row.vehicle ?? '',
    ).trim();
    const priceLabel = formatPrice(row);
    const reasonZh = fromFliggy
      ? buildFliggyCarReasonZh(row)
      : String(row.reasonZh ?? '').trim() || undefined;
    const pickupLabelZh = locLabel(row.pickup_location ?? row.pickupLocation);
    const dropoffLabelZh = locLabel(row.dropoff_location ?? row.dropoffLocation);
    // 飞猪：只用 https（webUrl），勿用 App Scheme deeplink
    const url =
      String(
        (fromFliggy
          ? row.webUrl ?? row.url ?? row.booking_url
          : row.url ?? row.webUrl ?? row.booking_url ?? row.deeplink) ?? '',
      ).trim() || undefined;
    const h5Url =
      url && /^https?:\/\//i.test(url)
        ? url
        : String(row.webUrl ?? '').trim() || undefined;
    const openUrl = fromFliggy ? h5Url || url : url;
    const id = String(row.id ?? row.offer_id ?? `${fromFliggy ? 'fliggy' : 'booking'}-car-${i}`);

    const fields_zh: CarRentalChatCard['fields_zh'] = [];
    if (vehicleType) fields_zh.push({ key: 'vehicle', label: '车型', value: vehicleType });
    if (priceLabel) {
      fields_zh.push({ key: 'price', label: '价格', value: priceLabel });
    } else if (fromFliggy) {
      fields_zh.push({
        key: 'price',
        label: '价格',
        value: '飞猪页查看实时总价',
      });
    }
    if (reasonZh) fields_zh.push({ key: 'reason', label: '推荐原因', value: reasonZh });
    if (opts?.pickUpDate && opts?.dropOffDate) {
      fields_zh.push({
        key: 'dates',
        label: '取还',
        value: `${opts.pickUpDate} → ${opts.dropOffDate}`,
      });
    }
    if (pickupLabelZh) fields_zh.push({ key: 'pickup', label: '取车点', value: pickupLabelZh });
    if (dropoffLabelZh) fields_zh.push({ key: 'dropoff', label: '还车点', value: dropoffLabelZh });
    fields_zh.push({
      key: 'disclaimer',
      label: '说明',
      value: opts?.fallbackDatesUsed
        ? '示例取还日窗口，报价仅供示意'
        : fromFliggy
          ? '列表价可能不全；总价与异地还车费以飞猪下单页为准'
          : '价格与可订性以预订页实时为准',
    });

    const nameZh = vehicleType ? `${company} · ${vehicleType}` : company;
    const cta = fromFliggy
      ? String(row.cta_zh ?? '去飞猪租车')
      : openUrl
        ? '查看报价'
        : '参考报价';
    const actions = openUrl
      ? [
          {
            action: 'open_car_rental_url',
            label: 'Open',
            labelCN: fromFliggy ? '去飞猪租车' : '查看报价',
            params: {
              url: openUrl,
              ...(fromFliggy
                ? { open_strategy: 'web' as const, fallback_url: openUrl, webUrl: openUrl }
                : {}),
            },
          },
        ]
      : [];

    return {
      id,
      name: nameZh,
      nameZh,
      nameEn: company,
      company,
      ...(vehicleType ? { vehicleType } : {}),
      ...(openUrl ? { url: openUrl } : {}),
      ...(priceLabel ? { priceLabel } : {}),
      ...(reasonZh ? { reasonZh } : {}),
      ...(pickupLabelZh ? { pickupLabelZh } : {}),
      ...(dropoffLabelZh ? { dropoffLabelZh } : {}),
      cta_zh: cta,
      actions,
      fields_zh,
      field_labels_zh: {
        vehicle: '车型',
        price: '价格',
        reason: '推荐原因',
        dates: '取还',
        pickup: '取车点',
        dropoff: '还车点',
        disclaimer: '说明',
      },
      source: fromFliggy ? ('fliggy' as const) : ('booking_com' as const),
      availabilityDisclaimerZh: opts?.fallbackDatesUsed
        ? '当前为系统示例取还日；请以行程真实日期重新查询'
        : fromFliggy
          ? '飞猪列表价可能不全；总价与异地还车费以飞猪下单页为准'
          : 'Booking.com 摘录；下单前请再确认可订性与保险条款',
    };
  });
}

/** iceland_rental_guidance 载荷 → 聊天卡 */
export function mapIcelandRentalGuidanceToChatCards(
  guidance: Record<string, unknown>,
): CarRentalChatCard[] {
  const locals = Array.isArray(guidance.trusted_local_providers)
    ? (guidance.trusted_local_providers as Array<Record<string, unknown>>)
    : [];
  const portals = Array.isArray(guidance.aggregation_portals)
    ? (guidance.aggregation_portals as Array<Record<string, unknown>>)
    : [];

  const fromLocal = locals.slice(0, 4).map((p, i) => {
    const name = String(p.name ?? `本地车行 ${i + 1}`);
    const url = String(p.url ?? '').trim();
    const reasonZh = String(p.positioning_zh ?? p.role_zh ?? '').trim();
    const tags = Array.isArray(p.trust_tags)
      ? p.trust_tags.map((t) => String(t)).filter(Boolean)
      : [];
    const fields_zh: CarRentalChatCard['fields_zh'] = [
      { key: 'kind', label: '类型', value: '本地车行' },
    ];
    if (reasonZh) fields_zh.push({ key: 'reason', label: '推荐原因', value: reasonZh });
    if (tags.length) fields_zh.push({ key: 'tags', label: '标签', value: tags.join('、') });
    if (url) fields_zh.push({ key: 'link', label: '官网', value: '点击打开' });

    return {
      id: String(p.id ?? `guidance-local-${i}`),
      name,
      nameZh: name,
      company: name,
      ...(url ? { url } : {}),
      ...(reasonZh ? { reasonZh } : {}),
      cta_zh: '打开官网',
      actions: url
        ? [
            {
              action: 'open_car_rental_url',
              label: 'Open',
              labelCN: '打开官网',
              params: { url },
            },
          ]
        : [],
      fields_zh,
      field_labels_zh: { kind: '类型', reason: '推荐原因', tags: '标签', link: '官网' },
      source: 'iceland_rental_guidance' as const,
      availabilityDisclaimerZh: '决策层推荐；实时报价请走 Booking / 官网',
    } satisfies CarRentalChatCard;
  });

  const fromPortal = portals.slice(0, 2).map((p, i) => {
    const name = String(p.name ?? `比价入口 ${i + 1}`);
    const url = String(p.url ?? '').trim();
    const reasonZh = String(p.role_zh ?? '').trim();
    const fields_zh: CarRentalChatCard['fields_zh'] = [
      { key: 'kind', label: '类型', value: '比价入口' },
    ];
    if (reasonZh) fields_zh.push({ key: 'reason', label: '推荐原因', value: reasonZh });

    return {
      id: String(p.id ?? `guidance-portal-${i}`),
      name,
      nameZh: name,
      company: name,
      ...(url ? { url } : {}),
      ...(reasonZh ? { reasonZh } : {}),
      cta_zh: '去比价',
      actions: url
        ? [
            {
              action: 'open_car_rental_url',
              label: 'Open',
              labelCN: '去比价',
              params: { url },
            },
          ]
        : [],
      fields_zh,
      field_labels_zh: { kind: '类型', reason: '推荐原因' },
      source: 'iceland_rental_guidance' as const,
    } satisfies CarRentalChatCard;
  });

  return [...fromLocal, ...fromPortal].slice(0, 6);
}

export function buildCarRentalChatCards(input: {
  userMessage: string;
  answerText?: string;
  bookingResults?: Array<Record<string, unknown>>;
  icelandRentalGuidance?: Record<string, unknown> | null;
  carRentalSearchMeta?: Record<string, unknown> | null;
}): CarRentalChatCard[] {
  const meta = input.carRentalSearchMeta ?? {};
  const pickUpDate = typeof meta.pick_up_date === 'string' ? meta.pick_up_date : undefined;
  const dropOffDate = typeof meta.drop_off_date === 'string' ? meta.drop_off_date : undefined;
  const fallbackDatesUsed = meta.fallback_dates_used === true;

  if (input.bookingResults?.length) {
    /** 已成型且已含价格/原因字段时透传；否则统一走 map 补全 fields_zh */
    const prebuilt = input.bookingResults.filter(
      (r) =>
        r &&
        typeof r === 'object' &&
        r.nameZh &&
        r.cta_zh &&
        Array.isArray(r.actions) &&
        Array.isArray(r.fields_zh) &&
        (r.fields_zh as unknown[]).some(
          (f) =>
            f &&
            typeof f === 'object' &&
            ((f as { key?: string }).key === 'price' ||
              (f as { key?: string }).key === 'reason'),
        ),
    );
    if (prebuilt.length === input.bookingResults.length) {
      return prebuilt.slice(0, 6) as unknown as CarRentalChatCard[];
    }
    return mapBookingCarRentalsToChatCards(input.bookingResults, {
      pickUpDate,
      dropOffDate,
      fallbackDatesUsed,
    });
  }

  if (input.icelandRentalGuidance) {
    const fromGuidance = mapIcelandRentalGuidanceToChatCards(input.icelandRentalGuidance);
    if (fromGuidance.length) return fromGuidance;
  }

  return matchCarRentalCatalogEntries(4).map(toCardFromCatalog);
}

export { ICELAND_CAR_RENTAL_CATALOG };
