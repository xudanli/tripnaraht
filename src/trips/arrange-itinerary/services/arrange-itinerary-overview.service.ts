import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScheduleTimelineService } from '../../services/schedule-timeline.service';
import { AttractionExploreContextService } from '../../attraction-explore/services/attraction-explore-context.service';
import { AttractionExploreCandidateService } from '../../attraction-explore/services/attraction-explore-candidate.service';
import type { ArrangeItineraryOverviewView } from '../types/arrange-itinerary.types';
import { scheduleTimelineUserId } from '../../utils/arrange-itinerary-day.util';

@Injectable()
export class ArrangeItineraryOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleTimeline: ScheduleTimelineService,
    private readonly context: AttractionExploreContextService,
    private readonly candidates: AttractionExploreCandidateService,
  ) {}

  async getOverview(tripId: string, userId: string): Promise<ArrangeItineraryOverviewView> {
    const [contextView, candidatesView, timelineResult, placedPlaceIds] = await Promise.all([
      this.context.getContext(tripId),
      this.candidates.listCandidates(tripId),
      this.scheduleTimeline.getScheduleTimeline(tripId, scheduleTimelineUserId(userId), {
        include: 'items,travelInfo',
        travelInfoMode: 'cached',
      }),
      this.loadPlacedPlaceIds(tripId),
    ]);

    const timeline =
      timelineResult.status === 'ok' ? timelineResult.data : { days: [], metricsSummary: undefined };

    let activityCount = 0;
    let totalDriveMinutes: number | null = null;
    let totalDistanceKm: number | null = null;

    for (const day of timeline.days) {
      const items = (day.itineraryItems as unknown[] | undefined) ?? [];
      activityCount += items.length;
    }

    const travelSummary = this.readTravelSummary(timeline.days);
    totalDriveMinutes = travelSummary.driveMinutes;
    totalDistanceKm = travelSummary.distanceKm;

    const dayCount =
      (
        await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { _count: { select: { TripDay: true } } },
        })
      )?._count.TripDay ?? timeline.days.length;
    const unplacedCandidateCount = candidatesView.candidates.filter(
      (candidate) => !placedPlaceIds.has(candidate.placeId),
    ).length;

    const pacing = contextView.travelConditions.pace;
    const transport = contextView.travelConditions.transportMode;

    return {
      tripId,
      dayCount,
      nights: Math.max(0, dayCount - 1),
      totalDriveMinutes,
      totalDistanceKm,
      activityCount,
      routeSpanKm: candidatesView.summary.routeSpanKm ?? null,
      unplacedCandidateCount,
      pacingLabel: pacing ?? null,
      transportLabel: transport ?? null,
      departureLabel: contextView.travelConditions.origin ?? null,
    };
  }

  private async loadPlacedPlaceIds(tripId: string): Promise<Set<number>> {
    const rows = await this.prisma.itineraryItem.findMany({
      where: {
        TripDay: { tripId },
        placeId: { not: null },
      },
      select: { placeId: true },
    });
    return new Set(rows.map((row) => row.placeId!).filter(Boolean));
  }

  private readTravelSummary(days: Array<{ travelInfo?: unknown }>): {
    driveMinutes: number | null;
    distanceKm: number | null;
  } {
    let driveMinutes = 0;
    let distanceKm = 0;
    let hasDrive = false;
    let hasDistance = false;

    for (const day of days) {
      const travelInfo = day.travelInfo as
        | {
            summary?: { totalDurationMinutes?: number; totalDistanceKm?: number };
            segments?: Array<{ durationMinutes?: number; distanceKm?: number }>;
          }
        | undefined;

      if (typeof travelInfo?.summary?.totalDurationMinutes === 'number') {
        driveMinutes += travelInfo.summary.totalDurationMinutes;
        hasDrive = true;
      } else if (Array.isArray(travelInfo?.segments)) {
        for (const segment of travelInfo.segments) {
          if (typeof segment.durationMinutes === 'number') {
            driveMinutes += segment.durationMinutes;
            hasDrive = true;
          }
          if (typeof segment.distanceKm === 'number') {
            distanceKm += segment.distanceKm;
            hasDistance = true;
          }
        }
      }

      if (typeof travelInfo?.summary?.totalDistanceKm === 'number') {
        distanceKm += travelInfo.summary.totalDistanceKm;
        hasDistance = true;
      }
    }

    return {
      driveMinutes: hasDrive ? Math.round(driveMinutes) : null,
      distanceKm: hasDistance ? Math.round(distanceKm) : null,
    };
  }
}
