/**
 * Decision OS 级执行轨迹 SSOT（离线 SFT/DPO 源头）。
 * schema_id: tripnara.decision_trajectory@v1
 */

import type { GateResult, Itinerary, DecisionLogEntry } from '../../interfaces/trip-plan.interface';

export const DECISION_TRAJECTORY_SCHEMA_ID = 'tripnara.decision_trajectory@v1' as const;

export type DecisionTrajectoryStatus = 'PENDING' | 'FINALIZED' | 'FAILED';

export type OrchestrationOutcomeKind =
  | 'CRITICAL_FAIL'
  | 'CONDITIONAL_REPAIR'
  | 'GOLDEN'
  | 'INCONCLUSIVE';

export type DecisionTrajectoryOrchestrationStep = {
  step: string;
  status: string;
  timestamp_ms: number;
  duration_ms?: number;
  /** PR-B：与 Harness trace 步对齐的墙钟跨度（微秒级 trace 聚合为 ms） */
  harness_duration_ms?: number;
  harness_run_status?: string;
  actor?: string;
};

export type DecisionTrajectoryInputContext = {
  trip_id?: string | null;
  user_id?: string | null;
  world_state_digest?: Record<string, unknown>;
  hard_constraints?: unknown[];
  operational_negative_constraints?: Record<string, unknown>;
  governance_revision?: string;
};

export type DecisionTrajectoryAxiomGate = {
  gate_result: GateResult['gate_result'];
  violations?: GateResult['violations'];
  required_adjustments?: GateResult['required_adjustments'];
  triggered_axiom_ids?: string[];
  confidence?: number;
};

/** 训练向三法官投票（PASS/BLOCK/WARN），与运行时 ALLOW/REJECT/ADJUST/REPLACE 映射 */
export type RedactedGuardianVote = 'PASS' | 'BLOCK' | 'WARN';

export type RedactedDebateGuardianSlice = {
  vote: RedactedGuardianVote;
  reason: string;
  verdict_raw: string;
  axiom_refs?: string[];
};

/** PR-B：脱敏后的辩论产物（DPO 负样本 / 对抗论据来源） */
export type RedactedDebateArtifact = {
  source: 'llm_debate' | 'deterministic_projection';
  tie_break_used: boolean;
  debate_gate_fusion?: string;
  guardian_votes_redacted: {
    abu: RedactedDebateGuardianSlice;
    dr_dre: RedactedDebateGuardianSlice;
    neptune?: RedactedDebateGuardianSlice;
  };
  prompts_redacted?: {
    system_prompt: string;
    user_prompt: string;
  };
  raw_completion_redacted?: string;
  debate_summary_zh?: string;
};

/** @deprecated 别名：payload.debate_history 使用 RedactedDebateArtifact */
export type DecisionTrajectoryDebateHistory = RedactedDebateArtifact;

export type DecisionTrajectoryHarnessTraceRef = {
  export_path: string | null;
  active_trace_id?: string | null;
  step_spans: Array<{
    harness_step: string;
    orchestration_step?: string;
    duration_ms?: number;
    run_status?: string;
  }>;
};

export type DecisionTrajectoryFinalOutput = {
  itinerary?: Itinerary;
  narrator_text?: string;
  gate_result?: GateResult;
  structured_payload_hash?: string;
};

export type DecisionTrajectoryV1 = {
  schema_id: typeof DECISION_TRAJECTORY_SCHEMA_ID;
  request_id: string;
  trip_id?: string | null;
  input_context: DecisionTrajectoryInputContext;
  axiom_gate: DecisionTrajectoryAxiomGate;
  orchestration_steps: DecisionTrajectoryOrchestrationStep[];
  debate_history?: RedactedDebateArtifact;
  final_output?: DecisionTrajectoryFinalOutput;
  harness_trace_export_path?: string | null;
  harness_trace?: DecisionTrajectoryHarnessTraceRef;
  decision_log_digest?: Pick<DecisionLogEntry, 'step' | 'actor' | 'timestamp'>[];
  /**
   * PR-D：首次 PLAN_GEN 完成后的行程拓扑快照（VERIFY/REPAIR 前冻结）。
   * 用于 DPO 真拓扑对比：rejected=draft vs chosen=final_output.itinerary。
   */
  plan_gen_draft_itinerary?: Itinerary;
  plan_gen_draft_captured_at_ms?: number;
};

export type DecisionTrajectoryFinalizeArtifacts = {
  orchestrationSteps?: DecisionTrajectoryOrchestrationStep[];
  debateHistory?: RedactedDebateArtifact;
  finalOutput?: DecisionTrajectoryFinalOutput;
  harnessTracePath?: string | null;
  harnessTraceId?: string | null;
  decisionLog?: DecisionLogEntry[];
  /** PR-B：Harness shadow 事件与 trace 落盘对齐 */
  decisionState?: import('../../../decision/kernel/decision-state.types').DecisionState;
};

export type DebateCompileInput = {
  source: RedactedDebateArtifact['source'];
  gate: GateResult;
  tie_break_used?: boolean;
  debate_gate_fusion?: string;
  prompts?: {
    system_prompt: string;
    user_prompt: string;
  };
  raw_completion?: string;
};
