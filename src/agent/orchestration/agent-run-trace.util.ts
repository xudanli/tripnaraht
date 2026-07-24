/**
 * 统一 Agent Run Trace：从 decision_log + 元数据汇总节点账本。
 * Schema: tripnara.agent_run_trace@v1
 */

import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { PhaseExecutionPathV1 } from './phase-execution-path.telemetry.util';

export const AGENT_RUN_TRACE_SCHEMA_ID = 'tripnara.agent_run_trace@v1' as const;

export type AgentRunTraceDeliveryStatus =
  | 'OK'
  | 'NEED_MORE_INFO'
  | 'NEED_CONFIRMATION'
  | 'FAILED'
  | 'BLOCKED'
  | 'PROCESSING'
  | 'UNKNOWN';

export interface AgentRunTraceNodeV1 {
  step: string;
  inputs_summary?: string;
  outputs_summary?: string;
  evidence_refs?: string[];
  duration_ms?: number;
  system_action?: string;
}

export interface AgentRunTraceV1 {
  schemaId: typeof AGENT_RUN_TRACE_SCHEMA_ID;
  version: 1;
  request_id: string;
  final_delivery_status: AgentRunTraceDeliveryStatus;
  nodes: AgentRunTraceNodeV1[];
  fallbacks: PhaseExecutionPathV1[];
  repair?: {
    repair_count?: number;
    flawed_draft?: boolean;
    flawed_draft_reason?: string;
  };
  return_to_research?: {
    count?: number;
    failure_codes?: string[];
    scopes?: string[];
  };
  hallucination_gate?: {
    verdict?: string;
  };
  at: string;
}

export function buildAgentRunTraceV1(input: {
  requestId: string;
  decisionLog?: OrchestratorState['decision_log'];
  metadata?: Record<string, unknown>;
  finalDeliveryStatus: AgentRunTraceDeliveryStatus | string;
}): AgentRunTraceV1 {
  const log = Array.isArray(input.decisionLog) ? input.decisionLog : [];
  const meta = input.metadata ?? {};
  const nodes: AgentRunTraceNodeV1[] = log.map((e) => {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    return {
      step: String(e.step ?? ''),
      inputs_summary: e.inputs_summary,
      outputs_summary: e.outputs_summary,
      evidence_refs: Array.isArray(e.evidence_refs) ? e.evidence_refs.map(String) : undefined,
      duration_ms: typeof m.duration_ms === 'number' ? m.duration_ms : undefined,
      system_action: typeof m.system_action === 'string' ? m.system_action : undefined,
    };
  });

  const fallbacks = Array.isArray(meta.phase_execution_paths_v1)
    ? (meta.phase_execution_paths_v1 as PhaseExecutionPathV1[]).filter(
        (p) => p && p.path && p.path !== 'kernel_native',
      )
    : [];

  const r2r = meta.return_to_research_context_v1 as
    | { failure_codes?: string[]; scopes?: string[] }
    | undefined;
  const hall = meta.hallucination_delivery_gate_v1 as { verdict?: string } | undefined;

  const statusRaw = String(input.finalDeliveryStatus || 'UNKNOWN').toUpperCase();
  const final_delivery_status = (
    [
      'OK',
      'NEED_MORE_INFO',
      'NEED_CONFIRMATION',
      'FAILED',
      'BLOCKED',
      'PROCESSING',
    ].includes(statusRaw)
      ? statusRaw
      : 'UNKNOWN'
  ) as AgentRunTraceDeliveryStatus;

  return {
    schemaId: AGENT_RUN_TRACE_SCHEMA_ID,
    version: 1,
    request_id: input.requestId,
    final_delivery_status,
    nodes,
    fallbacks,
    repair: {
      repair_count:
        typeof meta.repair_count === 'number'
          ? meta.repair_count
          : typeof meta.repairCount === 'number'
            ? meta.repairCount
            : undefined,
      flawed_draft: meta.flawed_draft_narrate === true,
      flawed_draft_reason:
        typeof meta.flawed_draft_reason === 'string' ? meta.flawed_draft_reason : undefined,
    },
    return_to_research: {
      count:
        typeof meta.verify_return_to_research_count === 'number'
          ? meta.verify_return_to_research_count
          : undefined,
      failure_codes: r2r?.failure_codes,
      scopes: r2r?.scopes,
    },
    hallucination_gate: hall?.verdict ? { verdict: hall.verdict } : undefined,
    at: new Date().toISOString(),
  };
}
