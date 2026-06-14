import {
  analyzeRoadClosureCascade,
  analyzeWeatherWindowCascade,
  isFroadRoadStatus,
  isRoadClosureBlocking,
  type RoadStatusValue,
} from './iceland-dependency-impact.analyzer';
import { extractIcelandActivityDependencyChain } from './trip-dependency-chain.util';
import type { EvidenceEnvelope } from '../types/evidence-envelope.types';

describe('iceland-dependency-impact analyzer', () => {
  const icelandChain = extractIcelandActivityDependencyChain([
    {
      id: 'd1',
      type: 'DRIVE',
      startTime: '2026-07-01T09:00:00.000Z',
      metadata: { isFroad: true },
      placeName: 'F208 highland segment',
      dayDate: '2026-07-01',
    },
    {
      id: 'p1',
      type: 'ACTIVITY',
      startTime: '2026-07-01T14:00:00.000Z',
      metadata: { indoorOutdoor: 'outdoor' },
      placeName: 'Landmannalaugar',
      dayDate: '2026-07-01',
    },
  ]);

  const roadEnvelope = (
    value: RoadStatusValue,
  ): EvidenceEnvelope<RoadStatusValue> => ({
    factType: 'ROAD',
    entityRef: { kind: 'ROAD', id: 'F208', label: 'F208' },
    value,
    source: 'road.is',
    observedAt: '2026-07-01T08:00:00.000Z',
    confidence: 0.9,
  });

  it('detects F-road closure markers', () => {
    expect(isFroadRoadStatus({ reason: 'F-road F208 closed', isOpen: false })).toBe(true);
    expect(isRoadClosureBlocking({ isOpen: false })).toBe(true);
    expect(isRoadClosureBlocking({ isOpen: true, riskLevel: 1 })).toBe(false);
  });

  it('cascades F-road closure to drive and POI', () => {
    const impact = analyzeRoadClosureCascade({
      trigger: roadEnvelope({
        isOpen: false,
        riskLevel: 3,
        reason: 'F-road F208 closed — snow',
        fRoadInfo: { roadId: 'F208' },
      }),
      chain: icelandChain,
      nowMs: Date.parse('2026-07-01T08:30:00.000Z'),
    });

    expect(impact.affected.length).toBeGreaterThan(0);
    expect(impact.affected.some((n) => n.riskLevel === 'CRITICAL')).toBe(true);
    expect(impact.affected.some((n) => n.entityRef.kind === 'SEGMENT')).toBe(true);
  });

  it('cascades adverse weather to outdoor POI', () => {
    const impact = analyzeWeatherWindowCascade({
      trigger: {
        factType: 'WEATHER',
        entityRef: { kind: 'REGION', id: 'iceland-south' },
        value: { windSpeed: 22, condition: 'storm' },
        source: 'open-meteo',
        observedAt: '2026-07-01T08:00:00.000Z',
        confidence: 0.85,
      },
      chain: icelandChain,
    });

    expect(impact.affected.some((n) => n.entityRef.kind === 'POI')).toBe(true);
    expect(impact.affected.some((n) => n.riskLevel === 'HIGH' || n.riskLevel === 'CRITICAL')).toBe(
      true,
    );
  });

  it('returns empty affected when road is open and low risk', () => {
    const impact = analyzeRoadClosureCascade({
      trigger: roadEnvelope({ isOpen: true, riskLevel: 0 }),
      chain: icelandChain,
    });
    expect(impact.affected).toHaveLength(0);
  });
});
