/**
 * 聊天餐厅推荐卡片：Places / 目录 → summary_json.restaurant_cards
 */

import {
  ICELAND_DINING_CATALOG,
  inferDiningRegionsFromText,
  matchDiningCatalogEntries,
  type IcelandDiningCatalogEntry,
} from '../../mcp/iceland-dining-catalog';
import { isDiningRecommendationQuery } from '../utils/trip-dining-consultation.util';
import { parseLodgingChoiceCalendarYmd } from '../utils/day-lodging-choice.util';

export const RESTAURANT_CARDS_SCHEMA = 'tripnara/chat_restaurant_cards@v1' as const;

export type RestaurantChatCard = {
  id: string;
  name: string;
  nameZh: string;
  nameEn?: string;
  url?: string;
  mapsUrl?: string;
  photoUrl?: string;
  rating?: number;
  priceLabel?: string;
  cuisineZh?: string;
  areaZh?: string;
  reasonZh?: string;
  reservationHintZh?: string;
  dayLabelZh?: string;
  cta_zh: string;
  actions: Array<{
    action: string;
    label: string;
    labelCN: string;
    params?: Record<string, unknown>;
  }>;
  fields_zh: Array<{ key: string; label: string; value: string }>;
  field_labels_zh: Record<string, string>;
  source: 'google_places' | 'catalog_fallback' | 'fliggy';
};

export function isRestaurantChatCardQuery(message: string): boolean {
  return isDiningRecommendationQuery(message);
}

function toCardFromCatalog(
  entry: IcelandDiningCatalogEntry,
  dayLabelZh?: string,
): RestaurantChatCard {
  const url = entry.url;
  const fields_zh: RestaurantChatCard['fields_zh'] = [];
  if (entry.areaZh) fields_zh.push({ key: 'area', label: '区域', value: entry.areaZh });
  if (entry.cuisineZh) fields_zh.push({ key: 'cuisine', label: '菜系', value: entry.cuisineZh });
  if (entry.priceHintZh) fields_zh.push({ key: 'price', label: '价位', value: entry.priceHintZh });
  if (dayLabelZh) fields_zh.push({ key: 'day', label: '行程日', value: dayLabelZh });
  fields_zh.push({ key: 'reason', label: '推荐原因', value: entry.reasonZh });
  fields_zh.push({ key: 'reservation', label: '预订', value: entry.reservationHintZh });

  const actions = [
    {
      action: 'open_restaurant_url',
      label: 'Open',
      labelCN: '查看官网',
      params: { url },
    },
    ...(entry.mapsUrl || url
      ? [
          {
            action: 'open_maps',
            label: 'Maps',
            labelCN: '地图',
            params: { url: entry.mapsUrl || url },
          },
        ]
      : []),
    {
      action: 'add_restaurant_to_itinerary',
      label: 'Add to Trip',
      labelCN: '加入行程',
      params: {
        applySnapshot: {
          id: entry.id,
          name: entry.nameZh,
          nameEn: entry.nameEn,
          url,
          areaZh: entry.areaZh,
          source: 'catalog_fallback',
        },
      },
    },
  ];

  return {
    id: entry.id,
    name: entry.nameZh,
    nameZh: entry.nameZh,
    nameEn: entry.nameEn,
    url,
    ...(entry.mapsUrl ? { mapsUrl: entry.mapsUrl } : {}),
    ...(entry.priceHintZh ? { priceLabel: entry.priceHintZh } : {}),
    ...(entry.cuisineZh ? { cuisineZh: entry.cuisineZh } : {}),
    areaZh: entry.areaZh,
    reasonZh: entry.reasonZh,
    reservationHintZh: entry.reservationHintZh,
    ...(dayLabelZh ? { dayLabelZh } : {}),
    cta_zh: '加入行程',
    actions,
    fields_zh,
    field_labels_zh: {
      area: '区域',
      cuisine: '菜系',
      price: '价位',
      day: '行程日',
      reason: '推荐原因',
      reservation: '预订',
    },
    source: 'catalog_fallback',
  };
}

