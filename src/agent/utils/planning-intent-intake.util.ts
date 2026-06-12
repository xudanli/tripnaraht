/**
 * INTAKE 接线：规划阶段对话意图 → metadata.planning_phase_intent + SYSTEM_MESSAGE hints。
 */

import type { OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  EvidenceLevel,
  hasAnyPlanningPhaseSubSignal,
  planningIntentProcessor,
  type IntakeSubSignals,
  type PlanningIntentPayload,
} from './planning-intent-processor.util';
import type { TripDaySnapshotForPlacement } from './route-and-run-intent-analyzer.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import { buildPartyNegotiationPayload } from './planning-intent-party.util';
import { evaluateSpatialIntentFeasibility } from './planning-intent-spatial.util';
import type { PartyMemberProfile } from './planning-intent-processor.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  memberProfilesByIdFromNegotiationArray,
  mergeMemberProfilesById,
  resolveInjectedPartyMemberProfilesFromRequest,
} from './party-member-profile-bridge.util';
import {
  applyPartyNegotiationToTripPlanRequest,
  injectPartyNegotiationIntoRouteAndRunRequest,
  tryComputeOrganizationalRobustnessPreview,
  formatOrganizationalRobustnessPreviewZh,
} from './planning-intent-party-robustness.util';

export function inferAvailableEvidenceLevel(
  state: OrchestratorState,
  intakeMsg: string,
): EvidenceLevel {
  const rd = state.research_data as Record<string, unknown> | undefined;
  const nl = stripSystemMessageBlocksForIntakeNl(intakeMsg);

  const safetravel = rd?.safetravel_advisories ?? rd?.safetravel ?? rd?.safetravel_rss;
  if (safetravel && typeof safetravel === 'object') {
    return EvidenceLevel.L3_DETERMINISTIC;
  }

  const l3Proof = (state.metadata as Record<string, unknown> | undefined)?.l3_deterministic_token;
  if (l3Proof) {
    return EvidenceLevel.L3_DETERMINISTIC;
  }

  const supplySnapshot =
    rd?.iceland_energy_planner ??
    rd?.supply_chain_snapshot ??
    rd?.energy_planner_snapshot;
  if (supplySnapshot && typeof supplySnapshot === 'object') {
    return EvidenceLevel.L2_RECENT_SNAPSHOT;
  }

  if (/小红书|评论区|听朋友说|用户说/i.test(nl)) {
    return EvidenceLevel.L0_USER_REPORT;
  }

  const countryCode = state.trip_plan_request?.ontology_context?.destination?.country_code;
  if (countryCode) {
    return EvidenceLevel.L1_HISTORICAL_STAT;
  }

  return EvidenceLevel.L1_HISTORICAL_STAT;
}

export function extractContingencySegmentIds(params: {
  intakeMsg: string;
  trip?: TripPlanRequest | null;
  tripDaySnapshots?: TripDaySnapshotForPlacement[];
}): string[] {
  const ids: string[] = [];
  const nl = stripSystemMessageBlocksForIntakeNl(params.intakeMsg ?? '');

  const dayMatches = nl.matchAll(/第\s*(\d+)\s*天|day\s*(\d+)/gi);
  for (const m of dayMatches) {
    const n = m[1] ?? m[2];
    if (n) ids.push(`seg_day_${n}`);
  }

  const daySegments = params.trip?.routing_metrics?.day_segments;
  if (Array.isArray(daySegments)) {
    for (const seg of daySegments.slice(0, 8)) {
      if (seg && typeof seg.day_index === 'number') {
        ids.push(`seg_day_${seg.day_index}`);
      }
    }
  }

  for (const snap of params.tripDaySnapshots ?? []) {
    ids.push(`seg_day_${snap.dayNumber}`);
  }

  const unique = [...new Set(ids)];
  if (
    unique.length === 0 &&
    planningIntentProcessor.extractSubSignals(nl).scenario_planning_requested
  ) {
    unique.push('seg_trip_primary_corridor');
  }
  return unique.slice(0, 8);
}

