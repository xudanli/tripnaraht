/**
 * Execution Gateway — Robustness Rollout enrichment (physical + organizational).
 */

import type { RouteAndRunRequestDto, RouteAndRunResponseDto, DecisionUiDisplayDto } from '../dto/route-and-run.dto';
import type { Itinerary, ItineraryDay, ItineraryItem, OrchestratorState } from '../interfaces/trip-plan.interface';
import { itineraryToTripPlan } from '../../decision/kernel/dso-to-trips-converter';
import { enrichClientUiDisplay } from './client-ui-enrichment.util';
import { buildExecutionOverlay } from '../../trips/execution-overlay/build-execution-overlay';
import { buildExecutionTruthDAG } from '../../trips/execution-truth-dag/build-execution-truth-dag';
import { compileDAGToIR } from '../../trips/execution-ir/compile-dag-to-ir';
import {
  executeRobustnessRollout,
  projectRobustnessPartyFromPersonas,
} from '../../trips/execution-simulation';
import type {
  RobustnessBottleneck,
  RobustnessRolloutResult,
  RolloutTimelineNode,
} from '../../trips/execution-simulation/robustness-rollout.types';
import type { RobustnessPartyContext } from '../../trips/multiverse/travel-latent-state.types';
import { projectPartyPersonasFromTripRequest } from '../../trips/decision/persona/project-party-from-request.util';
import { resolveRobustnessPartyFromRouteAndRunRequest } from '../../trips/execution-simulation/planning-party-robustness.util';
import type { TripPlan, PlanSlot } from '../../trips/decision/plan-model';
import {
  isRobustnessRolloutEnabled,
  ROBUSTNESS_ROLLOUT_POLICY,
  robustnessRolloutDefaultSampleCount,
} from '../engine/execution-gateway.config';

export interface RobustnessDashboardPayload {
  schema: 'tripnara.robustness_dashboard@v1';
  physical_robustness_score: number;
  organizational_robustness_score: number;
  /** Combined conservative score for legacy `payload.robustness` */
  combined_robustness_score: number;
  sample_count: number;
  bottlenecks: RobustnessBottleneck[];
  timeline: RolloutTimelineNode[];
  contingency_plans: Array<{
    trigger_node_id: string;
    condition: string;
    mutated_ir_step_delta: number;
  }>;
  party_id: string;
  member_count: number;
  computed_at: string;
}

export interface RobustnessRolloutEligibility {
  eligible: boolean;
  reason?: string;
}

/** Map RouteAndRunRequestDto party fields → TripPlanRequest pick for persona projection. */
export function partyPersonaInputFromRouteAndRunRequest(
  request: RouteAndRunRequestDto,
): Pick<
  import('../interfaces/trip-plan.interface').TripPlanRequest,
  'party' | 'party_profile' | 'party_mobility_note_zh'
> {
  const pp = request.party_profile;
  const fitness = pp?.fitness_level ?? request.fitness_level;
  const partyTotal = pp?.party_total;
  return {
    party: partyTotal
      ? {
          count: partyTotal,
          has_children: pp?.has_children,
          has_elderly: pp?.has_elderly,
          fitness_level: fitness,
        }
      : undefined,
    party_profile: pp?.risk_tolerance || fitness
      ? {
          risk_tolerance: pp?.risk_tolerance,
          fitness,
        }
      : undefined,
    party_mobility_note_zh: pp?.mobility_note_zh,
  };
}

export function assessRobustnessRolloutEligibility(
  request: RouteAndRunRequestDto,
  response: RouteAndRunResponseDto,
): RobustnessRolloutEligibility {
  if (!isRobustnessRolloutEnabled()) {
    return { eligible: false, reason: 'policy_disabled' };
  }
  if (request.options?.dry_run) {
    return { eligible: false, reason: 'dry_run' };
  }
  const status = response.result?.status;
  if (status !== 'OK') {
    return { eligible: false, reason: `status_${status ?? 'unknown'}` };
  }
  const modeFinal = (response.observability as { mode_final?: string } | undefined)?.mode_final;
  if (modeFinal === 'DEDUP') {
    return { eligible: false, reason: 'dedup_replay' };
  }
  const itinerary = extractItineraryFromResponse(response);
  if (!itinerary?.days?.length) {
    return { eligible: false, reason: 'no_itinerary_timeline' };
  }
  const itemCount = itinerary.days.reduce((n, d) => n + (d.items?.length ?? 0), 0);
  if (itemCount < ROBUSTNESS_ROLLOUT_POLICY.minItineraryItems) {
    return { eligible: false, reason: 'insufficient_items' };
  }
  return { eligible: true };
}

