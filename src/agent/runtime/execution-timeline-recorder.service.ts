// src/agent/runtime/execution-timeline-recorder.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EXECUTION_TIMELINE_SCHEMA_ABI } from './execution-timeline.schema';
import type {
  ExecutionTimelineEvent,
  ExecutionTimelineEventStatus,
  ExecutionTimelinePhase,
} from './execution-timeline-event.interface';
import type {
  ExecutionSpanFinishErrorInput,
  ExecutionSpanFinishSuccessInput,
  ExecutionSpanHandle,
  ExecutionSpanStartInput,
} from './execution-span.types';
import { executionTimelineInputHash } from './execution-timeline-hash.util';
import { AgentExecutionContextStore } from './agent-execution-context.store';
import { AgentMemoryContextStore } from '../memory/context/agent-memory-context.store';
import { RedisService } from '../../redis/redis.service';

const MAX_EVENTS_PER_REQUEST = 48;
const REDIS_KEY_PREFIX = 'agent:exec_timeline:v1:';
const REDIS_TTL_SEC = 7 * 24 * 60 * 60;

/** 过渡期：单点事件（started=ended）仍走内部 complete，避免 timeline 退化为纯日志流 */
export type RecordExecutionSpanInput = {
  phase: ExecutionTimelinePhase;
  eventType: string;
  nodeId: string;
  parentNodeId?: string | null;
  /** 与 AgentExecutionContext.activeParentSpanId / 子 span 的 parentSpanId 对齐时传入 */
  spanId?: string;
  startedAt?: string;
  endedAt?: string | null;
  inputPayload?: unknown;
  outputPayload?: unknown;
  payloadRef?: string | null;
  status?: ExecutionTimelineEventStatus;
};

type CommitSpanParams = {
  spanId: string;
  parentSpanId: string | null;
  operation: string;
  nodeId: string;
  parentNodeId: string | null;
  phase: ExecutionTimelinePhase;
  eventType: string;
  startedAt: string;
  endedAt: string | null;
  inputPayload?: unknown;
  outputPayload?: unknown;
  payloadRef?: string | null;
  status: ExecutionTimelineEventStatus;
  metadataSummary?: Record<string, string | number | boolean | null>;
};

/**
 * P6：黄金链路 timeline（仅 hash，默认不存原始 I/O）。
 * 无 Execution ALS 时 no-op，避免脚本路径噪声。
 */
@Injectable()
export class ExecutionTimelineRecorderService {
  private readonly logger = new Logger(ExecutionTimelineRecorderService.name);
  private readonly ring = new Map<string, ExecutionTimelineEvent[]>();

