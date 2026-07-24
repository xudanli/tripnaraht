import type { ItineraryDay } from '../interfaces/trip-plan.interface';
import { enrichClientUiDisplay } from './client-ui-enrichment.util';
import { buildDualTrackItineraryUi, buildAxisASegmentsFromItinerary } from './dual-track-itinerary-ui.util';
import { buildDeliveryArtifactsUi, buildGoogleMapsDirectionsUrl } from './delivery-artifacts-ui.util';
import type { RobustnessDashboardPayload } from './robustness-rollout-gateway.util';
import { DUAL_TRACK_ITINERARY_SCHEMA } from './dual-track-itinerary-ui.util';
import { DELIVERY_ARTIFACTS_SCHEMA } from './delivery-artifacts-ui.util';
import { POI_PITFALL_SCHEMA } from './poi-pitfall-insight.util';
import { BOOKING_CART_SCHEMA } from './booking-cart-ui.util';

const sampleDays: ItineraryDay[] = [
  {
    date: '2026-09-01',
    items: [
      {
        id: 'poi-1',
        type: 'ACTIVITY',
        location_ref: { name: '雷克雅未克', coordinates: { lat: 64.1466, lng: -21.9426 } },
        evidence_refs: [],
        verified: true,
        verification_status: 'VERIFIED',
      },
    ],
  },
  {
    date: '2026-09-02',
    items: [
      {
        id: 'poi-2',
        type: 'ACTIVITY',
        location_ref: { name: '冰川徒步', coordinates: { lat: 63.983, lng: -19.085 } },
        evidence_refs: [],
        verified: true,
        verification_status: 'VERIFIED',
      },
    ],
  },
];

describe('dual-track-itinerary-ui.util', () => {
  it('buildAxisASegmentsFromItinerary 按天生成 A 轴段', () => {
    const segs = buildAxisASegmentsFromItinerary({ request_id: 'r1', days: sampleDays });
    expect(segs).toHaveLength(2);
    expect(segs[0].segment_id).toBe('seg_day_1');
    expect(segs[0].label_zh).toContain('雷克雅未克');
    expect(segs[1].label_zh).toContain('冰川徒步');
  });

  it('buildDualTrackItineraryUi 合并 contingency_branches 为 B 轴', () => {
    const ui = buildDualTrackItineraryUi({
      itinerary: { request_id: 'r1', days: sampleDays },
      planningPhaseIntent: {
        sub_signals: {
          scenario_planning_requested: true,
          supply_chain_verification_requested: false,
          party_negotiation_requested: false,
          spatial_intent_capture_requested: false,
        },
        contingency_branches: [
          {
            trigger_condition: "segment_health:seg_day_2 === 'CRITICAL_DISRUPTION'",
            impacted_segment_ids: ['seg_day_2'],
            alternative_route_token: 'alt_glacier_indoor',
            expected_utility_ratio: 0.82,
          },
        ],
      },
    });

    expect(ui.schema).toBe(DUAL_TRACK_ITINERARY_SCHEMA);
    expect(ui.mode).toBe('dual_track');
    expect(ui.axis_a_segments).toHaveLength(2);
    expect(ui.axis_b_branches).toHaveLength(1);
    expect(ui.axis_b_branches[0].trigger_kind).toBe('GENERIC_DISRUPTION');
    expect(ui.axis_b_branches[0].expected_utility_ratio).toBe(0.82);
    expect(ui.headline_zh).toContain('双轨');
  });

  it('buildDualTrackItineraryUi 合并 robustness_dashboard contingency_plans', () => {
    const dashboard: RobustnessDashboardPayload = {
      schema: 'tripnara.robustness_dashboard@v1',
      physical_robustness_score: 0.7,
      organizational_robustness_score: 0.8,
      combined_robustness_score: 0.7,
      sample_count: 4,
      bottlenecks: [
        {
          nodeId: 'n1',
          primaryRisk: 'PHYSICAL_BLOCK',
          triggerEvent: 'weather_closure',
          description: 'Day 2 户外段在暴雨扰动下易超时',
        },
      ],
      timeline: [],
      contingency_plans: [
        {
          trigger_node_id: 'n1',
          condition: 'physical_block @ weather_closure',
          mutated_ir_step_delta: 2,
        },
      ],
      party_id: 'p1',
      member_count: 2,
      computed_at: new Date().toISOString(),
    };

    const ui = buildDualTrackItineraryUi({
      itinerary: { request_id: 'r1', days: sampleDays },
      robustnessDashboard: dashboard,
    });

    expect(ui.mode).toBe('dual_track');
    expect(ui.axis_b_branches.some((b) => b.branch_id.startsWith('plan_b_rollout'))).toBe(true);
    expect(ui.axis_b_branches[0].summary_zh).toContain('暴雨');
  });
});