export function extractItineraryFromResponse(response: RouteAndRunResponseDto): Itinerary | null {
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  if (!payload) return null;

  const timeline = payload.timeline as ItineraryDay[] | undefined;
  if (timeline?.length) {
    const orch = payload.orchestrationResult as { itinerary?: Itinerary } | undefined;
    const requestId =
      (orch?.itinerary?.request_id as string | undefined) ??
      (response.observability?.orchestration_request_id as string | undefined) ??
      'route-and-run';
    return {
      request_id: requestId,
      days: timeline,
      metadata: orch?.itinerary?.metadata,
    };
  }

  const orchItinerary = (payload.orchestrationResult as { itinerary?: Itinerary } | undefined)
    ?.itinerary;
  if (orchItinerary?.days?.length) {
    return orchItinerary;
  }
  return null;
}

function durationMinutesFromItem(item: ItineraryItem): number | undefined {
  const meta = item.metadata?.duration_minutes;
  if (typeof meta === 'number' && meta > 0) return meta;
  const start = String((item as { start_window?: string }).start_window ?? '');
  const end = String((item as { end_window?: string }).end_window ?? '');
  const sm = start.match(/T(\d{2}):(\d{2})|(\d{1,2}):(\d{2})/);
  const em = end.match(/T(\d{2}):(\d{2})|(\d{1,2}):(\d{2})/);
  if (sm && em) {
    const sh = Number(sm[1] ?? sm[3]);
    const smin = Number(sm[2] ?? sm[4]);
    const eh = Number(em[1] ?? em[3]);
    const emin = Number(em[2] ?? em[4]);
    const delta = eh * 60 + emin - (sh * 60 + smin);
    if (delta > 0) return delta;
  }
  return undefined;
}

/** Enrich TripPlan slots with travel legs derived from itinerary item windows / metadata. */
export function enrichTripPlanWithItineraryDurations(
  plan: TripPlan,
  itinerary: Itinerary,
): TripPlan {
  const itemBySlotId = new Map<string, ItineraryItem>();
  for (const day of itinerary.days ?? []) {
    for (const item of day.items ?? []) {
      if (item.id) itemBySlotId.set(item.id, item);
    }
  }

  const days = plan.days.map(day => ({
    ...day,
    timeSlots: day.timeSlots.map((slot: PlanSlot) => {
      const item = itemBySlotId.get(slot.id);
      if (!item) return slot;
      const durationMin = durationMinutesFromItem(item);
      if (!durationMin) return slot;
      const coords = item.location_ref?.coordinates;
      return {
        ...slot,
        travelLegFromPrev: {
          mode: 'drive' as const,
          from: coords ?? { lat: 0, lng: 0 },
          to: coords ?? { lat: 0, lng: 0 },
          durationMin,
        },
      };
    }),
  }));

  return { ...plan, days };
}

export function runRobustnessRolloutForItinerary(input: {
  request: RouteAndRunRequestDto;
  itinerary: Itinerary;
  sampleCount?: number;
  partyOverride?: RobustnessPartyContext;
}): RobustnessRolloutResult | null {
  const tripPlan = enrichTripPlanWithItineraryDurations(
    itineraryToTripPlan(input.itinerary),
    input.itinerary,
  );
  if (!tripPlan.days.length) return null;

  const frames = buildExecutionOverlay({ plan: tripPlan, weatherByDate: {} });
  const dag = buildExecutionTruthDAG({ plan: tripPlan, overlayFrames: frames });
  const ir = compileDAGToIR(dag);

  const party =
    input.partyOverride ??
    resolveRobustnessPartyFromRouteAndRunRequest(input.request) ??
    projectRobustnessPartyFromPersonas(
      projectPartyPersonasFromTripRequest(partyPersonaInputFromRouteAndRunRequest(input.request)),
      input.request.trip_id?.trim() || input.request.request_id,
    );

  const sampleCount = Math.min(
    ROBUSTNESS_ROLLOUT_POLICY.maxSampleCount,
    Math.max(1, input.sampleCount ?? robustnessRolloutDefaultSampleCount()),
  );

  return executeRobustnessRollout(
    {
      baseIR: ir,
      party,
      simulationConfig: {
        sampleCount,
        enabledPerturbations: [...ROBUSTNESS_ROLLOUT_POLICY.defaultPerturbations],
        organizationalStressThreshold: ROBUSTNESS_ROLLOUT_POLICY.organizationalStressThreshold,
      },
    },
    { witnessDag: dag, mode: 'SIMULATION' },
  );
}

