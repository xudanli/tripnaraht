import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveDayNumber } from '../../../mobile/utils/mobile-execution.util';
import { resolveExecutionActionDeadlineFromStartTimes } from '../utils/execution-action-deadline.util';
import type { ExecutionAdjustmentQueueContext } from './execution-adjustment-queue-projection.service';

@Injectable()
export class ExecutionAdjustmentQueueContextService {
  constructor(private readonly prisma: PrismaService) {}

  async load(tripId: string): Promise<ExecutionAdjustmentQueueContext> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        startDate: true,
        endDate: true,
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: { startTime: 'asc' },
              include: { Place: true },
            },
          },
        },
      },
    });

    const [collaborators, users] = await Promise.all([
      this.prisma.tripCollaborator.findMany({ where: { tripId } }),
      this.prisma.tripCollaborator
        .findMany({ where: { tripId }, select: { userId: true } })
        .then(async (rows) => {
          const userIds = rows.map((r) => r.userId);
          if (userIds.length === 0) return [];
          return this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true },
          });
        }),
    ]);

    const memberNamesById = new Map<string, string>();
    const userMap = new Map(users.map((u) => [u.id, u]));
    for (const row of collaborators) {
      const user = userMap.get(row.userId);
      memberNamesById.set(
        row.userId,
        user?.displayName ?? user?.email ?? row.userId,
      );
    }

    const activityTitleById = new Map<string, string>();
    let actionDeadline: string | undefined;

    if (trip) {
      const dayNumber = resolveDayNumber(trip.startDate, trip.endDate);
      const day = trip.TripDay[dayNumber - 1] ?? trip.TripDay[0];
      const now = DateTime.now();

      for (const item of day?.ItineraryItem ?? []) {
        activityTitleById.set(
          item.id,
          item.Place?.nameCN ?? item.Place?.nameEN ?? item.note ?? '行程项',
        );
      }

      actionDeadline = resolveExecutionActionDeadlineFromStartTimes(
        (day?.ItineraryItem ?? []).map((item) => item.startTime),
        now,
      );
    }

    return { memberNamesById, activityTitleById, actionDeadline };
  }
}
