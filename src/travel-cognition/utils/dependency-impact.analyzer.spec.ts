import {
  analyzeFlightDelayCascade,
  buildNonTransactionalReplanResult,
} from './dependency-impact.analyzer';
import {
  extractTripDependencyChain,
  extractIcelandActivityDependencyChain,
} from './trip-dependency-chain.util';
import type { EvidenceEnvelope } from '../types/evidence-envelope.types';
import type { FlightStatusValue } from './dependency-impact.analyzer';

describe('dependency-impact analyzer', () => {
  const flightRef = { kind: 'AIRPORT' as const, id: 'coord:64.13,-21.94', label: 'KEF' };

  const baseChain = extractTripDependencyChain([
    {
      id: 'f1',
      type: 'TRANSIT',
      startTime: '2026-06-15T06:00:00.000Z',
      endTime: '2026-06-15T14:00:00.000Z',
      metadata: { flight: 'FI123' },
      placeName: 'KEF Arrival',
    },
    {
      id: 't1',
      type: 'TRANSIT',
      startTime: '2026-06-15T14:45:00.000Z',
      metadata: { duration_minutes: 60 },
      placeName: 'Airport shuttle',
    },
    {
      id: 'h1',
      type: 'REST',
      startTime: '2026-06-15T16:00:00.000Z',
      metadata: { hotel: true },
      placeName: 'Reykjavik Hotel',
    },
    {
      id: 'p1',
      type: 'ACTIVITY',
      startTime: '2026-06-15T18:00:00.000Z',
      dayDate: '2026-06-15',
      placeName: 'Hallgrimskirkja',
    },
  ]);

  const flightTrigger = (value: FlightStatusValue): EvidenceEnvelope<FlightStatusValue> => ({
    factType: 'FLIGHT_STATUS',
    entityRef: flightRef,
    value,
    source: 'flight-status-provider',
    observedAt: '2026-06-15T13:00:00.000Z',
    validUntil: '2026-06-15T13:30:00.000Z',
    confidence: 0.9,
  });

  it('extracts flight → transfer → check-in → day plan chain', () => {
    expect(baseChain.map((n) => n.role)).toEqual(['flight', 'transfer', 'check_in', 'day_plan']);
  });

  it('returns empty affected when flight is on time', () => {
    const impact = analyzeFlightDelayCascade({
      trigger: flightTrigger({ status: 'ON_TIME', scheduledArrival: '2026-06-15T14:00:00.000Z' }),
      chain: baseChain,
    });
    expect(impact.affected).toHaveLength(0);
  });

  it('cascades delay to transfer and check-in', () => {
    const impact = analyzeFlightDelayCascade({
      trigger: flightTrigger({
        status: 'DELAYED',
        scheduledArrival: '2026-06-15T14:00:00.000Z',
        delayMinutes: 90,
      }),
      chain: baseChain,
      nowMs: Date.parse('2026-06-15T13:00:00.000Z'),
    });

    expect(impact.affected.length).toBeGreaterThan(0);
    expect(impact.affected.some((n) => n.entityRef.kind === 'SEGMENT')).toBe(true);
    expect(impact.affected.some((n) => n.userConfirmationRequired?.length)).toBe(true);
    expect(impact.affected.every((n) => n.recommendation !== undefined)).toBe(true);
  });

  it('marks all downstream CRITICAL when flight cancelled', () => {
    const impact = analyzeFlightDelayCascade({
      trigger: flightTrigger({ status: 'CANCELLED', scheduledArrival: '2026-06-15T14:00:00.000Z' }),
      chain: baseChain,
    });

    expect(impact.affected.every((n) => n.riskLevel === 'CRITICAL')).toBe(true);
    expect(impact.affected.every((n) => n.recommendation === 'ASK_USER')).toBe(true);
  });

  it('builds NonTransactionalReplanResult with coverage', () => {
    const result = buildNonTransactionalReplanResult({
      tripId: 'trip-1',
      trigger: flightTrigger({ status: 'DELAYED', delayMinutes: 60, scheduledArrival: '2026-06-15T14:00:00.000Z' }),
      chain: baseChain,
    });

    expect(result.tripId).toBe('trip-1');
    expect(result.coverage.uncoveredCapabilities).toContain('AUTO_BOOKING');
    expect(result.impact.rootFactType).toBe('FLIGHT_STATUS');
  });

  it('analyzes ROAD closure cascade', () => {
    const chain = extractIcelandActivityDependencyChain([
      {
        id: 'd1',
        type: 'DRIVE',
        startTime: '2026-07-01T09:00:00.000Z',
        dayDate: '2026-07-01',
        metadata: { isFroad: true },
      },
      {
        id: 'p1',
        type: 'ACTIVITY',
        startTime: '2026-07-01T14:00:00.000Z',
        dayDate: '2026-07-01',
        placeName: 'Highland POI',
      },
    ]);

    const result = buildNonTransactionalReplanResult({
      trigger: {
        factType: 'ROAD',
        entityRef: { kind: 'ROAD', id: 'F208' },
        value: { isOpen: false, riskLevel: 3, reason: 'F-road closed' },
        source: 'road.is',
        observedAt: '2026-07-01T08:00:00.000Z',
        confidence: 0.9,
      },
      chain,
    });

    expect(result.impact.rootFactType).toBe('ROAD');
    expect(result.impact.affected.length).toBeGreaterThan(0);
  });
});

describe('trip-dependency-chain util', () => {
  it('returns empty chain when no flight item', () => {
    expect(
      extractTripDependencyChain([
        { id: 'a1', type: 'ACTIVITY', startTime: '2026-06-15T10:00:00.000Z' },
      ]),
    ).toEqual([]);
  });

  it('extracts Iceland drive and POI chain', () => {
    const chain = extractIcelandActivityDependencyChain([
      {
        id: 'd1',
        type: 'DRIVE',
        startTime: '2026-07-01T09:00:00.000Z',
        dayDate: '2026-07-01',
      },
      {
        id: 'p1',
        type: 'ACTIVITY',
        startTime: '2026-07-01T12:00:00.000Z',
        dayDate: '2026-07-01',
      },
    ]);
    expect(chain.map((n) => n.role)).toEqual(['drive', 'poi', 'day_plan']);
  });
});
