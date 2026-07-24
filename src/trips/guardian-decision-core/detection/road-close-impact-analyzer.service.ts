/**
 * PR-B — load plan + bindings and compute road-close impact.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import {
  analyzeRoadCloseImpact,
  readBindingsFromTripMetadata,
} from './road-close-impact-analyzer';
import type {
  RoadSegmentBindings,
  RoadCloseImpactInput,
  RoadCloseImpactResult,
} from './road-close-impact.types';

@Injectable()
export class RoadCloseImpactAnalyzerService {
  constructor(private readonly prisma: PrismaService) {}

  async analyzeForTrip(
    tripId: string,
    input: Omit<RoadCloseImpactInput, 'tripId' | 'bindings'> & {
      bindings?: RoadSegmentBindings;
    },
  ): Promise<RoadCloseImpactResult> {
    const [plan, trip] = await Promise.all([
      synthesizeRoutePlanDraftFromTrip(this.prisma, tripId),
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      }),
    ]);

    if (!plan) {
      throw new Error(`Cannot synthesize RoutePlanDraft for trip ${tripId}`);
    }

    const bindings =
      input.bindings ?? readBindingsFromTripMetadata(trip?.metadata);

    return analyzeRoadCloseImpact(plan, {
      tripId,
      roadId: input.roadId,
      primarySegmentId: input.primarySegmentId,
      bindings,
    });
  }
}
