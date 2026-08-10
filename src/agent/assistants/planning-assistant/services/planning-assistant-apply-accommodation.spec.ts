import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PlanningAssistantV2Service } from './planning-assistant-v2.service';
import { PlanningAssistantService } from './planning-assistant.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ItineraryItemsService } from '../../../../itinerary-items/itinerary-items.service';
import { ItemType } from '../../../../itinerary-items/dto/create-itinerary-item.dto';
import { EffectivePlanWriteGuardService } from '../../../../decision-runtime/execution/effective-plan-write-guard.service';

describe('PlanningAssistantV2Service.applyAccommodationToItinerary', () => {
  let service: PlanningAssistantV2Service;
  let planningAssistantService: { getSessionState: jest.Mock };
  let itineraryItemsService: { create: jest.Mock; remove: jest.Mock };
  let prisma: {
    trip: { findUnique: jest.Mock };
    tripDay: { findFirst: jest.Mock; findMany: jest.Mock };
    itineraryItem: { findMany: jest.Mock };
    place: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    city: { findFirst: jest.Mock };
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    planningAssistantService = { getSessionState: jest.fn() };
    itineraryItemsService = {
      create: jest.fn().mockResolvedValue({ id: 'item-new-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      trip: { findUnique: jest.fn().mockResolvedValue({ destination: 'CN' }) },
      tripDay: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'day-2',
          date: new Date('2026-06-02T00:00:00.000Z'),
        }),
        findMany: jest.fn().mockResolvedValue([
          { date: new Date('2026-06-02T00:00:00.000Z') },
          { date: new Date('2026-06-03T00:00:00.000Z') },
        ]),
      },
      itineraryItem: { findMany: jest.fn().mockResolvedValue([]) },
      place: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 501 }),
        update: jest.fn().mockResolvedValue({ id: 501 }),
      },
      city: { findFirst: jest.fn().mockResolvedValue({ id: 7906 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningAssistantV2Service,
        { provide: PlanningAssistantService, useValue: planningAssistantService },
        { provide: PrismaService, useValue: prisma },
        { provide: ItineraryItemsService, useValue: itineraryItemsService },
        EffectivePlanWriteGuardService,
      ],
    }).compile();

    service = module.get(PlanningAssistantV2Service);
  });

  it('creates REST item on check-in trip day from session lastAccommodations', async () => {
    planningAssistantService.getSessionState.mockResolvedValue({
      sessionId: 'sess-1',
      lastAccommodationTripId: 'trip-1',
      lastAccommodations: [
        {
          id: 'listing-99',
          source: 'airbnb',
          name: 'Cozy stay near Skaftafell',
          checkIn: '2026-06-02',
          checkOut: '2026-06-03',
          url: 'https://airbnb.com/rooms/99',
          address: 'Vík',
        },
      ],
    });

    const result = await service.applyAccommodationToItinerary('trip-1', {
      sessionId: 'sess-1',
      accommodationIndex: 0,
    });

    expect(result.success).toBe(true);
    expect(result.itineraryItemId).toBe('item-new-1');
    expect(result.messageCN).toContain('Cozy stay');
    expect(itineraryItemsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tripDayId: 'day-2',
        type: ItemType.REST,
        placeId: 501,
        externalUrl: 'https://airbnb.com/rooms/99',
        costNote: undefined,
        startTime: '2026-06-02T20:00:00.000Z',
        endTime: '2026-06-03T11:00:00.000Z',
        note: expect.stringContaining('入住: 2026-06-02'),
        forceCreate: true,
      }),
    );
  });

  it('creates REST item from accommodation snapshot without session cache', async () => {
    planningAssistantService.getSessionState.mockResolvedValue(null);

    const result = await service.applyAccommodationToItinerary('trip-1', {
      sessionId: 'sess-missing',
      accommodationIndex: 0,
      accommodation: {
        id: 'listing-42',
        source: 'airbnb',
        name: 'Route-run card',
        checkIn: '2026-06-02',
        checkOut: '2026-06-03',
        url: 'https://airbnb.com/rooms/42',
      },
    });

    expect(result.success).toBe(true);
    expect(itineraryItemsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: 501,
        externalUrl: 'https://airbnb.com/rooms/42',
      }),
    );
  });

  it('uses accommodationCard route_and_run snapshot when session entry lacks name', async () => {
    planningAssistantService.getSessionState.mockResolvedValue({
      sessionId: 'sess-1',
      lastAccommodationTripId: 'trip-1',
      lastAccommodations: [{ id: 'hotel-1', source: 'hotel', name: '', checkIn: '2026-06-02', checkOut: '2026-06-03' }],
    });

    const result = await service.applyAccommodationToItinerary('trip-1', {
      sessionId: 'sess-1',
      accommodationIndex: 0,
      accommodationCard: {
        id: 'hotel-1',
        source: 'hotel',
        name: 'Hotel Klaustur Iceland',
        address: 'Kirkjubæjarklaustur',
        priceLabel: '¥1200/晚',
      },
    });

    expect(result.success).toBe(true);
    expect(itineraryItemsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        placeName: 'Hotel Klaustur Iceland',
        address: 'Kirkjubæjarklaustur',
      }),
    );
  });

  it('resolves checkIn from trip days when card only has nightIndex', async () => {
    planningAssistantService.getSessionState.mockResolvedValue({
      sessionId: 'sess-1',
      lastAccommodationTripId: 'trip-1',
      lastAccommodations: [
        {
          id: 'listing-77',
          source: 'airbnb',
          name: 'No dates card',
          nightIndex: 1,
          url: 'https://airbnb.com/rooms/77',
        },
      ],
    });

    const result = await service.applyAccommodationToItinerary('trip-1', {
      sessionId: 'sess-1',
      accommodationIndex: 0,
    });

    expect(result.success).toBe(true);
    expect(prisma.tripDay.findMany).toHaveBeenCalled();
    expect(itineraryItemsService.create).toHaveBeenCalled();
  });

  it('creates Place with coordinates when accommodationCard includes listing_lat/lng', async () => {
    planningAssistantService.getSessionState.mockResolvedValue({
      sessionId: 'sess-1',
      lastAccommodationTripId: 'trip-1',
      lastAccommodations: [],
    });

    await service.applyAccommodationToItinerary('trip-1', {
      sessionId: 'sess-1',
      accommodationIndex: 0,
      accommodationCard: {
        id: 'listing-geo',
        source: 'airbnb',
        name: 'Geo Cabin',
        checkIn: '2026-06-02',
        checkOut: '2026-06-03',
        listing_lat: 63.42,
        listing_lng: -19.01,
      },
    });

    expect(prisma.place.create).toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(itineraryItemsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 501 }),
    );
  });

  it('upserts Place for fliggy card without coordinates (OTA-first)', async () => {
    planningAssistantService.getSessionState.mockResolvedValue({
      sessionId: 'sess-1',
      lastAccommodationTripId: 'trip-1',
      lastAccommodations: [],
    });
    prisma.city.findFirst.mockResolvedValue({ id: 7906 });

    await service.applyAccommodationToItinerary('trip-1', {
      sessionId: 'sess-1',
      accommodationIndex: 0,
      accommodationCard: {
        id: '78309218',
        source: 'fliggy',
        name: '汉庭康定318国道酒店',
        address: '康定市榆林街道',
        checkIn: '2026-06-02',
        checkOut: '2026-06-03',
        otaRef: { provider: 'fliggy', externalId: '78309218' },
      },
    });

    expect(prisma.place.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nameCN: '汉庭康定318国道酒店',
          category: 'HOTEL',
          dataSource: 'fliggy',
          cityId: 7906,
          metadata: expect.objectContaining({
            fliggyShId: '78309218',
            externalId: '78309218',
            externalSource: 'fliggy',
          }),
        }),
      }),
    );
    expect(itineraryItemsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 501 }),
    );
  });

  it('reuses Place by fliggy externalId on second apply', async () => {
    planningAssistantService.getSessionState.mockResolvedValue({
      sessionId: 'sess-1',
      lastAccommodationTripId: 'trip-1',
      lastAccommodations: [],
    });
    prisma.$queryRaw.mockResolvedValue([{ id: 777 }]);

    await service.applyAccommodationToItinerary('trip-1', {
      sessionId: 'sess-1',
      accommodationIndex: 0,
      accommodationCard: {
        id: '78309218',
        source: 'fliggy',
        name: '汉庭康定318国道酒店',
        checkIn: '2026-06-02',
        checkOut: '2026-06-03',
        otaRef: { provider: 'fliggy', externalId: '78309218' },
      },
    });

    expect(prisma.place.create).not.toHaveBeenCalled();
    expect(prisma.place.update).toHaveBeenCalled();
    expect(itineraryItemsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 777 }),
    );
  });

  it('rejects when accommodation index is out of range', async () => {
    planningAssistantService.getSessionState.mockResolvedValue({
      sessionId: 'sess-1',
      lastAccommodationTripId: 'trip-1',
      lastAccommodations: [],
    });

    await expect(
      service.applyAccommodationToItinerary('trip-1', {
        sessionId: 'sess-1',
        accommodationIndex: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
