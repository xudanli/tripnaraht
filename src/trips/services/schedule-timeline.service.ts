import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ScheduleTimelineInclude,
  ScheduleTimelineResponseDto,
  ScheduleTimelineTravelInfoMode,
} from '../dto/schedule-timeline.dto';
import { ScheduleConverterService } from './schedule-converter.service';
import { TripMetricsService } from './trip-metrics.service';
import { TripsService } from '../trips.service';
import {
  buildScheduleTimelineEtag,
  buildScheduleTimelineQueryFingerprint,
  etagMatches,
} from '../utils/schedule-timeline-etag.util';

const DEFAULT_INCLUDE: ScheduleTimelineInclude[] = [
  'items',
  'schedule',
  'metrics',
  'travelInfo',
];

export function parseScheduleTimelineInclude(raw?: string): Set<ScheduleTimelineInclude> {
  if (!raw?.trim()) return new Set(DEFAULT_INCLUDE);
  const out = new Set<ScheduleTimelineInclude>();
  for (const p of raw.split(',')) {
    const token = p.trim().toLowerCase();
    if (token === 'items') out.add('items');
    else if (token === 'schedule') out.add('schedule');
    else if (token === 'metrics') out.add('metrics');
    else if (token === 'travelinfo' || token === 'travel_info') out.add('travelInfo');
  }
  return out.size > 0 ? out : new Set(DEFAULT_INCLUDE);
}

export type ScheduleTimelineGetResult =
  | { status: 'ok'; data: ScheduleTimelineResponseDto }
  | { status: 'not_modified'; etag: string };

