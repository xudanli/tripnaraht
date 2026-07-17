import {
  TRAVEL_ETA_CONTRACT_SCHEMA,
  applyPlanningAdjustments,
  isTravelEtaEnvelopeV1,
  mapPoiHopSourceToKind,
  projectLegacyDurationToEtaEnvelope,
  resolvePlanningDurationMin,
} from './travel-eta.contract';

describe('travel-eta.contract', () => {
  it('projects legacy single duration with base === planning', () => {
    const eta = projectLegacyDurationToEtaEnvelope({
      durationMin: 110,
      distanceM: 182000,
      sourceKind: 'ROUTE_API',
      provider: 'MAPBOX',
    });

    expect(eta.schema).toBe(TRAVEL_ETA_CONTRACT_SCHEMA);
    expect(eta.baseDurationMin).toBe(110);
    expect(eta.planningDurationMin).toBe(110);
    expect(eta.uncertaintyMin).toBe(0);
    expect(eta.adjustmentReasons).toEqual([]);
    expect(eta.provenance.provider).toBe('MAPBOX');
    expect(eta.provenance.sourceKind).toBe('ROUTE_API');
    expect(isTravelEtaEnvelopeV1(eta)).toBe(true);
  });

  it('applies L2 adjustments without overwriting base', () => {
    const base = projectLegacyDurationToEtaEnvelope({
      durationMin: 110,
      sourceKind: 'ROUTE_API',
      provider: 'GOOGLE',
      confidence: 0.85,
    });

    const planned = applyPlanningAdjustments(base, [
      { reason: 'F_ROAD', deltaMin: 30 },
      { reason: 'SEASONAL_UNCERTAINTY', deltaMin: 15 },
    ]);

    expect(planned.baseDurationMin).toBe(110);
    expect(planned.planningDurationMin).toBe(155);
    expect(planned.uncertaintyMin).toBe(45);
    expect(planned.adjustmentReasons).toEqual(['F_ROAD', 'SEASONAL_UNCERTAINTY']);
    expect(planned.confidence).toBeLessThanOrEqual(0.75);
  });

  it('resolvePlanningDurationMin prefers schedulableDurationMin (Shadow=base)', () => {
    const eta = applyPlanningAdjustments(
      projectLegacyDurationToEtaEnvelope({ durationMin: 100, sourceKind: 'ROUTE_API' }),
      [{ reason: 'SAFETY_BUFFER', deltaMin: 20 }],
      { authority: 'SHADOW' },
    );
    expect(eta.planningDurationMin).toBe(120);
    expect(eta.schedulableDurationMin).toBe(100);
    expect(resolvePlanningDurationMin({ duration: 100, eta })).toBe(100);

    const auth = applyPlanningAdjustments(
      projectLegacyDurationToEtaEnvelope({ durationMin: 100, sourceKind: 'ROUTE_API' }),
      [{ reason: 'SAFETY_BUFFER', deltaMin: 20 }],
      { authority: 'AUTHORITATIVE' },
    );
    expect(resolvePlanningDurationMin({ duration: 100, eta: auth })).toBe(120);
    expect(resolvePlanningDurationMin({ duration: 90 })).toBe(90);
    expect(resolvePlanningDurationMin({})).toBeNull();
  });

  it('maps poi-hop source tags', () => {
    expect(mapPoiHopSourceToKind('route_api')).toBe('ROUTE_API');
    expect(mapPoiHopSourceToKind('heuristic')).toBe('HEURISTIC');
  });
});
