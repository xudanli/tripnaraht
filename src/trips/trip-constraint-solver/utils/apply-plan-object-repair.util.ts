/**
 * PlanObject feasibility repairs → trip metadata / itinerary mutations.
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { PrismaService } from '../../../prisma/prisma.service';
import { assertDirectEffectivePlanWriteBlocked } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { resolveLunchStrategyFromTrip } from '../../../planning-policy/utils/lunch-strategy.util';
import {
  projectDayPlanObjects,
  readMealWindowDayShifts,
  type TripDayRow,
} from '../../../decision-runtime/plan-objects/projectors/itinerary-to-plan-object.projector';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { findScheduleTimeOverlap } from './travel-timing-repair.util';

const PLAN_OBJECT_APPLY_OPTION_IDS = new Set([
  'shift_meal_later',
  'add_travel_buffer',
  'reorder_day_schedule',
  'insert_meal_stop',
  'extend_lunch_gap',
  'relax_lunch_strategy',
  'reduce_day_intensity',
  'split_heavy_day',
  'reduce_transfer_legs',
  'insert_rest_stop',
  'add_stay_anchor',
  'move_stay_terminal',
  'review_plan_object',
]);

export function isPlanObjectRepairOptionId(optionId: string): boolean {
  return PLAN_OBJECT_APPLY_OPTION_IDS.has(optionId);
}

export type PlanObjectRepairApplyResult = {
  optionId: string;
  dayNumber?: number;
  planObjectId?: string;
  message: string;
  [key: string]: unknown;
};

async function loadTripDayForPlanObject(
  prisma: PrismaService,
  tripId: string,
  input: { dayNumber?: number; planObjectId?: string },
): Promise<{ trip: { metadata: unknown; pacingConfig: unknown; destination: string | null }; day: TripDayRow }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      metadata: true,
      pacingConfig: true,
      destination: true,
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            include: {
              Place: {
                select: {
                  nameCN: true,
                  nameEN: true,
                  category: true,
                  address: true,
                  physicalMetadata: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

  const dayIdFromPlanObject = input.planObjectId
    ? parseDayIdFromMealPlanObjectId(input.planObjectId)
    : undefined;

  const dayRow =
    (dayIdFromPlanObject
      ? trip.TripDay.find((d) => d.id === dayIdFromPlanObject)
      : undefined) ??
    (typeof input.dayNumber === 'number'
      ? trip.TripDay[input.dayNumber - 1]
      : undefined);

  if (!dayRow) {
    throw new NotFoundException(
      `Day ${input.dayNumber ?? dayIdFromPlanObject ?? '?'} 不存在`,
    );
  }

  const day: TripDayRow = {
    id: dayRow.id,
    date: dayRow.date,
    dayNumber:
      input.dayNumber ??
      trip.TripDay.findIndex((d) => d.id === dayRow.id) + 1,
    items: dayRow.ItineraryItem.map((item) => ({
      id: item.id,
      type: String(item.type),
      tripDayId: item.tripDayId,
      startTime: item.startTime,
      endTime: item.endTime,
      note: item.note,
      placeId: item.placeId,
      costCategory: item.costCategory,
      bookingStatus: item.bookingStatus,
      travelFromPreviousDuration: item.travelFromPreviousDuration,
      travelFromPreviousDistance: item.travelFromPreviousDistance,
      travelMode: item.travelMode,
      Place: item.Place,
    })),
  };

  return {
    trip: {
      metadata: trip.metadata,
      pacingConfig: trip.pacingConfig,
      destination: trip.destination,
    },
    day,
  };
}

function parseDayIdFromMealPlanObjectId(planObjectId: string): string | undefined {
  const match = /^po_(.+)_meal_window_policy$/.exec(planObjectId);
  return match?.[1];
}

async function resolvePrecedingItineraryItemId(
  prisma: PrismaService,
  tripId: string,
  input: { planObjectId?: string; dayNumber?: number },
): Promise<string | undefined> {
  const dayNumber = input.dayNumber;
  const planObjectId = input.planObjectId;
  if (!dayNumber || !planObjectId) return undefined;

  const { trip, day } = await loadTripDayForPlanObject(prisma, tripId, {
    dayNumber: input.dayNumber,
    planObjectId: input.planObjectId,
  });
  const lunchStrategy = resolveLunchStrategyFromTrip(trip);
  const mealShifts = readMealWindowDayShifts(trip.metadata);
  const objects = projectDayPlanObjects(day, lunchStrategy, mealShifts);

  const mealIdx = objects.findIndex((o) => o.planObjectId === planObjectId);
  if (mealIdx < 0) return undefined;

  for (let i = mealIdx - 1; i >= 0; i -= 1) {
    const prev = objects[i];
    if (prev.sourceItineraryItemId) return prev.sourceItineraryItemId;
  }
  return undefined;
}

async function resolveDayNumberFromPayload(
  prisma: PrismaService,
  tripId: string,
  payload: Record<string, unknown>,
): Promise<number | undefined> {
  if (typeof payload.dayNumber === 'number') return payload.dayNumber;

  const planObjectId = typeof payload.planObjectId === 'string' ? payload.planObjectId : undefined;
  const dayId = planObjectId ? parseDayIdFromMealPlanObjectId(planObjectId) : undefined;
  if (!dayId) return undefined;

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { TripDay: { orderBy: { date: 'asc' }, select: { id: true } } },
  });
  const idx = trip?.TripDay.findIndex((d) => d.id === dayId) ?? -1;
  return idx >= 0 ? idx + 1 : undefined;
}

async function applyShiftMealLater(
  prisma: PrismaService,
  tripId: string,
  payload: Record<string, unknown>,
): Promise<PlanObjectRepairApplyResult> {
  const dayNumber = await resolveDayNumberFromPayload(prisma, tripId, payload);
  const shiftMinutes =
    typeof payload.shiftMinutes === 'number' && payload.shiftMinutes > 0
      ? payload.shiftMinutes
      : 30;
  if (!dayNumber) {
    throw new BadRequestException('shift_meal_later 缺少 dayNumber 或 planObjectId');
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const existing = readMealWindowDayShifts(meta);
  const nextShifts: Record<string, number> = {};
  for (const [k, v] of Object.entries(existing)) {
    nextShifts[String(k)] = v;
  }
  const key = String(dayNumber);
  nextShifts[key] = (nextShifts[key] ?? 0) + shiftMinutes;

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      metadata: toInputJsonValue({
        ...meta,
        mealWindowDayShifts: nextShifts,
      }),
    },
  });

  return {
    optionId: 'shift_meal_later',
    dayNumber,
    planObjectId: typeof payload.planObjectId === 'string' ? payload.planObjectId : undefined,
    shiftMinutes,
    totalShiftMinutes: nextShifts[key],
    message: `已将 Day ${dayNumber} 午餐窗后移 ${shiftMinutes} 分钟（累计 ${nextShifts[key]} 分钟）`,
  };
}

async function applyExtendItemEndRepair(
  prisma: PrismaService,
  itemId: string,
  extendMinutes: number,
): Promise<{ itemId: string; extendMinutes: number; newEndTime?: string }> {
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    include: {
      TripDay: {
        include: {
          ItineraryItem: {
            select: { id: true, startTime: true, endTime: true },
          },
        },
      },
    },
  });
  if (!item) throw new NotFoundException(`行程项 ${itemId} 不存在`);
  if (!item.endTime) {
    throw new BadRequestException('该行程项无 endTime，无法延长停留');
  }

  const newEnd = DateTime.fromJSDate(item.endTime).plus({ minutes: extendMinutes });
  const newStart = item.startTime ? DateTime.fromJSDate(item.startTime) : null;

  const overlapWith = findScheduleTimeOverlap({
    itemId,
    newStart: newStart?.toJSDate() ?? item.startTime!,
    newEnd: newEnd.toJSDate(),
    siblings: item.TripDay?.ItineraryItem ?? [],
  });
  if (overlapWith) {
    throw new ConflictException({
      message: `延长后将与行程项 ${overlapWith} 时间重叠`,
      errorCode: 'SCHEDULE_CONFLICT',
    });
  }

  await prisma.itineraryItem.update({
    where: { id: itemId },
    data: { endTime: newEnd.toJSDate() },
  });

  return {
    itemId,
    extendMinutes,
    newEndTime: newEnd.toISO() ?? undefined,
  };
}

async function applyAddTravelBuffer(
  prisma: PrismaService,
  tripId: string,
  payload: Record<string, unknown>,
): Promise<PlanObjectRepairApplyResult> {
  const dayNumber = typeof payload.dayNumber === 'number' ? payload.dayNumber : undefined;
  const bufferMinutes =
    typeof payload.bufferMinutes === 'number' && payload.bufferMinutes > 0
      ? payload.bufferMinutes
      : 30;
  const planObjectId = typeof payload.planObjectId === 'string' ? payload.planObjectId : undefined;

  const itemId = await resolvePrecedingItineraryItemId(prisma, tripId, {
    planObjectId,
    dayNumber,
  });
  if (!itemId) {
    throw new BadRequestException('add_travel_buffer 无法定位午餐前的行程项');
  }

  const result = await applyExtendItemEndRepair(prisma, itemId, bufferMinutes);
  return {
    optionId: 'add_travel_buffer',
    dayNumber,
    planObjectId,
    precedingItemId: itemId,
    bufferMinutes,
    message: `已将上一站结束时间延长 ${bufferMinutes} 分钟`,
    ...result,
  };
}

export async function applyPlanObjectRepair(
  prisma: PrismaService,
  tripId: string,
  optionId: string,
  payload: Record<string, unknown>,
): Promise<PlanObjectRepairApplyResult> {
  assertDirectEffectivePlanWriteBlocked('plan-object-repair.apply');
  switch (optionId) {
    case 'shift_meal_later':
      return applyShiftMealLater(prisma, tripId, payload);
    case 'add_travel_buffer':
      return applyAddTravelBuffer(prisma, tripId, payload);
    case 'reorder_day_schedule':
      throw new BadRequestException(
        'reorder_day_schedule 需手动调整当日活动顺序，请在工作台编辑行程',
      );
    default:
      throw new BadRequestException(`PlanObject 修复选项 ${optionId} 暂不支持自动应用`);
  }
}
