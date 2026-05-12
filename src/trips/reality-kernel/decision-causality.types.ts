/**
 * Policy → Plan → Execution 因果骨架（可回放 / 审计 / 解释「为何发生此次执行」）。
 */

import type { ExecutionDecision } from './execution-gate.types';
import type { RealityPolicyCode, RealityPolicyVerdict } from './reality-policy-engine.types';
import type { SnapshotValidityStatus } from './reality-snapshot.types';

export const DECISION_CAUSALITY_SCHEMA_V0 = 'tripnara/decision-causality/v0' as const;

export type DecisionCausalityTickKind = 'generate_plan' | 'repair_plan';

/** Single completed causal record for one planning/repair tick. */
export interface DecisionCausalityRecordV0 {
  schema: typeof DECISION_CAUSALITY_SCHEMA_V0;
  causality_id: string;
  started_at: string;
  completed_at: string;
  tick_kind: DecisionCausalityTickKind;
  /** Correlates with observability / shadow snapshot build */
  trace_request_id?: string;
  /** Reality slice — what world truth was bound */
  reality: {
    snapshot_id?: string;
    validity_status?: SnapshotValidityStatus;
    region?: string;
  };
  /** Policy layer — why the engine judged ALLOW/DEGRADE/BLOCK */
  policy_engine: {
    verdict: RealityPolicyVerdict;
    codes: RealityPolicyCode[];
    reasons: string[];
  };
  /** Execution Gate — legal execution shape after binding validity + policy */
  execution_gate: ExecutionDecision;
  /** Plan / execution outcome — what changed (or why stopped) */
  plan_execution: {
    phase: 'completed' | 'blocked_at_gate' | 'constraint_rejected';
    run_id?: string;
    planner_version?: string;
    plan_version?: string;
    plan_days?: number;
    plan_slots_estimate?: number;
    constraint_rejection_summary?: string;
  };
  /**
   * Closed loop — what happened after execution (telemetry / ops audit / decision outcome).
   * Join via `extensions.decision_causality_id` on OPS outcome payloads when crossing HTTP.
   */
  outcome?: DecisionOutcomeLinkV0;
}

/** Links downstream observation / outcome rows back to this causal tick */
export interface DecisionOutcomeLinkV0 {
  linked_at: string;
  /** Prisma `decisionOutcome.id` when recorded via DecisionLoggingService */
  decision_outcome_id?: string;
  /** P-OPS-2 prediction snapshot id when outcome is merged into audit row */
  ops_reality_snapshot_id?: string;
  trip_run_id?: string;
  execution_trace_id?: string;
  /** Short pointer for UI / replay scripts */
  summary_ref?: string;
}

/** In-flight draft — filled at gate pass; finalized when plan/log ready */
export interface DecisionCausalityDraftPayload {
  causality_id: string;
  started_at: string;
  tick_kind: DecisionCausalityTickKind;
  trace_request_id?: string;
  reality: DecisionCausalityRecordV0['reality'];
  policy_engine: DecisionCausalityRecordV0['policy_engine'];
  execution_gate: ExecutionDecision;
}