@Injectable()
export class ScheduleTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly itineraryItems: ItineraryItemsService,
    private readonly scheduleConverter: ScheduleConverterService,
    private readonly tripMetrics: TripMetricsService,
  ) {}

  async getScheduleTimeline(
    tripId: string,
    userId: string | undefined,
    query: {
      include?: string;
      dates?: string;
      from?: number;
      limit?: number;
      travelInfoMode?: ScheduleTimelineTravelInfoMode;
      ifNoneMatch?: string;
    },
  ): Promise<ScheduleTimelineGetResult> {
    const travelMode = query.travelInfoMode ?? 'cached';
    if (travelMode === 'recalculate') {
      throw new BadRequestException({
        code: 'TRAVEL_RECALC_NOT_ON_GET',
        message:
          'GET schedule-timeline 不支持 travelInfoMode=recalculate；请使用 POST /itinerary-items/trip/:tripId/calculate-all-travel',
      });
    }

    const include = parseScheduleTimelineInclude(query.include);
    const wantTravel = include.has('travelInfo') && travelMode !== 'none';
    const queryFingerprint = buildScheduleTimelineQueryFingerprint(query);

    await this.tripsService.findOne(tripId, userId);

    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        destination: true,
        startDate: true,
        endDate: true,
        pacingConfig: true,
        metadata: true,
        status: true,
        updatedAt: true,
        TripDay: {
          orderBy: { date: 'asc' },
          select: { id: true, date: true },
        },
      },
    });
    if (!tripRow) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const allOrderedDays = tripRow.TripDay.map((d) => ({
      id: d.id,
      date: d.date,
    }));

    let days = allOrderedDays.map((d, idx) => ({
      dayId: d.id,
      date: DateTime.fromJSDate(d.date).toISODate() ?? '',
      dayIndex: idx,
      dateObj: d.date,
      tripId,
    }));

    const dateFilter = query.dates
      ?.split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    if (dateFilter?.length) {
      const set = new Set(dateFilter);
      days = days.filter((d) => set.has(d.date));
    }

    const from = query.from != null && Number.isFinite(query.from) ? Math.max(0, query.from) : 0;
    const limit =
      query.limit != null && Number.isFinite(query.limit) && query.limit > 0
        ? Math.floor(query.limit)
        : undefined;
    if (limit != null) {
      days = days.slice(from, from + limit);
    } else if (from > 0) {
      days = days.slice(from);
    }

    const windowDayIds = days.map((d) => d.dayId);
    const itemCount = windowDayIds.length
      ? await this.prisma.itineraryItem.count({
          where: { tripDayId: { in: windowDayIds } },
        })
      : 0;

    const etag = buildScheduleTimelineEtag({
      tripUpdatedAt: tripRow.updatedAt,
      queryFingerprint,
      dayCount: days.length,
      itemCount,
    });

    if (query.ifNoneMatch && etagMatches(query.ifNoneMatch, etag)) {
      return { status: 'not_modified', etag };
    }

    const needsItemRows =
      include.has('items') || include.has('schedule') || wantTravel;
    const loadDayIds = needsItemRows
      ? this.collectItemLoadDayIds(windowDayIds, allOrderedDays)
      : [];
    const itemsByDayId = needsItemRows
      ? await this.itineraryItems.loadItemsGroupedByTripDayIds(tripId, loadDayIds)
      : new Map<string, any[]>();

    const dateIsoList = days.map((d) => d.date);

    let metricsBundle: Awaited<ReturnType<TripMetricsService['getTripMetrics']>> | undefined;
    if (include.has('metrics') && dateIsoList.length > 0) {
      metricsBundle = await this.tripMetrics.getTripMetrics(tripId, dateIsoList, {
        includeConflicts: true,
      });
    }
    const metricsByDate = new Map(
      (metricsBundle?.days ?? []).map((d) => [d.date, d]),
    );

    const meta = tripRow.metadata as Record<string, unknown> | null;
    const dayThemes =
      meta?.dayThemes && typeof meta.dayThemes === 'object' && !Array.isArray(meta.dayThemes)
        ? (meta.dayThemes as Record<string, unknown>)
        : {};
    const dayLabels =
      meta?.dayLabels && typeof meta.dayLabels === 'object' && !Array.isArray(meta.dayLabels)
        ? (meta.dayLabels as Record<string, unknown>)
        : {};

    const readThemeMap = (map: Record<string, unknown>, dayNumber1Based: number): string | null => {
      const raw = map[String(dayNumber1Based)] ?? map[dayNumber1Based as unknown as string];
      return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    };

    const dayPayloads = await Promise.all(
      days.map(async (day) => {
        const dayNumber1Based = day.dayIndex + 1;
        const theme = readThemeMap(dayThemes, dayNumber1Based);
        const label = readThemeMap(dayLabels, dayNumber1Based);
        const payload: ScheduleTimelineResponseDto['days'][number] = {
          dayId: day.dayId,
          date: day.date,
          dayIndex: day.dayIndex,
          theme,
          title: theme,
          label,
          locationLabel: label,
        };

        if (include.has('items')) {
          payload.itineraryItems = await this.itineraryItems.buildTimelineDayItems(
            { id: day.dayId, date: day.dateObj, tripId },
            allOrderedDays,
            itemsByDayId,
          );
        }

        if (include.has('schedule')) {
          const rawItems = itemsByDayId.get(day.dayId) ?? [];
          const schedule = this.scheduleConverter.buildScheduleFromItems(rawItems, day.date);
          payload.schedule = {
            date: day.date,
            schedule,
            persisted: schedule !== null,
          };
        }

        if (include.has('metrics')) {
          payload.metrics = metricsByDate.get(day.date) ?? null;
        }

        if (wantTravel) {
          payload.travelInfo = this.itineraryItems.buildDayTravelInfoFromLoadedItems(
            day.dayId,
            day.dateObj,
            itemsByDayId.get(day.dayId) ?? [],
          );
        }

        return payload;
      }),
    );

    const pipelineStatus =
      typeof meta?.pipelineStatus === 'string'
        ? meta.pipelineStatus
        : typeof meta?.pipeline_status === 'string'
          ? meta.pipeline_status
          : null;

    return {
      status: 'ok',
      data: {
        tripId,
        trip: {
          id: tripRow.id,
          destination: tripRow.destination,
          startDate: tripRow.startDate?.toISOString() ?? null,
          endDate: tripRow.endDate?.toISOString() ?? null,
          pacingConfig: tripRow.pacingConfig,
          metadata: tripRow.metadata,
          status: tripRow.status,
          pipelineStatus,
        },
        days: dayPayloads,
        ...(metricsBundle?.summary ? { metricsSummary: metricsBundle.summary } : {}),
        etag,
      },
    };
  }

  /** 窗口内每天 + 各天前一日（退房项） */
  private collectItemLoadDayIds(
    windowDayIds: string[],
    allOrderedDays: Array<{ id: string }>,
  ): string[] {
    const ids = new Set(windowDayIds);
    for (const dayId of windowDayIds) {
      const idx = allOrderedDays.findIndex((d) => d.id === dayId);
      if (idx > 0) {
        ids.add(allOrderedDays[idx - 1].id);
      }
    }
    return [...ids];
  }
}
