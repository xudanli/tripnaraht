import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { ItineraryItemsService } from '../../../itinerary-items/itinerary-items.service';
import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import { ScheduleTimelineService } from '../../services/schedule-timeline.service';
import type { ArrangeItineraryMutationResult } from '../types/arrange-itinerary.types';
import type {
  ArrangeItineraryGapDto,
  ArrangeItineraryItemDto,
  PlaceAttractionExploreCandidateDto,
} from '../dto/arrange-itinerary.dto';
import {
  buildDayDateTime,
  resolveTripDayByIndex,
  scheduleTimelineUserId,
  toZeroBasedDayIndex,
} from '../../utils/arrange-itinerary-day.util';
import { extractPlaceMeta } from '../../attraction-explore/utils/attraction-explore-place.util';
import { AttractionExploreCandidateService } from '../../attraction-explore/services/attraction-explore-candidate.service';

@Injectable()
export class ArrangeItineraryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itineraryItems: ItineraryItemsService,
    private readonly scheduleTimeline: ScheduleTimelineService,
    private readonly candidates: AttractionExploreCandidateService,
  ) {}

  async placeCandidate(input: {
    tripId: string;
    userId: string;
    candidateId: string;
    body: PlaceAttractionExploreCandidateDto;
  }): Promise<ArrangeItineraryMutationResult> {
    const candidate = await this.prisma.tripAttractionExploreCandidate.findFirst({
      where: { id: input.candidateId, tripId: input.tripId },
      include: { Place: true },
    });
    if (!candidate) {
      throw new NotFoundException('候选不存在或不属于该行程');
    }

    const tripDays = await this.loadTripDays(input.tripId);
    const tripDay = resolveTripDayByIndex(tripDays, input.body.dayIndex);
    const dwell = extractPlaceMeta(candidate.Place).suggestedDwellMinutes ?? 90;

    const { startTime, endTime } = await this.resolveTimeWindow({
      tripDayId: tripDay.id,
      dayDate: tripDay.date,
      startTime: input.body.startTime,
      endTime: input.body.endTime,
      defaultDurationMinutes: dwell,
      insertMode: input.body.insertMode ?? 'append',
      anchorItemId: input.body.anchorItemId,
    });

    const order = await this.resolveInsertOrder(
      tripDay.id,
      input.body.insertMode ?? 'append',
      input.body.anchorItemId,
    );

    const created = await this.itineraryItems.create({
      tripDayId: tripDay.id,
      placeId: candidate.placeId,
      type: ItemType.ACTIVITY,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      note: `[景点探索] ${candidate.Place.nameCN}`,
      order,
      forceCreate: true,
    });

    let candidatesView;
    if (input.body.removeFromCandidates !== false) {
      await this.prisma.tripAttractionExploreCandidate.delete({ where: { id: candidate.id } });
      candidatesView = await this.candidates.listCandidates(input.tripId);
    }

    const scheduleTimeline = await this.loadDayTimeline(
      input.tripId,
      input.userId,
      input.body.dayIndex,
      tripDays.length,
    );

    return {
      tripId: input.tripId,
      itineraryItem: created as Record<string, unknown>,
      scheduleTimeline,
      ...(candidatesView ? { candidates: candidatesView } : {}),
    };
  }

  async createItem(input: {
    tripId: string;
    userId: string;
    body: ArrangeItineraryItemDto;
  }): Promise<ArrangeItineraryMutationResult> {
    const tripDays = await this.loadTripDays(input.tripId);
    const tripDay = resolveTripDayByIndex(tripDays, input.body.dayIndex);

    const startTime = buildDayDateTime(tripDay.date, input.body.startTime);
    const endTime = buildDayDateTime(tripDay.date, input.body.endTime);
    if (startTime >= endTime) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    const order = await this.resolveInsertOrder(
      tripDay.id,
      input.body.insertMode ?? 'append',
      input.body.anchorItemId,
    );

    const created = await this.itineraryItems.create({
      tripDayId: tripDay.id,
      placeId: input.body.placeId,
      type: input.body.type,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      note: input.body.note,
      placeName: input.body.placeName,
      order,
      forceCreate: input.body.forceCreate ?? true,
    });

    return {
      tripId: input.tripId,
      itineraryItem: created as Record<string, unknown>,
      scheduleTimeline: await this.loadDayTimeline(
        input.tripId,
        input.userId,
        input.body.dayIndex,
        tripDays.length,
      ),
    };
  }

  async createGap(input: {
    tripId: string;
    userId: string;
    body: ArrangeItineraryGapDto;
  }): Promise<ArrangeItineraryMutationResult> {
    const tripDays = await this.loadTripDays(input.tripId);
    const tripDay = resolveTripDayByIndex(tripDays, input.body.dayIndex);
    const startTime = buildDayDateTime(tripDay.date, input.body.startTime);
    const endTime = buildDayDateTime(tripDay.date, input.body.endTime);
    if (startTime >= endTime) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    const created = await this.itineraryItems.create({
      tripDayId: tripDay.id,
      type: ItemType.REST,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      note: input.body.label?.trim() || '空档 / 休息',
      forceCreate: true,
    });

    return {
      tripId: input.tripId,
      itineraryItem: created as Record<string, unknown>,
      scheduleTimeline: await this.loadDayTimeline(
        input.tripId,
        input.userId,
        input.body.dayIndex,
        tripDays.length,
      ),
    };
  }

  private async loadTripDays(tripId: string) {
    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });
    return tripDays;
  }

  private async resolveTimeWindow(input: {
    tripDayId: string;
    dayDate: Date;
    startTime?: string;
    endTime?: string;
    defaultDurationMinutes: number;
    insertMode: 'append' | 'before' | 'after';
    anchorItemId?: string;
  }): Promise<{ startTime: Date; endTime: Date }> {
    if (input.startTime && input.endTime) {
      return {
        startTime: buildDayDateTime(input.dayDate, input.startTime),
        endTime: buildDayDateTime(input.dayDate, input.endTime),
      };
    }

    if (input.startTime) {
      const start = buildDayDateTime(input.dayDate, input.startTime);
      return {
        startTime: start,
        endTime: DateTime.fromJSDate(start, { zone: 'utc' })
          .plus({ minutes: input.defaultDurationMinutes })
          .toJSDate(),
      };
    }

    const dayItems = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: input.tripDayId },
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
      select: { id: true, endTime: true, startTime: true, order: true },
    });

    if (input.insertMode !== 'append' && input.anchorItemId) {
      const anchor = dayItems.find((item) => item.id === input.anchorItemId);
      if (!anchor) throw new NotFoundException('锚点行程项不存在');
      const anchorStart = anchor.startTime
        ? DateTime.fromJSDate(anchor.startTime, { zone: 'utc' })
        : DateTime.fromJSDate(buildDayDateTime(input.dayDate, '09:00'), { zone: 'utc' });
      const anchorEnd = anchor.endTime
        ? DateTime.fromJSDate(anchor.endTime, { zone: 'utc' })
        : anchorStart.plus({ minutes: input.defaultDurationMinutes });
      const start =
        input.insertMode === 'before'
          ? anchorStart.minus({ minutes: input.defaultDurationMinutes }).toJSDate()
          : anchorEnd.toJSDate();
      return {
        startTime: start,
        endTime: DateTime.fromJSDate(start, { zone: 'utc' })
          .plus({ minutes: input.defaultDurationMinutes })
          .toJSDate(),
      };
    }

    const last = dayItems[dayItems.length - 1];
    const start = last?.endTime
      ? DateTime.fromJSDate(last.endTime, { zone: 'utc' }).plus({ minutes: 15 }).toJSDate()
      : buildDayDateTime(input.dayDate, '09:00');

    return {
      startTime: start,
      endTime: DateTime.fromJSDate(start, { zone: 'utc' })
        .plus({ minutes: input.defaultDurationMinutes })
        .toJSDate(),
    };
  }

  private async resolveInsertOrder(
    tripDayId: string,
    insertMode: 'append' | 'before' | 'after',
    anchorItemId?: string,
  ): Promise<number | undefined> {
    if (insertMode === 'append' || !anchorItemId) return undefined;

    const anchor = await this.prisma.itineraryItem.findFirst({
      where: { id: anchorItemId, tripDayId },
      select: { order: true },
    });
    if (!anchor) throw new NotFoundException('锚点行程项不存在');

    const targetOrder =
      insertMode === 'before'
        ? anchor.order ?? 1
        : (anchor.order ?? 1) + 1;

    await this.prisma.itineraryItem.updateMany({
      where: { tripDayId, order: { gte: targetOrder } },
      data: { order: { increment: 1 } },
    });

    return targetOrder;
  }

  private async loadDayTimeline(
    tripId: string,
    userId: string,
    dayIndex: number,
    dayCount: number,
  ) {
    const zeroBased = toZeroBasedDayIndex(dayIndex, dayCount);
    const result = await this.scheduleTimeline.getScheduleTimeline(
      tripId,
      scheduleTimelineUserId(userId),
      {
      include: 'items,metrics,travelInfo',
      travelInfoMode: 'cached',
      from: zeroBased,
      limit: 1,
    });
    if (result.status !== 'ok') {
      throw new BadRequestException('无法加载日程时间轴');
    }
    return {
      tripId: result.data.tripId,
      days: result.data.days,
    };
  }
}