export function serializeRobustnessDashboard(
  result: RobustnessRolloutResult,
  meta: { partyId: string; memberCount: number; sampleCount: number },
): RobustnessDashboardPayload {
  const combined = Math.min(result.physicalRobustnessScore, result.organizationalRobustnessScore);
  return {
    schema: 'tripnara.robustness_dashboard@v1',
    physical_robustness_score: result.physicalRobustnessScore,
    organizational_robustness_score: result.organizationalRobustnessScore,
    combined_robustness_score: combined,
    sample_count: meta.sampleCount,
    bottlenecks: result.bottlenecks,
    timeline: result.timeline,
    contingency_plans: result.contingencyPlans.map(c => ({
      trigger_node_id: c.triggerNodeId,
      condition: c.condition,
      mutated_ir_step_delta: c.mutatedIR.steps.length,
    })),
    party_id: meta.partyId,
    member_count: meta.memberCount,
    computed_at: new Date().toISOString(),
  };
}

export function tryBuildRobustnessDashboard(
  request: RouteAndRunRequestDto,
  response: RouteAndRunResponseDto,
): RobustnessDashboardPayload | null {
  const eligibility = assessRobustnessRolloutEligibility(request, response);
  if (!eligibility.eligible) return null;

  const itinerary = extractItineraryFromResponse(response);
  if (!itinerary) return null;

  const result = runRobustnessRolloutForItinerary({ request, itinerary });
  if (!result) return null;

  const personas = request.options?.party_negotiation_member_profiles?.length
    ? request.options.party_negotiation_member_profiles
    : projectPartyPersonasFromTripRequest(partyPersonaInputFromRouteAndRunRequest(request));

  return serializeRobustnessDashboard(result, {
    partyId: request.trip_id?.trim() || request.request_id,
    memberCount: Array.isArray(request.options?.party_negotiation_member_profiles)
      ? request.options.party_negotiation_member_profiles.length
      : Array.isArray(personas)
        ? personas.length
        : 1,
    sampleCount: result.sampleSummaries.length,
  });
}

export function attachRobustnessDashboardToResponse(
  response: RouteAndRunResponseDto,
  dashboard: RobustnessDashboardPayload,
): RouteAndRunResponseDto {
  const obs = (response.observability ?? {}) as Record<string, unknown>;
  obs.robustness_dashboard = dashboard;

  const result = response.result;
  if (result?.payload) {
    const payload = result.payload as Record<string, unknown>;
    payload.robustness_dashboard = dashboard;
    payload.robustness = dashboard.physical_robustness_score;

    const orch = payload.orchestrationResult as { itinerary?: Itinerary } | undefined;
    if (orch?.itinerary) {
      const days = orch.itinerary.days?.length ?? 0;
      orch.itinerary = {
        ...orch.itinerary,
        metadata: {
          ...orch.itinerary.metadata,
          total_days: orch.itinerary.metadata?.total_days ?? days,
          robustness_score: dashboard.combined_robustness_score,
        },
      };
    }

    const existingUi = (payload.ui_display as DecisionUiDisplayDto | undefined) ?? {};
    const orchState = (payload.orchestrationResult as { state?: OrchestratorState } | undefined)?.state;
    payload.ui_display = enrichClientUiDisplay({
      existingUiDisplay: existingUi,
      state: orchState,
      itinerary: extractItineraryFromResponse(response),
      robustnessDashboard: dashboard,
      resultOk: true,
    });
  }

  response.observability = obs as RouteAndRunResponseDto['observability'];
  return response;
}
