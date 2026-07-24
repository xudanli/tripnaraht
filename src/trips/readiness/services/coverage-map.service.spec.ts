import { NotFoundException } from '@nestjs/common';
import { CoverageMapService } from './coverage-map.service';
import type { ReadinessService } from './readiness.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CoverageMapData, SegmentCoverage } from '../types/coverage-map.types';
import type { ReadinessCheckResult } from '../types/readiness-findings.types';
import { GLOBAL_SEGMENT_DISTANCE_THRESHOLDS } from '../../trip-constraint-solver/utils/segment-distance-threshold.util';

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
    updatedAt: startDate,
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

    it('returns departure preparation score for planning phase trips', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 120);

      (prisma.trip.findUnique as jest.Mock).mockResolvedValue(makeTrip(startDate));
      jest.spyOn(service, 'getCoverageMap').mockResolvedValue(makeCoverageMapData());

      const result = await service.getReadinessScore('trip-1');

      expect(result.readinessPhase).toBe('planning');
      expect(result.score.overall).toBeGreaterThanOrEqual(0);
      expect(result.score.entryTransit).toBeDefined();
      expect(result.score.scheduleFeasibility).toBeUndefined();
    });

    it('throws when trip is missing', async () => {
      (prisma.trip.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getReadinessScore('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reuses provided coverageData without calling getCoverageMap', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 120);
      const coverage = makeCoverageMapData();

      (prisma.trip.findUnique as jest.Mock).mockResolvedValue(makeTrip(startDate));
      const getCoverageMapSpy = jest.spyOn(service, 'getCoverageMap');

      await service.getReadinessScore('trip-1', { coverageData: coverage });

      expect(getCoverageMapSpy).not.toHaveBeenCalled();
    });
  });

  describe('getCoverageMap', () => {
    it('skips gap analysis when includeGaps is false', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 30);

      (prisma.trip.findUnique as jest.Mock).mockResolvedValue({
        ...makeTrip(startDate),
        status: 'PLANNING',
        metadata: {},
        TripDay: [
          {
            date: startDate,
            ItineraryItem: [
              {
                id: 'item-1',
                placeId: 1,
                startTime: null,
                endTime: null,
                Place: {
                  id: 1,
                  nameCN: 'A',
                  nameEN: 'A',
                  category: 'attraction',
                  metadata: { lat: 64, lng: -21 },
                },
              },
            ],
          },
        ],
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 1, lat: 64, lng: -21 }]);

      const identifyGapsSpy = jest
        .spyOn(service as any, 'identifyGaps')
        .mockReturnValue([{ id: 'gap-1' }]);

      const result = await service.getCoverageMap('trip-1', { includeGaps: false });

      expect(identifyGapsSpy).not.toHaveBeenCalled();
      expect(result.gaps).toEqual([]);
      expect(result.deduplicatedWarnings).toBeUndefined();
      expect(result.summary.totalGaps).toBe(0);
    });

    it('includes POI when coords only exist in metadata.location (itinerary parity)', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 30);

      (prisma.trip.findUnique as jest.Mock).mockResolvedValue({
        ...makeTrip(startDate),
        status: 'PLANNING',
        metadata: {},
        TripDay: [
          {
            date: startDate,
            ItineraryItem: [
              {
                id: 'item-a',
                placeId: 101,
                order: 1,
                startTime: null,
                endTime: null,
                Place: {
                  id: 101,
                  nameCN: 'A',
                  nameEN: 'A',
                  category: 'attraction',
                  metadata: { location: { lat: 64.1, lng: -21.9 } },
                },
              },
              {
                id: 'item-b',
                placeId: 102,
                order: 2,
                startTime: null,
                endTime: null,
                Place: {
                  id: 102,
                  nameCN: 'B',
                  nameEN: 'B',
                  category: 'attraction',
                  metadata: { location: { lat: 64.2, lng: -21.8 } },
                },
              },
            ],
          },
        ],
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await service.getCoverageMap('trip-1', { includeGaps: false });

      expect(result.pois).toHaveLength(2);
      expect(result.pois.map((p) => p.itemId)).toEqual(['item-a', 'item-b']);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toMatchObject({
        fromPoiId: result.pois[0]!.id,
        toPoiId: result.pois[1]!.id,
        day: 1,
      });
    });
  });

  describe('reservation evidence coverage', () => {
    it('marks required reservation as missing booking confirmation until a confirmation exists', () => {
      const place = {
        id: 1,
        nameCN: '蓝湖温泉',
        nameEN: 'Blue Lagoon',
        category: 'attraction',
        metadata: {
          canonicalType: 'HOT_SPRING',
          openingHours: { source: 'official' },
        },
      };

      const coverage = (service as any).evaluateCoverageFromReadiness(
        place,
        { findings: [], summary: {} },
        '2026-06-20',
      );

      expect(coverage.missingEvidence).toContain('booking_confirmation');
      expect(coverage.evidenceTypes).toContain('opening_hours');

      const confirmed = (service as any).evaluateCoverageFromReadiness(
        {
          ...place,
          metadata: {
            ...place.metadata,
            reservation: { required: true, leadTime: 'P3D', confirmationId: 'BL-123' },
          },
        },
        { findings: [], summary: {} },
        '2026-06-20',
      );

      expect(confirmed.evidenceTypes).toContain('booking_confirmation');
      expect(confirmed.missingEvidence).not.toContain('booking_confirmation');
    });

    it('normalizes popular reservation POI metadata with lead time hints', () => {
      const poi = (service as any).evaluatePoiCoverage(
        'poi-1',
        'item-blue-lagoon',
        1,
        1,
        {
          id: 1,
          nameCN: '蓝湖温泉',
          nameEN: 'Blue Lagoon',
          category: 'attraction',
          metadata: { canonicalType: 'HOT_SPRING' },
        },
        { lat: 64, lng: -21 },
        { findings: [], summary: {} },
        '2026-06-20',
      );

      expect(poi.metadata.requiresReservation).toBe(true);
      expect(poi.metadata.reservation.leadTime).toBe('P3D');
      expect(poi.missingEvidence).toContain('booking_confirmation');
    });
  });

  describe('P1 evidence grading (gap severity)', () => {
    it('escalates partial reservation POI missing booking to high severity gap', () => {
      const poi = {
        id: 'poi-1',
        day: 1,
        name: '蓝湖温泉',
        coverageStatus: 'partial',
        missingEvidence: ['booking_confirmation'],
        metadata: { requiresReservation: true, canonicalType: 'HOT_SPRING' },
        coordinates: { lat: 64, lng: -21 },
      };

      const severity = (service as any).resolvePoiGapSeverity(poi);
      expect(severity).toBe('high');
    });

    it('keeps weather-only missing evidence at medium severity', () => {
      const poi = {
        id: 'poi-2',
        day: 2,
        name: '冰川湖',
        coverageStatus: 'uncovered',
        missingEvidence: ['weather'],
        metadata: { canonicalType: 'GLACIER' },
        coordinates: { lat: 64, lng: -16 },
      };

      const severity = (service as any).resolvePoiGapSeverity(poi);
      expect(severity).toBe('medium');
    });

    it('marks road_closure high hazards as blocker in today scoped findings', () => {
      const coverageData = {
        gaps: [],
        pois: [
          { id: 'p1', day: 1, name: 'A', coordinates: { lat: 64, lng: -21 } },
          { id: 'p2', day: 1, name: 'B', coordinates: { lat: 64.1, lng: -21.1 } },
        ],
        segments: [
          {
            id: 'seg-1',
            fromPoiId: 'p1',
            toPoiId: 'p2',
            day: 1,
            duration: 120,
            distance: 120,
            hazards: [{ type: 'road_closure', severity: 'high', message: '道路可能封闭' }],
          },
        ],
      };

      const findings = (service as any).extractTodayScopedFindings(coverageData);

      const transport = findings.find((f: { id: string }) => f.id === 'transport-seg-1-road_closure');
      expect(transport?.type).toBe('blocker');
    });

    it('includes long_distance hazards in today scoped transport findings', () => {
      const coverageData = {
        gaps: [],
        pois: [
          { id: 'p1', day: 1, name: '蓝湖', itemId: 'item-1', coordinates: { lat: 64, lng: -22 } },
          { id: 'p2', day: 1, name: '塞济斯菲厄泽', itemId: 'item-2', coordinates: { lat: 65.26, lng: -14 } },
        ],
        segments: [
          {
            id: 'seg-1',
            fromPoiId: 'p1',
            toPoiId: 'p2',
            day: 1,
            distance: 620,
            duration: 480,
            hazards: [
              {
                type: 'long_distance',
                severity: 'high',
                message: '超长距离行驶(>300km)，强烈建议分段或中途住宿',
              },
            ],
          },
        ],
      };

      const findings = (service as any).extractTodayScopedFindings(coverageData);

      const transport = findings.find((f: { id: string }) => f.id === 'transport-seg-1-long_distance');
      expect(transport?.category).toBe('transport');
      expect(transport?.type).toBe('blocker');
    });
  });

  describe('generateSegments', () => {
    it('pairs adjacent POIs within each day only', async () => {
      const pois = [
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
        {
          id: 'poi-3',
          day: 2,
          order: 1,
          name: 'C',
          type: 'attraction',
          coordinates: { lat: 64.2, lng: -21.2 },
          coverageStatus: 'covered',
          evidenceCount: 1,
        },
        {
          id: 'poi-4',
          day: 2,
          order: 2,
          name: 'D',
          type: 'attraction',
          coordinates: { lat: 64.3, lng: -21.3 },
          coverageStatus: 'covered',
          evidenceCount: 1,
        },
      ] as const;

      const { segments } = await (service as any).generateSegments(
        [...pois],
        false,
        new Date('2026-07-01'),
        GLOBAL_SEGMENT_DISTANCE_THRESHOLDS,
        false,
      );

      expect(segments).toHaveLength(2);
      expect(segments[0]).toMatchObject({
        fromPoiId: 'poi-1',
        toPoiId: 'poi-2',
        day: 1,
        sequenceIndex: 0,
      });
      expect(segments[1]).toMatchObject({
        fromPoiId: 'poi-3',
        toPoiId: 'poi-4',
        day: 2,
        sequenceIndex: 1,
      });
      expect(segments.every((s) => s.polyline.length > 0)).toBe(true);
    });

    it('returns no segments when a day has fewer than two POIs', async () => {
      const pois = [
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
          day: 2,
          order: 1,
          name: 'B',
          type: 'attraction',
          coordinates: { lat: 64.1, lng: -21.1 },
          coverageStatus: 'covered',
          evidenceCount: 1,
        },
      ] as const;

      const { segments } = await (service as any).generateSegments(
        [...pois],
        false,
        new Date('2026-07-01'),
        GLOBAL_SEGMENT_DISTANCE_THRESHOLDS,
        false,
      );

      expect(segments).toEqual([]);
    });
  });

  describe('mergeHighSeverityCoverageGapBlockersIntoTripReadiness', () => {
    it('PR-1: no longer merges coverage gaps into pack readiness', async () => {
      const baseResult: ReadinessCheckResult = {
        findings: [
          {
            destinationId: 'IS',
            packId: 'pack.is',
            packVersion: '1',
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

      expect(merged).toBe(baseResult);
      expect(merged.summary.totalBlockers).toBe(0);
    });
  });
});
