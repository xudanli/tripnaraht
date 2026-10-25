import { NotFoundException } from '@nestjs/common';
import { AdminTripWorldStateService } from './admin-trip-world-state.service';
import { ADMIN_TRIP_WORLD_STATE_SCHEMA_ID } from '../dto/admin-trip-world-state.dto';

describe('AdminTripWorldStateService', () => {
  const prisma = {
    trip: { findUnique: jest.fn() },
    tripEnvironmentEvent: { findMany: jest.fn() },
  };

  const worldStateStore = {
    readStore: jest.fn(),
  };

  const riskAggregation = {
    listRisks: jest.fn(),
    buildSummaryRecommendation: jest.fn(),
  };

  let service: AdminTripWorldStateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminTripWorldStateService(
      prisma as never,
      worldStateStore as never,
      riskAggregation as never,
    );
  });

  it('throws NotFound when trip missing', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(service.getWorldState('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns empty-ish projection for bare trip (low completeness)', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-bare',
      destination: 'IS',
      startDate: new Date('2026-08-20T00:00:00.000Z'),
      endDate: new Date('2026-08-27T00:00:00.000Z'),
      budgetConfig: null,
      metadata: null,
      TripCollaborator: [],
      TripDay: [],
    });
    prisma.tripEnvironmentEvent.findMany.mockResolvedValue([]);
    worldStateStore.readStore.mockResolvedValue({ assertions: [], snapshots: [], events: [] });

    const view = await service.getWorldState('trip-bare');

    expect(view.schemaId).toBe(ADMIN_TRIP_WORLD_STATE_SCHEMA_ID);
    expect(view.tripId).toBe('trip-bare');
    expect(view.environment.alerts).toEqual([]);
    expect(view.environment.weather).toBeNull();
    expect(view.road.riskLevel).toBe('unknown');
    expect(view.vehicle.model).toBeNull();
    expect(view.plan.destination).toBe('IS');
    expect(view.team.size).toBeNull();
    expect(view.riskOverview.overallRiskLevel).toBe('unknown');
    expect(view.completeness.environment).toBe(0);
    expect(view.completeness.vehicle).toBe(0);
  });

  it('maps iceland driving settings, plan places, env alerts, and road assertions', async () => {
    const dayDate = new Date('2026-08-20T00:00:00.000Z');
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-rich',
      destination: 'IS',
      startDate: dayDate,
      endDate: new Date('2026-08-27T00:00:00.000Z'),
      budgetConfig: { total: 15000, currency: 'CNY' },
      metadata: {
        icelandSelfDrive: {
          productLine: 'iceland_self_drive',
          wizard: {
            travelerCount: 4,
            vehicleAcquisition: 'rent',
          },
          drivingSettings: {
            vehicle: {
              vehicleClass: 'suv_4wd',
              vehicleClassLabel: '4WD SUV',
              is4wd: true,
              isHighBody: true,
              rentalRestrictions: ['no_wading'],
            },
            drivers: {
              driverCount: 2,
              experienceLevel: 'intermediate',
              dailyDrivingLimitHours: 6,
              candidates: [],
            },
            members: { hasChildren: true, hasElderly: false, motionSickness: false },
            routePreference: {
              pacePreference: 'balanced',
              allowNightDriving: false,
              dailyDrivingLimitHours: 6,
            },
          },
        },
      },
      TripCollaborator: [{ userId: 'owner-1', role: 'OWNER' }],
      TripDay: [
        {
          id: 'day-1',
          date: dayDate,
          ItineraryItem: [
            {
              id: 'i1',
              type: 'ACTIVITY',
              note: null,
              startTime: new Date('2026-08-20T09:00:00.000Z'),
              endTime: new Date('2026-08-20T10:00:00.000Z'),
              order: 1,
              Place: { id: 1, nameCN: '维克', nameEN: 'Vik', category: 'ATTRACTION' },
            },
            {
              id: 'i2',
              type: 'ACTIVITY',
              note: null,
              startTime: new Date('2026-08-20T12:00:00.000Z'),
              endTime: new Date('2026-08-20T13:00:00.000Z'),
              order: 2,
              Place: { id: 2, nameCN: '休息点', nameEN: 'Rest', category: 'ATTRACTION' },
            },
            {
              id: 'i3',
              type: 'ACTIVITY',
              note: null,
              startTime: new Date('2026-08-20T16:00:00.000Z'),
              endTime: new Date('2026-08-20T17:00:00.000Z'),
              order: 3,
              Place: {
                id: 3,
                nameCN: '冰河湖酒店',
                nameEN: 'Glacier Lagoon Hotel',
                category: 'HOTEL',
              },
            },
          ],
        },
      ],
    });

    prisma.tripEnvironmentEvent.findMany.mockResolvedValue([
      {
        type: 'WEATHER',
        severity: 'HIGH',
        description: 'Blizzard Yellow Warning',
        detectedAt: new Date('2026-08-13T07:00:00.000Z'),
        sourceObservedAt: null,
        cascadeImpact: [{ dimension: 'time', severity: 'MEDIUM' }],
      },
    ]);

    worldStateStore.readStore.mockResolvedValue({
      assertions: [
        {
          assertionId: 'a1',
          predicate: 'road.status',
          status: 'ACTIVE',
          observedAt: '2026-08-13T06:00:00.000Z',
          payload: {
            roadName: 'Highway 1',
            surfaceCondition: 'Snow-covered',
            riskLevel: 'high',
            speedLimit: '70 km/h',
          },
        },
      ],
      snapshots: [],
      events: [],
    });

    riskAggregation.listRisks.mockResolvedValue([
      {
        id: 'r1',
        type: 'ENVIRONMENT',
        level: 'HIGH',
        summary: '强风影响路段',
        code: 'WEATHER_STRONG_WIND',
      },
    ]);
    riskAggregation.buildSummaryRecommendation.mockResolvedValue({
      headline: '建议谨慎，考虑调整行程',
    });

    const view = await service.getWorldState('trip-rich');

    expect(view.environment.location).toBe('维克');
    expect(view.environment.alerts[0]).toContain('Blizzard Yellow Warning');
    expect(view.road.currentSegment).toBe('Highway 1');
    expect(view.road.surfaceCondition).toBe('Snow-covered');
    expect(view.road.riskLevel).toBe('high');
    expect(view.road.recommendedSpeedLimit).toBe('70 km/h');
    expect(view.vehicle.model).toBe('4WD SUV');
    expect(view.vehicle.driveMode).toBe('4WD');
    expect(view.vehicle.wadingAbility).toMatch(/Low/i);
    expect(view.plan.currentDay).toBe('Day 1');
    expect(view.plan.origin).toBe('维克');
    expect(view.plan.lodging).toBe('冰河湖酒店');
    expect(view.plan.midpointStops).toBe(1);
    expect(view.team.size).toBe(4);
    expect(view.team.composition).toContain('含儿童');
    expect(view.constraints.maxDailyDrivingHours).toBe(6);
    expect(view.constraints.budgetLevel).toBe('Medium');
    expect(view.riskOverview.overallRiskLevel).toBe('high');
    expect(view.riskOverview.recommendationText).toContain('谨慎');
    expect(view.completeness.vehicle).toBeGreaterThan(0);
    expect(view.completeness.plan).toBeGreaterThan(0.5);
    expect(view.provenance.some((p) => p.domain === 'vehicle')).toBe(true);
  });
});
