import { BadRequestException } from '@nestjs/common';
import {
  parseScheduleTimelineInclude,
  ScheduleTimelineService,
} from './schedule-timeline.service';

describe('parseScheduleTimelineInclude', () => {
  it('defaults to all sections when empty', () => {
    const set = parseScheduleTimelineInclude(undefined);
    expect(set.has('items')).toBe(true);
    expect(set.has('schedule')).toBe(true);
    expect(set.has('metrics')).toBe(true);
    expect(set.has('travelInfo')).toBe(true);
  });

  it('parses subset and travelInfo aliases', () => {
    const set = parseScheduleTimelineInclude('items,schedule,travel_info');
    expect(set.has('items')).toBe(true);
    expect(set.has('schedule')).toBe(true);
    expect(set.has('metrics')).toBe(false);
    expect(set.has('travelInfo')).toBe(true);
  });
});

describe('ScheduleTimelineService', () => {
  const prisma = {
    trip: { findUnique: jest.fn() },
    itineraryItem: { count: jest.fn() },
  };
  const tripsService = { findOne: jest.fn() };
  const itineraryItems = {
    loadItemsGroupedByTripDayIds: jest.fn(),
    buildTimelineDayItems: jest.fn(),
    buildDayTravelInfoFromLoadedItems: jest.fn(),
  };
  const scheduleConverter = { buildScheduleFromItems: jest.fn() };
  const tripMetrics = { getTripMetrics: jest.fn() };

  let service: ScheduleTimelineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScheduleTimelineService(
      prisma as any,
      tripsService as any,
      itineraryItems as any,
      scheduleConverter as any,
      tripMetrics as any,
    );
    tripsService.findOne.mockResolvedValue({ id: 'trip-1' });
    prisma.itineraryItem.count.mockResolvedValue(3);
    itineraryItems.loadItemsGroupedByTripDayIds.mockResolvedValue(
      new Map([
        ['day-1', [{ id: 'item-1' }]],
        ['day-2', [{ id: 'item-2' }]],
      ]),
    );
    itineraryItems.buildTimelineDayItems.mockResolvedValue([{ id: 'item-1' }]);
    scheduleConverter.buildScheduleFromItems.mockReturnValue({ stops: [] });
    itineraryItems.buildDayTravelInfoFromLoadedItems.mockReturnValue({
      dayId: 'day-1',
      source: 'cached',
      segments: [],
    });
  });

  it('rejects travelInfoMode=recalculate on GET', async () => {
    await expect(
      service.getScheduleTimeline('trip-1', 'user-1', { travelInfoMode: 'recalculate' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns not_modified when If-None-Match matches etag', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      destination: 'IS',
      startDate: new Date('2026-06-20'),
      endDate: new Date('2026-06-22'),
      pacingConfig: {},
      metadata: null,
      status: 'DRAFT',
      updatedAt: new Date('2026-06-20T12:00:00.000Z'),
      TripDay: [{ id: 'day-1', date: new Date('2026-06-20') }],
    });
    prisma.itineraryItem.count.mockResolvedValue(1);

    const first = await service.getScheduleTimeline('trip-1', 'user-1', {
      include: 'items',
      travelInfoMode: 'none',
    });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;

    const second = await service.getScheduleTimeline('trip-1', 'user-1', {
      include: 'items',
      travelInfoMode: 'none',
      ifNoneMatch: first.data.etag,
    });
    expect(second).toEqual({ status: 'not_modified', etag: first.data.etag });
    expect(itineraryItems.loadItemsGroupedByTripDayIds).toHaveBeenCalledTimes(1);
  });

  it('aggregates days with batch item load', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      destination: 'IS',
      startDate: new Date('2026-06-20'),
      endDate: new Date('2026-06-22'),
      pacingConfig: {},
      metadata: { pipelineStatus: 'PLANNING' },
      status: 'DRAFT',
      updatedAt: new Date('2026-06-20T12:00:00Z'),
      TripDay: [
        { id: 'day-1', date: new Date('2026-06-20') },
        { id: 'day-2', date: new Date('2026-06-21') },
      ],
    });
    tripMetrics.getTripMetrics.mockResolvedValue({
      days: [{ date: '2026-06-20', totalMinutes: 480 }],
      summary: { totalDays: 2 },
    });

    const result = await service.getScheduleTimeline('trip-1', 'user-1', {
      include: 'items,schedule,metrics,travelInfo',
      travelInfoMode: 'cached',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(itineraryItems.loadItemsGroupedByTripDayIds).toHaveBeenCalledTimes(1);
    expect(itineraryItems.buildTimelineDayItems).toHaveBeenCalledTimes(2);
    expect(scheduleConverter.buildScheduleFromItems).toHaveBeenCalledTimes(2);
    expect(scheduleConverter.buildScheduleFromItems).toHaveBeenCalledWith(
      expect.any(Array),
      '2026-06-20',
      'Atlantic/Reykjavik',
    );
    expect(result.data.days).toHaveLength(2);
    expect(result.data.metricsSummary).toEqual({ totalDays: 2 });
    expect(result.data.etag).toMatch(/^[a-f0-9]{16}$/);
  });

  it('applies from/limit window', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      destination: 'IS',
      startDate: null,
      endDate: null,
      pacingConfig: null,
      metadata: null,
      status: null,
      updatedAt: new Date('2026-06-20T12:00:00.000Z'),
      TripDay: [
        { id: 'd0', date: new Date('2026-06-20') },
        { id: 'd1', date: new Date('2026-06-21') },
        { id: 'd2', date: new Date('2026-06-22') },
      ],
    });

    const result = await service.getScheduleTimeline('trip-1', 'user-1', {
      include: 'items',
      from: 1,
      limit: 1,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(itineraryItems.buildTimelineDayItems).toHaveBeenCalledTimes(1);
    expect(result.data.days).toHaveLength(1);
    expect(result.data.days[0].dayId).toBe('d1');
  });
});
