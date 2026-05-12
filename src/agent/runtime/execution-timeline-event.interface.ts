// src/agent/runtime/execution-timeline-event.interface.ts
import { EXECUTION_TIMELINE_SCHEMA_ABI } from './execution-timeline.schema';

export type ExecutionTimelinePhase =
  | 'route_and_run'
  | 'orchestration'
  | 'planner'
  | 'route_selector'
  | 'recovery';

export type ExecutionTimelineEventStatus = 'ok' | 'error' | 'skipped' | 'retry';

/**
 * P6：黄金链路执行时序（不存全量 payload，仅 hash / 可选 ref）。
 */
export interface ExecutionTimelineEvent {
  schemaAbi: typeof EXECUTION_TIMELINE_SCHEMA_ABI;
  eventId: string;
  requestId: string;
  snapshotId: string;
  snapshotVersion: number;
  /** 一次 operation 实例；重试/分支下唯一 */
  spanId: string;
  parentSpanId: string | null;
  /** 语义操作名，如 pickRouteDirections */
  operation: string;
  /** 过渡期：与 spanId 对齐写入，避免旧预览路径断裂 */
  nodeId: string;
  parentNodeId: string | null;
  phase: ExecutionTimelinePhase;
  /** 完成态建议固定为 span；旧点事件可为 phase-specific 字符串 */
  eventType: string;
  startedAt: string;
  endedAt: string | null;
  inputHash: string | null;
  outputHash: string | null;
  /** 可选：blob 指针（S3/PG），当前阶段可留空 */
  payloadRef?: string | null;
  status: ExecutionTimelineEventStatus;
  metadataSummary?: Record<string, string | number | boolean | null>;
}
