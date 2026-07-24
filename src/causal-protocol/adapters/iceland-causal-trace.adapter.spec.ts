import {
  shouldSeedIcelandWindTravelCausal,
  isTravelOrTransportProblem,
} from './iceland-causal-trace.adapter';

describe('shouldSeedIcelandWindTravelCausal', () => {
  it('rejects DecisionCase vehicle even when dimension is TRANSPORT', () => {
    expect(
      shouldSeedIcelandWindTravelCausal({
        problemId: 'dc_vehicle_abc',
        semanticKey: 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT',
        dimension: 'TRANSPORT',
      }),
    ).toBe(false);
    expect(
      isTravelOrTransportProblem({
        problemId: 'dc_vehicle_abc',
        dimension: 'TRANSPORT',
      }),
    ).toBe(false);
  });

  it('accepts transport_buffer / same_day / weather markers', () => {
    expect(
      shouldSeedIcelandWindTravelCausal({
        problemId: 'prob_1',
        semanticKey: 'transport_buffer',
      }),
    ).toBe(true);
    expect(
      shouldSeedIcelandWindTravelCausal({
        problemId: 'prob_2',
        semanticKey: 'SAME_DAY_CONFLICT',
      }),
    ).toBe(true);
    expect(
      shouldSeedIcelandWindTravelCausal({
        problemId: 'prob_3',
        semanticKey: 'WORLD_EVENT.STRONG_WIND',
      }),
    ).toBe(true);
  });

  it('does not treat bare TRANSPORT dimension as wind buffer', () => {
    expect(
      shouldSeedIcelandWindTravelCausal({
        problemId: 'legacy_vehicle_like',
        dimension: 'TRANSPORT',
        semanticKey: 'PREFERENCE_CONFLICT',
      }),
    ).toBe(false);
  });
});
