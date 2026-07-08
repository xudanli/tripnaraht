/**
 * Agentic loop 执行图 checkpoint（Harness State P2 基础）。
 * 每步 tool 轮次结束后快照 messages + trace；支持 HITL ask hold 暂停与 resume。
 */

import { createHash, randomUUID } from 'crypto';
import type {
  BookingCompletionContract,
  BookingFailurePattern,
  BookingNoProgressReason,
} from '../task-closure/booking-minimal.types';

/** Agentic loop trace step（与 mcp-agent-executor 共享，避免 runtime ↔ executor 循环依赖） */
export interface AgentLoopTraceStep {
  step: number;
  llm_finish_reason?: string | null;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  tool_results?: Array<{ tool_call_id: string; envelope: unknown }>;
  latency_ms: number;
  booking_prev_completion?: BookingCompletionContract;
  booking_next_completion?: BookingCompletionContract;
  booking_progress_made?: boolean;
  booking_no_progress_step?: boolean;
  booking_no_progress_reason?: BookingNoProgressReason;
  booking_state_delta?: {
    route_len_delta: number;
    inventory_items_delta: number;
  };
  booking_discouraged_action?: boolean;
  booking_failure_pattern?: BookingFailurePattern;
  booking_pattern_stability?: number;
  booking_suggested_candidates_count?: number;
  booking_suggested_used?: boolean;
  booking_suggested_override?: boolean;
}

export interface AgenticLoopCheckpointMetricsV1 {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** JSON-safe chat message snapshot（OpenAI 兼容） */
export type AgenticLoopCheckpointMessageV1 = Record<string, unknown>;

export interface AgenticLoopCheckpointV1 {
  schemaId: 'tripnara.agentic_loop_checkpoint@v1';
  version: 1;
  checkpoint_id: string;
  /** 已完成的最大 step 序号（与 trace step 对齐） */
  step: number;
  /** 原始用户任务（resume 时须一致） */
  task_message: string;
  messages: AgenticLoopCheckpointMessageV1[];
  trace_steps: AgentLoopTraceStep[];
  metrics: AgenticLoopCheckpointMetricsV1;
  created_at: string;
}

export interface AgenticLoopCheckpointObservabilityV1 {
  schemaId: 'tripnara.agentic_loop_checkpoints@v1';
  version: 1;
  enabled: boolean;
  count: number;
  latest_step: number | null;
  resumable: boolean;
  stopped_for_governance_hold: boolean;
}

export function parseAgenticLoopCheckpointsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.AGENTIC_LOOP_CHECKPOINTS?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  return true;
}

export function cloneCheckpointMessages<T>(messages: readonly T[]): T[] {
  return JSON.parse(JSON.stringify(messages)) as T[];
}

function fingerprintTaskMessage(message: string): string {
  return createHash('sha256').update(message.trim()).digest('hex').slice(0, 16);
}

export function buildAgenticLoopCheckpoint(params: {
  step: number;
  taskMessage: string;
  messages: readonly Record<string, unknown>[];
  traceSteps: AgentLoopTraceStep[];
  metrics: AgenticLoopCheckpointMetricsV1;
}): AgenticLoopCheckpointV1 {
  const taskFp = fingerprintTaskMessage(params.taskMessage);
  const checkpoint_id = `cp-${params.step}-${taskFp}-${randomUUID().slice(0, 8)}`;
  return {
    schemaId: 'tripnara.agentic_loop_checkpoint@v1',
    version: 1,
    checkpoint_id,
    step: params.step,
    task_message: params.taskMessage.trim(),
    messages: cloneCheckpointMessages(params.messages),
    trace_steps: cloneCheckpointMessages(params.traceSteps),
    metrics: { ...params.metrics },
    created_at: new Date().toISOString(),
  };
}

export function validateAgenticResumeCheckpoint(
  checkpoint: AgenticLoopCheckpointV1 | undefined | null,
  taskMessage: string,
): { ok: true } | { ok: false; reason: string } {
  if (!checkpoint) return { ok: false, reason: 'missing_checkpoint' };
  if (checkpoint.schemaId !== 'tripnara.agentic_loop_checkpoint@v1' || checkpoint.version !== 1) {
    return { ok: false, reason: 'invalid_schema' };
  }
  if (!Number.isFinite(checkpoint.step) || checkpoint.step < 1) {
    return { ok: false, reason: 'invalid_step' };
  }
  if (!Array.isArray(checkpoint.messages) || checkpoint.messages.length < 2) {
    return { ok: false, reason: 'invalid_messages' };
  }
  if (checkpoint.task_message.trim() !== taskMessage.trim()) {
    return { ok: false, reason: 'task_message_mismatch' };
  }
  return { ok: true };
}

export function parseAgenticLoopCheckpointV1(raw: unknown): AgenticLoopCheckpointV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as AgenticLoopCheckpointV1;
  if (o.schemaId !== 'tripnara.agentic_loop_checkpoint@v1' || o.version !== 1) return null;
  if (typeof o.step !== 'number' || !Array.isArray(o.messages)) return null;
  return o;
}

export function isGovernanceAskHoldEnvelope(envelope: {
  success?: boolean;
  data?: unknown;
  error?: string | null;
}): boolean {
  if (envelope.success !== false) return false;
  const d = envelope.data as Record<string, unknown> | undefined;
  return d?._system_status === 'AWAITING_APPROVAL' || envelope.error === 'NEED_USER_APPROVAL';
}

export function stepHasGovernanceAskHold(step: AgentLoopTraceStep | undefined): boolean {
  if (!step?.tool_results?.length) return false;
  return step.tool_results.some((tr) =>
    isGovernanceAskHoldEnvelope(
      tr.envelope as { success?: boolean; data?: unknown; error?: string | null | undefined },
    ),
  );
}

export function buildAgenticLoopCheckpointObservability(params: {
  enabled: boolean;
  checkpoints: AgenticLoopCheckpointV1[];
  stoppedReason: string;
}): AgenticLoopCheckpointObservabilityV1 {
  const latest = params.checkpoints.length
    ? params.checkpoints[params.checkpoints.length - 1]
    : undefined;
  const governanceHold = params.stoppedReason === 'governance_ask_hold';
  return {
    schemaId: 'tripnara.agentic_loop_checkpoints@v1',
    version: 1,
    enabled: params.enabled,
    count: params.checkpoints.length,
    latest_step: latest?.step ?? null,
    resumable: !!latest && (governanceHold || params.stoppedReason === 'max_steps'),
    stopped_for_governance_hold: governanceHold,
  };
}
