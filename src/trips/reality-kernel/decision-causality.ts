/**
 * Decision causality chain — append-only spine on `TripWorldState.signals.decisionCausalityChain`.
 */

import type { TripWorldState } from '../decision/world-model';
import type { DecisionRunLog } from '../decision/decision-log';
import type { TripPlan } from '../decision/plan-model';
import {
  DECISION_CAUSALITY_SCHEMA_V0,
  type DecisionCausalityDraftPayload,
  type DecisionCausalityRecordV0,
  type DecisionOutcomeLinkV0,
} from './decision-causality.types';

export type {
  DecisionCausalityDraftPayload,
  DecisionCausalityRecordV0,
  DecisionOutcomeLinkV0,
} from './decision-causality.types';

export function appendDecisionCausality(state: TripWorldState, record: DecisionCausalityRecordV0): void {
  if (!state.signals.decisionCausalityChain) {
    state.signals.decisionCausalityChain = [];
  }
  state.signals.decisionCausalityChain.push(record);
}

export function buildDecisionCausalityId(): string {
  return `dc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function countPlanSlots(plan: TripPlan | null): number {
  if (!plan?.days?.length) return 0;
  return plan.days.reduce((n, d) => n + (d.timeSlots?.length ?? 0), 0);
}

/** Gate blocked execution — record before throwing */
/** Immutable snapshot when Gate returns BLOCK (persisted before throw). */
export function buildBlockedAtGateCausalityRecord(input: {
  causality_id: string;
  started_at: string;
  tick_kind: DecisionCausalityRecordV0['tick_kind'];
  trace_request_id?: string;
  reality: DecisionCausalityRecordV0['reality'];
  policy_engine: DecisionCausalityRecordV0['policy_engine'];
  execution_gate: DecisionCausalityRecordV0['execution_gate'];
}): DecisionCausalityRecordV0 {
  return {
    schema: DECISION_CAUSALITY_SCHEMA_V0,
    causality_id: input.causality_id,
    started_at: input.started_at,
    completed_at: new Date().toISOString(),
    tick_kind: input.tick_kind,
    trace_request_id: input.trace_request_id,
    reality: input.reality,
    policy_engine: input.policy_engine,
    execution_gate: input.execution_gate,
    plan_execution: {
      phase: 'blocked_at_gate',
    },
  };
}

/** Successful or constraint-rejected tick — merges draft + plan/log */
/** Merge outcome onto an existing chain row (same process / TripWorldState). */
export function attachOutcomeToCausalityRecord(
  state: TripWorldState,
  causalityId: string,
  outcome: Omit<DecisionOutcomeLinkV0, 'linked_at'> & Partial<Pick<DecisionOutcomeLinkV0, 'linked_at'>>,
): boolean {
  const chain = state.signals.decisionCausalityChain;
  if (!chain?.length) return false;
  const row = chain.find((r) => r.causality_id === causalityId);
  if (!row) return false;
  const linkedAt = outcome.linked_at ?? new Date().toISOString();
  row.outcome = {
    ...row.outcome,
    ...outcome,
    linked_at: linkedAt,
  };
  return true;
}

export function finalizeDecisionCausalityRecord(
  draft: DecisionCausalityDraftPayload,
  outcome: {
    phase: 'completed' | 'constraint_rejected';
    log: DecisionRunLog;
    plan: TripPlan | null;
  },
): DecisionCausalityRecordV0 {
  const plan = outcome.plan;
  return {
    schema: DECISION_CAUSALITY_SCHEMA_V0,
    causality_id: draft.causality_id,
    started_at: draft.started_at,
    completed_at: new Date().toISOString(),
    tick_kind: draft.tick_kind,
    trace_request_id: draft.trace_request_id,
    reality: draft.reality,
    policy_engine: draft.policy_engine,
    execution_gate: draft.execution_gate,
    plan_execution: {
      phase: outcome.phase === 'constraint_rejected' ? 'constraint_rejected' : 'completed',
      run_id: outcome.log.runId,
      planner_version: outcome.log.plannerVersion,
      plan_version: plan?.version,
      plan_days: plan?.days?.length,
      plan_slots_estimate: countPlanSlots(plan),
      constraint_rejection_summary:
        outcome.phase === 'constraint_rejected'
          ? (outcome.log.explanation ?? '').slice(0, 800)
          : undefined,
    },
  };
}
