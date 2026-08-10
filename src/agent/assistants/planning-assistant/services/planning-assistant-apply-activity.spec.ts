import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PlanningAssistantV2Service } from './planning-assistant-v2.service';
import { PlanningAssistantService } from './planning-assistant.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ItineraryItemsService } from '../../../../itinerary-items/itinerary-items.service';
import { ItemType } from '../../../../itinerary-items/dto/create-itinerary-item.dto';
import { EffectivePlanWriteGuardService } from '../../../../decision-runtime/execution/effective-plan-write-guard.service';

describe('PlanningAssistantV2Service.applyActivityToItinerary', () => {
  let service: PlanningAssistantV2Service;
  let planningAssistantService: { getSessionState: jest.Mock };
  let itineraryItemsService: { create: jest.Mock };
  let prisma: {
    trip: { findUnique: jest.Mock };
    tripDay: { findFirst: jest.Mock; findMany: jest.Mock };
    place: { create: jest.Mock; update: jest.Mock };
    city: { findFirst: jest.Mock };
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    planningAssistantService = { getSessionState: jest.fn() };
    itineraryItemsService = {
      create: jest.fn().mockResolvedValue({ id: 'item-act-1' }),
    };
    prisma = {
      trip: { findUnique: jest.fn().mockResolvedValue({ destination: 'CN' }) },
      tripDay: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'day-2',
          date: new Date('2026-06-02T00:00:00.000Z'),
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'day-1', date: new Date('2026-06-01T00:00:00.000Z') },
          { id: 'day-2', date: new Date('2026-06-02T00:00:00.000Z') },
        ]),
      },
      place: {
        create: jest.fn().mockResolvedValue({ id: 601 }),
        update: jest.fn().mockResolvedValue({ id: 601 }),
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

  it('upserts Place for fliggy ticket without coordinates (OTA-first)', async () => {
    prisma.city.findFirst.mockResolvedValue({ id: 7906 });

    const result = await service.applyActivityToItinerary('trip-1', {
      activityIndex: 0,
      dayNumber: 2,
      activityCard: {
        id: 'poi-hailuogou',
        source: 'fliggy',
        name: '海螺沟冰川森林公园',
        address: '泸定县磨西镇',
        url: 'https://h5.m.taobao.com/fliggy/demo',
        otaRef: { provider: 'fliggy', externalId: 'poi-hailuogou' },
        category: 'ATTRACTION_TICKET',
        priceLabel: '¥120起',
      },
    });

    expect(result.success).toBe(true);
    expect(result.placeId).toBe(601);
    expect(prisma.place.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nameCN: '海螺沟冰川森林公园',
          category: 'ATTRACTION',
          dataSource: 'fliggy',
          cityId: 7906,
          metadata: expect.objectContaining({
            fliggyPoiId: 'poi-hailuogou',
            externalId: 'poi-hailuogou',
            externalSource: 'fliggy',
          }),
        }),
      }),
    );
    expect(itineraryItemsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tripDayId: 'day-2',
        type: ItemType.ACTIVITY,
        placeId: 601,
        externalUrl: 'https://h5.m.taobao.com/fliggy/demo',
        forceCreate: true,
      }),
    );
  });

  it('reuses Place by fliggy externalId on second apply', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 888 }]);

    const result = await service.applyActivityToItinerary('trip-1', {
      activityIndex: 0,
      activityCard: {
        id: 'poi-hailuogou',
        source: 'fliggy',
        name: '海螺沟冰川森林公园',
        otaRef: { provider: 'fliggy', externalId: 'poi-hailuogou' },
      },
    });

    expect(result.success).toBe(true);
    expect(result.placeId).toBe(888);
    expect(prisma.place.create).not.toHaveBeenCalled();
    expect(prisma.place.update).toHaveBeenCalled();
    expect(itineraryItemsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 888, type: ItemType.ACTIVITY }),
    );
  });

  it('rejects when activity card missing', async () => {
    await expect(
      service.applyActivityToItinerary('trip-1', {
        activityIndex: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
