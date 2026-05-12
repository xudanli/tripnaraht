import { computePostponeTimelineFragility, reliabilityScoreFromMinBuffer } from './timeline-fragility.util';

describe('computePostponeTimelineFragility', () => {
  it('flags HIGH risk when a hard booking has <= HIGH_RISK slack after postpone (rolling delay)', async () => {
    const itinerary: any = {
      days: [
        {
          items: [
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
    const r = await computePostponeTimelineFragility({
      itinerary,
      postponeMinutes: 30,
      prefetchedEvidence: [],
    });
    expect(r).toBeTruthy();
    expect(r!.min_buffer_minutes).toBe(5);
    expect(r!.is_fragile).toBe(true);
    expect(r!.risk_level).toBe('HIGH');
  });

  it('returns null when no hard bookings', async () => {
    const r = await computePostponeTimelineFragility({
      itinerary: { days: [{ items: [{ id: 'x', status: 'PLANNED', start_time: '2026-01-01T10:00:00.000Z' }] }] } as any,
      postponeMinutes: 10,
      prefetchedEvidence: [],
    });
    expect(r).toBeNull();
  });

  it('reliabilityScoreFromMinBuffer maps slack with (min−5)/15 clamp', () => {
    expect(reliabilityScoreFromMinBuffer(5)).toBe(0);
    expect(reliabilityScoreFromMinBuffer(20)).toBe(1);
    expect(reliabilityScoreFromMinBuffer(12.5)).toBeCloseTo(0.5, 5);
  });
});