export function appendPlanningPhaseIntentSystemHints(
  trip: TripPlanRequest,
  payload: PlanningIntentPayload,
): void {
  const lines: string[] = [];
  const sig = payload.sub_signals;

  if (sig.scenario_planning_requested) {
    lines.push('- Planning mode: scenario / contingency pre-planning (dual-track topology requested)');
    const branchCount = payload.contingency_branches?.length ?? 0;
    if (branchCount > 0) {
      lines.push(`- Contingency branches seeded: ${branchCount} segment(s); activate Plan B on CRITICAL_DISRUPTION`);
    }
  }
  if (sig.supply_chain_verification_requested) {
    const level = payload.available_evidence_level ?? EvidenceLevel.L1_HISTORICAL_STAT;
    lines.push(`- Supply-chain verification: evidence floor ${level}; do NOT absolute-promise unless L3_DETERMINISTIC`);
    if (payload.supply_chain_safety && !payload.supply_chain_safety.safeToPromise) {
      lines.push('- Absolute promise blocked: use Gate constraints + refill anchors instead of certainty language');
    }
  }
  if (sig.party_negotiation_requested && payload.party_negotiation) {
    const pn = payload.party_negotiation;
    lines.push(
      `- Multi-party negotiation: size=${pn.party_size}, regret_upper_bound=${pn.regret_upper_bound}, aggregated_pace=${pn.aggregated_pace}`,
    );
    if (pn.nash_reorder_hint) {
      lines.push(
        `- Nash reorder hint: swap Day ${pn.nash_reorder_hint.swap_day_a} ↔ Day ${pn.nash_reorder_hint.swap_day_b}`,
      );
    }
    if (pn.branch_policies?.length) {
      lines.push(`- Risk dissent branch_policies: ${pn.branch_policies.length} (Hold/Proceed)`);
    }
    if (pn.organizational_robustness_preview) {
      lines.push(
        `- Organizational robustness preview: ${Math.round(pn.organizational_robustness_preview.organizational_robustness_score * 100)}% (INTAKE rollout N=${pn.organizational_robustness_preview.sample_count})`,
      );
    }
    if (pn.requires_hitl_clarification) {
      lines.push('- HITL: collect per-member preference vectors before PLAN_GEN ordering');
    }
  }
  if (sig.spatial_intent_capture_requested && payload.spatial_intent) {
    const sp = payload.spatial_intent;
    lines.push(
      `- Spatial intent: target_day=${sp.target_day_number ?? '?'}, feasible=${sp.feasible}, conflicts=${sp.conflicts.length}`,
    );
    if (!sp.feasible && sp.suggested_day_number) {
      lines.push(`- Suggested alternate day: Day ${sp.suggested_day_number}`);
    }
  }

  if (!lines.length) return;

  const block =
    `[SYSTEM_MESSAGE][PLANNING_PHASE_INTENT]\n` +
    `User query classified as planning-phase defensive dialog (Layer2 sub_signals).\n` +
    `${lines.join('\n')}\n`;
  trip.message = `${block}${trip.message ?? ''}`.trim();
}

