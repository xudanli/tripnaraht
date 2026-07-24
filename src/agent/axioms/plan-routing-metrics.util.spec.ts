import {
  computePlanRoutingMetricsFromItinerary,
  extractPlanRoutingMetrics,
  isPlanRoutingFatigueOverloaded,
  syncPlanRoutingMetricsToTripPlan,
  SINGLE_DAY_DRIVING_LIMIT_MINUTES,
} from './plan-routing-metrics.util';
import { applyPostRepairRoutingMetricsSync } from './post-repair-routing-sync.util';
import { buildAxiomMatchContext } from './build-axiom-match-context.util';
import { matchAxioms } from './axiom-matchers';
import type { Itinerary, TripPlanRequest } from '../interfaces/trip-plan.interface';

describe('plan-routing-metrics.util', () => {
  const itinerary: Itinerary = {
    request_id: 'r1',
    days: [
      {
        day_index: 1,
        items: [
          {
            id: 'd1',
            type: 'DRIVE',
            start_window: '08:00',
            end_window: '18:00',
            location_ref: { name: 'A' },
            evidence_refs: [],
            verified: false,
            metadata: { duration_minutes: 510 },
          },
        ],
      },
      {
        day_index: 2,
        items: [
          {
            id: 'd2',
            type: 'DRIVE',
            start_window: '09:00',
            end_window: '12:00',
            location_ref: { name: 'B' },
            evidence_refs: [],
            verified: false,
            metadata: { duration_minutes: 120 },
          },
        ],
      },
    ],
  };

  it('computePlanRoutingMetricsFromItinerary sums DRIVE minutes per day', () => {
    const m = computePlanRoutingMetricsFromItinerary(itinerary);
    expect(m?.pure_driving_minutes).toBe(630);
    expect(m?.max_single_day_driving_minutes).toBe(510);
    expect(isPlanRoutingFatigueOverloaded(m)).toBe(true);
  });

  it('syncPlanRoutingMetricsToTripPlan writes plan_output and routing_metrics', () => {
    const trip = syncPlanRoutingMetricsToTripPlan({ request_id: 'r1' } as TripPlanRequest, itinerary);
    expect(trip.plan_output?.route_summary.pure_driving_minutes).toBe(630);
    expect(trip.routing_metrics?.max_single_day_driving_minutes).toBe(510);
    const again = extractPlanRoutingMetrics(trip);
    expect(again?.source).toBe('trip.routing_metrics');
    expect(again?.max_single_day_driving_minutes).toBe(510);
  });

  it('post-repair sync refreshes metrics and clears FATIGUE_OVERLOAD when driving drops', () => {
    const before: Itinerary = {
      request_id: 'r-repair',
      days: [
        {
          day_index: 1,
          items: [
            {
              id: 'd1',
              type: 'DRIVE',
              start_window: '08:00',
              end_window: '18:00',
              location_ref: { name: 'A' },
              evidence_refs: [],
              verified: false,
              metadata: { duration_minutes: 510 },
            },
          ],
        },
      ],
    };
    const afterRepair: Itinerary = {
      request_id: 'r-repair',
      days: [
        {
          day_index: 1,
          items: [
            {
              id: 'd1',
              type: 'DRIVE',
              start_window: '08:00',
              end_window: '14:00',
              location_ref: { name: 'A' },
              evidence_refs: [],
              verified: false,
              metadata: { duration_minutes: 360 },
            },
          ],
        },
      ],
    };
    let trip = syncPlanRoutingMetricsToTripPlan({ request_id: 'r-repair' } as TripPlanRequest, before);
    expect(
      matchAxioms(buildAxiomMatchContext({ trip, itinerary: before })).some(
        (m) => m.axiom_id === 'FATIGUE_OVERLOAD',
      ),
    ).toBe(true);

    const meta: Record<string, unknown> = {};
    const post = applyPostRepairRoutingMetricsSync({
      trip,
      itinerary: afterRepair,
      metadata: meta,
    });
    trip = post.trip;
    expect(post.postRepairDominantAxiomCid).toBe('NONE');
    expect(meta.post_repair_max_single_day_driving_minutes).toBe(360);
    expect(
      matchAxioms(buildAxiomMatchContext({ trip, itinerary: afterRepair })).some(
        (m) => m.axiom_id === 'FATIGUE_OVERLOAD',
      ),
    ).toBe(false);
  });

  it('fatigue axiom uses CLARIFICATION with 8.5h actual from PLAN_GEN metrics', () => {
    const trip = syncPlanRoutingMetricsToTripPlan(
      { request_id: 'r1', message: '环岛' } as TripPlanRequest,
      itinerary,
    );
    const fatigue = matchAxioms(
      buildAxiomMatchContext({ trip, itinerary }),
    ).find((m) => m.axiom_id === 'FATIGUE_OVERLOAD');
    expect(fatigue?.evidence.match_source).toBe('CLARIFICATION');
    expect(fatigue?.evidence.metric_details?.actual).toBe(8.5);
    expect(fatigue?.evidence.metric_details?.limit).toBe(SINGLE_DAY_DRIVING_LIMIT_MINUTES / 60);
    expect(fatigue?.evidence.proof_payload?.trigger_reason).toBe('PLAN_GEN_REAL_METRIC_OVERLOAD');
  });
});
