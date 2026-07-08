import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  classifyPlanningItemLock,
  type PlanningItemLockView,
} from '../utils/planning-item-lock.util';

export interface TripItemLockSnapshot {
  tripId: string;
  lockedItems: PlanningItemLockView[];
  semiLockedItems: PlanningItemLockView[];
  mustVisitItems: PlanningItemLockView[];
  movableItems: PlanningItemLockView[];
}

@Injectable()
export class PlanningItemLockService {
  constructor(private readonly prisma: PrismaService) {}

  async getTripItemLocks(tripId: string): Promise<TripItemLockSnapshot> {
    const [items, mustGoCandidates] = await Promise.all([
      this.prisma.itineraryItem.findMany({
        where: { TripDay: { tripId } },
        select: {
          id: true,
          type: true,
          placeId: true,
          note: true,
          bookingStatus: true,
          bookedAt: true,
        },
      }),
      this.prisma.tripAttractionExploreCandidate.findMany({
        where: { tripId, priority: 'must_go' },
        select: { placeId: true },
      }),
    ]);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const metadata = (trip?.metadata as Record<string, unknown> | null) ?? {};
    const userLockedIds = new Set(
      Array.isArray(metadata.userLockedItemIds)
        ? (metadata.userLockedItemIds as string[])
        : [],
    );
    const mustGoPlaceIds = new Set(mustGoCandidates.map((c) => c.placeId));

    const locks = items.map((item) =>
      classifyPlanningItemLock({
        itemId: item.id,
        type: item.type,
        placeId: item.placeId,
        note: item.note,
        bookingStatus: item.bookingStatus,
        bookedAt: item.bookedAt,
        userLocked: userLockedIds.has(item.id),
        candidatePriority:
          item.placeId && mustGoPlaceIds.has(item.placeId) ? 'must_go' : null,
      }),
    );

    return {
      tripId,
      lockedItems: locks.filter((l) => l.lockLevel === 'locked'),
      semiLockedItems: locks.filter((l) => l.lockLevel === 'semi_locked'),
      mustVisitItems: locks.filter((l) => l.lockLevel === 'must_visit'),
      movableItems: locks.filter((l) => l.lockLevel === 'movable'),
    };
  }

  isItemLocked(snapshot: TripItemLockSnapshot, itemId: string): boolean {
    return snapshot.lockedItems.some((l) => l.itemId === itemId);
  }
}
