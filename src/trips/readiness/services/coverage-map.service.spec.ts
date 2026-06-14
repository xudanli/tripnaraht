import { NotFoundException } from '@nestjs/common';
import { CoverageMapService } from './coverage-map.service';
import type { ReadinessService } from './readiness.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CoverageMapData, SegmentCoverage } from '../types/coverage-map.types';
import type { ReadinessCheckResult } from '../types/readiness-findings.types';

function makeSummary(): CoverageMapData['summary'] {
  return {
    totalPois: 2,
    coveredPois: 2,
    partialPois: 0,
    uncoveredPois: 0,
    totalSegments: 1,
    coveredSegments: 0,
    warningSegments: 1,
    blockedSegments: 0,
    totalGaps: 0,
    coverageRate: 1,
  };
}

function makeSegmentWithLiveHazard(): SegmentCoverage {
  return {
    id: 'seg-1',
    fromPoiId: 'poi-1',
    toPoiId: 'poi-2',
    day: 1,
    distance: 120,
    duration: 150,
    routeType: 'driving',
    coverageStatus: 'warning',
    polyline: '',
    hazards: [
      {
        type: 'road_closure',
        severity: 'high',
        message: '出发前查看路况（road.is）',
      },
    ],
  };
}

function makeCoverageMapData(overrides: Partial<CoverageMapData> = {}): CoverageMapData {
  return {
    tripId: 'trip-1',
    bounds: {
      northeast: { lat: 65, lng: -20 },
      southwest: { lat: 63, lng: -22 },
    },
    center: { lat: 64, lng: -21 },
    zoom: 8,
    pois: [
      {
        id: 'poi-1',
        day: 1,
        order: 1,
        name: 'A',
        type: 'attraction',
        coordinates: { lat: 64, lng: -21 },
        coverageStatus: 'covered',
        evidenceCount: 1,
      },
      {
        id: 'poi-2',
        day: 1,
        order: 2,
        name: 'B',
        type: 'attraction',
        coordinates: { lat: 64.1, lng: -21.1 },
        coverageStatus: 'covered',
        evidenceCount: 1,
      },
    ],
    segments: [makeSegmentWithLiveHazard()],
    gaps: [],
    summary: makeSummary(),
    calculatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTrip(startDate: Date) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  return {
    id: 'trip-1',
    destination: 'IS',
    startDate,
    endDate,
    TripDay: [],
  };
}

describe('CoverageMapService', () => {
  const prisma = {
    trip: { findUnique: jest.fn() },
    tripFindingMark: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  } as unknown as PrismaService;

  const readinessService = {
    checkFromDestination: jest.fn(),
  } as unknown as ReadinessService;

  let service: CoverageMapService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CoverageMapService(prisma, readinessService);
    (prisma.tripFindingMark.findMany as jest.Mock).mockResolvedValue([]);
    (readinessService.checkFromDestination as jest.Mock).mockResolvedValue({
      findings: [],
      summary: {},
    });
  });

  describe('getReadinessScore', () => {
    it('marks far-future trips as planning phase', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 120);

      (prisma.trip.findUnique as jest.Mock).mockResolvedValue(makeTrip(startDate));
      jest.spyOn(service, 'getCoverageMap').mockResolvedValue(makeCoverageMapData());

      const result = await service.getReadinessScore('trip-1');

      expect(result.readinessPhase).toBe('planning');
      expect(result.daysUntilStart).toBeGreaterThan(14);
      expect(result.phaseHint).toContain('出发前');
      expect(result.coverageDisclosure?.summary).toMatch(/未检查/);
      expect(result.coverageDisclosure?.uncoveredCapabilities).toContain('BOOKABILITY');
    });

    it('does not heavily penalize live road hazards during planning', async () => {
      const planningStart = new Date();
      planningStart.setDate(planningStart.getDate() + 120);
      const preDepartureStart = new Date();
      preDepartureStart.setDate(preDepartureStart.getDate() + 7);

      const coverage = makeCoverageMapData();

      jest.spyOn(service, 'getCoverageMap').mockResolvedValue(coverage);

      (prisma.trip.findUnique as jest.Mock).mockResolvedValue(makeTrip(planningStart));
      const planningScore = await service.getReadinessScore('trip-1');

      (prisma.trip.findUnique as jest.Mock).mockResolvedValue(makeTrip(preDepartureStart));
      const preDepartureScore = await service.getReadinessScore('trip-1');

      expect(planningScore.score.transportCertainty).toBeGreaterThan(
        preDepartureScore.score.transportCertainty,
      );
      expect(planningScore.readinessPhase).toBe('planning');
      expect(preDepartureScore.readinessPhase).toBe('pre_departure');
    });

    it('throws when trip is missing', async () => {
      (prisma.trip.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getReadinessScore('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('mergeHighSeverityCoverageGapBlockersIntoTripReadiness', () => {
    it('merges high severity coverage gaps into destination blockers', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 30);

      jest.spyOn(service, 'getCoverageMap').mockResolvedValue(
        makeCoverageMapData({
          gaps: [
            {
              id: 'gap-1',
              type: 'segment',
              relatedId: 'seg-1',
              coordinates: { lat: 64, lng: -21 },
              severity: 'high',
              message: '路段缺少道路封闭证据',
              affectedDays: [1],
            },
          ],
        }),
      );

      const baseResult: ReadinessCheckResult = {
        destinationId: 'IS',
        findings: [
          {
            destinationId: 'IS',
            destinationName: { en: 'Iceland', zh: '冰岛' },
            blockers: [],
            must: [],
            should: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalBlockers: 0,
          totalMust: 0,
          totalShould: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      };

      const merged = await service.mergeHighSeverityCoverageGapBlockersIntoTripReadiness(
        'trip-1',
        'IS',
        baseResult,
      );

      const blockers = merged.findings[0].blockers;
      expect(blockers.some((b) => b.id === 'coverage-gap:gap-1')).toBe(true);
      expect(merged.summary.totalBlockers).toBeGreaterThan(0);
    });
  });
});
