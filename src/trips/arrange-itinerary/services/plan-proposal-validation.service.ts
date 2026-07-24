import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  PlanProposalChange,
  PlanProposalDiff,
  PlanProposalDiffChange,
  PlanProposalValidation,
} from '../types/plan-proposal.types';
import { resolveTripDayByIndex } from '../../utils/arrange-itinerary-day.util';

@Injectable()
export class PlanProposalValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateChanges(input: {
    tripId: string;
    changes: PlanProposalChange[];
  }): Promise<PlanProposalValidation> {
    const warnings: string[] = [];
    const conflicts: PlanProposalValidation['conflicts'] = [];

    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId: input.tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });

    for (const change of input.changes) {
      if (change.operation !== 'ADD' && change.operation !== 'MOVE') continue;
      if (!change.startTime || !change.endTime) continue;

      try {
        const tripDay = resolveTripDayByIndex(tripDays, change.dayIndex);
        const start = this.parseTime(tripDay.date, change.startTime);
        const end = this.parseTime(tripDay.date, change.endTime);

        if (start >= end) {
          conflicts.push({
            kind: 'invalid_time_window',
            message: `${change.label ?? '行程项'} 结束时间必须晚于开始时间`,
            dayIndex: change.dayIndex,
          });
          continue;
        }

        const dayItems = await this.prisma.itineraryItem.findMany({
          where: { tripDayId: tripDay.id },
          select: {
            id: true,
            placeId: true,
            startTime: true,
            endTime: true,
            note: true,
          },
        });

        if (change.placeId) {
          const duplicate = dayItems.find((item) => item.placeId === change.placeId);
          if (duplicate) {
            conflicts.push({
              kind: 'duplicate_item',
              message: `第 ${change.dayIndex} 天已存在相同景点（行程项重复）`,
              dayIndex: change.dayIndex,
              itemIds: [duplicate.id],
            });
          }
        }

        for (const item of dayItems) {
          if (change.itemId && item.id === change.itemId) continue;
          if (!item.startTime || !item.endTime) continue;
          const overlap = start < item.endTime && end > item.startTime;
          if (overlap) {
            warnings.push(
              `第 ${change.dayIndex} 天 ${change.startTime}-${change.endTime} 与现有行程时间重叠`,
            );
          }
        }

        if (end.getHours() >= 21) {
          warnings.push(`${change.label ?? '行程项'} 预计 ${change.endTime} 结束，可能偏晚`);
        }
      } catch {
        conflicts.push({
          kind: 'invalid_day',
          message: `dayIndex ${change.dayIndex} 无效`,
          dayIndex: change.dayIndex,
        });
      }
    }

    const status =
      conflicts.some((c) => c.kind === 'duplicate_item' || c.kind === 'invalid_time_window')
        ? 'BLOCK'
        : warnings.length > 0
          ? 'WARN'
          : 'PASS';

    return { status, warnings, conflicts };
  }

  buildDiff(changes: PlanProposalChange[]): PlanProposalDiff {
    const timelineChanges: PlanProposalDiffChange[] = changes.map((change) => {
      const label = change.label ?? change.note ?? '行程调整';
      const impact: PlanProposalDiffChange['impact'] =
        change.operation === 'REMOVE' || change.operation === 'MOVE'
          ? 'medium'
          : 'low';

      if (change.operation === 'ADD') {
        return {
          operation: change.operation,
          label: `新增：${label}`,
          dayIndex: change.dayIndex,
          to: `${change.dayIndex} ${change.startTime ?? ''}-${change.endTime ?? ''}`.trim(),
          impact,
        };
      }

      if (change.operation === 'MOVE' || change.operation === 'REORDER') {
        return {
          operation: change.operation,
          label: `调整：${label}`,
          dayIndex: change.dayIndex,
          from: change.from,
          to: change.to,
          impact: 'medium',
        };
      }

      if (change.operation === 'REMOVE_CANDIDATE') {
        return {
          operation: change.operation,
          label: `从候选移除：${label}`,
          dayIndex: change.dayIndex,
          impact: 'low',
        };
      }

      return {
        operation: change.operation,
        label,
        dayIndex: change.dayIndex,
        impact,
      };
    });

    const addCount = changes.filter((c) => c.operation === 'ADD').length;
    const summary =
      addCount > 0
        ? `将新增 ${addCount} 个行程项`
        : changes.length > 0
          ? `共 ${changes.length} 处调整`
          : '无变更';

    return { timelineChanges, summary };
  }

  private parseTime(dayDate: Date, hhmm: string): Date {
    const [hourRaw, minuteRaw] = hhmm.split(':');
    return DateTime.fromJSDate(dayDate, { zone: 'utc' })
      .set({
        hour: Number(hourRaw),
        minute: Number(minuteRaw),
        second: 0,
        millisecond: 0,
      })
      .toJSDate();
  }
}