  constructor(
    @Optional() private readonly executionCtx?: AgentExecutionContextStore,
    @Optional() private readonly memoryCtx?: AgentMemoryContextStore,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /** 单点事件（started=ended）；新代码优先 startSpan */
  recordPoint(input: RecordExecutionSpanInput): void {
    const now = new Date().toISOString();
    const spanId = input.spanId ?? randomUUID();
    this.commitSpan({
      spanId,
      parentSpanId: null,
      operation: `${input.phase}:${input.eventType}`,
      nodeId: input.nodeId,
      parentNodeId: input.parentNodeId ?? null,
      phase: input.phase,
      eventType: String(input.eventType).slice(0, 96),
      startedAt: input.startedAt ?? now,
      endedAt: input.endedAt ?? now,
      inputPayload: input.inputPayload,
      outputPayload: input.outputPayload,
      payloadRef: input.payloadRef ?? null,
      status: input.status ?? 'ok',
    });
  }

  /**
   * 语义 span：start 不落盘，finish 时写一条完整区间（Execution Span Semantics）。
   */
  startSpan(input: ExecutionSpanStartInput): ExecutionSpanHandle | null {
    const ex = this.executionCtx?.get();
    if (!ex) {
      return null;
    }
    const spanId = randomUUID();
    const startedAt = new Date().toISOString();
    const parentSpanId = input.parentSpanId ?? ex.activeParentSpanId ?? null;
    let finished = false;

    const finish = (p: CommitSpanParams) => {
      if (finished) {
        return;
      }
      finished = true;
      this.commitSpan(p);
    };

    return {
      spanId,
      finishSuccess: (fin?: ExecutionSpanFinishSuccessInput) => {
        const endedAt = new Date().toISOString();
        finish({
          spanId,
          parentSpanId,
          operation: input.operation,
          nodeId: spanId,
          parentNodeId: null,
          phase: input.phase,
          eventType: 'span',
          startedAt,
          endedAt,
          inputPayload: input.inputPayload,
          outputPayload: fin?.outputPayload,
          payloadRef: null,
          status: 'ok',
          metadataSummary: fin?.metadataSummary,
        });
      },
      finishError: (fin?: ExecutionSpanFinishErrorInput) => {
        const endedAt = new Date().toISOString();
        finish({
          spanId,
          parentSpanId,
          operation: input.operation,
          nodeId: spanId,
          parentNodeId: null,
          phase: input.phase,
          eventType: 'span',
          startedAt,
          endedAt,
          inputPayload: input.inputPayload,
          outputPayload: {
            status: 'error',
            errorType: fin?.errorType ?? 'Error',
            ...(fin?.retryable !== undefined ? { retryable: Boolean(fin.retryable) } : {}),
          },
          payloadRef: null,
          status: 'error',
          metadataSummary: fin?.metadataSummary,
        });
      },
    };
  }

  /** @deprecated 内部/过渡期：请使用 startSpan + finish */
  recordSpan(input: RecordExecutionSpanInput): void {
    this.recordPoint(input);
  }

  getRingPreview(
    requestId: string,
    max = 8,
  ): Pick<ExecutionTimelineEvent, 'phase' | 'eventType' | 'operation' | 'spanId' | 'nodeId' | 'status'>[] {
    const arr = this.ring.get(requestId) ?? [];
    return arr.slice(-max).map((e) => ({
      phase: e.phase,
      eventType: e.eventType,
      operation: e.operation,
      spanId: e.spanId,
      nodeId: e.nodeId,
      status: e.status,
    }));
  }

  private commitSpan(input: CommitSpanParams): void {
    const ex = this.executionCtx?.get();
    if (!ex) {
      return;
    }
    const mem = this.memoryCtx?.get();
    const requestId = ex.requestId;
    const snapshotId = mem?.snapshotId ?? ex.snapshotId;
    const snapshotVersion = mem?.snapshotVersion ?? ex.snapshotVersion;

    const ev: ExecutionTimelineEvent = {
      schemaAbi: EXECUTION_TIMELINE_SCHEMA_ABI,
      eventId: randomUUID(),
      requestId,
      snapshotId,
      snapshotVersion,
      spanId: input.spanId,
      parentSpanId: input.parentSpanId,
      operation: String(input.operation).slice(0, 96),
      nodeId: input.nodeId,
      parentNodeId: input.parentNodeId,
      phase: input.phase,
      eventType: String(input.eventType).slice(0, 96),
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      inputHash: executionTimelineInputHash(input.inputPayload ?? null),
      outputHash: executionTimelineInputHash(input.outputPayload ?? null),
      payloadRef: input.payloadRef ?? null,
      status: input.status,
      metadataSummary: input.metadataSummary,
    };

    const arr = this.ring.get(requestId) ?? [];
    arr.push(ev);
    while (arr.length > MAX_EVENTS_PER_REQUEST) {
      arr.shift();
    }
    this.ring.set(requestId, arr);

    void this.persistAppend(requestId, ev).catch(() => {});

    this.logger.debug(
      `ExecutionTimeline: ${ev.phase}/${ev.operation} span=${ev.spanId} snap=${ev.snapshotId}@${ev.snapshotVersion} st=${ev.status}`,
    );
  }

  private async persistAppend(requestId: string, ev: ExecutionTimelineEvent): Promise<void> {
    if (!this.redis) return;
    const key = `${REDIS_KEY_PREFIX}${requestId}`;
    try {
      const prev = (await this.redis.get<{ events: ExecutionTimelineEvent[] }>(key)) ?? { events: [] };
      const events = [...(prev.events ?? []), ev].slice(-MAX_EVENTS_PER_REQUEST);
      await this.redis.set(key, { schema: 'v1', events }, REDIS_TTL_SEC);
    } catch (e: any) {
      this.logger.warn(`ExecutionTimeline persist: ${e?.message ?? e}`);
    }
  }
}
