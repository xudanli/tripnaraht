import { projectLegacyDurationToEtaEnvelope } from '../contracts/travel-eta.contract';
import { applyIcelandPlanningEtaAdjustment } from './iceland-planning-eta-adjustment.util';
import type { TravelSegmentTerrainV1 } from '../contracts/travel-eta.contract';

const iceland20m: TravelSegmentTerrainV1 = {
  ascentM: 640,
  descentM: 420,
  avgSlopePct: 4.2,
  maxSlopePct: 14,
  sampleCount: 48,
  demSource: 'geo_dem_iceland_20m',
  resolutionM: 20,
  srid: 5327,
  confidence: 0.98,
  geometrySource: 'ROUTE_API',
};

function baseEta(min = 125) {
  return projectLegacyDurationToEtaEnvelope({
    durationMin: min,
    distanceM: 95_000,
    sourceKind: 'ROUTE_API',
    provider: 'MAPBOX',
  });
}

describe('IcelandPlanningEtaAdjustment L2', () => {
  it('F208 4WD OPEN → ALLOW + planning > base, SHADOW keeps schedulable=base', () => {
    const r = applyIcelandPlanningEtaAdjustment({
      baseEta: baseEta(),
      origin: { lat: 64.0, lng: -19.2 },
      destination: { lat: 64.3, lng: -19.8 },
      vehicle: '4WD',
      roadId: 'F208',
      roadStatus: 'OPEN',
      month: 7,
      terrain: iceland20m,
      authority: 'SHADOW',
    });
    expect(r.decision).toBe('ALLOW');
    expect(r.eta.baseDurationMin).toBe(125);
    expect(r.eta.planningDurationMin).toBeGreaterThan(125);
    expect(r.eta.schedulableDurationMin).toBe(125);
    expect(r.eta.shadowPlanningDurationMin).toBe(r.eta.planningDurationMin);
    expect(r.eta.adjustmentReasons).toEqual(expect.arrayContaining(['F_ROAD', 'STEEP_TERRAIN']));
  });

  it('AUTHORITATIVE uses planning as schedulable', () => {
    const r = applyIcelandPlanningEtaAdjustment({
      baseEta: baseEta(),
      origin: { lat: 64.0, lng: -19.2 },
      destination: { lat: 64.3, lng: -19.8 },
      vehicle: '4WD',
      roadId: 'F208',
      terrain: iceland20m,
      authority: 'AUTHORITATIVE',
      month: 7,
    });
    expect(r.eta.schedulableDurationMin).toBe(r.eta.planningDurationMin);
  });

  it('2WD on F-road → REJECT BLOCKED without relying on inflated schedule ETA', () => {
    const r = applyIcelandPlanningEtaAdjustment({
      baseEta: baseEta(),
      vehicle: '2WD',
      roadId: 'F208',
      terrain: iceland20m,
      month: 7,
      authority: 'AUTHORITATIVE',
    });
    expect(r.decision).toBe('REJECT');
    expect(r.eta.schedulability).toBe('BLOCKED');
    expect(r.eta.gateReasons).toContain('OFFICIAL_IS_FROAD_2WD');
    expect(r.eta.baseDurationMin).toBe(125);
    // blocked: do not schedule on planning buffers
    expect(r.eta.schedulableDurationMin).toBe(125);
  });

  it('CLOSED → SUGGEST_REPLACE BLOCKED', () => {
    const r = applyIcelandPlanningEtaAdjustment({
      baseEta: baseEta(),
      vehicle: '4WD',
      roadId: 'F208',
      roadStatus: 'CLOSED',
      terrain: iceland20m,
      month: 7,
    });
    expect(r.decision).toBe('SUGGEST_REPLACE');
    expect(r.eta.schedulability).toBe('BLOCKED');
  });

  it('paved ring road does not add F_ROAD buffer', () => {
    const r = applyIcelandPlanningEtaAdjustment({
      baseEta: baseEta(90),
      origin: { lat: 63.42, lng: -19.01 },
      destination: { lat: 63.75, lng: -18.12 },
      pavedRingRoad: true,
      vehicle: '2WD',
      month: 7,
      terrain: {
        ...iceland20m,
        ascentM: 120,
        descentM: 100,
        maxSlopePct: 4,
      },
      authority: 'SHADOW',
    });
    expect(r.eta.planningDurationMin).toBe(90);
    expect(r.eta.adjustmentReasons).not.toContain('F_ROAD');
    expect(r.decision).toBe('ALLOW');
  });

  it('highland + global DEM → NEED_CONFIRM + DATA_UNCERTAINTY', () => {
    const r = applyIcelandPlanningEtaAdjustment({
      baseEta: baseEta(),
      origin: { lat: 64.1, lng: -19.4 },
      destination: { lat: 64.2, lng: -19.5 },
      highlandRisk: true,
      vehicle: '4WD',
      month: 7,
      terrain: { ...iceland20m, demSource: 'geo_dem_global', confidence: 0.4 },
      authority: 'SHADOW',
    });
    expect(r.decision).toBe('NEED_CONFIRM');
    expect(r.reasons).toContain('DEM_GLOBAL_FALLBACK');
    expect(r.eta.adjustmentReasons).toContain('DATA_UNCERTAINTY');
    expect(r.eta.confidence).toBeLessThanOrEqual(0.55);
  });

  it('highland + NONE DEM → REJECT', () => {
    const r = applyIcelandPlanningEtaAdjustment({
      baseEta: baseEta(),
      highlandRisk: true,
      vehicle: '4WD',
      terrain: { ...iceland20m, demSource: 'NONE', confidence: 0 },
      month: 7,
    });
    expect(r.decision).toBe('REJECT');
    expect(r.reasons).toContain('E_DEM_MISSING');
  });
});