export function mapPlacesRestaurantsToChatCards(
  rows: Array<Record<string, unknown>>,
  opts?: { dayLabelZh?: string },
): RestaurantChatCard[] {
  return rows.slice(0, 6).map((r, i) => {
    const fromFliggy = String(r.source ?? '') === 'fliggy';
    const name = String(r.nameZh ?? r.name ?? r.nameCN ?? `餐厅 ${i + 1}`).trim();
    // 飞猪只用 https H5
    const url =
      String(
        (fromFliggy
          ? r.webUrl ?? r.url ?? r.website
          : r.website ?? r.url ?? r.webUrl) ?? '',
      ).trim() || undefined;
    const mapsUrl =
      String(r.mapsUrl ?? '').trim() ||
      (!fromFliggy && r.placeId
        ? `https://www.google.com/maps/place/?q=place_id:${String(r.placeId)}`
        : undefined);
    const rating =
      typeof r.rating === 'number'
        ? r.rating
        : Number.isFinite(Number(r.rating))
          ? Number(r.rating)
          : undefined;
    const address = String(r.address ?? '').trim() || undefined;
    const priceLevel = typeof r.priceLevel === 'number' ? r.priceLevel : undefined;
    const priceLabel =
      (r.priceLabel != null && String(r.priceLabel).trim()
        ? String(r.priceLabel).trim()
        : undefined) ||
      (priceLevel != null ? '¥'.repeat(Math.min(4, Math.max(1, priceLevel))) : undefined);
    const fields_zh: RestaurantChatCard['fields_zh'] = [];
    if (address) fields_zh.push({ key: 'area', label: '位置', value: address });
    if (rating != null) fields_zh.push({ key: 'rating', label: '评分', value: String(rating) });
    if (priceLabel) fields_zh.push({ key: 'price', label: '价位', value: priceLabel });
    if (opts?.dayLabelZh) fields_zh.push({ key: 'day', label: '行程日', value: opts.dayLabelZh });
    if (fromFliggy) {
      fields_zh.push({
        key: 'disclaimer',
        label: '说明',
        value: '飞猪实时结果，口味与订位以飞猪/门店为准',
      });
    }

    const openLabel = fromFliggy ? '去飞猪查看' : '查看官网';
    const actions = [
      ...(url
        ? [
            {
              action: 'open_restaurant_url',
              label: 'Open',
              labelCN: openLabel,
              params: {
                url,
                ...(fromFliggy
                  ? { open_strategy: 'web' as const, fallback_url: url, webUrl: url }
                  : {}),
              },
            },
          ]
        : []),
      ...(mapsUrl
        ? [{ action: 'open_maps', label: 'Maps', labelCN: '地图', params: { url: mapsUrl } }]
        : []),
      {
        action: 'add_restaurant_to_itinerary',
        label: 'Add to Trip',
        labelCN: '加入行程',
        params: {
          applySnapshot: {
            id: String(r.placeId ?? r.id ?? `rest-${i}`),
            name,
            ...(url ? { url } : {}),
            ...(address ? { address } : {}),
            source: fromFliggy ? 'fliggy' : 'google_places',
          },
        },
      },
    ];

    return {
      id: String(r.placeId ?? r.id ?? `rest-${i}`),
      name,
      nameZh: name,
      ...(url ? { url } : {}),
      ...(mapsUrl ? { mapsUrl } : {}),
      ...(rating != null ? { rating } : {}),
      ...(priceLabel ? { priceLabel } : {}),
      ...(address ? { areaZh: address } : {}),
      ...(opts?.dayLabelZh ? { dayLabelZh: opts.dayLabelZh } : {}),
      cta_zh: fromFliggy ? String(r.cta_zh ?? '去飞猪查看') : '加入行程',
      actions,
      fields_zh,
      field_labels_zh: {
        area: '位置',
        rating: '评分',
        price: '价位',
        day: '行程日',
        disclaimer: '说明',
      },
      source: fromFliggy ? ('fliggy' as const) : ('google_places' as const),
    };
  });
}

export function buildRestaurantChatCards(input: {
  userMessage: string;
  answerText?: string;
  tripStartYmd?: string;
  placesResults?: Array<Record<string, unknown>>;
}): RestaurantChatCard[] {
  const dayYmd = parseLodgingChoiceCalendarYmd(input.userMessage, {
    tripStartYmd: input.tripStartYmd,
  });
  const dayLabelZh = dayYmd
    ? `${Number(dayYmd.slice(5, 7))}月${Number(dayYmd.slice(8, 10))}日`
    : undefined;

  if (input.placesResults?.length) {
    /** 飞猪已成型卡：直接透传 */
    const prebuilt = input.placesResults.filter(
      (r) =>
        r &&
        typeof r === 'object' &&
        r.nameZh &&
        r.cta_zh &&
        Array.isArray(r.actions) &&
        r.source === 'fliggy',
    );
    if (prebuilt.length === input.placesResults.length) {
      return prebuilt.slice(0, 6) as unknown as RestaurantChatCard[];
    }
    return mapPlacesRestaurantsToChatCards(input.placesResults, { dayLabelZh });
  }

  const blob = `${input.userMessage}\n${input.answerText ?? ''}`;
  const regions = inferDiningRegionsFromText(blob);
  /** 8.16 / 黄金圈日默认塞尔福斯+黄金圈 */
  if (!regions.length && /8\s*[.．/]\s*16|8\s*月\s*16/.test(input.userMessage)) {
    regions.push('golden_circle', 'selfoss');
  }
  const entries = matchDiningCatalogEntries(blob, regions.length ? regions : undefined, 4);
  return entries.map((e) => toCardFromCatalog(e, dayLabelZh));
}

export { ICELAND_DINING_CATALOG, isDiningRecommendationQuery };
