/**
 * TravelWorldState 只读投影器。
 * 从已有 Decision OS / Decision / Live / Risk / Party / Lodging 切片组装，不写回 Trip。
 */

import type { DecisionOsWorldState } from '../runtime/decision-os-world-state.types';
import type { TravelDecisionProblem } from '../decision-support/travel-decision.types';
import type { LiveExecutionConclusionV1 } from '../harness/live-execution-runtime.util';
import type { TravelRiskEvent } from '../execution/risk-event.types';
import type { RouteRunPartyProfileSnapshot } from '../memory/interfaces/agent-memory-context.interface';
import {
  TRAVEL_WORLD_STATE_SCHEMA,
  type TravelWorldStateV1,
  type TravelWorldBookingItem,
  type TravelWorldDecisionRef,
} from './travel-world-state.types';

export type ProjectTravelWorldStateInput = {
  tripId: string;
  projectedAt?: string;
  lifecycle?: TravelWorldStateV1['trip']['lifecycle'];
  decisionOs?: DecisionOsWorldState | null;
  tripMeta?: {
    name?: string | null;
    status?: string | null;
    destination?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    planVersion?: number | null;
    tripVersion?: number | null;
  } | null;
  openDecisions?: TravelDecisionProblem[] | null;
  latestCommittedDecision?: TravelDecisionProblem | null;
  liveConclusion?: LiveExecutionConclusionV1 | null;
  riskEvents?: TravelRiskEvent[] | null;
  riskGateOk?: boolean | null;
  partyProfile?: RouteRunPartyProfileSnapshot | null;
  memberIds?: string[] | null;
  bookingItems?: TravelWorldBookingItem[] | null;
  missingLodgingDays?: number[] | null;
  correlation?: TravelWorldStateV1['correlation'] | null;
};

function mapDecisionRef(p: TravelDecisionProblem): TravelWorldDecisionRef {
  const state =
    p.state === 'OPEN' || p.state === 'COMMITTED' || p.state === 'CANCELLED'
      ? p.state
      : 'UNKNOWN';
  return {
    decisionId: p.decisionId,
    decisionKey: p.decisionKey,
    state,
    subjectZh: p.subject?.title_zh,
  };
}

function daySummariesFromOs(os?: DecisionOsWorldState | null): string[] {
  if (!os?.days?.length) return [];
  return os.days.slice(0, 14).map((d) => {
    const n = d.items?.length ?? 0;
    const head = d.items?.[0]?.placeName ?? d.items?.[0]?.note;
    return head ? `${d.date}: ${head}${n > 1 ? ` 等${n}项` : ''}` : `${d.date}: ${n}项`;
  });
}

/**
 * 组装 TravelWorldStateV1（只读投影）。
 */
export function projectTravelWorldState(
  input: ProjectTravelWorldStateInput,
): TravelWorldStateV1 {
  const os = input.decisionOs ?? null;
  const meta = input.tripMeta ?? null;
  const open = (input.openDecisions ?? []).map(mapDecisionRef);
  const latestCommitted = input.latestCommittedDecision
    ? mapDecisionRef(input.latestCommittedDecision)
    : null;
  const risks = input.riskEvents ?? [];
  const highestUrgency =
    risks.length > 0 ? Math.max(...risks.map((r) => Number(r.urgency) || 0)) : null;
  const live = input.liveConclusion ?? null;
  const bookingItems = input.bookingItems ?? [];
  const missingLodgingDays = input.missingLodgingDays ?? [];

  return {
    schemaId: TRAVEL_WORLD_STATE_SCHEMA,
    version: 1,
    projectedAt: input.projectedAt ?? new Date().toISOString(),
    authority: 'PROJECTION_ONLY',
    trip: {
      tripId: input.tripId,
      name: meta?.name ?? os?.name ?? null,
      status: meta?.status ?? os?.status ?? null,
      destination: meta?.destination ?? os?.destination ?? null,
      startDate: meta?.startDate ?? os?.startDate ?? null,
      endDate: meta?.endDate ?? os?.endDate ?? null,
      lifecycle: input.lifecycle ?? 'UNKNOWN',
    },
    plan: {
      planVersion: meta?.planVersion ?? null,
      tripVersion: meta?.tripVersion ?? null,
      dayCount: os?.days?.length ?? null,
      daySummariesZh: daySummariesFromOs(os),
    },
    decisions: {
      open,
      latestCommitted,
    },
    execution: {
      phase: live ? 'LIVE_JUDGED' : null,
      liveVerdict: live?.verdict ?? null,
      liveConclusionZh: live?.conclusionZh ?? null,
      deadlineZh: live?.deadlineZh ?? null,
      /** Live 结论默认不得写行程；真实写入看 ActionReceipt */
      appliedToItinerary: false,
    },
    risk: {
      eventIds: risks.map((r) => r.id),
      highestUrgency,
      summaryZh: risks[0]?.message ?? null,
      gateOk: input.riskGateOk ?? null,
    },
    members: {
      partyTotal: input.partyProfile?.party_total ?? null,
      hasChildren: input.partyProfile?.has_children ?? null,
      hasElderly: input.partyProfile?.has_elderly ?? null,
      fitnessLevel: input.partyProfile?.fitness_level ?? null,
      riskTolerance: input.partyProfile?.risk_tolerance ?? null,
      memberIds: [...(input.memberIds ?? [])],
    },
    booking: {
      items: bookingItems,
      missingLodgingDays: [...missingLodgingDays],
    },
    correlation: {
      latestTurnId: input.correlation?.latestTurnId ?? null,
      latestTaskId: input.correlation?.latestTaskId ?? null,
      latestDecisionId:
        input.correlation?.latestDecisionId ??
        latestCommitted?.decisionId ??
        open[0]?.decisionId ??
        null,
      latestActionId: input.correlation?.latestActionId ?? null,
      latestPlanVersion:
        input.correlation?.latestPlanVersion ?? meta?.planVersion ?? null,
      latestAgentTurnTraceSchema:
        input.correlation?.latestAgentTurnTraceSchema ?? null,
    },
    sources: {
      decisionOs: Boolean(os),
      tripMetadata: Boolean(meta),
      liveConclusion: Boolean(live),
      riskEvents: risks.length > 0,
      partyProfile: Boolean(input.partyProfile),
      lodgingFacts: missingLodgingDays.length > 0 || bookingItems.length > 0,
    },
  };
}

export function projectTravelWorldStateForObservability(
  state: TravelWorldStateV1,
): Record<string, unknown> {
  return {
    schema_id: state.schemaId,
    trip_id: state.trip.tripId,
    authority: state.authority,
    plan_version: state.plan.planVersion,
    open_decisions: state.decisions.open.length,
    live_verdict: state.execution.liveVerdict,
    risk_events: state.risk.eventIds.length,
    missing_lodging_days: state.booking.missingLodgingDays,
    correlation: state.correlation,
  };
}
