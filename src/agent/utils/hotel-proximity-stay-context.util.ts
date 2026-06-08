/**
 * 跨天住宿选址：结合「入住当晚」与「次日行程」的粗估体能/动线，辅助排序与决策文案。
 * 非精确导航；用于 PA / route_and_run 酒店列表的综合权衡。
 */

import type { HotelDecisionCardLike, HotelPartyAndPreferenceContext } from './hotel-decision-support.signals';
import { buildTemplateHotelDecisionSupportZh } from './hotel-decision-support.signals';

export type DayPoiStop = {
  lat: number;
  lng: number;
  nameZh: string;
  startHourUtc?: number;
  endHourUtc?: number;
};

export type TripDayGeoProfile = {
  dayNumber: number;
  dateYmd: string;
  itemCount: number;
  /** 当日首个带坐标行程点 */
  firstStop?: DayPoiStop;
  /** 当日最后一个带坐标行程点 */
  lastStop?: DayPoiStop;
  /** 当日行程项间 travelFromPreviousDuration 之和（分钟） */
  totalTravelMinutes: number;
};

export type HotelProximityStayContext = {
  /** 入住对应行程日（如第 2 天） */
  stayDayNumber: number;
  /** 用户希望靠近的行程日（如第 3 天） */
  anchorDayNumber: number;
  stayDay: TripDayGeoProfile;
  anchorDay: TripDayGeoProfile;
  /** 是否次日偏早起（首站早于 9:00 UTC） */
  earlyStartNextDay: boolean;
  /** 入住日是否偏累（活动多或路上时间长） */
  heavyStayDay: boolean;
};

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function classifyDayLoad(profile: TripDayGeoProfile): 'light' | 'moderate' | 'heavy' {
  if (profile.itemCount >= 6 || profile.totalTravelMinutes >= 200) return 'heavy';
  if (profile.itemCount >= 4 || profile.totalTravelMinutes >= 120) return 'moderate';
  return 'light';
}

export function buildHotelProximityStayContext(params: {
  stayDay: TripDayGeoProfile;
  anchorDay: TripDayGeoProfile;
}): HotelProximityStayContext {
  const earlyStartNextDay =
    params.anchorDay.firstStop?.startHourUtc != null && params.anchorDay.firstStop.startHourUtc < 9;
  const heavyStayDay = classifyDayLoad(params.stayDay) === 'heavy';
  return {
    stayDayNumber: params.stayDay.dayNumber,
    anchorDayNumber: params.anchorDay.dayNumber,
    stayDay: params.stayDay,
    anchorDay: params.anchorDay,
    earlyStartNextDay,
    heavyStayDay,
  };
}

/**
 * 综合排序分（越小越优）：距次日锚点 + 距入住日末站（收队动线）+ 早起惩罚。
 */
export function scoreAccommodationForProximityStay(
  card: Pick<HotelDecisionCardLike, 'distance_to_anchor_km'> & { location?: { lat: number; lng: number } },
  ctx: HotelProximityStayContext,
): number {
  const toAnchor = card.distance_to_anchor_km ?? 999;
  let score = toAnchor;

  const loc = card.location;
  const last = ctx.stayDay.lastStop;
  if (loc && last) {
    const toLastStop = haversineKm(loc.lat, loc.lng, last.lat, last.lng);
    const load = classifyDayLoad(ctx.stayDay);
    const wLast = load === 'heavy' ? 0.45 : load === 'moderate' ? 0.3 : 0.2;
    score += toLastStop * wLast;
  }

  if (ctx.earlyStartNextDay && toAnchor > 25) {
    score += Math.min(40, (toAnchor - 25) * 0.8);
  }
  if (ctx.heavyStayDay && loc && last) {
    const toLast = haversineKm(loc.lat, loc.lng, last.lat, last.lng);
    if (toLast > 40) score += (toLast - 40) * 0.25;
  }

  return Math.round(score * 10) / 10;
}

/** 跨天权衡说明（追加在 L1 模版之后） */
export function buildProximityStayTradeoffZh(ctx: HotelProximityStayContext): string {
  const parts: string[] = [];
  const stayLoad = classifyDayLoad(ctx.stayDay);
  const stayLabel =
    stayLoad === 'heavy'
      ? `第 ${ctx.stayDayNumber} 天行程偏满（${ctx.stayDay.itemCount} 项、路上约 ${ctx.stayDay.totalTravelMinutes} 分钟）`
      : stayLoad === 'moderate'
        ? `第 ${ctx.stayDayNumber} 天强度中等`
        : `第 ${ctx.stayDayNumber} 天相对轻松`;

  parts.push(stayLabel);

  if (ctx.stayDay.lastStop?.nameZh) {
    parts.push(`收队参考「${ctx.stayDay.lastStop.nameZh}」`);
  }
  if (ctx.anchorDay.firstStop?.nameZh) {
    const early =
      ctx.earlyStartNextDay && ctx.anchorDay.firstStop.startHourUtc != null
        ? `，第 ${ctx.anchorDayNumber} 天首站偏早（约 ${ctx.anchorDay.firstStop.startHourUtc}:00 起）`
        : '';
    parts.push(`次日从「${ctx.anchorDay.firstStop.nameZh}」一带展开${early}`);
  }

  if (ctx.earlyStartNextDay) {
    parts.push('若不想早起，宜优先距次日首站更近的住宿');
  } else if (ctx.heavyStayDay) {
    parts.push('入住当晚宜少折返，优先离收队点近或顺路的住处');
  } else {
    parts.push('可在「离次日近」与「当晚收队省心」之间按偏好取舍');
  }

  return parts.join('；');
}

export function buildAccommodationDecisionSupportWithStayContext(
  card: HotelDecisionCardLike,
  rawListing: unknown | undefined,
  partyCtx: HotelPartyAndPreferenceContext,
  stayCtx: HotelProximityStayContext | undefined,
): string | undefined {
  const base = buildTemplateHotelDecisionSupportZh(card, rawListing, partyCtx);
  if (!stayCtx) return base;
  const tradeoff = buildProximityStayTradeoffZh(stayCtx);
  if (!base) return tradeoff;
  return `${base} ${tradeoff}`;
}
