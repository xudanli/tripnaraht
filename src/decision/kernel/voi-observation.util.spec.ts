import {
  computeObservationVoi,
  proxyExpectedUtilityAfterObservation,
  rankObservationActionsFromSignals,
} from './voi-observation.util';

describe('voi-observation.util', () => {
  it('computeObservationVoi matches E[U] - U - cost', () => {
    expect(
      computeObservationVoi({
        utilityBefore: 0.6,
        expectedUtilityAfter: 0.72,
        cost01: 0.05,
      }),
    ).toBeCloseTo(0.07, 5);
  });

  it('proxyExpectedUtilityAfterObservation increases with entropy and reduction', () => {
    const low = proxyExpectedUtilityAfterObservation({
      utilityBefore: 0.5,
      entropy01: 0.2,
      expectedEntropyReduction01: 0.3,
      utilityPerEntropyUnit: 0.1,
    });
    const high = proxyExpectedUtilityAfterObservation({
      utilityBefore: 0.5,
      entropy01: 0.8,
      expectedEntropyReduction01: 0.5,
      utilityPerEntropyUnit: 0.1,
    });
    expect(high).toBeGreaterThan(low);
  });

  it('rankObservationActionsFromSignals includes SNS and POI when weather risk is high', () => {
    const ranked = rankObservationActionsFromSignals({
      utilityBefore: 0.55,
      entropy01: 0.5,
      weatherRisk01: 0.9,
      fragilePoiIds: ['poi-a'],
      geo: { lat: 64.1, lng: -21.9 },
    });
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked.some(r => r.action.type === 'OBSERVATION_SNS_CRAWL')).toBe(true);
    expect(ranked.some(r => r.action.type === 'OBSERVATION_POI_VERIFY')).toBe(true);
    expect(ranked[0].voiAudit?.costPenalty).toBeDefined();
  });

  it('rankObservationActionsFromSignals returns empty when signals are calm', () => {
    const ranked = rankObservationActionsFromSignals({
      utilityBefore: 0.7,
      entropy01: 0.1,
      weatherRisk01: 0.1,
    });
    expect(ranked).toEqual([]);
  });
});
