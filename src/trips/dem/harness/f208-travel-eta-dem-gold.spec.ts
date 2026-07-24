import {
  evaluateF208TravelEtaDemGold,
  f208Gold2wdRejectFixture,
  f208GoldSummer4wdAllowFixture,
  highlandGlobalDemFixture,
  ringRoadPavedControlFixture,
  F208_GOLD_POIS,
  F208_GOLD_SEGMENT_ID,
  F208_ROAD_ID,
} from './f208-travel-eta-dem-gold';
import type { TravelSegmentTerrainV1 } from '../../../transport/contracts/travel-eta.contract';
import {
  applyTerrainToSegmentPhysics,
  terrainToDemDecisionEvidence,
} from '../utils/map-travel-terrain.util';
import { StateConsistencyGuardService } from '../services/state-consistency-guard.service';

const icelandTerrainOk: TravelSegmentTerrainV1 = {
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

describe('Iceland travel-eta + DEM gold matrix (5 cases)', () => {
  it('exposes canonical F208 spatial POI anchors', () => {
    expect(F208_GOLD_POIS.west.id).toBe('poi-is-f208-west');
    expect(F208_GOLD_POIS.east.id).toBe('poi-is-f208-east');
    expect(F208_ROAD_ID).toBe('F208');
    expect(F208_GOLD_SEGMENT_ID).toBe('seg-is-f208');
  });

  it('1) F208 + 4WD + OPEN → ALLOW with L2 planningDuration > base (Shadow schedulable=base)', () => {
    const result = evaluateF208TravelEtaDemGold(f208GoldSummer4wdAllowFixture(icelandTerrainOk));
    expect(result.decision).toBe('ALLOW');
    expect(result.summary.baseDurationMin).toBe(125);
    expect(result.summary.planningDurationMin).toBeGreaterThan(125);
    expect(result.summary.schedulableDurationMin).toBe(125);
    expect(result.eta.adjustmentReasons).toEqual(
      expect.arrayContaining(['F_ROAD', 'STEEP_TERRAIN']),
    );
    expect(result.eta.baseDurationMin).toBe(125);
    expect(result.demEvidence.violation).toBe('NONE');
    expect(result.demEvidence.dataProvenance).toBe('LIVE');
    expect(result.summary.demSource).toBe('geo_dem_iceland_20m');
    expect(result.vehicleOk).toBe(true);
  });

  it('2) F208 + 2WD → REJECT with OFFICIAL_IS_FROAD_2WD', () => {
    const result = evaluateF208TravelEtaDemGold(f208Gold2wdRejectFixture(icelandTerrainOk));
    expect(result.decision).toBe('REJECT');
    expect(result.reasons).toContain('OFFICIAL_IS_FROAD_2WD');
    expect(result.vehicleOk).toBe(false);
    expect(result.eta.baseDurationMin).toBe(125);
    expect(result.eta.schedulability).toBe('BLOCKED');
  });

  it('3) CLOSED F208 + 4WD → SUGGEST_REPLACE', () => {
    const result = evaluateF208TravelEtaDemGold({
      ...f208GoldSummer4wdAllowFixture(icelandTerrainOk),
      roadStatus: 'CLOSED',
    });
    expect(result.decision).toBe('SUGGEST_REPLACE');
    expect(result.reasons).toEqual(
      expect.arrayContaining(['ROAD_CLOSED_F208', 'REROUTE_OFF_F208']),
    );
    expect(result.eta.schedulability).toBe('BLOCKED');
  });

  it('4) paved ring road → no F_ROAD highland buffer', () => {
    const result = evaluateF208TravelEtaDemGold(ringRoadPavedControlFixture(icelandTerrainOk));
    expect(result.decision).toBe('ALLOW');
    expect(result.summary.planningDurationMin).toBe(90);
    expect(result.eta.adjustmentReasons).not.toContain('F_ROAD');
  });

  it('5a) highland + global DEM → NEED_CONFIRM + lower confidence', () => {
    const result = evaluateF208TravelEtaDemGold(highlandGlobalDemFixture(icelandTerrainOk));
    expect(result.decision).toBe('NEED_CONFIRM');
    expect(result.reasons).toContain('DEM_GLOBAL_FALLBACK');
    expect(result.eta.adjustmentReasons).toContain('DATA_UNCERTAINTY');
    expect(result.eta.confidence).toBeLessThanOrEqual(0.55);
  });

  it('5b) DEM missing → REJECT E_DEM_MISSING / HARD', () => {
    const missing: TravelSegmentTerrainV1 = {
      ...icelandTerrainOk,
      demSource: 'NONE',
      confidence: 0,
    };
    const result = evaluateF208TravelEtaDemGold(f208GoldSummer4wdAllowFixture(missing));
    expect(result.decision).toBe('REJECT');
    expect(result.reasons).toEqual(
      expect.arrayContaining(['E_DEM_MISSING', 'HARD_DEM_VIOLATION']),
    );
    expect(result.demEvidence.violation).toBe('HARD');
  });
});

describe('map-travel-terrain → StateConsistencyGuard', () => {
  it('applies metadata.terrain without calling DEM effort', async () => {
    const demElevation = { isInIcelandBounds: jest.fn().mockReturnValue(true) };
    const demEffort = { calculateEffortMetadata: jest.fn() };
    const guard = new StateConsistencyGuardService(demElevation as any, demEffort as any);

    const { plan, patched } = await guard.enrichRoutePlanDraftIfNeeded({
      tripId: 't-f208',
      routeDirectionId: 'is-f208',
      segments: [
        {
          segmentId: F208_GOLD_SEGMENT_ID,
          dayIndex: 0,
          distanceKm: 95,
          ascentM: 0,
          slopePct: 0,
          metadata: {
            terrain: icelandTerrainOk,
            travelEta: {
              schema: 'tripnara/travel-eta/v1',
              baseDurationMin: 125,
              planningDurationMin: 165,
              schedulableDurationMin: 125,
              uncertaintyMin: 40,
              confidence: 0.7,
              adjustmentReasons: ['F_ROAD'],
              provenance: {
                provider: 'MAPBOX',
                sourceKind: 'ROUTE_API',
                calculatedAt: new Date().toISOString(),
                cacheHit: false,
                confidence: 0.7,
              },
              terrain: icelandTerrainOk,
            },
          },
        },
      ],
    });

    expect(patched).toBe(true);
    expect(plan.segments[0].ascentM).toBe(640);
    expect(plan.segments[0].slopePct).toBe(14);
    expect(plan.segments[0].metadata?.terrainAuditSource).toBe('travel-eta-terrain');
    expect(demEffort.calculateEffortMetadata).not.toHaveBeenCalled();

    const physics = applyTerrainToSegmentPhysics(icelandTerrainOk);
    expect(physics).toEqual({ ascentM: 640, slopePct: 14 });

    const evidence = terrainToDemDecisionEvidence({
      segmentId: F208_GOLD_SEGMENT_ID,
      terrain: icelandTerrainOk,
    });
    expect(evidence.violation).toBe('NONE');
    expect(evidence.cumulativeAscent).toBe(640);
  });
});
