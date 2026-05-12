import { buildStrategyImpactMap, onTimeProbabilityIndexFromBufferMinutes, STRATEGY_ON_TIME_MODEL_VERSION } from './strategy-impact-map.util';

describe('strategy-impact-map.util', () => {
  it('onTimeProbabilityIndexFromBufferMinutes is monotonic in buffer headroom', () => {
    const low = onTimeProbabilityIndexFromBufferMinutes(5);
    const high = onTimeProbabilityIndexFromBufferMinutes(20);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    expect(high! > low!).toBe(true);
  });

  it('buildStrategyImpactMap compares alternatives with distinct on-time intervals', async () => {
    const itin: any = {
      days: [
        {
          items: [
            {
              id: 'tr1',
              type: 'TRANSIT',
              status: 'PLANNED',
              start_time: '2026-06-01T09:00:00.000Z',
              end_time: '2026-06-01T09:30:00.000Z',
              metadata: { coordinates: { lat: 64.0, lng: -19.0 } },
              location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
            },
            {
              id: 'hb1',
              type: 'VISIT',
              status: 'PLANNED',
              start_time: '2026-06-01T10:00:00.000Z',
              end_time: '2026-06-01T10:30:00.000Z',
              metadata: {
                hard_booking: true,
                latest_arrival_time: '2026-06-01T10:35:00.000Z',
                min_duration_minutes: 30,
                coordinates: { lat: 64.0, lng: -19.0 },
              },
              location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
            },
          ],
        },
      ],
    };

    const alts = [
      { id: 'UPGRADE_TO_DRIVE', cost_delta_usd: 50, time_delta_minutes: 0, reliability_score: 0.9, reasoning_tags: [] },
      { id: 'POSTPONE_SCHEDULE', cost_delta_usd: 0, time_delta_minutes: 30, reliability_score: 0.2, reasoning_tags: [] },
    ];

    const map = await buildStrategyImpactMap({
      baselineItinerary: itin,
      alternatives: alts,
      negotiation_session_id: 'neg:test',
      negotiation_payload: { alternatives: alts, evidence_lineage: {} },
      prefetchedEvidence: [],
      resolveTravelMinutes: async () => 0,
      findCachedTravelMinutes: () => undefined,
    });

    expect(map).toBeTruthy();
    expect(map!.on_time_model.version).toBe(STRATEGY_ON_TIME_MODEL_VERSION);
    expect(Array.isArray(map!.alternatives)).toBe(true);
    expect(map!.alternatives.length).toBe(2);
    const up = map!.alternatives.find((a: any) => a.alternative_id === 'UPGRADE_TO_DRIVE');
    const po = map!.alternatives.find((a: any) => a.alternative_id === 'POSTPONE_SCHEDULE');
    expect(up?.trip_on_time_probability_interval).toBeTruthy();
    expect(po?.trip_on_time_probability_interval).toBeTruthy();
    expect(Number(po?.trip_on_time_probability)).toBeLessThan(Number(up?.trip_on_time_probability));
  });
});
