import type { SplitPlanScheduleItem } from './split-plan-schedule.source.util';
import {
  estimateDriveMinutes,
  haversineDistanceKm,
  type PlaceCoord,
} from './split-plan-place-coords.util';

/** 送达酒店后 A 组继续游览 — 冰岛环岛日常见 2–3h 车程仍可行 */
const MAX_RENTAL_HOTEL_STRAIGHT_KM = 200;
const MAX_RENTAL_HOTEL_DRIVE_MIN = 180;

export type RentalHotelSplitContext = {
  rentalItemId: string;
  hotelItemId: string;
  rentalPlaceName: string;
  hotelPlaceName: string;
  distanceKm: number;
  driveMin: number;
  /** 租车点送达酒店后，A 组可独立游览 */
  dropoffFeasible: boolean;
  source: 'coords' | 'itinerary_travel';
};

export function isCarRentalItem(item: SplitPlanScheduleItem): boolean {
  return /^\[timelineDisplayRole:car_rental\]/i.test(item.note?.trim() ?? '');
}

export function isScheduledHotelItem(item: SplitPlanScheduleItem): boolean {
  return (
    item.type === 'REST' && /^\[timelineDisplayRole:hotel\]/i.test(item.note?.trim() ?? '')
  );
}

export function isHotelRestItem(item: SplitPlanScheduleItem): boolean {
  if (item.type !== 'REST') return false;
  const note = item.note?.trim() ?? '';
  return /^\[timelineDisplayRole:hotel\]/i.test(note) || item.intensity === 'low';
}

/** 当日 schedule 含「先送 B 组入住酒店、A 组继续游览」模式 */
export function findHotelDropoffForkIndex(items: SplitPlanScheduleItem[]): number | undefined {
  const hotelIdx = items.findIndex(isScheduledHotelItem);
  if (hotelIdx <= 0) return undefined;
  const hasContinuation = items
    .slice(hotelIdx + 1)
    .some((i) => i.intensity === 'high' || i.intensity === 'medium');
  return hasContinuation ? hotelIdx : undefined;
}

function placeLabel(item: SplitPlanScheduleItem): string {
  return item.placeName ?? item.placeLabel ?? item.title;
}

function coordOf(item: SplitPlanScheduleItem): PlaceCoord | null {
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return { lat: item.lat, lng: item.lng };
  }
  return null;
}

function sumTravelMinutesBetween(
  items: SplitPlanScheduleItem[],
  fromItemId: string,
  toItemId: string,
): number | undefined {
  const fromIdx = items.findIndex((i) => i.id === fromItemId);
  const toIdx = items.findIndex((i) => i.id === toItemId);
  if (fromIdx < 0 || toIdx <= fromIdx) return undefined;
  let sum = 0;
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    sum += items[i].travelDurationMin ?? 0;
  }
  return sum > 0 ? sum : undefined;
}

/** 分流起点 — 全员同行结束后的首个活动（非租车公司总部坐标） */
export function resolveForkReferenceItem(
  sharedBefore: SplitPlanScheduleItem[],
  forkItem?: SplitPlanScheduleItem,
): SplitPlanScheduleItem | undefined {
  if (forkItem) return forkItem;
  for (let i = sharedBefore.length - 1; i >= 0; i--) {
    if (!isCarRentalItem(sharedBefore[i])) return sharedBefore[i];
  }
  return sharedBefore[sharedBefore.length - 1];
}

export function analyzeRentalHotelSplit(input: {
  sharedBefore: SplitPlanScheduleItem[];
  branchBItems: SplitPlanScheduleItem[];
  allDayItems: SplitPlanScheduleItem[];
  /** 分叉点活动 — 距酒店车程以此为准（租车点可能在机场，与当日路线无关） */
  forkItem?: SplitPlanScheduleItem;
}): RentalHotelSplitContext | undefined {
  const rental = input.sharedBefore.find(isCarRentalItem);
  const hotel =
    input.branchBItems.find(isHotelRestItem) ??
    input.allDayItems.find(
      (i) => isHotelRestItem(i) && /^\[timelineDisplayRole:hotel\]/i.test(i.note?.trim() ?? ''),
    );
  if (!rental || !hotel) return undefined;

  const routeRef = resolveForkReferenceItem(input.sharedBefore, input.forkItem);
  const refCoord = coordOf(routeRef);
  const hotelCoord = coordOf(hotel);

  let distanceKm: number | undefined;
  let driveMin: number | undefined;
  let source: RentalHotelSplitContext['source'] = 'coords';

  if (refCoord && hotelCoord) {
    distanceKm = Math.round(haversineDistanceKm(refCoord, hotelCoord) * 10) / 10;
    driveMin = estimateDriveMinutes(distanceKm);
  } else {
    const refId = routeRef?.id ?? rental.id;
    const alongRoute = sumTravelMinutesBetween(input.allDayItems, refId, hotel.id);
    if (alongRoute != null) {
      driveMin = alongRoute;
      distanceKm = Math.round(((alongRoute / 60) * 65) / 1.25);
      source = 'itinerary_travel';
    }
  }

  if (distanceKm == null || driveMin == null) return undefined;

  const dropoffFeasible =
    distanceKm <= MAX_RENTAL_HOTEL_STRAIGHT_KM && driveMin <= MAX_RENTAL_HOTEL_DRIVE_MIN;

  return {
    rentalItemId: rental.id,
    hotelItemId: hotel.id,
    rentalPlaceName: placeLabel(rental),
    hotelPlaceName: placeLabel(hotel),
    distanceKm,
    driveMin,
    dropoffFeasible,
    source,
  };
}

export function formatRentalHotelHighlight(ctx: RentalHotelSplitContext): string {
  return `距上一站约 ${ctx.distanceKm} km（${ctx.driveMin} 分钟）送达${ctx.hotelPlaceName}`;
}

/** Nara 建议 — 与「先全员同行、至分叉点再送 B 组」时间轴一致 */
export function formatHotelDropoffAiSuggestion(input: {
  sharedRouteLabels: string[];
  forkTime?: string;
  hotelPlaceName: string;
  distanceKm: number;
  driveMin: number;
  branchAActivities?: string;
  meetupTime?: string;
}): string {
  const lead =
    input.sharedRouteLabels.length > 0
      ? `全员同行（${input.sharedRouteLabels.join(' → ')}）后${input.forkTime ? `，${input.forkTime}` : ''}`
      : input.forkTime ?? '途中';
  const aPart = input.branchAActivities ? `，A 组继续游览：${input.branchAActivities}` : '';
  const meetup = input.meetupTime
    ? `，${input.meetupTime} 于${input.hotelPlaceName}汇合`
    : `，晚间于${input.hotelPlaceName}汇合`;
  return `${lead} 送 B 组至${input.hotelPlaceName}（约 ${input.distanceKm} km / ${input.driveMin} 分钟）${aPart}${meetup}。`;
}

export function formatRentalHotelTransport(
  ctx: Pick<
    RentalHotelSplitContext,
    'dropoffFeasible' | 'rentalPlaceName' | 'hotelPlaceName' | 'distanceKm' | 'driveMin'
  >,
): string {
  if (ctx.dropoffFeasible) {
    return `送达 ${ctx.hotelPlaceName}（路线约 ${ctx.distanceKm} km / ${ctx.driveMin} 分钟），B 组休息 · A 组继续游览`;
  }
  return `送达 ${ctx.hotelPlaceName} 路线约 ${ctx.distanceKm} km（${ctx.driveMin} 分钟），建议全员同行后再入住`;
}
