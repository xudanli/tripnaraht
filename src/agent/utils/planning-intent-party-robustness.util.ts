/**
 * D3 × Robustness Rollout — INTAKE 阶段多人 profile 注入与组织鲁棒性预演。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { Itinerary, ItineraryDay, ItineraryItem } from '../interfaces/trip-plan.interface';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type {
  OrganizationalRobustnessPreview,
  PartyMemberProfile,
  PartyNegotiationPayload,
} from './planning-intent-processor.util';
import type { TripDaySnapshotForPlacement } from './route-and-run-intent-analyzer.util';
import { itineraryToTripPlan } from '../../decision/kernel/dso-to-trips-converter';
import { projectRobustnessPartyFromNegotiationProfiles } from '../../trips/execution-simulation/planning-party-robustness.util';
import { runRobustnessRolloutForItinerary } from './robustness-rollout-gateway.util';

const INTAKE_PREVIEW_SAMPLES = 15;

function paceToFitnessLevel(pace: PartyNegotiationPayload['aggregated_pace']): 'low' | 'medium' | 'high' {
  if (pace === 'intensive') return 'high';
  if (pace === 'relaxed') return 'low';
  return 'medium';
}

function formatEndWindow(startHour: number, durationMinutes: number): string {
  const total = startHour * 60 + durationMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildStubItemsForDay(snap: TripDaySnapshotForPlacement): ItineraryItem[] {
  const items: ItineraryItem[] = [];
  const driveMinutes = Math.min(480, Math.max(90, snap.itemCount * 75));

  items.push({
    id: `stub_day_${snap.dayNumber}_drive`,
    type: 'DRIVE',
    start_window: '08:00',
    end_window: formatEndWindow(8, driveMinutes),
    location_ref: { name: snap.city ?? `Day ${snap.dayNumber}` },
    metadata: { duration_minutes: driveMinutes },
    evidence_refs: [],
    verified: false,
    verification_status: 'ASSUMPTION',
  });

  for (let i = 1; i < snap.itemCount; i++) {
    items.push({
      id: `stub_day_${snap.dayNumber}_act_${i}`,
      type: 'POI',
      start_window: formatEndWindow(8, driveMinutes + (i - 1) * 60),
      end_window: formatEndWindow(8, driveMinutes + i * 60),
      location_ref: { name: `Activity ${i}` },
      metadata: { duration_minutes: 60 },
      evidence_refs: [],
      verified: false,
      verification_status: 'ASSUMPTION',
    });
  }

  return items;
}

export function buildStubItineraryFromTripDaySnapshots(
  snapshots: TripDaySnapshotForPlacement[],
  requestId: string,
): Itinerary | null {
  if (!snapshots.length) return null;
  const days: ItineraryDay[] = snapshots.map(snap => ({
    date: snap.dateYmd,
    items: buildStubItemsForDay(snap),
  }));
  return { request_id: requestId, days };
}

export function applyPartyNegotiationToTripPlanRequest(
  trip: TripPlanRequest,
  partyNeg: PartyNegotiationPayload,
): void {
  const fitness = paceToFitnessLevel(partyNeg.aggregated_pace);
  trip.party = {
    ...trip.party,
    count: partyNeg.party_size,
    fitness_level: fitness,
    has_elderly: partyNeg.member_profiles.some(p => p.pace === 'relaxed' && p.risk_tolerance === 'LOW'),
  };
  trip.party_profile = {
    ...trip.party_profile,
    fitness,
    risk_tolerance: partyNeg.aggregated_risk_tolerance,
  };

  const meta = (trip as TripPlanRequest & { metadata?: Record<string, unknown> }).metadata ?? {};
  meta.party_member_profiles = partyNeg.member_profiles;
  meta.branch_policies = partyNeg.branch_policies;
  (trip as TripPlanRequest & { metadata?: Record<string, unknown> }).metadata = meta;
}

export function injectPartyNegotiationIntoRouteAndRunRequest(
  request: RouteAndRunRequestDto,
  partyNeg: PartyNegotiationPayload,
): void {
  const fitness = paceToFitnessLevel(partyNeg.aggregated_pace);
  request.party_profile = {
    ...request.party_profile,
    fitness_level: fitness,
    risk_tolerance: partyNeg.aggregated_risk_tolerance,
    party_total: partyNeg.party_size,
  };
  request.fitness_level = fitness;
  request.options = {
    ...request.options,
    party_negotiation_member_profiles: partyNeg.member_profiles,
  };
}

export function tryComputeOrganizationalRobustnessPreview(params: {
  tripDaySnapshots?: TripDaySnapshotForPlacement[];
  partyNegotiation: PartyNegotiationPayload;
  requestId: string;
  sampleCount?: number;
}): OrganizationalRobustnessPreview | null {
  const snapshots = params.tripDaySnapshots ?? [];
  if (snapshots.length < 1) return null;
  if (params.partyNegotiation.party_size < 2) return null;

  const itinerary = buildStubItineraryFromTripDaySnapshots(snapshots, params.requestId);
  if (!itinerary) return null;

  const party = projectRobustnessPartyFromNegotiationProfiles(
    params.partyNegotiation.member_profiles,
    params.requestId,
    params.partyNegotiation.regret_upper_bound,
  );

  const result = runRobustnessRolloutForItinerary({
    request: {
      request_id: params.requestId,
      trip_id: params.requestId,
      options: {},
    } as RouteAndRunRequestDto,
    itinerary,
    sampleCount: params.sampleCount ?? INTAKE_PREVIEW_SAMPLES,
    partyOverride: party,
  });
  if (!result) return null;

  const peakNode = result.timeline.reduce(
    (best, node) => (node.socialStressIndex > (best?.socialStressIndex ?? -1) ? node : best),
    result.timeline[0],
  );

  return {
    organizational_robustness_score: result.organizationalRobustnessScore,
    physical_robustness_score: result.physicalRobustnessScore,
    combined_robustness_score: Math.min(
      result.physicalRobustnessScore,
      result.organizationalRobustnessScore,
    ),
    sample_count: result.sampleSummaries.length,
    peak_social_stress_node_id: peakNode?.nodeId,
    peak_social_stress_index: peakNode?.socialStressIndex,
    peak_social_stress_day: peakNode?.timestamp,
    bottlenecks: result.bottlenecks.slice(0, 3),
    timeline: result.timeline,
    is_preview: true,
    source: 'intake_stub_itinerary',
  };
}

export function formatOrganizationalRobustnessPreviewZh(
  preview: OrganizationalRobustnessPreview,
): string {
  const orgPct = Math.round(preview.organizational_robustness_score * 100);
  const peak = preview.peak_social_stress_index != null
    ? Math.round(preview.peak_social_stress_index * 100)
    : null;
  let line = `搭子组织力预演 ${orgPct}%（N=${preview.sample_count}）`;
  if (peak != null && preview.peak_social_stress_day) {
    line += `；社交压力峰值 ${peak}% @ ${preview.peak_social_stress_day}`;
  }
  if (preview.bottlenecks.length) {
    line += `；脆弱节点 ${preview.bottlenecks[0].nodeId}（${preview.bottlenecks[0].primaryRisk}）`;
  }
  return line;
}

/** 从 stub snapshots 校验 party 向量是否可跑通 rollout（单测 / 诊断） */
export function previewUsesTripPlan(itinerary: Itinerary): ReturnType<typeof itineraryToTripPlan> {
  return itineraryToTripPlan(itinerary);
}
