import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ItineraryDay } from '../interfaces/trip-plan.interface';
import {
  assessRobustnessRolloutEligibility,
  attachRobustnessDashboardToResponse,
  enrichTripPlanWithItineraryDurations,
  extractItineraryFromResponse,
  runRobustnessRolloutForItinerary,
  serializeRobustnessDashboard,
  tryBuildRobustnessDashboard,
} from './robustness-rollout-gateway.util';
import { itineraryToTripPlan } from '../../decision/kernel/dso-to-trips-converter';
import {
  isRobustnessRolloutEnabled,
  ROBUSTNESS_ROLLOUT_POLICY,
} from '../engine/execution-gateway.config';

function sampleResponse(days: ItineraryDay[]): RouteAndRunResponseDto {
  return {
    request_id: 'req-1',
    route: { route: 'SYSTEM2_ORCHESTRATION' },
    result: {
      status: 'OK',
      answer_text: '',
      payload: {
        timeline: days,
        robustness: null,
      },
    },
    explain: { decision_log: [] },
    observability: {
      latency_ms: 100,
      router_ms: 1,
      system_mode: 'SYSTEM2',
      tool_calls: 0,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0,
      fallback_used: false,
    },
  } as RouteAndRunResponseDto;
}

function sampleRequest(): RouteAndRunRequestDto {
  return {
    request_id: 'req-1',
    user_id: 'u1',
    trip_id: 'trip-1',
    message: 'plan iceland',
    options: {},
    party_profile: { fitness_level: 'low', risk_tolerance: 'LOW' },
  } as RouteAndRunRequestDto;
}

describe('robustness-rollout-gateway.util', () => {
  const originalEnabled = process.env.ROBUSTNESS_ROLLOUT_ENABLED;

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.ROBUSTNESS_ROLLOUT_ENABLED;
    } else {
      process.env.ROBUSTNESS_ROLLOUT_ENABLED = originalEnabled;
    }
  });

  it('extractItineraryFromResponse reads payload.timeline', () => {
    const days: ItineraryDay[] = [
      {
        date: '2026-09-01',
        items: [
          {
            id: 'n1',
            type: 'DRIVE',
            start_window: '09:00',
            end_window: '15:00',
            location_ref: { name: 'A' },
            evidence_refs: [],
            verified: true,
            verification_status: 'VERIFIED',
          },
        ],
      },
    ];
    const it = extractItineraryFromResponse(sampleResponse(days));
    expect(it?.days).toHaveLength(1);
  });

  it('assessRobustnessRolloutEligibility rejects dry_run', () => {
    const req = { ...sampleRequest(), options: { dry_run: true } };
    const res = sampleResponse([]);
    expect(assessRobustnessRolloutEligibility(req, res).reason).toBe('dry_run');
  });

  it('tryBuildRobustnessDashboard attaches dual scores for multi-day itinerary', () => {
    process.env.ROBUSTNESS_ROLLOUT_ENABLED = '1';
    process.env.ROBUSTNESS_ROLLOUT_SAMPLES = '12';

    const days: ItineraryDay[] = [
      {
        date: '2026-09-01',
        items: [
          {
            id: 'n1',
            type: 'DRIVE',
            start_window: '08:00',
            end_window: '14:00',
            location_ref: { name: 'Leg1', coordinates: { lat: 64, lng: -22 } },
            metadata: { duration_minutes: 360 },
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
            id: 'n2',
            type: 'POI',
            start_window: '10:00',
            end_window: '12:00',
            location_ref: { name: 'Sight', coordinates: { lat: 64.1, lng: -21.9 } },
            evidence_refs: [],
            verified: true,
            verification_status: 'VERIFIED',
          },
        ],
      },
    ];

    const dashboard = tryBuildRobustnessDashboard(sampleRequest(), sampleResponse(days));
    expect(dashboard).not.toBeNull();
    expect(dashboard!.physical_robustness_score).toBeGreaterThanOrEqual(0);
    expect(dashboard!.organizational_robustness_score).toBeGreaterThanOrEqual(0);
    expect(dashboard!.timeline.length).toBeGreaterThan(0);
    expect(dashboard!.schema).toBe('tripnara.robustness_dashboard@v1');
  });

  it('attachRobustnessDashboardToResponse writes observability and payload', () => {
    const days: ItineraryDay[] = [
      {
        date: '2026-09-01',
        items: [
          {
            id: 'n1',
            type: 'DRIVE',
            start_window: '08:00',
            end_window: '14:00',
            location_ref: { name: 'Leg1' },
            metadata: { duration_minutes: 300 },
            evidence_refs: [],
            verified: true,
            verification_status: 'VERIFIED',
          },
        ],
      },
    ];
    const itinerary = extractItineraryFromResponse(sampleResponse(days))!;
    const result = runRobustnessRolloutForItinerary({
      request: sampleRequest(),
      itinerary,
      sampleCount: 8,
    });
    expect(result).not.toBeNull();
    const dashboard = serializeRobustnessDashboard(result!, {
      partyId: 'trip-1',
      memberCount: 1,
      sampleCount: 8,
    });
    const res = attachRobustnessDashboardToResponse(sampleResponse(days), dashboard);
    expect((res.observability as { robustness_dashboard?: unknown }).robustness_dashboard).toBeDefined();
    expect(res.result?.payload?.robustness).toBe(dashboard.physical_robustness_score);
    const uiDisplay = (res.result?.payload as { ui_display?: { dual_track_itinerary?: { mode?: string } } })
      ?.ui_display;
    expect(uiDisplay?.dual_track_itinerary?.schema).toBe('tripnara.dual_track_itinerary@v1');
  });

  it('enrichTripPlanWithItineraryDurations injects travel legs', () => {
    const days: ItineraryDay[] = [
      {
        date: '2026-09-01',
        items: [
          {
            id: 'slot-a',
            type: 'DRIVE',
            start_window: '09:00',
            end_window: '12:00',
            location_ref: { name: 'X' },
            metadata: { duration_minutes: 180 },
            evidence_refs: [],
            verified: true,
            verification_status: 'VERIFIED',
          },
        ],
      },
    ];
    const plan = enrichTripPlanWithItineraryDurations(
      itineraryToTripPlan({ request_id: 'r', days }),
      { request_id: 'r', days },
    );
    expect(plan.days[0].timeSlots[0].travelLegFromPrev?.durationMin).toBe(180);
  });

  it('respects ROBUSTNESS_ROLLOUT_POLICY sample cap', () => {
    expect(ROBUSTNESS_ROLLOUT_POLICY.maxSampleCount).toBe(100);
    expect(ROBUSTNESS_ROLLOUT_POLICY.defaultPerturbations).toContain('SOCIAL');
    expect(isRobustnessRolloutEnabled()).toBe(true);
    process.env.ROBUSTNESS_ROLLOUT_ENABLED = '0';
    expect(isRobustnessRolloutEnabled()).toBe(false);
    delete process.env.ROBUSTNESS_ROLLOUT_ENABLED;
  });
});
