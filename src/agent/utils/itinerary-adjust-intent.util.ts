/**
 * 已有 Trip 上的改稿意图（天气调整、替换景点、车程上限等），与从零 GENERAL_PLAN 区分。
 */

import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { detectItineraryItemDeleteIntent } from './itinerary-item-delete.util';
import { detectItineraryItemAddIntent } from './itinerary-item-add.util';
import { detectItineraryItemUpdateIntent } from './itinerary-item-update.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

function conflictsWithSlotPlacementIntent(t: string): boolean {
  return (
    /哪一天|哪几天|哪个行程|哪一程|安排在哪|加在哪|插在|放进|能否在.{0,24}安排|顺路/i.test(t) &&
    (/行程|第\s*\d+\s*天|D\s*\d+/i.test(t) ||
      /观鲸|胡萨维克|阿克雷里|活动|安排/i.test(t))
  );
}

/** NL 正则落成的国家级/过粗目的地（应让 Trip 库内更细字段覆盖） */
export const COARSE_COUNTRY_ONLY_DESTINATIONS = new Set([
  '冰岛',
  '尼泊尔',
  '瑞士',
  '日本',
  '韩国',
  '泰国',
  '新加坡',
  '马来西亚',
  '印度尼西亚',
  '菲律宾',
  '越南',
]);

export function isCoarseCountryOnlyDestination(destination: string | undefined | null): boolean {
  const d = String(destination ?? '').trim();
  return d.length > 0 && COARSE_COUNTRY_ONLY_DESTINATIONS.has(d);
}

/** 绑定 Trip 且库内目的地更具体时，优先 Trip 目的地 */
export function shouldPreferTripDestinationOnHydration(
  planDestination: string | undefined | null,
  tripDestination: string | undefined | null,
): boolean {
  const trip = String(tripDestination ?? '').trim();
  if (!trip) return false;
  const plan = String(planDestination ?? '').trim();
  if (!plan || plan === '未指定') return true;
  if (!isCoarseCountryOnlyDestination(plan)) return false;
  return trip.length > plan.length || trip.includes(plan);
}

/** 用户是否在已有行程语境下请求改稿（非「哪一天插入观鲸」类槽位编排） */
export function detectItineraryAdjustIntent(message: string): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return false;
  if (conflictsWithSlotPlacementIntent(t)) return false;

  const hasTripAnchor =
    (/(?:行程|日程|计划|itinerary)/i.test(t) &&
      (/\d{4}\s*年?\s*\d{1,2}\s*月|\d{4}-\d{2}-\d{2}|第\s*\d+\s*天|D\s*\d+/i.test(t) ||
        /冰岛|iceland/i.test(t))) ||
    detectItineraryItemDeleteIntent(t) ||
    detectItineraryItemAddIntent(t) ||
    detectItineraryItemUpdateIntent(t);

  const hasExplicitEdit =
    /(?:修改|调整|重排|替换|改行程|换酒店|换景点|优化|改写|重新安排|删除|移除|取消|去掉|删掉|删去|新增|添加|加上|加入|插入)/.test(t) ||
    /(?:根据|按照|依照).{0,24}?(?:刚才|先前|上文|前述|你).{0,40}?(?:分析|结论|建议|风险|预报)/.test(t);

  const hasWeatherDrivenEdit =
    /(?:强风|大风|风速|风大|风小|室内(?:活动)?|天气(?:风险|预报)|恶劣天)/i.test(t) &&
    /(?:调整|替换|改|优先|安排|换成)/.test(t);

  const hasDrivingCap =
    /(?:每日|每天|单日).{0,12}?(?:车程|驾驶|开车|驾车)/.test(t) &&
    /(?:不超过|最多|至多|上限|≤|<=)/.test(t);

  return hasTripAnchor && (hasExplicitEdit || hasWeatherDrivenEdit || hasDrivingCap);
}

/** 从 NL 抽取「每日车程/驾驶」上限（小时） */
export function extractMaxDailyDrivingHoursFromMessage(message: string): number | null {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  const m =
    t.match(
      /(?:每日|每天|单日).{0,16}?(?:车程|驾驶|开车|驾车).{0,12}?(?:不超过|最多|至多|上限)?\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/i,
    ) ??
    t.match(/(?:车程|驾驶).{0,12}?(?:不超过|最多|至多)\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n <= 24 ? n : null;
}

/** 改稿约束写入 trip.message（下游 PLAN/REPAIR 可读） */
export function appendItineraryAdjustSystemHints(trip: TripPlanRequest, message: string): void {
  const lines: string[] = [];
  const maxH = extractMaxDailyDrivingHoursFromMessage(message);
  if (maxH != null) {
    lines.push(`- Max daily driving (planning ceiling): ${maxH}h`);
  }
  if (/(?:强风|大风|风速|风大)/i.test(message)) {
    lines.push('- On high-wind days: prefer indoor activities or lower-exposure POIs');
  }
  if (!lines.length) return;
  const block =
    `[SYSTEM_MESSAGE][ITINERARY_ADJUST]\n` +
    `User requested in-place itinerary revision on bound trip (not a new destination scope).\n` +
    `${lines.join('\n')}\n`;
  trip.message = `${block}${trip.message ?? ''}`.trim();
}

/**
 * 改稿且已种子化 Trip 内 POI 时，勿用「国家级冷检索 + 无起点」的通勤累加拦截整单。
 */
export function shouldSkipPoiDestinationClarificationForItineraryAdjust(
  primary: string | undefined,
  tripPoiSeedCount: number,
  minRequired = 2,
): boolean {
  return primary === 'ITINERARY_ADJUST' && tripPoiSeedCount >= minRequired;
}

export function buildDestinationScopeClarificationOptions(destinationRaw: string): string[] {
  const base = (destinationRaw || '雷克雅未克').trim();
  const options: string[] = [`${base} 市区`, `${base} 近郊`];
  if (!/南部\s*$/u.test(base)) {
    options.push(`${base} 南部`);
  }
  options.push('我来手动输入具体城市/区域');
  return options;
}

export type TripPlaceRowForPoiEvidence = {
  id: number;
  nameCN: string;
  nameEN: string | null;
  category: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

/** 将 Trip 内 Place 登记转为 RESEARCH poi_evidence 同形条目 */
export function mapTripPlacesToPoiEvidence(
  rows: TripPlaceRowForPoiEvidence[],
): Array<Record<string, unknown>> {
  const ts = Date.now();
  return rows.map((p) => ({
    poi_id: String(p.id),
    name: p.nameCN || p.nameEN || `Place ${p.id}`,
    nameCN: p.nameCN,
    nameEN: p.nameEN,
    coordinates:
      p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)
        ? { lat: p.lat, lng: p.lng }
        : undefined,
    category: p.category,
    address: p.address ?? undefined,
    source: 'trip_itinerary_adjust_seed',
    evidence_id: `trip_place_${p.id}_${ts}`,
  }));
}
