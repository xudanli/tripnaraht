import { Injectable, Logger } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AttractionExploreAutoArrangeResult } from '../types/attraction-explore.types';
import { extractPlaceMeta } from '../utils/attraction-explore-place.util';

@Injectable()
export class AttractionExploreAutoArrangeService {
  private readonly logger = new Logger(AttractionExploreAutoArrangeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async autoArrange(input: {
    tripId: string;
    candidateIds?: string[];
  }): Promise<AttractionExploreAutoArrangeResult> {
    const taskId = `ae_arrange_${randomUUID()}`;

    const rows = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: {
        tripId: input.tripId,
        ...(input.candidateIds?.length ? { id: { in: input.candidateIds } } : {}),
      },
      include: { Place: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const priorityRank: Record<string, number> = {
      must_go: 0,
      very_interested: 1,
      alternative: 2,
    };
    rows.sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        a.sortOrder - b.sortOrder,
    );

    if (rows.length === 0) {
      return { taskId, status: 'completed', itemCount: 0 };
    }

    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId: input.tripId },
      orderBy: { date: 'asc' },
    });
    if (tripDays.length === 0) {
      return { taskId, status: 'completed', itemCount: 0 };
    }

    let dayIndex = 0;
    let slotHour = 9;
    let itemCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const tripDay = tripDays[dayIndex % tripDays.length];
        const dayDate = DateTime.fromJSDate(tripDay.date, { zone: 'utc' });
        const dwell = extractPlaceMeta(row.Place).suggestedDwellMinutes ?? 90;
        const startTime = dayDate.set({ hour: slotHour, minute: 0 }).toJSDate();
        const endTime = dayDate.plus({ minutes: dwell }).toJSDate();

        await tx.itineraryItem.create({
          data: {
            id: randomUUID(),
            tripDayId: tripDay.id,
            placeId: row.placeId,
            type: ItemType.ACTIVITY,
            startTime,
            endTime,
            note: `[景点探索] ${row.Place.nameCN}`,
          },
        });
        itemCount += 1;

        slotHour += Math.max(1, Math.ceil(dwell / 60));
        if (slotHour >= 17) {
          dayIndex += 1;
          slotHour = 9;
        }
      }
    });

    this.logger.log(`Auto-arranged ${itemCount} candidates into trip ${input.tripId} (${taskId})`);
    return { taskId, status: 'completed', itemCount };
  }
}
