/**
 * 交通衔接 repair — 分钟级 shift / buffer（P0-2）
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { PrismaService } from '../../../prisma/prisma.service';
import type {
  FeasibilityIssueAnchorsDto,
  FeasibilityRepairOptionDto,
} from '../types/trip-constraint-solver.types';

const DEFAULT_BUFFER_MINUTES = 15;

export function computeShiftMinutes(
  shortfallMinutes?: number,
  bufferMinutes: number = DEFAULT_BUFFER_MINUTES,
): number {
  const shortfall = Math.max(0, Math.ceil(shortfallMinutes ?? 0));
  return shortfall + bufferMinutes;
}

export function roundBufferMinutes(minutes: number): number {
  return Math.max(DEFAULT_BUFFER_MINUTES, Math.ceil(minutes / 15) * 15);
}

export function buildShiftDepartureRepairOption(input: {
  issueId: string;
  toItemId: string;
  toLabel?: string;
  shortfallMinutes?: number;
  bufferMinutes?: number;
  suggestedTime?: string;
  anchors?: FeasibilityIssueAnchorsDto;
}): FeasibilityRepairOptionDto {
  const shiftMinutes = computeShiftMinutes(input.shortfallMinutes, input.bufferMinutes);
  const toLabel = input.toLabel ?? '下一站';

  return {
    id: 'shift_departure',
    label: `顺延 ${toLabel} ${shiftMinutes} 分钟`,
    description: `将下一站开始时间后移 ${shiftMinutes} 分钟（含 ${input.bufferMinutes ?? DEFAULT_BUFFER_MINUTES} 分钟缓冲），消除交通时间不足。`,
    impactSummary: `+${shiftMinutes} 分钟`,
    type: 'shift_departure',
    actionType: 'shift_departure',
    payload: {
      itemId: input.toItemId,
      shiftMinutes,
      bufferMinutes: input.bufferMinutes ?? DEFAULT_BUFFER_MINUTES,
      shortfallMinutes: Math.ceil(input.shortfallMinutes ?? 0),
      suggestedValue: input.suggestedTime,
      field: 'startTime',
      validateScope: { type: 'issue', issueId: input.issueId },
      anchors: input.anchors,
    },
  };
}

export function buildFixedMinuteBufferRepairOption(input: {
  issueId: string;
  toItemId: string;
  fromItemId?: string;
  toLabel?: string;
  toDayNumber?: number;
  bufferMinutes: 30 | 60;
  anchors?: FeasibilityIssueAnchorsDto;
}): FeasibilityRepairOptionDto {
  const toLabel = input.toLabel ?? '下一站';
  const dayNumber = input.toDayNumber ?? 1;

  return {
    id: `buffer-add-${input.bufferMinutes}`,
    label: `加 ${input.bufferMinutes} 分钟缓冲`,
    description: `将${toLabel}出发推迟 ${input.bufferMinutes} 分钟，缓解与上一段的衔接。`,
    impactSummary: `+${input.bufferMinutes} 分钟`,
    type: 'add_buffer',
    actionType: 'add_buffer',
    payload: {
      bufferMinutes: input.bufferMinutes,
      bufferSlot: 'before',
      fromItemId: input.fromItemId,
      toItemId: input.toItemId,
      itemId: input.toItemId,
      shiftMinutes: input.bufferMinutes,
      field: 'startTime',
      validateScope: {
        type: 'day',
        dayNumber,
        issueId: input.issueId,
      },
      anchors: input.anchors,
    },
  };
}

export function buildMinuteBufferRepairOptions(input: {
  issueId: string;
  toItemId: string;
  fromItemId?: string;
  toLabel?: string;
  toDayNumber?: number;
  shortfallMinutes?: number;
  anchors?: FeasibilityIssueAnchorsDto;
}): FeasibilityRepairOptionDto[] {
  const presets: Array<30 | 60> = [30, 60];
  const options = presets.map((bufferMinutes) =>
    buildFixedMinuteBufferRepairOption({
      issueId: input.issueId,
      toItemId: input.toItemId,
      fromItemId: input.fromItemId,
      toLabel: input.toLabel,
      toDayNumber: input.toDayNumber,
      bufferMinutes,
      anchors: input.anchors,
    }),
  );

  const rounded = roundBufferMinutes(input.shortfallMinutes ?? 0);
  if (rounded > 0 && rounded !== 30 && rounded !== 60) {
    options.push(buildAddBufferMinutesRepairOption(input));
  }

  return options;
}

export function isInsertRestDayRepairPayload(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.beforeDayNumber === 'number' &&
    payload.bufferMinutes == null &&
    (payload.strategy === 'insert_rest' || payload.afterDayNumber != null)
  );
}

export function isMinuteBufferRepairPayload(payload: Record<string, unknown>): boolean {
  return typeof payload.bufferMinutes === 'number' && payload.bufferMinutes > 0;
}

export function buildAddBufferMinutesRepairOption(input: {
  issueId: string;
  toItemId: string;
  toLabel?: string;
  shortfallMinutes?: number;
  anchors?: FeasibilityIssueAnchorsDto;
}): FeasibilityRepairOptionDto {
  const bufferMinutes = roundBufferMinutes(input.shortfallMinutes ?? DEFAULT_BUFFER_MINUTES);
  const toLabel = input.toLabel ?? '下一站';

  return {
    id: 'add_buffer_minutes',
    label: `增加 ${bufferMinutes} 分钟缓冲`,
    description: `在 ${toLabel} 前增加 ${bufferMinutes} 分钟交通缓冲，不改变行程天数。`,
    impactSummary: `+${bufferMinutes} 分钟`,
    type: 'add_buffer_minutes',
    actionType: 'add_buffer_minutes',
    payload: {
      itemId: input.toItemId,
      bufferMinutes,
      shiftMinutes: bufferMinutes,
      field: 'startTime',
      validateScope: { type: 'issue', issueId: input.issueId },
      anchors: input.anchors,
    },
  };
}

export function shouldOfferMinuteTimingRepairs(input: {
  toItemId?: string;
  shortfallMinutes?: number;
  isStartTooEarly?: boolean;
  issueKind?: string;
  priority?: string;
}): boolean {
  if (!input.toItemId) return false;
  if (input.isStartTooEarly === true || (input.shortfallMinutes ?? 0) > 0) return true;
  if (input.issueKind === 'inter_day_travel' && input.priority === 'must_handle') return true;
  return false;
}

export function findScheduleTimeOverlap(input: {
  itemId: string;
  newStart: Date;
  newEnd: Date;
  siblings: Array<{ id: string; startTime: Date | null; endTime: Date | null }>;
}): string | undefined {
  for (const other of input.siblings) {
    if (other.id === input.itemId || !other.startTime || !other.endTime) continue;
    if (input.newStart < other.endTime && other.startTime < input.newEnd) {
      return other.id;
    }
  }
  return undefined;
}

export async function applyMinuteTimingShiftRepair(
  prisma: PrismaService,
  payload: Record<string, unknown>,
): Promise<{ itemId: string; shiftMinutes: number; newStartTime?: string }> {
  const itemId = typeof payload.itemId === 'string' ? payload.itemId : undefined;
  const shiftMinutes =
    typeof payload.shiftMinutes === 'number'
      ? payload.shiftMinutes
      : typeof payload.bufferMinutes === 'number'
        ? payload.bufferMinutes
        : undefined;

  if (!itemId || !shiftMinutes || shiftMinutes <= 0) {
    throw new BadRequestException('shift 修复缺少 itemId 或 shiftMinutes');
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
  if (!item.startTime) {
    throw new BadRequestException('该行程项无 startTime，无法顺延');
  }

  const newStart = DateTime.fromJSDate(item.startTime).plus({ minutes: shiftMinutes });
  const durationMin =
    item.startTime && item.endTime
      ? DateTime.fromJSDate(item.endTime).diff(DateTime.fromJSDate(item.startTime), 'minutes')
          .minutes
      : 120;
  const newEnd = newStart.plus({ minutes: Math.max(30, durationMin) });

  const overlapWith = findScheduleTimeOverlap({
    itemId,
    newStart: newStart.toJSDate(),
    newEnd: newEnd.toJSDate(),
    siblings: item.TripDay?.ItineraryItem ?? [],
  });
  if (overlapWith) {
    throw new ConflictException({
      message: `顺延后将与行程项 ${overlapWith} 时间重叠`,
      errorCode: 'SCHEDULE_CONFLICT',
    });
  }

  await prisma.itineraryItem.update({
    where: { id: itemId },
    data: {
      startTime: newStart.toJSDate(),
      endTime: newEnd.toJSDate(),
    },
  });

  return {
    itemId,
    shiftMinutes,
    newStartTime: newStart.toISO() ?? undefined,
  };
}
