/**
 * inter_day_travel — 插入缓冲日 repair（P0-2 一键缓冲）
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../../../prisma/prisma.service';
import type {
  FeasibilityIssueAnchorsDto,
  FeasibilityRepairOptionDto,
} from '../types/trip-constraint-solver.types';
import type {
  PreviewRepairResponse,
  RepairOption,
} from '../../readiness/types/coverage-map.types';

export function shouldOfferAddBufferRepair(input: {
  issueKind?: string;
  isStartTooEarly?: boolean;
  priority?: string;
}): boolean {
  return (
    input.issueKind === 'inter_day_travel' &&
    (input.isStartTooEarly === true || input.priority === 'must_handle')
  );
}

export function buildAddBufferRepairOption(input: {
  issueId: string;
  anchors?: FeasibilityIssueAnchorsDto;
  affectedDays?: number[];
  fromItemId?: string;
  toItemId?: string;
  fromDayNumber?: number;
  toDayNumber?: number;
  fromPlaceLabel?: string;
  toPlaceLabel?: string;
  isStartTooEarly?: boolean;
}): FeasibilityRepairOptionDto {
  const afterDayNumber =
    input.fromDayNumber ?? input.anchors?.fromDayNumber ?? input.affectedDays?.[0] ?? 1;
  const beforeDayNumber =
    input.toDayNumber ?? input.anchors?.toDayNumber ?? (input.affectedDays?.[1] ?? afterDayNumber + 1);
  const fromLabel = input.fromPlaceLabel ?? input.anchors?.fromPlaceLabel ?? '上一站';
  const toLabel = input.toPlaceLabel ?? input.anchors?.toPlaceLabel ?? '下一站';

  return {
    id: 'add_buffer',
    label: '插入缓冲日',
    description: `在 Day ${afterDayNumber} 与 Day ${beforeDayNumber} 之间增加 1 天缓冲，缓解 ${fromLabel} → ${toLabel} 跨天长途交通。`,
    impactSummary: '行程 +1 天',
    type: 'insert_rest_day',
    actionType: 'insert_rest_day',
    payload: {
      afterDayNumber,
      beforeDayNumber,
      fromItemId: input.fromItemId ?? input.anchors?.fromItemId,
      toItemId: input.toItemId ?? input.anchors?.toItemId,
      strategy: 'insert_rest',
      validateScope: { type: 'issue', issueId: input.issueId },
    },
  };
}

export async function applyInterDayBufferDayRepair(
  prisma: PrismaService,
  tripId: string,
  payload: Record<string, unknown>,
): Promise<{
  insertedDayId: string;
  insertedDateISO: string;
  beforeDayNumber: number;
  shiftedDayCount: number;
}> {
  const beforeDayNumber =
    typeof payload.beforeDayNumber === 'number' ? payload.beforeDayNumber : undefined;
  if (!beforeDayNumber || beforeDayNumber < 2) {
    throw new BadRequestException('add_buffer 缺少有效 beforeDayNumber');
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: { ItineraryItem: { orderBy: { startTime: 'asc' } } },
      },
    },
  });
  if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

  const days = trip.TripDay;
  const insertIndex = beforeDayNumber - 1;
  if (insertIndex < 1 || insertIndex > days.length) {
    throw new BadRequestException(`无法在 Day ${beforeDayNumber} 前插入缓冲日`);
  }

  const bufferDate = days[insertIndex].date;
  const insertedDateISO = DateTime.fromJSDate(bufferDate).toISODate() ?? bufferDate.toISOString().slice(0, 10);
  let insertedDayId = '';

  await prisma.$transaction(async (tx) => {
    for (let i = days.length - 1; i >= insertIndex; i--) {
      const day = days[i];
      const shiftedDate = DateTime.fromJSDate(day.date).plus({ days: 1 }).toJSDate();
      await tx.tripDay.update({ where: { id: day.id }, data: { date: shiftedDate } });

      for (const item of day.ItineraryItem) {
        const patch: { startTime?: Date; endTime?: Date | null } = {};
        if (item.startTime) {
          patch.startTime = DateTime.fromJSDate(item.startTime).plus({ days: 1 }).toJSDate();
        }
        if (item.endTime) {
          patch.endTime = DateTime.fromJSDate(item.endTime).plus({ days: 1 }).toJSDate();
        }
        if (Object.keys(patch).length > 0) {
          await tx.itineraryItem.update({ where: { id: item.id }, data: patch });
        }
      }
    }

    insertedDayId = randomUUID();
    await tx.tripDay.create({
      data: { id: insertedDayId, tripId, date: bufferDate },
    });

    const restStart = DateTime.fromJSDate(bufferDate).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
    await tx.itineraryItem.create({
      data: {
        id: randomUUID(),
        tripDayId: insertedDayId,
        type: 'REST',
        startTime: restStart.toJSDate(),
        endTime: restStart.plus({ hours: 8 }).toJSDate(),
        note: '缓冲日 · 自由活动 / 机动',
        order: 1,
      },
    });

    await tx.trip.update({
      where: { id: tripId },
      data: {
        endDate: DateTime.fromJSDate(trip.endDate).plus({ days: 1 }).toJSDate(),
        updatedAt: new Date(),
      },
    });
  });

  return {
    insertedDayId,
    insertedDateISO,
    beforeDayNumber,
    shiftedDayCount: days.length - insertIndex,
  };
}

export function buildAddBufferPreviewResponse(input: {
  tripId: string;
  blockerId: string;
  issueId: string;
  optionId: string;
  payload: Record<string, unknown>;
  totalDays: number;
  totalItems: number;
}): PreviewRepairResponse {
  const beforeDayNumber =
    typeof input.payload.beforeDayNumber === 'number' ? input.payload.beforeDayNumber : 2;

  return {
    tripId: input.tripId,
    blockerId: input.blockerId,
    issueId: input.issueId,
    optionId: input.optionId,
    actionType: 'insert_rest_day',
    previewMode: 'heuristic',
    status: 'preview',
    message: `将在 Day ${beforeDayNumber} 前插入 1 天缓冲，后续 ${Math.max(0, input.totalDays - beforeDayNumber + 1)} 天顺延 1 日`,
    before: {
      dayNumber: beforeDayNumber,
      itemCount: 0,
      totalItemCount: input.totalItems,
      highlights: [`当前共 ${input.totalDays} 天`],
    },
    after: {
      dayNumber: beforeDayNumber,
      itemCount: 1,
      totalItemCount: input.totalItems + 1,
      highlights: [`插入缓冲日`, `总天数 ${input.totalDays + 1}`],
    },
    itineraryDiff: [
      {
        slotId: 'buffer-day',
        changeType: 'added',
        dayNumber: beforeDayNumber,
        after: { title: '缓冲日 · 自由活动 / 机动', time: '10:00' },
      },
    ],
    impact: {
      feasibilityScoreBefore: 0,
      feasibilityScoreAfter: 10,
      estimated: true,
    },
    option: {
      id: input.optionId,
      title: '插入缓冲日',
      description: `在 Day ${beforeDayNumber} 前增加 1 天缓冲`,
      impact: 'high',
      timeEstimate: '2分钟',
      actionType: 'insert_rest_day',
      payload: input.payload,
    } satisfies RepairOption,
  };
}
