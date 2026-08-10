import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { PrismaService } from '../../../prisma/prisma.service';
import { assertDirectEffectivePlanWriteBlocked } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import type {
  ExecutionRecommendationDto,
  ExecutionScheduleMutationDto,
} from '../types/trip-constraint-solver.types';
import { findScheduleTimeOverlap } from './travel-timing-repair.util';

const DEFAULT_SHORTEN_MINUTES = 30;
const MIN_STAY_MINUTES = 30;

type ItinerarySibling = {
  id: string;
  startTime: Date | null;
  endTime: Date | null;
};

async function loadDayItems(prisma: PrismaService, tripDayId: string) {
  return prisma.itineraryItem.findMany({
    where: { tripDayId },
    include: { Place: true },
    orderBy: { startTime: 'asc' },
  });
}

export async function applyShortenStay(
  prisma: PrismaService,
  itemId: string,
  deltaMinutes: number,
): Promise<ExecutionScheduleMutationDto> {
  assertDirectEffectivePlanWriteBlocked('execution-advisory.applyShortenStay');
  const shortenBy = Math.abs(deltaMinutes);
  if (shortenBy <= 0) {
    throw new BadRequestException('缩短分钟数必须大于 0');
  }

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
  if (!item.startTime || !item.endTime) {
    throw new BadRequestException('该行程项缺少时间，无法缩短停留');
  }

  const start = DateTime.fromJSDate(item.startTime);
  const end = DateTime.fromJSDate(item.endTime);
  const durationMin = end.diff(start, 'minutes').minutes;
  const nextDuration = Math.max(MIN_STAY_MINUTES, durationMin - shortenBy);
  const actualShorten = Math.round(durationMin - nextDuration);
  if (actualShorten <= 0) {
    throw new BadRequestException('当前停留已无法继续缩短');
  }

  const newEnd = end.minus({ minutes: actualShorten });
  const siblings = item.TripDay?.ItineraryItem ?? [];

  const overlapWith = findScheduleTimeOverlap({
    itemId,
    newStart: item.startTime,
    newEnd: newEnd.toJSDate(),
    siblings,
  });
  if (overlapWith) {
    throw new BadRequestException(`缩短后将与行程项 ${overlapWith} 时间重叠`);
  }

  await prisma.itineraryItem.update({
    where: { id: itemId },
    data: { endTime: newEnd.toJSDate() },
  });

  const laterItems = siblings
    .filter((s) => s.id !== itemId && s.startTime && s.startTime >= item.endTime!)
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime());

  for (const later of laterItems) {
    if (!later.startTime || !later.endTime) continue;
    const shiftedStart = DateTime.fromJSDate(later.startTime).minus({ minutes: actualShorten });
    const shiftedEnd = DateTime.fromJSDate(later.endTime).minus({ minutes: actualShorten });
    await prisma.itineraryItem.update({
      where: { id: later.id },
      data: {
        startTime: shiftedStart.toJSDate(),
        endTime: shiftedEnd.toJSDate(),
      },
    });
  }

  return {
    type: 'SHORTEN_STAY',
    itemId,
    deltaMinutes: -actualShorten,
  };
}

export async function applySkipItem(
  prisma: PrismaService,
  itemId: string,
): Promise<ExecutionScheduleMutationDto> {
  assertDirectEffectivePlanWriteBlocked('execution-advisory.applySkipItem');
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
  if (!item.startTime || !item.endTime) {
    throw new BadRequestException('该行程项缺少时间，无法跳过');
  }

  const freedMinutes = Math.round(
    DateTime.fromJSDate(item.endTime).diff(DateTime.fromJSDate(item.startTime), 'minutes').minutes,
  );
  const siblings = item.TripDay?.ItineraryItem ?? [];
  const laterItems = siblings
    .filter((s) => s.id !== itemId && s.startTime && s.startTime >= item.endTime!)
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime());

  await prisma.itineraryItem.delete({ where: { id: itemId } });

  if (freedMinutes > 0) {
    for (const later of laterItems) {
      if (!later.startTime || !later.endTime) continue;
      const shiftedStart = DateTime.fromJSDate(later.startTime).minus({ minutes: freedMinutes });
      const shiftedEnd = DateTime.fromJSDate(later.endTime).minus({ minutes: freedMinutes });
      await prisma.itineraryItem.update({
        where: { id: later.id },
        data: {
          startTime: shiftedStart.toJSDate(),
          endTime: shiftedEnd.toJSDate(),
        },
      });
    }
  }

  return { type: 'SKIP_ITEM', itemId };
}

export function resolveRecommendationMutation(input: {
  recommendation: ExecutionRecommendationDto;
  activeItemId?: string;
  tripDayItemIds: string[];
}): { action: 'shorten' | 'skip' | 'replace' | 'keep'; itemId?: string; deltaMinutes?: number } {
  const { recommendation, activeItemId, tripDayItemIds } = input;

  if (recommendation.actionType === 'keep') {
    return { action: 'keep' };
  }

  if (recommendation.actionType === 'shorten') {
    const itemId =
      activeItemId ??
      (recommendation.id === 'rec-shorten-active'
        ? tripDayItemIds[0]
        : tripDayItemIds.find((id) => recommendation.id.includes(id)));
    return { action: 'shorten', itemId, deltaMinutes: -DEFAULT_SHORTEN_MINUTES };
  }

  if (recommendation.actionType === 'skip') {
    const lastId = tripDayItemIds[tripDayItemIds.length - 1];
    return { action: 'skip', itemId: lastId };
  }

  if (recommendation.actionType === 'replace') {
    return { action: 'replace' };
  }

  return { action: 'keep' };
}

export function buildScheduleItemsForResponse(
  items: Array<{
    id: string;
    placeId: number | null;
    startTime: Date | null;
    endTime: Date | null;
    Place?: { nameCN: string | null; nameEN: string | null } | null;
  }>,
  now: DateTime,
): Array<{
  placeId: number | string;
  placeName: string;
  startTime: string;
  endTime: string;
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
}> {
  return items
    .filter((item) => item.startTime && item.endTime)
    .map((item) => {
      const start = DateTime.fromJSDate(item.startTime!);
      const end = DateTime.fromJSDate(item.endTime!);
      let status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled' = 'upcoming';
      if (now >= end) status = 'completed';
      else if (now >= start && now <= end) status = 'in_progress';

      return {
        placeId: item.placeId ?? item.id,
        placeName: item.Place?.nameCN || item.Place?.nameEN || '行程项',
        startTime: start.toISO() ?? item.startTime!.toISOString(),
        endTime: end.toISO() ?? item.endTime!.toISOString(),
        status,
      };
    });
}
