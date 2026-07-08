import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface TripPlanningContextSnapshot {
  tripId: string;
  contextVersion: number;
  basePlanVersion: number;
  itemCount: number;
  candidateCount: number;
  dayCount: number;
  tripUpdatedAt: string;
}

@Injectable()
export class PlanProposalContextService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(tripId: string): Promise<TripPlanningContextSnapshot> {
    const [trip, itemCount, candidateCount, dayCount] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { updatedAt: true },
      }),
      this.prisma.itineraryItem.count({
        where: { TripDay: { tripId } },
      }),
      this.prisma.tripAttractionExploreCandidate.count({ where: { tripId } }),
      this.prisma.tripDay.count({ where: { tripId } }),
    ]);

    const tripUpdatedAt = trip?.updatedAt?.toISOString() ?? new Date(0).toISOString();
    const contextVersion = this.computeVersion({
      tripUpdatedAt,
      itemCount,
      candidateCount,
      dayCount,
    });

    return {
      tripId,
      contextVersion,
      basePlanVersion: itemCount,
      itemCount,
      candidateCount,
      dayCount,
      tripUpdatedAt,
    };
  }

  computeVersion(input: {
    tripUpdatedAt: string;
    itemCount: number;
    candidateCount: number;
    dayCount: number;
  }): number {
    const seed = [
      input.tripUpdatedAt,
      input.itemCount,
      input.candidateCount,
      input.dayCount,
    ].join('|');
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  isStale(proposalContextVersion: number, current: TripPlanningContextSnapshot): boolean {
    return proposalContextVersion !== current.contextVersion;
  }
}
