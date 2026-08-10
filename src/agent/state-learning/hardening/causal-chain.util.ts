/**
 * TravelEvent Ledger 因果链 Hardening。
 * Turn → Task → Decision/Proposal → Verify → Action → PlanVersion → Outcome 可回放。
 */

import type {
  TravelEventCorrelation,
  TravelEventKind,
  TravelEventLedgerEntryV1,
} from '../travel-event-ledger.types';
import type { TravelEventLedgerStore } from '../travel-event-ledger.store';

/** 因果相位（不扩大 Memory 类型；仅扩展 Ledger kind） */
export const CAUSAL_CHAIN_PHASES = [
  'TURN',
  'TASK',
  'DECISION',
  'PROPOSAL',
  'VERIFY',
  'ACTION',
  'PLAN_VERSION',
  'OUTCOME',
] as const;

export type CausalChainPhase = (typeof CAUSAL_CHAIN_PHASES)[number];

const PHASE_TO_KIND: Record<CausalChainPhase, TravelEventKind> = {
  TURN: 'AGENT_TURN_TRACE',
  TASK: 'TASK',
  DECISION: 'DECISION',
  PROPOSAL: 'PROPOSAL',
  VERIFY: 'VERIFY',
  ACTION: 'ACTION_RECEIPT',
  PLAN_VERSION: 'PLAN_VERSION',
  OUTCOME: 'OUTCOME',
};

export type CausalChainLinkInput = {
  tripId: string;
  turnId: string;
  taskId?: string;
  decisionId?: string;
  proposalId?: string;
  verifyOk?: boolean;
  actionId?: string;
  planVersion?: number;
  outcomeId?: string;
  worldStateProjectedAt?: string;
  payloads?: Partial<Record<CausalChainPhase, Record<string, unknown>>>;
};

export type CausalReplayFrame = {
  phase: CausalChainPhase;
  event: TravelEventLedgerEntryV1;
};

export type CausalReplayResult = {
  turnId: string;
  tripId: string;
  frames: CausalReplayFrame[];
  complete: boolean;
  missingPhases: CausalChainPhase[];
};

/** 写入一条完整（或局部）因果链，共享 correlation */
export function appendCausalChain(
  ledger: TravelEventLedgerStore,
  input: CausalChainLinkInput,
): TravelEventLedgerEntryV1[] {
  const corr: TravelEventCorrelation = {
    tripId: input.tripId,
    turnId: input.turnId,
    taskId: input.taskId ?? null,
    decisionId: input.decisionId ?? null,
    actionId: input.actionId ?? null,
    planVersion: input.planVersion ?? null,
    worldStateProjectedAt: input.worldStateProjectedAt ?? null,
    causalChainId: `chain_${input.turnId}`,
  };

  const out: TravelEventLedgerEntryV1[] = [];
  const push = (phase: CausalChainPhase, payload: Record<string, unknown>) => {
    out.push(
      ledger.append({
        kind: PHASE_TO_KIND[phase],
        correlation: corr,
        payload: {
          causal_phase: phase,
          ...(input.payloads?.[phase] ?? {}),
          ...payload,
        },
      }),
    );
  };

  push('TURN', { turnId: input.turnId });
  if (input.taskId) push('TASK', { taskId: input.taskId });
  if (input.decisionId) push('DECISION', { decisionId: input.decisionId });
  if (input.proposalId) {
    push('PROPOSAL', { proposalId: input.proposalId });
  }
  if (typeof input.verifyOk === 'boolean') {
    push('VERIFY', { verifyOk: input.verifyOk });
  }
  if (input.actionId) push('ACTION', { actionId: input.actionId });
  if (input.planVersion != null) {
    push('PLAN_VERSION', { planVersion: input.planVersion });
  }
  if (input.outcomeId) push('OUTCOME', { outcomeId: input.outcomeId });

  return out;
}

/** 按 turn 回放因果帧（时间序） */
export function replayCausalChain(
  ledger: TravelEventLedgerStore,
  input: { tripId: string; turnId: string },
): CausalReplayResult {
  const events = ledger
    .query({ tripId: input.tripId, turnId: input.turnId, limit: 200 })
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const frames: CausalReplayFrame[] = [];
  const seen = new Set<CausalChainPhase>();

  for (const e of events) {
    const phase =
      (typeof e.payload.causal_phase === 'string'
        ? (e.payload.causal_phase as CausalChainPhase)
        : null) ??
      (Object.entries(PHASE_TO_KIND).find(([, k]) => k === e.kind)?.[0] as
        | CausalChainPhase
        | undefined);
    if (!phase || !CAUSAL_CHAIN_PHASES.includes(phase)) continue;
    if (seen.has(phase)) continue;
    seen.add(phase);
    frames.push({ phase, event: e });
  }

  const orderIndex = (p: CausalChainPhase) => CAUSAL_CHAIN_PHASES.indexOf(p);
  frames.sort((a, b) => orderIndex(a.phase) - orderIndex(b.phase));

  const missingPhases = CAUSAL_CHAIN_PHASES.filter((p) => !seen.has(p));
  /** 最小可回放：TURN + (DECISION|PROPOSAL|ACTION|OUTCOME 任一) */
  const complete =
    seen.has('TURN') &&
    (seen.has('DECISION') ||
      seen.has('PROPOSAL') ||
      seen.has('ACTION') ||
      seen.has('OUTCOME'));

  return {
    turnId: input.turnId,
    tripId: input.tripId,
    frames,
    complete,
    missingPhases,
  };
}

export function projectCausalReplayForObservability(
  r: CausalReplayResult,
): Record<string, unknown> {
  return {
    turn_id: r.turnId,
    trip_id: r.tripId,
    complete: r.complete,
    phases: r.frames.map((f) => f.phase),
    missing_phases: r.missingPhases,
    event_ids: r.frames.map((f) => f.event.eventId),
  };
}
