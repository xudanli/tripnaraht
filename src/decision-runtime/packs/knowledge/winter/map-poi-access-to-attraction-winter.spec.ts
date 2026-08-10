import {
  attractionWinterFromPoiAccessEvaluation,
  isSeasonalWinterAccessConcern,
  mapAccessVerdictToAttractionWinterStatus,
  pickWorstAttractionWinterAccess,
} from './map-poi-access-to-attraction-winter';
import { mergeAttractionIntoRouteFacts } from './merge-attraction-into-route-facts';
import { assessAttractionWinterAccess } from './assess-iceland-winter-knowledge';
import { projectIcelandSelfDriveSituationClient } from '../demo/iceland-self-drive-situation.client';
import { evaluateIcelandSelfDriveSituation } from '../demo/evaluate-iceland-self-drive-situation';

describe('mapAccessVerdictToAttractionWinterStatus', () => {
  it('maps BLOCKED + seasonal → CLOSED HARD', () => {
    const m = mapAccessVerdictToAttractionWinterStatus('BLOCKED', {
      bottleneckRuleType: 'SEASONAL_CLOSURE',
    });
    expect(m.status).toBe('CLOSED');
    expect(m.enforcement).toBe('HARD');
  });

  it('maps NEEDS_CONFIRMATION → PENDING_CONFIRMATION', () => {
    const m = mapAccessVerdictToAttractionWinterStatus('NEEDS_CONFIRMATION');
    expect(m.status).toBe('PENDING_CONFIRMATION');
    expect(m.enforcement).toBe('SOFT');
  });

  it('maps FEASIBLE → OPEN only when evaluate said so', () => {
    const m = mapAccessVerdictToAttractionWinterStatus('FEASIBLE');
    expect(m.status).toBe('OPEN');
  });

  it('omits soft-safety FEASIBLE_WITH_RISK (never OPEN/ALLOW)', () => {
    const m = mapAccessVerdictToAttractionWinterStatus('FEASIBLE_WITH_RISK', {
      bottleneckRuleType: 'SAFETY_RESTRICTION',
    });
    expect(m).toBeNull();
    expect(
      attractionWinterFromPoiAccessEvaluation({
        poiId: 'is.reynisfjara',
        verdict: 'FEASIBLE_WITH_RISK',
        bottleneckRuleType: 'SAFETY_RESTRICTION',
      }),
    ).toBeUndefined();
  });

  it('omits crowding FEASIBLE_WITH_RISK (no seasonal rule) — not open-reachable', () => {
    const m = mapAccessVerdictToAttractionWinterStatus('FEASIBLE_WITH_RISK');
    expect(m).toBeNull();
  });

  it('maps seasonal FEASIBLE_WITH_RISK → PENDING_CONFIRMATION', () => {
    const m = mapAccessVerdictToAttractionWinterStatus('FEASIBLE_WITH_RISK', {
      bottleneckRuleType: 'TRAIL_RESTRICTION',
    });
    expect(m.status).toBe('PENDING_CONFIRMATION');
    expect(m.reasons).toContain('POI_ACCESS_SEASONAL_RISK');
  });

  it('picks worst among seasonal concerns only', () => {
    const worst = pickWorstAttractionWinterAccess([
      { poiId: 'is.reynisfjara', verdict: 'FEASIBLE_WITH_RISK', bottleneckRuleType: 'SAFETY_RESTRICTION' },
      { poiId: 'is.skaftafell', verdict: 'BLOCKED', bottleneckRuleType: 'SEASONAL_CLOSURE' },
      { poiId: 'is.dettifoss', verdict: 'NEEDS_CONFIRMATION' },
    ]);
    expect(worst?.poiId).toBe('is.skaftafell');
    expect(worst?.status).toBe('CLOSED');
  });

  it('omits winter card when trip only has soft-safety / crowding risk', () => {
    expect(
      pickWorstAttractionWinterAccess([
        {
          poiId: 'is.reynisfjara',
          verdict: 'FEASIBLE_WITH_RISK',
          bottleneckRuleType: 'SAFETY_RESTRICTION',
        },
        { poiId: 'is.seljalandsfoss', verdict: 'FEASIBLE_WITH_RISK' },
        { poiId: 'is.gullfoss', verdict: 'FEASIBLE' },
      ]),
    ).toBeUndefined();
  });

  it('isSeasonalWinterAccessConcern excludes soft safety', () => {
    expect(
      isSeasonalWinterAccessConcern('FEASIBLE_WITH_RISK', 'SAFETY_RESTRICTION'),
    ).toBe(false);
    expect(
      isSeasonalWinterAccessConcern('NEEDS_CONFIRMATION', 'TRAIL_RESTRICTION'),
    ).toBe(true);
  });

  it('feeds situation client attractionAccess', () => {
    const attraction = attractionWinterFromPoiAccessEvaluation({
      poiId: 'is.skaftafell',
      verdict: 'NEEDS_CONFIRMATION',
    });
    expect(attraction).toBeDefined();
    expect(assessAttractionWinterAccess(attraction!).gate).toBe('NEED_CONFIRM');

    const result = evaluateIcelandSelfDriveSituation({
      tripId: 't_attr',
      vehicleRoadFit: {
        vehicleClass: 'SEDAN',
        roadSegmentId: 'RING_ROAD',
        roadBaseType: 'PAVED',
        roadStatus: 'OPEN',
      },
      winter: { attractionAccess: attraction },
      executeFuelRunbookOnBlock: false,
    });
    const client = projectIcelandSelfDriveSituationClient(result, {
      tripId: 't_attr',
    });
    expect(client.attractionAccess?.poiId).toBe('is.skaftafell');
    expect(client.attractionAccess?.status).toBe('PENDING_CONFIRMATION');
    expect(client.gate).toBe('NEED_CONFIRM');
  });

  it('mergeAttractionIntoRouteFacts preserves upstream', () => {
    const merged = mergeAttractionIntoRouteFacts(
      {
        winter: {
          attractionAccess: {
            poiId: 'is.kept',
            status: 'OPEN',
          },
        },
      },
      { poiId: 'is.other', status: 'CLOSED' },
    );
    expect(merged.winter?.attractionAccess?.poiId).toBe('is.kept');
  });
});
