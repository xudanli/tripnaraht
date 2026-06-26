import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TripPlan } from '../../decision/plan-model';
import { TripRevisionBumpService } from '../../services/trip-revision-bump.service';
import {
  buildTripPlanPersistenceOps,
  summarizePersistenceResult,
  type TripPlanPersistenceResult,
} from '../utils/trip-plan-persistence.util';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TripPlanPersistenceService {
  private readonly logger = new Logger(TripPlanPersistenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripRevisionBump: TripRevisionBumpService,
  ) {}

  async persistRepairPlan(tripId: string, plan: TripPlan): Promise<TripPlanPersistenceResult> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              select: {
                id: true,
                tripDayId: true,
                type: true,
                placeId: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const lockedSlotIds = new Set<string>();
    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        if (slot.locked) lockedSlotIds.add(slot.id);
      }
    }

    const ops = buildTripPlanPersistenceOps({
      plan,
      tripDays: trip.TripDay.map((day) => ({ id: day.id, date: day.date })),
      existingItems: trip.TripDay.flatMap((day) => day.ItineraryItem),
      lockedSlotIds,
    });

    const existingIds = new Set(
      trip.TripDay.flatMap((day) => day.ItineraryItem.map((item) => item.id)),
    );
    const updatingIds = new Set(ops.updates.map((update) => update.id));
    const deletes = ops.deletes.filter((id) => !updatingIds.has(id));

    for (const update of ops.updates) {
      if (!existingIds.has(update.id)) {
        throw new BadRequestException(
          `REPAIR_ITEM_NOT_FOUND: itinerary item ${update.id} does not exist on trip ${tripId}`,
        );
      }
    }

    if (ops.updates.length === 0 && ops.creates.length === 0 && deletes.length === 0) {
      return summarizePersistenceResult({ ...ops, deletes });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const update of ops.updates) {
        await tx.itineraryItem.update({
          where: { id: update.id },
          data: {
            tripDayId: update.tripDayId,
            startTime: update.startTime,
            endTime: update.endTime,
            order: update.order,
            placeId: update.placeId,
            type: update.type as any,
          },
        });
      }

      for (const create of ops.creates) {
        await tx.itineraryItem.create({
          data: {
            id: UUID_RE.test(create.id) ? create.id : randomUUID(),
            tripDayId: create.tripDayId,
            startTime: create.startTime,
            endTime: create.endTime,
            order: create.order,
            placeId: create.placeId,
            type: create.type as any,
            note: null,
          },
        });
      }

      for (const itemId of deletes) {
        await tx.itineraryItem.delete({ where: { id: itemId } });
      }

      await tx.trip.update({
        where: { id: tripId },
        data: { updatedAt: new Date() },
      });
    });

    await this.tripRevisionBump.bump(tripId);

    const summary = summarizePersistenceResult({ ...ops, deletes });
    this.logger.log(
      `persistRepairPlan trip=${tripId} updated=${summary.updatedItemIds.length} created=${summary.createdItemIds.length} removed=${summary.removedItemIds.length}`,
    );
    return summary;
  }
}
