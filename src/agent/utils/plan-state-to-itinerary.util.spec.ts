import { planStateToItinerary } from './plan-state-to-itinerary.util';
import type { PlanContext, PlanState } from '../../skills/plan/shared/plan-state.types';

describe('planStateToItinerary', () => {
  const context: PlanContext = {
    destination: { country: 'Iceland' },
    days: 1,
  };

  it('maps segment attractions to POI items', () => {
    const planState: PlanState = {
      plan_id: 'plan_test',
      plan_version: 1,
      constraints: {
        time: { days: 1, startDate: '2026-08-01' },
        budget: {},
        fitness: {},
      },
      itinerary: {
        tripId: 'trip_1',
        routeDirectionId: 'rd_1',
        segments: [
          {
            segmentId: 'day_1_segment_1',
            dayIndex: 0,
            distanceKm: 0,
            ascentM: 0,
            slopePct: 0,
            metadata: {
              day: 1,
              theme: 'Golden Circle',
              attractions: [{ name: 'Gullfoss' }, { nameCN: '辛格维利尔' }],
            },
          },
        ],
      },
      mobility: { transferSegments: [] },
      budget: {},
      pace: {},
      gate: { status: 'NEED_CONFIRM', reasons: [], missingEvidence: [] },
      evidence_refs: [],
      decision_log_refs: [],
      status: 'DRAFT',
    };

    const itinerary = planStateToItinerary({ planState, context });
    expect(itinerary.days).toHaveLength(1);
    expect(itinerary.days[0]?.date).toBe('2026-08-01');
    expect(itinerary.days[0]?.items.length).toBeGreaterThanOrEqual(2);
    expect(itinerary.days[0]?.items.some((i) => i.location_ref.name === 'Gullfoss')).toBe(true);
  });
});