describe('delivery-artifacts-ui.util', () => {
  it('buildGoogleMapsDirectionsUrl 生成多点动线链接', () => {
    const url = buildGoogleMapsDirectionsUrl([
      { lat: 64.1466, lng: -21.9426 },
      { lat: 63.983, lng: -19.085 },
    ]);
    expect(url).toContain('google.com/maps/dir');
    expect(url).toContain('64.1466');
  });

  it('buildDeliveryArtifactsUi 在 OK 行程下输出日历/地图/分享链接', () => {
    const artifacts = buildDeliveryArtifactsUi({
      itinerary: { request_id: 'r1', days: sampleDays },
      tripId: 'trip-abc',
      userId: 'user-1',
      include: true,
    });

    expect(artifacts?.schema).toBe(DELIVERY_ARTIFACTS_SCHEMA);
    expect(artifacts?.trip_id).toBe('trip-abc');
    expect(artifacts?.links.some((l) => l.kind === 'map')).toBe(true);
    expect(artifacts?.links.some((l) => l.kind === 'calendar')).toBe(true);
    expect(artifacts?.links.some((l) => l.kind === 'share')).toBe(true);
    expect(artifacts?.map_polyline_url).toBeDefined();
  });
});

describe('client-ui-enrichment.util', () => {
  it('enrichClientUiDisplay 合并 evidence_cards_ui 与双轨/交付块', () => {
    const out = enrichClientUiDisplay({
      existingUiDisplay: { evidence_cards_ui: [] },
      state: {
        metadata: {
          planning_phase_intent: {
            sub_signals: {
              scenario_planning_requested: true,
              supply_chain_verification_requested: false,
              party_negotiation_requested: false,
              spatial_intent_capture_requested: false,
            },
            contingency_branches: [
              {
                trigger_condition: "segment_health:seg_day_2 === 'CRITICAL_DISRUPTION'",
                impacted_segment_ids: ['seg_day_2'],
                alternative_route_token: 'alt_indoor',
                expected_utility_ratio: 0.85,
              },
            ],
          },
        },
      } as any,
      itinerary: { request_id: 'r1', days: sampleDays },
      request: { trip_id: 'trip-1', user_id: 'u1' } as any,
      resultOk: true,
    });

    expect(out.evidence_cards_ui).toEqual([]);
    expect(out.dual_track_itinerary?.mode).toBe('dual_track');
    expect(out.delivery_artifacts?.links.length).toBeGreaterThan(0);
  });

  it('enrichClientUiDisplay 投影 poi_pitfall_cards 与 booking_cart', () => {
    const museumDay: ItineraryDay = {
      date: '2026-09-01',
      items: [
        {
          id: 'm1',
          type: 'POI',
          location_ref: { name: '东京国立博物馆' },
          evidence_refs: [],
          verified: true,
          verification_status: 'VERIFIED',
        },
      ],
    };

    const out = enrichClientUiDisplay({
      itinerary: { request_id: 'r1', days: [museumDay] },
      request: { trip_id: 'trip-1' } as any,
      resultOk: true,
      state: {
        trip_plan_request: {
          constraints: { budget: { total: 20000, currency: 'CNY' } },
        },
      } as any,
      bookingPayload: {
        car_rentals: [{ id: 'c1', vehicle_name: 'Economy', price_total: '¥3000' }],
      },
    });

    expect(out.poi_pitfall_cards?.length).toBeGreaterThan(0);
    expect(out.poi_pitfall_cards?.[0].schema).toBe(POI_PITFALL_SCHEMA);
    expect(out.booking_cart?.schema).toBe(BOOKING_CART_SCHEMA);
    expect(out.booking_cart?.items.some((i) => i.kind === 'car_rental')).toBe(true);
    expect(out.booking_cart?.cart_state).toBe('optimized');
    expect(out.booking_cart?.selection?.within_budget).toBe(true);
  });

  it('enrichClientUiDisplay 投影 emotional_context 至 ui_display', () => {
    const out = enrichClientUiDisplay({
      state: {
        emotional_context: {
          schemaVersion: 'tripnara.emotional_context@v1',
          userId: 'u1',
          tripId: 't1',
          fatigueIndex: 0.5,
          anxietyLevel: 0.55,
          anxietyTriggered: true,
          ambienceSignals: {
            isGoldenHour: false,
            isRomancePacingActive: false,
            weatherWindLockActive: true,
          },
          sharedMilestones: [],
          recommendedVoiceStance: {
            toneModifier: 'professional_authoritative',
            audioProsodyPreference: { pitch: 'low', speedFactor: 0.9 },
          },
          proactivityGate: 'ACTIVE',
        },
      } as any,
    });

    expect(out.emotional_context?.schemaVersion).toBe('tripnara.emotional_context.client@v1');
    expect(out.emotional_context?.proactivityGate).toBe('ACTIVE');
    expect(out.emotional_context?.voiceToneModifier).toBe('professional_authoritative');
  });
});
