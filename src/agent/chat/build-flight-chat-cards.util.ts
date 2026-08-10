/**
 * 聊天机票推荐卡片：飞猪 / Amadeus sample_offers → summary_json.flight_cards
 */

import { isExecutableFlightInventoryQuery } from '../utils/flight-inventory-signals.util';

export const FLIGHT_CARDS_SCHEMA = 'tripnara/chat_flight_cards@v1' as const;

export type FlightChatCard = {
  id: string;
  name: string;
  nameZh: string;
  titleZh?: string;
  url?: string;
  appUrl?: string;
  webUrl?: string;
  tbOpenUrl?: string;
  priceLabel?: string;
  durationLabel?: string;
  airlineZh?: string;
  flightNo?: string;
  depLabelZh?: string;
  arrLabelZh?: string;
  summaryLineZh?: string;
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
  source: 'fliggy' | 'amadeus' | 'flight_mcp' | 'unknown';
  bookingProvider?: string;
  availabilityDisclaimerZh?: string;
};

export function isFlightChatCardQuery(message: string): boolean {
  return isExecutableFlightInventoryQuery(message);
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function inferSource(row: Record<string, unknown>): FlightChatCard['source'] {
  const s = String(row.source ?? row.provider ?? row.bookingProvider ?? '').toLowerCase();
  if (s.includes('fliggy')) return 'fliggy';
  if (s.includes('amadeus')) return 'amadeus';
  if (s.includes('flight_mcp') || s.includes('mcp')) return 'flight_mcp';
  return 'unknown';
}

function formatPriceLabel(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return t;
  if (/¥|￥|元/.test(t)) return t;
  const n = Number(t.replace(/,/g, ''));
  if (Number.isFinite(n)) return `¥${Math.round(n)}`;
  return `¥${t}`;
}

function extractPriceFromText(text: string): string | undefined {
  const t = String(text ?? '');
  const yen = t.match(/¥\s*(\d+(?:\.\d+)?)/);
  if (yen?.[1]) return `¥${Math.round(Number(yen[1]))}`;
  const cny = t.match(/(\d+(?:\.\d+)?)\s*元/);
  if (cny?.[1]) return `¥${Math.round(Number(cny[1]))}`;
  return undefined;
}

function buildReasonZh(row: Record<string, unknown>): string {
  const existing = pickStr(row, ['reasonZh', 'reason_zh']);
  if (existing && !/Based on fly\.ai/i.test(existing)) return existing;
  const bits: string[] = [];
  const airline = pickStr(row, ['airlineZh', 'airline']);
  const flightNo = pickStr(row, ['flightNo', 'flight_no']);
  const price =
    pickStr(row, ['priceLabel', 'price_label', 'price_total', 'price', 'ticketPrice']) ||
    extractPriceFromText(String(row.summaryLineZh ?? row.titleZh ?? row.title ?? ''));
  if (airline) bits.push(`${airline}执飞`);
  if (flightNo) bits.push(`航班 ${flightNo}`);
  if (pickStr(row, ['durationLabel', 'duration'])) {
    bits.push(`航程 ${pickStr(row, ['durationLabel', 'duration'])}`);
  }
  if (price) bits.push(`参考价 ${price}`);
  if (!bits.length) bits.push('实时可查机票报价');
  bits.push('点开核对舱位、行李与退改规则');
  return bits.join('；');
}

function toCardFromOffer(row: Record<string, unknown>, index: number): FlightChatCard | null {
  const summaryLineZh =
    pickStr(row, ['summaryLineZh', 'summary_line', 'titleZh', 'title', 'nameZh', 'name']) ||
    undefined;
  const nameZh =
    pickStr(row, ['titleZh', 'title', 'nameZh', 'name', 'summaryLineZh']) ||
    summaryLineZh ||
    `航班选项 ${index + 1}`;
  const url =
    pickStr(row, ['url', 'webUrl', 'jumpUrl', 'detailUrl', 'bookingUrl', 'h5Url']) || undefined;
  const webUrl = pickStr(row, ['webUrl', 'web_url']) || url;
  const priceRaw =
    pickStr(row, [
      'priceLabel',
      'price_label',
      'price_total',
      'price',
      'ticketPrice',
      'adultPrice',
    ]) ||
    extractPriceFromText(String(row.summaryLineZh ?? row.titleZh ?? row.title ?? '')) ||
    undefined;
  const priceLabel = priceRaw ? formatPriceLabel(priceRaw) : undefined;
  const durationLabel =
    pickStr(row, ['durationLabel', 'duration_label', 'duration']) || undefined;
  const airlineZh = pickStr(row, ['airlineZh', 'airline']);
  const flightNo = pickStr(row, ['flightNo', 'flight_no']);
  const depLabelZh = pickStr(row, ['depLabelZh', 'dep_label_zh']);
  const arrLabelZh = pickStr(row, ['arrLabelZh', 'arr_label_zh']);
  const id =
    pickStr(row, ['id', 'offer_id', 'itemId']) ||
    `flight-${flightNo || index}-${String(depLabelZh ?? '').slice(0, 16)}`;
  const source = inferSource(row);
  const reasonZh = buildReasonZh({ ...row, ...(priceLabel ? { priceLabel } : {}) });
  const cta_zh =
    pickStr(row, ['cta_zh', 'ctaZh']) ||
    (source === 'fliggy' ? '去飞猪订票' : '查看报价');

  if (!url && !summaryLineZh && !flightNo) return null;

  // 字段顺序与租车卡对齐：价格 → 推荐原因 → 其它，便于 iOS 复用同一渲染
  const fields_zh: FlightChatCard['fields_zh'] = [];
  if (priceLabel) {
    fields_zh.push({ key: 'price', label: '价格', value: priceLabel });
  } else if (source === 'fliggy') {
    fields_zh.push({ key: 'price', label: '价格', value: '飞猪页查看实时票价' });
  }
  fields_zh.push({ key: 'reason', label: '推荐原因', value: reasonZh });
  if (durationLabel) fields_zh.push({ key: 'duration', label: '航程', value: durationLabel });
  if (depLabelZh) fields_zh.push({ key: 'dep', label: '出发', value: depLabelZh });
  if (arrLabelZh) fields_zh.push({ key: 'arr', label: '到达', value: arrLabelZh });
  if (airlineZh) fields_zh.push({ key: 'airline', label: '航司', value: airlineZh });
  if (flightNo) fields_zh.push({ key: 'flight_no', label: '航班号', value: flightNo });

  /** 唤端不稳定：机票 CTA 只走 H5 https */
  const openUrl = webUrl || url;
  const actions: FlightChatCard['actions'] = openUrl
    ? [
        {
          action: 'open_url',
          label: 'Open',
          labelCN: cta_zh,
          params: {
            url: openUrl,
            fallback_url: openUrl,
            open_strategy: 'web',
          },
        },
      ]
    : [];

  return {
    id: String(id),
    name: nameZh,
    nameZh,
    titleZh: nameZh,
    ...(openUrl ? { url: openUrl } : {}),
    ...(openUrl ? { webUrl: openUrl } : {}),
    ...(priceLabel ? { priceLabel } : {}),
    ...(durationLabel ? { durationLabel } : {}),
    ...(airlineZh ? { airlineZh } : {}),
    ...(flightNo ? { flightNo } : {}),
    ...(depLabelZh ? { depLabelZh } : {}),
    ...(arrLabelZh ? { arrLabelZh } : {}),
    ...(summaryLineZh ? { summaryLineZh } : {}),
    reasonZh,
    cta_zh,
    actions,
    fields_zh,
    field_labels_zh: Object.fromEntries(fields_zh.map((f) => [f.key, f.label])),
    source,
    ...(source === 'fliggy' ? { bookingProvider: 'fliggy' } : {}),
    availabilityDisclaimerZh:
      pickStr(row, ['availabilityDisclaimerZh']) ||
      (source === 'fliggy'
        ? '飞猪实时机票结果，舱位与价格以下单页为准。'
        : '报价为采样结果，舱位与价格以预订页为准。'),
  };
}

/** 从 flight_inventory_snapshot.legs[].sample_offers 生成聊天卡 */
export function buildFlightChatCards(input: {
  flightInventorySnapshot?: Record<string, unknown> | null;
  limit?: number;
}): FlightChatCard[] {
  const snap = input.flightInventorySnapshot;
  if (!snap || typeof snap !== 'object') return [];
  const limit = input.limit ?? 6;
  const legs = Array.isArray(snap.legs) ? snap.legs : [];
  const out: FlightChatCard[] = [];
  for (const leg of legs) {
    if (!leg || typeof leg !== 'object') continue;
    const offers = Array.isArray((leg as Record<string, unknown>).sample_offers)
      ? ((leg as Record<string, unknown>).sample_offers as unknown[])
      : [];
    for (const raw of offers) {
      if (out.length >= limit) return out;
      if (!raw || typeof raw !== 'object') continue;
      const card = toCardFromOffer(raw as Record<string, unknown>, out.length);
      if (card) out.push(card);
    }
  }
  return out;
}
