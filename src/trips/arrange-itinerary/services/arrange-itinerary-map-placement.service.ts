import { Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { loadPlaceCoordinatesBatch } from '../../attraction-explore/utils/attraction-explore-place-coordinates.util';
import { extractPlaceMeta } from '../../attraction-explore/utils/attraction-explore-place.util';
import { AttractionExploreRouteDetourService } from '../../attraction-explore/services/attraction-explore-route-detour.service';
import {
  buildDayDateTime,
  formatDayClockTime,
  resolveTripDayByIndex,
} from '../../utils/arrange-itinerary-day.util';
import { resolveTripTimezone } from '../../../common/utils/destination-timezone.util';
import { PlanProposalBuilderService } from './plan-proposal-builder.service';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import type { PlanProposalMutationResponse } from '../types/plan-proposal.types';

export interface MapPlacementSuggestion {
  dayIndex: number;
  startTime: string;
  endTime: string;
  detourMinutes: number;
  detourMethod?: string;
  segmentIndex: number;
  anchorItemId?: string;
  label: string;
}

export interface MapPlaceProposalResult extends PlanProposalMutationResponse {
  suggestions: MapPlacementSuggestion[];
}

@Injectable()
export class ArrangeItineraryMapPlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: PlanProposalBuilderService,
    private readonly store: PlanProposalStoreService,
    private readonly routeDetour: AttractionExploreRouteDetourService,
  ) {}

  async buildPlaceProposal(input: {
    tripId: string;
    userId: string;
    placeId: number;
    dayIndex?: number;
    candidateId?: string;
  }): Promise<MapPlaceProposalResult> {
    const place = await this.prisma.place.findUnique({ where: { id: input.placeId } });
    if (!place) throw new NotFoundException(`地点 ${input.placeId} 不存在`);

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: input.tripId },
      select: { destination: true, metadata: true },
    });
    const timezone = resolveTripTimezone({
      destination: trip.destination,
      metadata: trip.metadata,
    });

    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId: input.tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });

    const coordsMap = await loadPlaceCoordinatesBatch(this.prisma, [input.placeId]);
    const placeCoords = coordsMap.get(input.placeId);
    if (!placeCoords) throw new NotFoundException('景点缺少坐标，无法计算插入位置');

    const dayIndexes =
      input.dayIndex != null
        ? [input.dayIndex]
        : tripDays.map((_, idx) => idx + 1);

    const suggestions: MapPlacementSuggestion[] = [];

    for (const dayIndex of dayIndexes) {
      const tripDay = resolveTripDayByIndex(tripDays, dayIndex);
      const items = await this.prisma.itineraryItem.findMany({
        where: { tripDayId: tripDay.id, placeId: { not: null } },
        orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
        include: { Place: true },
      });

      const itemCoords = await loadPlaceCoordinatesBatch(
        this.prisma,
        items.map((i) => i.placeId!).filter(Boolean),
      );
      const routePoints = items
        .map((item) => (item.placeId ? itemCoords.get(item.placeId) : null))
        .filter((c): c is { lat: number; lng: number } => c != null);

      const insertion = await this.routeDetour.findBestRouteInsertionAsync({
        routePoints,
        candidate: placeCoords,
        countryCode: trip.destination.toUpperCase(),
        travelDate: tripDay.date,
      });

      if (!insertion && routePoints.length === 0) {
        suggestions.push({
          dayIndex,
          startTime: '10:00',
          endTime: '11:30',
          detourMinutes: 0,
          segmentIndex: 0,
          label: place.nameCN,
        });
        continue;
      }

      if (!insertion) continue;

      const anchorItem = items[insertion.segmentIndex] ?? items[items.length - 1];
      const dwell = extractPlaceMeta(place).suggestedDwellMinutes ?? 90;
      const start = this.suggestStartTime(
        anchorItem?.endTime ?? null,
        tripDay.date,
        timezone,
      );
      const end = DateTime.fromJSDate(start, { zone: 'utc' }).plus({ minutes: dwell }).toJSDate();

      suggestions.push({
        dayIndex,
        startTime: formatDayClockTime(start, timezone),
        endTime: formatDayClockTime(end, timezone),
        detourMinutes: insertion.detourMinutes,
        detourMethod: insertion.method,
        segmentIndex: insertion.segmentIndex,
        anchorItemId: anchorItem?.id,
        label: place.nameCN,
      });
    }

    suggestions.sort((a, b) => a.detourMinutes - b.detourMinutes);
    const best = suggestions[0];
    if (!best) {
      throw new NotFoundException('无法为该景点找到合适的路线插入位置');
    }

    const changes = [
      {
        operation: 'ADD' as const,
        candidateId: input.candidateId,
        placeId: input.placeId,
        dayIndex: best.dayIndex,
        startTime: best.startTime,
        endTime: best.endTime,
        label: place.nameCN,
        itemType: ItemType.ACTIVITY,
        note: `[地图插入] ${place.nameCN}`,
        insertMode: 'after' as const,
        anchorItemId: best.anchorItemId,
        removeFromCandidates: Boolean(input.candidateId),
      },
      ...(input.candidateId
        ? [
            {
              operation: 'REMOVE_CANDIDATE' as const,
              candidateId: input.candidateId,
              dayIndex: best.dayIndex,
              label: place.nameCN,
            },
          ]
        : []),
    ];

    const proposal = await this.builder.build({
      tripId: input.tripId,
      userId: input.userId,
      intent: input.candidateId ? 'PLACE_CANDIDATE' : 'ADD_ITEM',
      source: {
        type: 'ai_action',
        payload: { placeId: input.placeId, dayIndex: best.dayIndex, candidateId: input.candidateId },
      },
      changes,
      tradeoffs: [
        `建议插入第 ${best.dayIndex} 天 ${best.startTime}`,
        `预计增加驾驶约 ${best.detourMinutes} 分钟`,
      ],
      benefits: { itemsAdded: 1 },
    });

    this.store.save(proposal);

    return {
      mode: 'proposal',
      tripId: input.tripId,
      proposal,
      suggestions: suggestions.slice(0, 3),
      orchestrationState: {
        tripId: input.tripId,
        phase: 'AWAITING_CONFIRMATION',
        activeProposalId: proposal.proposalId,
        contextVersion: proposal.contextVersion,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  private suggestStartTime(
    anchorEnd: Date | null,
    dayDate: Date,
    timezone: string,
  ): Date {
    if (anchorEnd) {
      return DateTime.fromJSDate(anchorEnd, { zone: 'utc' }).plus({ minutes: 15 }).toJSDate();
    }
    return buildDayDateTime(dayDate, '10:00', timezone);
  }
}
