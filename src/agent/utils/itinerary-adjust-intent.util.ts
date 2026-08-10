/**
 * 已有 Trip 上的改稿意图（天气调整、替换景点、车程上限等），与从零 GENERAL_PLAN 区分。
 */

import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { detectItineraryItemDeleteIntent } from './itinerary-item-delete.util';
import { detectItineraryItemAddIntent } from './itinerary-item-add.util';
import { detectItineraryItemUpdateIntent } from './itinerary-item-update.util';
import { parseTripDayNumber } from './itinerary-item-add.util';
import { messageExpressesMultiNightStayPlanningIntent } from './hotel-mcp-route-run.mapper';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import {
  resolveRelativeDayYmdFromAnchor,
  resolveTripTemporalAnchor,
} from './trip-temporal-anchor.util';
import { stripUiInjectedDayScheduleContext } from './ui-day-schedule-context.util';

export interface ItineraryAdjustDateRange {
  start_date?: string;
  end_date?: string;
  /** 默认 `new Date()`；测试可注入以稳定 ON_TRIP 锚点 */
  now?: Date;
}

function conflictsWithSlotPlacementIntent(t: string): boolean {
  /** 与 analyzeRouteAndRunIntent 共用检测，避免「空日规划」等边界分叉 */
  const { detectItinerarySlotPlacementIntent } = require('./route-and-run-intent-analyzer.util') as typeof import('./route-and-run-intent-analyzer.util');
  return detectItinerarySlotPlacementIntent(t);
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

/** 粗粒度国家 token：用于绑定 Trip 时判断 NL 城市是否与库内目的地冲突 */
export function roughDestinationCountryToken(destination: string | undefined | null): string | undefined {
  const d = String(destination ?? '').trim();
  if (!d) return undefined;
  const x = d.toLowerCase();
  if (/^is$/i.test(d) || /冰岛|iceland|reykjav[ií]k|雷克雅未克/.test(x)) return 'IS';
  if (/^jp$/i.test(d) || /日本|tokyo|osaka|kyoto|东京|大阪|京都/.test(x)) return 'JP';
  if (/^kr$/i.test(d) || /韩国|seoul|首尔/.test(x)) return 'KR';
  if (
    /^cn$/i.test(d) ||
    /中国|china|上海|北京|广州|深圳|杭州|成都|重庆|西安|南京|苏州|武汉|厦门|青岛|天津/.test(x)
  ) {
    return 'CN';
  }
  if (/^gl$/i.test(d) || /格陵兰|greenland/.test(x)) return 'GL';
  if (/^[a-z]{2}$/i.test(d)) return d.toUpperCase();
  return undefined;
}

/** NL 目的地与 Trip 库目的地是否跨国家冲突（如「杭州」vs「冰岛」） */
export function destinationsConflictForBoundTrip(
  planDestination: string | undefined | null,
  tripDestination: string | undefined | null,
): boolean {
  const a = roughDestinationCountryToken(planDestination);
  const b = roughDestinationCountryToken(tripDestination);
  return Boolean(a && b && a !== b);
}

/**
 * 绑定 Trip 且库内目的地更具体 / 与 NL 跨国家冲突时，优先 Trip 目的地。
 * 防止长期偏好「从杭州出发」等城市词在 hydration 前落成 plan.destination 后无法被冰岛 Trip 覆盖。
 */
export function shouldPreferTripDestinationOnHydration(
  planDestination: string | undefined | null,
  tripDestination: string | undefined | null,
): boolean {
  const trip = String(tripDestination ?? '').trim();
  if (!trip) return false;
  const plan = String(planDestination ?? '').trim();
  if (!plan || plan === '未指定') return true;
  if (destinationsConflictForBoundTrip(plan, trip)) return true;
  if (!isCoarseCountryOnlyDestination(plan)) return false;
  return trip.length > plan.length || trip.includes(plan);
}

/** 行程日锚：第 N 天、D3、Day 1、2026-06-02、6月2日 等 */
const TRIP_DAY_DATE_ANCHOR_RE =
  /\d{4}\s*年?\s*\d{1,2}\s*月(?:\d{1,2}\s*日)?|\d{4}-\d{2}-\d{2}|\d{1,2}\s*月\s*\d{1,2}\s*日|第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天|\bD\s*\d+\b|\bDay\s*\d+\b/i;

function diffCalendarDaysYmd(startYmd: string, endYmd: string): number {
  const s = new Date(`${startYmd.slice(0, 10)}T00:00:00Z`);
  const e = new Date(`${endYmd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

function countInclusiveTripDays(dateRange?: ItineraryAdjustDateRange): number | undefined {
  const start = dateRange?.start_date?.slice(0, 10);
  const end = dateRange?.end_date?.slice(0, 10);
  if (!start || !end) return undefined;
  const span = diffCalendarDaysYmd(start, end);
  return span >= 0 ? span + 1 : undefined;
}

/** 用户是否明确只改某一天（相对日 / 第 N 天 / 单点 CRUD） */
export function detectExplicitSingleDayAdjustAnchor(
  message: string,
  dateRange?: ItineraryAdjustDateRange,
): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return false;

  // 整段多日重规划（含「第6天改为返程日」「每天12:00午餐」等约束）优先于单日 CRUD/锚点启发式
  if (hasFullTripReplanScopeSignals(t, dateRange)) return false;

  if (/明天|今天|今日|后天|大后天/.test(t)) return true;

  if (
    detectItineraryItemDeleteIntent(t) ||
    detectItineraryItemAddIntent(t) ||
    detectItineraryItemUpdateIntent(t)
  ) {
    return true;
  }

  const explicitDayNumber = parseTripDayNumber(t);
  if (explicitDayNumber != null && !/(?:各|每)\s*(?:天|日)/.test(t)) {
    // 「第6天改为返程日」等可能是整段重规划里的单日约束，勿误判为仅改该日
    if (hasFullTripReplanScopeSignals(t, dateRange)) return false;
    return true;
  }

  const monthDayMatches = [...t.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)];
  if (monthDayMatches.length === 1 && !/\d{1,2}\s*月\s*\d{1,2}\s*日.{0,10}(?:至|到|~|—|-)/.test(t)) {
    return true;
  }

  const isoMatches = [...t.matchAll(/\d{4}-\d{2}-\d{2}/g)];
  if (isoMatches.length === 1) {
    const hasRangeTail = /\d{4}-\d{2}-\d{2}\s*(?:至|到|~|—|-)\s*(?:\d{4}-)?\d{1,2}-\d{1,2}/.test(t);
    if (!hasRangeTail) return true;
  }

  if (dateRange?.start_date && /^\s*(\d{1,2})-(\d{1,2})\s*$/.test(t)) {
    return true;
  }

  return false;
}

/** 话术是否指向绑定 Trip 上的整段多日重规划（非单日 ITINERARY_ADJUST） */
function hasFullTripReplanScopeSignals(
  t: string,
  dateRange?: ItineraryAdjustDateRange,
): boolean {
  if (detectFullTripLogisticsGapFillIntent(t, dateRange)) {
    return true;
  }

  const tripDays = countInclusiveTripDays(dateRange);
  /** 去掉「第 N 天」后再抽「N 天」，避免「第2天调整路线」被当成 2 天整段重规划 */
  const withoutDayOrdinals = t.replace(
    /第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天/g,
    ' ',
  );
  const statedDayCount = withoutDayOrdinals.match(/(\d+)\s*天/);
  const statedDays = statedDayCount ? parseInt(statedDayCount[1], 10) : undefined;

  const hasMultiDaySpan =
    (statedDays != null && statedDays >= 2) ||
    /全程|整段|整个行程|全(?:部|周)|每一(?:天|晚)|各(?:天|日|晚)|逐(?:天|日|晚)/.test(t) ||
    messageExpressesMultiNightStayPlanningIntent(t) ||
    (tripDays != null &&
      statedDays != null &&
      statedDays >= Math.max(2, tripDays - 1)) ||
    messageDateSpanCoversTrip(t, dateRange);

  if (!hasMultiDaySpan) return false;

  const hasReplanEdit =
    /(?:优化|重新规划|重新安排|重写|更新|生成).{0,24}(?:行程|草案|方案)/.test(t) ||
    /(?:行程|草案|方案).{0,24}(?:优化|重排|重新规划|更新)/.test(t) ||
    /(?:生成|产出).{0,12}(?:新(?:的)?)?(?:行程|草案|方案)/.test(t);

  const hasMultiDayLogistics =
    /(?:每日|每天|各日|各天|每晚|各晚).{0,16}(?:住宿|午餐|晚餐|用餐|过夜|城镇|行程|餐饮|车程|驾驶|补给)/.test(t) ||
    /(?:住宿|过夜|餐饮).{0,32}(?:午餐|晚餐|用餐|安排|预订)/.test(t) ||
    /(?:还缺|缺少|补齐|补上).{0,24}(?:住宿|餐饮|用餐)/.test(t) ||
    (/(?:强风|大风|天气)/i.test(t) &&
      /(?:每日|每天).{0,12}(?:车程|驾驶|安排|替换|调整)/.test(t));

  const hasRouteCorridorReplan =
    /(?:更改|调整|修改|变更|换成|改为).{0,20}(?:路线|目的地|行程线|走向|线路)/.test(t) ||
    /(?:雷克雅未克|reykjavik).{0,48}(?:vik|维克|vík)|(?:vik|维克|vík).{0,48}(?:雷克雅未克|reykjavik)/i.test(
      t,
    );

  /** 晕车/晕船等体感约束下的路线微调，不是整段走廊重规划 */
  const motionSicknessLocalAdjust =
    /(?:晕车|晕船|晕机|晕交通|motion\s*sick)/i.test(t) &&
    /(?:调整|改|缩短|减少|优化).{0,16}(?:路线|行程|车程|驾驶|开车)/.test(t);
  if (motionSicknessLocalAdjust && !/(?:全程|整段|整个行程|全部|整趟)/.test(t)) {
    return false;
  }

  const hasReplanOrFill =
    hasReplanEdit ||
    hasMultiDayLogistics ||
    hasRouteCorridorReplan ||
    /(?:帮我|请|麻烦).{0,24}(?:安排|补齐|补充|完善|规划).{0,32}(?:住宿|餐饮|用餐|行程)/.test(t);

  return hasReplanOrFill;
}

/**
 * 绑定 Trip 上的整段多日重规划（全周优化、逐日住宿/用餐等），与单日 ITINERARY_ADJUST 区分。
 */
export function detectFullTripReplanIntent(
  message: string,
  dateRange?: ItineraryAdjustDateRange,
): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return false;
  if (detectExplicitSingleDayAdjustAnchor(t, dateRange)) return false;
  return hasFullTripReplanScopeSignals(t, dateRange);
}

function messageDateSpanCoversTrip(
  t: string,
  dateRange?: ItineraryAdjustDateRange,
): boolean {
  const tripDays = countInclusiveTripDays(dateRange);
  if (!tripDays || tripDays < 2) return false;

  const isoMatches = [...t.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  if (isoMatches.length >= 2) {
    const span = diffCalendarDaysYmd(isoMatches[0], isoMatches[isoMatches.length - 1]) + 1;
    if (span >= tripDays - 1) return true;
  }

  const rangeMatch = t.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:至|到|~|—|-)\s*(?:(\d{4})-)?(\d{1,2})-(\d{1,2})/,
  );
  if (rangeMatch && dateRange?.start_date) {
    const endYmd = rangeMatch[2]
      ? `${rangeMatch[2]}-${String(parseInt(rangeMatch[3], 10)).padStart(2, '0')}-${String(parseInt(rangeMatch[4], 10)).padStart(2, '0')}`
      : `${dateRange.start_date.slice(0, 4)}-${String(parseInt(rangeMatch[3], 10)).padStart(2, '0')}-${String(parseInt(rangeMatch[4], 10)).padStart(2, '0')}`;
    const span = diffCalendarDaysYmd(rangeMatch[1], endYmd) + 1;
    if (span >= tripDays - 1) return true;
  }

  const cnRange = t.match(
    /(\d{4})\s*年?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|~|—|-)\s*(\d{1,2})\s*月?\s*(\d{1,2})\s*日?/,
  );
  if (cnRange) {
    const startYmd = `${cnRange[1]}-${String(parseInt(cnRange[2], 10)).padStart(2, '0')}-${String(parseInt(cnRange[3], 10)).padStart(2, '0')}`;
    const endYmd = `${cnRange[1]}-${String(parseInt(cnRange[4], 10)).padStart(2, '0')}-${String(parseInt(cnRange[5], 10)).padStart(2, '0')}`;
    const span = diffCalendarDaysYmd(startYmd, endYmd) + 1;
    if (span >= tripDays - 1) return true;
  }

  const cnRangeSameMonth = t.match(
    /(\d{4})\s*年?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|~|—|-)\s*(\d{1,2})\s*日/,
  );
  if (cnRangeSameMonth) {
    const startYmd = `${cnRangeSameMonth[1]}-${String(parseInt(cnRangeSameMonth[2], 10)).padStart(2, '0')}-${String(parseInt(cnRangeSameMonth[3], 10)).padStart(2, '0')}`;
    const endYmd = `${cnRangeSameMonth[1]}-${String(parseInt(cnRangeSameMonth[2], 10)).padStart(2, '0')}-${String(parseInt(cnRangeSameMonth[4], 10)).padStart(2, '0')}`;
    const span = diffCalendarDaysYmd(startYmd, endYmd) + 1;
    if (span >= tripDays - 1) return true;
  }

  return false;
}

export function isItineraryFullTripReplanMetadata(
  metadata: Record<string, unknown> | undefined | null,
): boolean {
  return metadata?.itinerary_full_trip_replan === true;
}

/** 整段重规划是否应触发住宿 MCP（含 metadata 标记与话术） */
export function detectFullTripReplanHotelIntent(
  message: string,
  metadata?: Record<string, unknown> | null,
): boolean {
  if (metadata?.full_trip_replan_hotel_requested === true) return true;
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return false;
  return (
    messageExpressesMultiNightStayPlanningIntent(t) ||
    /(?:住宿|过夜|hotel|stay|民宿|酒店|住哪|预订)/i.test(t) ||
    /(?:还缺|缺少|缺失|补齐|补上|补充).{0,24}(?:住宿|餐饮|用餐)/.test(t) ||
    /(?:雷克雅未克|reykjavik).{0,48}(?:vik|维克|vík)|(?:vik|维克|vík).{0,48}(?:雷克雅未克|reykjavik)/i.test(
      t,
    )
  );
}

/** 绑定 Trip 上补齐整段住宿/餐饮（非单日改排） */
function detectFullTripLogisticsGapFillIntent(
  t: string,
  dateRange?: ItineraryAdjustDateRange,
): boolean {
  const tripDays = countInclusiveTripDays(dateRange);
  if (!tripDays || tripDays < 2) return false;
  if (
    /(?:还缺|缺少|缺失|没有|没安排|补齐|补上|补充|完善).{0,32}(?:住宿|餐饮|用餐|午餐|晚餐|过夜)/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /(?:住宿|餐饮|用餐).{0,32}(?:还缺|缺少|缺失|补齐|补上|安排|预订)/.test(t) &&
    /(?:行程|整段|全程|每天|每日|各晚|每晚)/.test(t)
  ) {
    return true;
  }
  if (
    /(?:雷克雅未克|reykjavik).{0,48}(?:vik|维克|vík)|(?:vik|维克|vík).{0,48}(?:雷克雅未克|reykjavik)/i.test(
      t,
    ) &&
    /(?:住宿|过夜|住|预订)/i.test(t)
  ) {
    return true;
  }
  if (/(?:每晚|各晚|逐晚|每天).{0,20}(?:住宿|过夜|住|酒店|民宿)/.test(t)) {
    return true;
  }
  return false;
}

/** 用户是否在已有行程语境下请求改稿（非「哪一天插入观鲸」类槽位编排） */
export function detectItineraryAdjustIntent(
  message: string,
  dateRange?: ItineraryAdjustDateRange,
): boolean {
  const t = stripUiInjectedDayScheduleContext(
    stripSystemMessageBlocksForIntakeNl(String(message ?? '')),
  );
  if (!t.trim()) return false;
  if (detectFullTripReplanIntent(t, dateRange)) return false;
  if (conflictsWithSlotPlacementIntent(t)) return false;

  const hasTripAnchor =
    (/(?:行程|日程|计划|itinerary)/i.test(t) &&
      (TRIP_DAY_DATE_ANCHOR_RE.test(t) ||
        /冰岛|iceland|雷克雅未克|reykjav[ií]k/i.test(t))) ||
    /** 「优化第六天的路线」：日锚 + 优化/重排 + 路线，无需再写「行程」 */
    (TRIP_DAY_DATE_ANCHOR_RE.test(t) &&
      /(?:优化|调整|重排|重新排序)/.test(t) &&
      /(?:路线|顺序|交通|通勤)/.test(t)) ||
    detectItineraryItemDeleteIntent(t) ||
    detectItineraryItemAddIntent(t) ||
    detectItineraryItemUpdateIntent(t);

  const hasExplicitEdit =
    /(?:修改|调整|修正|纠正|修复|重排|替换|改行程|换酒店|换景点|优化|改写|重新安排|重新规划|更新|重写|重新生成|删除|移除|取消|去掉|删掉|删去|新增|添加|加上|加入|插入)/.test(
      t,
    ) ||
    /(?:生成|产出).{0,12}(?:新(?:的)?)?(?:行程|草案|方案)/.test(t) ||
    /(?:将|把).{0,32}(?:行程|日程).{0,12}(?:更新|改为|调整|重排|替换|修正|修复)/.test(t) ||
    /(?:根据|按照|依照).{0,24}?(?:刚才|先前|上文|前述|你|顾问).{0,40}?(?:分析|结论|建议|风险|预报)/.test(t) ||
    /(?:路线|地理坐标|坐标).{0,16}?(?:错误|有误)|不可执行|拆分为.{0,8}天|拆成.{0,8}天/.test(t);

  const hasWeatherDrivenEdit =
    /(?:强风|大风|风速|风大|风小|室内(?:活动)?|天气(?:风险|预报)|恶劣天)/i.test(t) &&
    /(?:调整|替换|改|优先|安排|换成)/.test(t);

  const hasDrivingCap =
    /(?:每日|每天|单日).{0,12}?(?:车程|驾驶|开车|驾车)/.test(t) &&
    /(?:不超过|最多|至多|上限|≤|<=)/.test(t);

  /** 绑定 Trip 上的节奏/疲劳改排（如「明天太累了，轻松点」） */
  const hasPacingDrivenEdit =
    /(?:太累|好累|疲惫|轻松|别早起|不要太赶|慢节奏|放缓|休息)/i.test(t) &&
    (/(?:明天|今天|今日|后天|大后天)/.test(t) ||
      (/(?:行程|日程|计划)/i.test(t) && TRIP_DAY_DATE_ANCHOR_RE.test(t)));

  /** 成员晕车等体感 → 调整路线/缩短车程（可无显式日锚） */
  const hasMotionSicknessDrivenEdit =
    /(?:晕车|晕船|晕机|晕交通|motion\s*sick)/i.test(t) &&
    /(?:调整|改|缩短|减少|优化|重排).{0,16}(?:路线|行程|车程|驾驶|开车|日程)/.test(t);

  return (
    (hasTripAnchor && (hasExplicitEdit || hasWeatherDrivenEdit || hasDrivingCap)) ||
    hasPacingDrivenEdit ||
    hasMotionSicknessDrivenEdit
  );
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

export function extractItineraryAdjustTargetDateFromMessage(
  message: string,
  dateRange?: ItineraryAdjustDateRange,
): string | undefined {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return undefined;

  const iso = t.match(/\d{4}-\d{2}-\d{2}/);
  if (iso?.[0]) return iso[0];

  const monthDay = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (monthDay && dateRange?.start_date) {
    const year = parseInt(dateRange.start_date.slice(0, 4), 10);
    const month = parseInt(monthDay[1], 10);
    const day = parseInt(monthDay[2], 10);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dayNumber = parseTripDayNumber(t);
  if (dayNumber != null && dayNumber >= 1 && dateRange?.start_date) {
    const start = new Date(`${dateRange.start_date}T00:00:00Z`);
    if (!Number.isNaN(start.getTime())) {
      start.setUTCDate(start.getUTCDate() + dayNumber - 1);
      return start.toISOString().slice(0, 10);
    }
  }

  const temporal = resolveTripTemporalAnchor({
    startDateYmd: dateRange?.start_date,
    endDateYmd: dateRange?.end_date,
    now: dateRange?.now,
  });
  const anchorYmd = temporal?.anchorYmd ?? dateRange?.start_date;
  if (anchorYmd) {
    if (/大后天/.test(t)) {
      return resolveRelativeDayYmdFromAnchor(anchorYmd, 3);
    }
    if (/后天/.test(t)) {
      return resolveRelativeDayYmdFromAnchor(anchorYmd, 2);
    }
    if (/明天/.test(t)) {
      return resolveRelativeDayYmdFromAnchor(anchorYmd, 1);
    }
    if (/今天|今日/.test(t)) {
      return anchorYmd;
    }
  }

  return undefined;
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

/** 整段多日重规划约束写入 trip.message（下游 PLAN_GEN 走全周生成，非单日走廊改排） */
export function appendFullTripReplanSystemHints(trip: TripPlanRequest, message: string): void {
  const lines: string[] = [
    '- Scope: full multi-day itinerary replan on bound trip (all calendar days, not single-day ITINERARY_ADJUST)',
  ];
  const maxH = extractMaxDailyDrivingHoursFromMessage(message);
  if (maxH != null) {
    lines.push(`- Max daily driving (planning ceiling): ${maxH}h`);
  }
  if (/(?:强风|大风|风速|风大)/i.test(message)) {
    lines.push('- On high-wind days: prefer indoor activities or lower-exposure POIs');
  }
  if (/(?:午餐|用餐|meal|dining|restaurant)/i.test(message)) {
    lines.push('- Include practical en-route lunch stops suitable for self-drive days');
  }
  if (/(?:住宿|过夜|hotel|stay)/i.test(message)) {
    lines.push('- Align overnight towns with daily driving legs; do not assume one property for the whole trip');
  }
  const block =
    `[SYSTEM_MESSAGE][FULL_TRIP_REPLAN]\n` +
    `User requested full multi-day itinerary revision on bound trip.\n` +
    `${lines.join('\n')}\n`;
  trip.message = `${block}${trip.message ?? ''}`.trim();
}

/**
 * 绑定行程已种子化足够 Place 时，勿用「国家级冷检索 + 无起点」的通勤/稀疏闸拦截整单。
 * 不再限制 intent：聊天 / 咨询 / 改稿都不应逼用户重选区域。
 */
export function shouldSkipPoiDestinationClarificationForItineraryAdjust(
  primary: string | undefined,
  tripPoiSeedCount: number,
  minRequired = 2,
): boolean {
  void primary;
  return tripPoiSeedCount >= minRequired;
}

export type PoiDestinationScopeBypassReason =
  | 'RANKED_POOL_BACKFILL'
  | 'BOUND_TRIP_POI_SEEDS'
  | 'EXISTING_TRIP_ROUTE_ORDER_OPTIMIZATION'
  | 'BOUND_TRIP_SOFT_CONTINUE';

/**
 * 聚类后过稀时优先回填/软放行，避免把「聚类过严 / 冷检索假象」误判成「目的地过大」硬澄清。
 * 仅在无绑定行程、且排名池也不足时才应 clarify。
 */
export function resolveSparseSelectedPoiContinuation<T>(input: {
  scored: T[];
  rankedPois: T[];
  minPoiRequired: number;
  tripPoiSeedCount: number;
  hasBoundTrip: boolean;
  routeIntentPrimary?: string;
  bypassRouteOrderOptimization?: boolean;
}): {
  scored: T[];
  shouldClarify: boolean;
  bypassReason?: PoiDestinationScopeBypassReason;
} {
  const minRequired = input.minPoiRequired > 0 ? input.minPoiRequired : 2;
  const scoredIn = input.scored;

  if (scoredIn.length === 0 || scoredIn.length >= minRequired) {
    return { scored: scoredIn, shouldClarify: false };
  }

  if (input.rankedPois.length >= minRequired) {
    return {
      scored: input.rankedPois.slice(0, Math.max(minRequired, scoredIn.length)),
      shouldClarify: false,
      bypassReason: 'RANKED_POOL_BACKFILL',
    };
  }

  if (
    shouldSkipPoiDestinationClarificationForItineraryAdjust(
      input.routeIntentPrimary,
      input.tripPoiSeedCount,
      minRequired,
    )
  ) {
    return {
      scored: input.rankedPois.length
        ? input.rankedPois.slice(0, Math.max(minRequired, scoredIn.length))
        : scoredIn,
      shouldClarify: false,
      bypassReason: 'BOUND_TRIP_POI_SEEDS',
    };
  }

  if (input.bypassRouteOrderOptimization) {
    return {
      scored: scoredIn,
      shouldClarify: false,
      bypassReason: 'EXISTING_TRIP_ROUTE_ORDER_OPTIMIZATION',
    };
  }

  if (input.hasBoundTrip) {
    return {
      scored: scoredIn,
      shouldClarify: false,
      bypassReason: 'BOUND_TRIP_SOFT_CONTINUE',
    };
  }

  return { scored: scoredIn, shouldClarify: true };
}

/** 绑定行程上的「单日通勤过长」多为国家级冷检索假象，勿硬拦用户选区域。 */
export function shouldSkipPoiDestinationCommuteClarification(input: {
  tripPoiSeedCount: number;
  hasBoundTrip: boolean;
  routeIntentPrimary?: string;
  bypassRouteOrderOptimization?: boolean;
  minRequired?: number;
}): boolean {
  if (input.bypassRouteOrderOptimization) return true;
  if (
    shouldSkipPoiDestinationClarificationForItineraryAdjust(
      input.routeIntentPrimary,
      input.tripPoiSeedCount,
      input.minRequired ?? 2,
    )
  ) {
    return true;
  }
  return input.hasBoundTrip;
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
