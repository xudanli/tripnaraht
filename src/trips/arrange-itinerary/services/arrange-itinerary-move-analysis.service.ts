import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlanProposalBuilderService } from './plan-proposal-builder.service';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import { PlanningItemLockService } from './planning-item-lock.service';
import { isPlanningItemImmutable } from '../utils/planning-item-lock.util';
import type { PlanProposal, PlanProposalMutationResponse } from '../types/plan-proposal.types';
import {
  buildDayDateTime,
  resolveTripDayByIndex,
} from '../../utils/arrange-itinerary-day.util';

@Injectable()
export class ArrangeItineraryMoveAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: PlanProposalBuilderService,
    private readonly store: PlanProposalStoreService,
    private readonly itemLocks: PlanningItemLockService,
  ) {}

  async analyzeMove(input: {
    tripId: string;
    userId: string;
    itemId: string;
    dayIndex: number;
    startTime: string;
    endTime?: string;
    persistProposal?: boolean;
  }): Promise<PlanProposalMutationResponse> {
    const item = await this.prisma.itineraryItem.findFirst({
      where: { id: input.itemId, TripDay: { tripId: input.tripId } },
      include: {
        Place: { select: { nameCN: true } },
        TripDay: { select: { id: true, date: true, tripId: true } },
      },
    });
    if (!item) {
      throw new NotFoundException('行程项不存在或不属于该行程');
    }

    const locks = await this.itemLocks.getTripItemLocks(input.tripId);
    const lock = [
      ...locks.lockedItems,
      ...locks.semiLockedItems,
      ...locks.mustVisitItems,
      ...locks.movableItems,
    ].find((l) => l.itemId === input.itemId);

    if (lock && isPlanningItemImmutable(lock.lockLevel)) {
      throw new BadRequestException(`该行程项已锁定（${lock.reason}），无法移动`);
    }

    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId: input.tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });
    const targetDay = resolveTripDayByIndex(tripDays, input.dayIndex);
    const sourceDayIndex =
      tripDays.findIndex((d) => d.id === item.tripDayId) + 1;

    const start = buildDayDateTime(targetDay.date, input.startTime);
    let end: Date;
    if (input.endTime) {
      end = buildDayDateTime(targetDay.date, input.endTime);
    } else if (item.startTime && item.endTime) {
      const duration = DateTime.fromJSDate(item.endTime, { zone: 'utc' }).diff(
        DateTime.fromJSDate(item.startTime, { zone: 'utc' }),
        'minutes',
      ).minutes;
      end = DateTime.fromJSDate(start, { zone: 'utc' }).plus({ minutes: duration }).toJSDate();
    } else {
      end = DateTime.fromJSDate(start, { zone: 'utc' }).plus({ minutes: 90 }).toJSDate();
    }

    const label = item.Place?.nameCN ?? item.note ?? '行程项';
    const fromLabel =
      item.startTime && sourceDayIndex > 0
        ? `第 ${sourceDayIndex} 天 ${this.formatTime(item.startTime)}`
        : `第 ${sourceDayIndex} 天`;

    const proposal = await this.builder.build({
      tripId: input.tripId,
      userId: input.userId,
      intent: 'MOVE_ITEM',
      source: {
        type: 'ai_action',
        payload: {
          itemId: input.itemId,
          dayIndex: input.dayIndex,
          startTime: input.startTime,
          endTime: input.endTime,
        },
      },
      changes: [
        {
          operation: 'MOVE',
          itemId: input.itemId,
          dayIndex: input.dayIndex,
          from: fromLabel,
          to: `第 ${input.dayIndex} 天 ${this.formatTime(start)}`,
          startTime: this.formatTime(start),
          endTime: this.formatTime(end),
          label,
        },
      ],
      tradeoffs: await this.buildMoveTradeoffs({
        tripDayId: targetDay.id,
        start,
        end,
        itemId: input.itemId,
        sourceDayIndex,
        targetDayIndex: input.dayIndex,
      }),
    });

    if (input.persistProposal !== false) {
      this.store.save(proposal);
    }

    return {
      mode: 'proposal',
      tripId: input.tripId,
      proposal,
      orchestrationState: {
        tripId: input.tripId,
        phase: 'AWAITING_CONFIRMATION',
        activeProposalId: proposal.proposalId,
        contextVersion: proposal.contextVersion,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  private async buildMoveTradeoffs(input: {
    tripDayId: string;
    start: Date;
    end: Date;
    itemId: string;
    sourceDayIndex: number;
    targetDayIndex: number;
  }): Promise<string[]> {
    const tradeoffs: string[] = [];
    if (input.sourceDayIndex !== input.targetDayIndex) {
      tradeoffs.push(`从第 ${input.sourceDayIndex} 天移至第 ${input.targetDayIndex} 天`);
    }

    const dayItems = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: input.tripDayId },
      select: { id: true, startTime: true, endTime: true },
    });

    for (const other of dayItems) {
      if (other.id === input.itemId || !other.startTime || !other.endTime) continue;
      if (input.start < other.endTime && input.end > other.startTime) {
        tradeoffs.push('移动后可能与同天其他行程时间重叠');
        break;
      }
    }

    if (input.end.getHours() >= 21) {
      tradeoffs.push('预计结束时间偏晚，请留意营业与入住时间');
    }

    return tradeoffs;
  }

  private formatTime(value: Date): string {
    return DateTime.fromJSDate(value, { zone: 'utc' }).toFormat('HH:mm');
  }
}
