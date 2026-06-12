import type { ConstraintReport } from '../../decision/kernel/decision-state.types';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import type {
  DecisionContextSlice,
  IntentionalSlackSlot,
  OpenWorldDiscoveryResult,
  OpenWorldPoiStub,
} from '../types/open-world-poi.types';
import { SPARSE_REGION_PROFILES } from '../profiles/sparse-region.profile';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function readOpenWorldStubs(metadata: Record<string, unknown> | undefined): OpenWorldPoiStub[] {
  const raw = metadata?.open_world_stubs;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s === 'object') as OpenWorldPoiStub[];
}

function readDiscovery(metadata: Record<string, unknown> | undefined, research: Record<string, unknown> | undefined): OpenWorldDiscoveryResult | undefined {
  const fromMeta = asRecord(metadata?.open_world_discovery as unknown);
  const fromResearch = asRecord(research?.open_world_discovery as unknown);
  const raw = fromMeta ?? fromResearch;
  if (!raw || !Array.isArray(raw.stubs)) return undefined;
  return raw as unknown as OpenWorldDiscoveryResult;
}

function collectIntentionalSlackFromItinerary(state: OrchestratorState): IntentionalSlackSlot[] {
  const days = state.itinerary?.days;
  if (!Array.isArray(days)) return [];

  const slots: IntentionalSlackSlot[] = [];
  for (const day of days) {
    if (!day || typeof day !== 'object') continue;
    const d = day as unknown as Record<string, unknown>;
    const dayNum = typeof d.day === 'number' ? d.day : undefined;
    const date = typeof d.date === 'string' ? d.date : undefined;
    const daySlots = d.slots;
    if (!daySlots || typeof daySlots !== 'object') {
      slots.push({
        day: dayNum,
        date,
        reasonCode: 'WEATHER_WINDOW',
        minutesReserved: 120,
        narrationHint: '当日行程留白，等待天气窗或安全边界',
      });
      continue;
    }
    const slotKeys = Object.keys(daySlots as object);
    if (slotKeys.length <= 2) {
      slots.push({
        day: dayNum,
        date,
        reasonCode: 'EXPEDITION_FLEX',
        minutesReserved: 180,
        narrationHint: '稀疏区日程：保留弹性，避免强行填满',
      });
    }
  }
  return slots;
}

export function buildDecisionContextSliceFromOrchestrator(
  state: OrchestratorState,
  dso?: DecisionState,
): DecisionContextSlice {
  const md = asRecord(state.metadata);
  const rd = asRecord(state.research_data as unknown);
  const discovery = readDiscovery(md, rd);
  const sparseProfileId =
    typeof md?.sparse_region_profile === 'string' ? md.sparse_region_profile : undefined;

  const stubMap = new Map<string, OpenWorldPoiStub>();
  for (const s of readOpenWorldStubs(md)) stubMap.set(s.stubId, s);
  for (const s of discovery?.stubs ?? []) stubMap.set(s.stubId, s);
  for (const s of dso?.constraints?.decisionContext?.openWorldStubs ?? []) stubMap.set(s.stubId, s);

  const profile = sparseProfileId
    ? Object.values(SPARSE_REGION_PROFILES).find((p) => p.profileId === sparseProfileId)
    : undefined;

  let intentionalSlack = collectIntentionalSlackFromItinerary(state);
  if (intentionalSlack.length === 0 && profile?.freezeFillMissingSlots) {
    intentionalSlack = [
      {
        reasonCode: profile.slackSlotTemplate.defaultReasonCode,
        minutesReserved: profile.slackSlotTemplate.maxMinutes,
        narrationHint: '极地稀疏区：显式保留天气窗/安全缓冲，不惩罚性填充',
      },
    ];
  }

  return {
    sparseProfileId,
    intentionalSlack: intentionalSlack.length ? intentionalSlack : undefined,
    openWorldStubs: stubMap.size ? [...stubMap.values()] : undefined,
    openWorldMentions: discovery?.mentions?.length ? discovery.mentions : undefined,
    discoveryAppliedAt: discovery ? new Date().toISOString() : md?.open_world_discovery_applied_at as string | undefined,
  };
}

export function mergeDecisionContextIntoConstraints(
  constraints: ConstraintReport | undefined,
  slice: DecisionContextSlice,
): ConstraintReport {
  return {
    feasible: constraints?.feasible ?? true,
    violations: constraints?.violations ?? [],
    feasibleActions: constraints?.feasibleActions,
    hardViolationCount: constraints?.hardViolationCount,
    softSatisfactionRate: constraints?.softSatisfactionRate,
    gateOutcome: constraints?.gateOutcome,
    decisionContext: {
      ...(constraints?.decisionContext ?? {}),
      ...slice,
      openWorldStubs: slice.openWorldStubs ?? constraints?.decisionContext?.openWorldStubs,
      openWorldMentions: slice.openWorldMentions ?? constraints?.decisionContext?.openWorldMentions,
      intentionalSlack: slice.intentionalSlack ?? constraints?.decisionContext?.intentionalSlack,
    },
  };
}

export function syncDecisionContextToDecisionState(
  dso: DecisionState,
  state: OrchestratorState,
): DecisionState {
  const slice = buildDecisionContextSliceFromOrchestrator(state, dso);
  return {
    ...dso,
    constraints: mergeDecisionContextIntoConstraints(dso.constraints, slice),
  };
}

/** GATE / REPAIR 阶段仅有 PhaseExecutorContext 时，从 research + DSO 重建 Orchestrator 投影 */
export function buildPseudoOrchestratorForDecisionContext(
  ctx: {
    requestId: string;
    researchData?: Record<string, unknown>;
    tripPlanRequest?: unknown;
    itinerary?: unknown;
    gateResult?: unknown;
  },
  dso?: DecisionState,
): OrchestratorState {
  const rd = ctx.researchData ?? {};
  const fromDso = dso?.constraints?.decisionContext;
  return {
    request_id: ctx.requestId,
    research_data: rd as OrchestratorState['research_data'],
    trip_plan_request: ctx.tripPlanRequest as OrchestratorState['trip_plan_request'],
    itinerary: ctx.itinerary as OrchestratorState['itinerary'],
    gate_result: ctx.gateResult as OrchestratorState['gate_result'],
    metadata: {
      sparse_region_profile: fromDso?.sparseProfileId ?? rd.sparse_region_profile,
      open_world_stubs: fromDso?.openWorldStubs ?? rd.open_world_stubs,
      open_world_discovery: rd.open_world_discovery,
    },
  } as unknown as OrchestratorState;
}

export function attachDecisionContextToConstraintReport(
  constraints: ConstraintReport,
  dso: DecisionState,
  state: OrchestratorState,
): ConstraintReport {
  const slice = buildDecisionContextSliceFromOrchestrator(state, dso);
  return mergeDecisionContextIntoConstraints(constraints, slice);
}
