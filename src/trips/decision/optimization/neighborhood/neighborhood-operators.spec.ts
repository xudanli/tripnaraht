import { NeighborhoodOperators } from './neighborhood-operators';
import { PlanFeaturesService } from '../plan-features/plan-features.service';

describe('NeighborhoodOperators', () => {
  it('spreadAcrossDays should reduce maxSegmentsInADay for a peak-day plan', () => {
    const ops = new NeighborhoodOperators();
    const pf = new PlanFeaturesService();

    const basePlan: any = {
      tripId: 't',
      routeDirectionId: 'rd-1',
      segments: Array.from({ length: 6 }).map((_, i) => ({
        dayIndex: 0, // all in one day (peak)
        distanceKm: 5,
        ascentM: 100,
        segmentId: `s${i}`,
      })),
    };

    const spread = ops.spreadAcrossDays(basePlan, 3);
    const fBase = pf.extract(basePlan);
    const fSpread = pf.extract(spread.plan as any);

    expect(fBase.maxSegmentsInADay).toBeGreaterThan(fSpread.maxSegmentsInADay);
    expect(fBase.diversitySignature).not.toEqual(fSpread.diversitySignature);
  });

  it('ensureConnectivityBuffer should push later slots to satisfy travelDurationMinFromPrev', () => {
    const ops = new NeighborhoodOperators();

    const plan: any = {
      tripId: 't',
      routeDirectionId: 'rd-1',
      segments: [
        {
          dayIndex: 0,
          distanceKm: 1,
          ascentM: 0,
          slopePct: 0,
          segmentId: 's1',
          metadata: { poiId: 'poi-a', startTime: '09:00', endTime: '10:00' },
        },
        {
          dayIndex: 0,
          distanceKm: 1,
          ascentM: 0,
          slopePct: 0,
          segmentId: 's2',
          metadata: { poiId: 'poi-b', startTime: '10:05', endTime: '11:05', travelDurationMinFromPrev: 90 },
        },
      ],
    };

    const repaired = ops.ensureConnectivityBuffer(plan, 10).plan as any;
    const seg2 = repaired.segments.find((s: any) => (s.metadata?.poiId ?? '') === 'poi-b');
    expect(seg2).toBeTruthy();
    // Must start after prevEnd (10:00) + travel(90) + buffer(10) = 11:40
    expect(String(seg2.metadata.startTime)).toBe('11:40');
  });
});

