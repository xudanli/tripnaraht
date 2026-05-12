// src/agent/runtime/execution-span.types.ts
import type { ExecutionTimelinePhase } from './execution-timeline-event.interface';

/**
 * P6：语义执行 span（非泛用 tracing）。一次 operation 的实例 = spanId；
 * replay / diff 以 span 为粒度，而非离散 log event。
 */
export interface ExecutionSpan {
  spanId: string;
  parentSpanId: string | null;
  requestId: string;
  snapshotId: string;
  snapshotVersion: number;
  phase: ExecutionTimelinePhase;
  operation: string;
  startedAt: string;
  endedAt: string | null;
  status: 'ok' | 'error' | 'skipped' | 'retry';
  inputHash: string | null;
  outputHash: string | null;
  /** 极小摘要：条数、策略名等，禁止全量 intent / 评分矩阵 */
  metadataSummary?: Record<string, string | number | boolean | null>;
}

export interface ExecutionSpanStartInput {
  phase: ExecutionTimelinePhase;
  /** 语义操作，如 pickRouteDirections；与 spanId 解耦（重试/并行会有多 span 同 operation） */
  operation: string;
  /** 显式父 span；省略时使用 `AgentExecutionContext.activeParentSpanId`（route_and_run 根） */
  parentSpanId?: string | null;
  inputPayload?: unknown;
}

export interface ExecutionSpanFinishSuccessInput {
  /** 参与 outputHash；须为窄契约对象（如 `{ status, selectedRouteCount }`），禁止塞全量业务 payload */
  outputPayload?: unknown;
  /** 条数、策略、latency 等治理字段；不进默认 hash 时可与 outputPayload 分离（由 recorder 写入事件） */
  metadataSummary?: Record<string, string | number | boolean | null>;
}

export interface ExecutionSpanFinishErrorInput {
  errorType?: string;
  retryable?: boolean;
  /** 治理用小摘要；禁止 stack、禁止任意大 payload */
  metadataSummary?: Record<string, string | number | boolean | null>;
}

export interface ExecutionSpanHandle {
  readonly spanId: string;
  finishSuccess(input?: ExecutionSpanFinishSuccessInput): void;
  finishError(input?: ExecutionSpanFinishErrorInput): void;
}
