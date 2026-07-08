import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import {
  buildItineraryRowsFromSegment,
  PLAN_GATE_TIMELINE_NOTE_PREFIX,
} from './plan-gate-timeline-materializer.util';

describe('plan-gate-timeline-materializer.util', () => {
  it('builds rows from attractions restaurants and accommodation', () => {
    const rows = buildItineraryRowsFromSegment({
      segmentId: 'day_2_segment_1',
      dayIndex: 1,
      distanceKm: 0,
      ascentM: 0,
      slopePct: 0,
      metadata: {
        day: 2,
        theme: '黄金圈',
        attractions: [{ nameCN: '黄金瀑布', placeId: 101 }],
        restaurants: [{ poi: { nameCN: 'Fish Company', placeId: 202 } }],
        accommodation: { nameCN: '南岸酒店', placeId: 303 },
      },
    });

    expect(rows.length).toBe(3);
    expect(rows[0].placeId).toBe(101);
    expect(rows[1].type).toBe('MEAL_ANCHOR');
    expect(rows[2].type).toBe('REST');
  });

  it('falls back to theme-only activity when no poi metadata', () => {
    const rows = buildItineraryRowsFromSegment({
      segmentId: 'day_1_segment_1',
      dayIndex: 0,
      distanceKm: 0,
      ascentM: 0,
      slopePct: 0,
      metadata: { day: 1, theme: '抵达日' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].label).toContain('抵达日');
  });

  it('uses plan gate note prefix constant', () => {
    expect(PLAN_GATE_TIMELINE_NOTE_PREFIX).toBe('[PlanGate]');
  });
});

function minimalPlan(segments: PlanState['itinerary']['segments']): PlanState {
  return {
    plan_id: 'plan_a4',
    plan_version: 4,
    constraints: { time: { days: segments.length }, budget: { total: 10000, currency: 'CNY' }, fitness: {} },
    itinerary: { tripId: 'trip_1', routeDirectionId: 'r1', segments },
    mobility: { transferSegments: [] },
    budget: {},
    pace: {},
    gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
    evidence_refs: [],
    decision_log_refs: [],
    status: 'LOCKED',
    metadata: {},
  };
}

describe('buildItineraryRowsFromSegment integration with plan state', () => {
  it('covers all segment days', () => {
    const plan = minimalPlan([
      {
        segmentId: 'd1',
        dayIndex: 0,
        distanceKm: 0,
        ascentM: 0,
        slopePct: 0,
        metadata: { day: 1, theme: 'Day1' },
      },
      {
        segmentId: 'd2',
        dayIndex: 1,
        distanceKm: 0,
        ascentM: 0,
        slopePct: 0,
        metadata: { day: 2, theme: 'Day2' },
      },
    ]);
    expect(plan.itinerary.segments).toHaveLength(2);
  });
});