export function formatPlanningPhaseIntentOutputsZh(payload: PlanningIntentPayload): string {
  const parts: string[] = [];
  const active = (Object.entries(payload.sub_signals) as [keyof IntakeSubSignals, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k.replace(/_requested$/, ''));
  parts.push(`规划期 Layer2 信号：${active.join('、') || 'none'}`);

  if (payload.contingency_branches?.length) {
    parts.push(`双轨 contingency_branches=${payload.contingency_branches.length}`);
  }
  if (payload.supply_chain_safety) {
    parts.push(
      payload.supply_chain_safety.safeToPromise
        ? `供应链证据层级 ${payload.supply_chain_safety.enforcedLevel}（可标注，未熔断）`
        : `供应链熔断：拦截绝对承诺，证据层级 ${payload.supply_chain_safety.enforcedLevel}`,
    );
  }
  if (payload.party_negotiation) {
    parts.push(
      `多人仲裁 ${payload.party_negotiation.party_size} 人，遗憾上界 ${payload.party_negotiation.regret_upper_bound}`,
    );
    if (payload.party_negotiation.organizational_robustness_preview) {
      parts.push(
        formatOrganizationalRobustnessPreviewZh(payload.party_negotiation.organizational_robustness_preview),
      );
    }
    if (payload.party_negotiation.nash_reorder_hint) {
      parts.push(
        `建议调换 Day ${payload.party_negotiation.nash_reorder_hint.swap_day_a}/${payload.party_negotiation.nash_reorder_hint.swap_day_b}`,
      );
    }
  }
  if (payload.spatial_intent) {
    parts.push(
      payload.spatial_intent.feasible
        ? `空间锚点 Day ${payload.spatial_intent.target_day_number ?? '?'} 可插入`
        : `空间锚点冲突 ${payload.spatial_intent.conflicts.length} 项，建议 Day ${payload.spatial_intent.suggested_day_number ?? '?'}`,
    );
  }
  return parts.join('；');
}

export function enrichPlanningPhaseIntentExtensions(params: {
  payload: PlanningIntentPayload;
  intakeMsg: string;
  trip?: TripPlanRequest | null;
  tripDaySnapshots?: TripDaySnapshotForPlacement[];
  memberProfilesById?: Record<string, Partial<PartyMemberProfile>>;
  injectedMemberProfiles?: PartyMemberProfile[];
  request?: RouteAndRunRequestDto | null;
}): PlanningIntentPayload {
  const { payload } = params;

  if (payload.sub_signals.party_negotiation_requested) {
    payload.party_negotiation = buildPartyNegotiationPayload({
      intakeMsg: params.intakeMsg,
      trip: params.trip,
      tripDaySnapshots: params.tripDaySnapshots,
      memberProfilesById: params.memberProfilesById,
      injectedMemberProfiles: params.injectedMemberProfiles,
      request: params.request,
    });
  }

  if (payload.sub_signals.spatial_intent_capture_requested) {
    payload.spatial_intent = evaluateSpatialIntentFeasibility({
      intakeMsg: params.intakeMsg,
      tripDaySnapshots: params.tripDaySnapshots,
    });
  }

  return payload;
}

/**
 * INTAKE 主入口：写入 `metadata.planning_phase_intent`，追加 SYSTEM_MESSAGE，打 decision_log。
 * 无任一 sub_signal 时返回 null（no-op）。
 */
export function applyPlanningPhaseIntentToIntake(params: {
  intakeMsg: string;
  state: OrchestratorState;
  trip?: TripPlanRequest | null;
  tripDaySnapshots?: TripDaySnapshotForPlacement[];
  memberProfilesById?: Record<string, Partial<PartyMemberProfile>>;
  request?: RouteAndRunRequestDto | null;
}): PlanningIntentPayload | null {
  const nl = stripSystemMessageBlocksForIntakeNl(params.intakeMsg ?? '');
  if (!nl.trim()) return null;

  const evidenceLevel = inferAvailableEvidenceLevel(params.state, nl);
  const segmentIds = extractContingencySegmentIds({
    intakeMsg: nl,
    trip: params.trip,
    tripDaySnapshots: params.tripDaySnapshots,
  });

  const payload = planningIntentProcessor.buildPlanningIntentPayload({
    text: nl,
    segmentIds,
    availableDataSourceLevel: evidenceLevel,
  });

  if (!hasAnyPlanningPhaseSubSignal(payload.sub_signals)) {
    return null;
  }

  const injectedMemberProfiles = resolveInjectedPartyMemberProfilesFromRequest(
    params.request,
    params.trip,
  );
  const memberProfilesById = mergeMemberProfilesById(
    params.memberProfilesById,
    memberProfilesByIdFromNegotiationArray(injectedMemberProfiles),
  );

  enrichPlanningPhaseIntentExtensions({
    payload,
    intakeMsg: nl,
    trip: params.trip,
    tripDaySnapshots: params.tripDaySnapshots,
    memberProfilesById,
    injectedMemberProfiles,
    request: params.request,
  });

  if (payload.sub_signals.party_negotiation_requested && payload.party_negotiation) {
    if (params.trip) {
      applyPartyNegotiationToTripPlanRequest(params.trip, payload.party_negotiation);
    }
    if (params.request) {
      injectPartyNegotiationIntoRouteAndRunRequest(params.request, payload.party_negotiation);
    }
    const preview = tryComputeOrganizationalRobustnessPreview({
      tripDaySnapshots: params.tripDaySnapshots,
      partyNegotiation: payload.party_negotiation,
      requestId: params.state.request_id,
    });
    if (preview) {
      payload.party_negotiation.organizational_robustness_preview = preview;
    }
  }

  const meta = params.state.metadata as Record<string, unknown>;
  meta.planning_phase_intent = payload;

  if (params.trip) {
    appendPlanningPhaseIntentSystemHints(params.trip, payload);
  }

  params.state.decision_log.push({
    request_id: params.state.request_id,
    step: 'INTAKE',
    actor: 'Orchestrator',
    inputs_summary: nl.slice(0, 120),
    outputs_summary: formatPlanningPhaseIntentOutputsZh(payload),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'PLANNING_PHASE_INTENT_CLASSIFIED',
      planning_phase_sub_signals: payload.sub_signals,
      contingency_branch_count: payload.contingency_branches?.length ?? 0,
      supply_chain_safe_to_promise: payload.supply_chain_safety?.safeToPromise,
      evidence_level: payload.available_evidence_level,
      party_regret_upper_bound: payload.party_negotiation?.regret_upper_bound,
      organizational_robustness_preview_score:
        payload.party_negotiation?.organizational_robustness_preview?.organizational_robustness_score,
      spatial_intent_feasible: payload.spatial_intent?.feasible,
    },
  });

  return payload;
}
