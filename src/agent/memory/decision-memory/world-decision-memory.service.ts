// src/agent/memory/decision-memory/world-decision-memory.service.ts
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionMemory, DecisionMemoryType } from './decision-memory.types';
import { AgentMemoryContextStore } from '../context/agent-memory-context.store';
import { AgentExecutionContextStore } from '../../runtime/agent-execution-context.store';
import { applyDecisionRingToExecutionOperationalOverlay } from '../../compression/negative-constraint-compressor.util';
import {
  WORLD_DECISION_MEMORY_ARCHIVE,
  type WorldDecisionMemoryArchivePort,
} from './world-decision-memory-archive.port';

const DEFAULT_MAX_PER_REQUEST = 64;

export type ListDecisionMemoryOptions = {
  decisionType?: DecisionMemoryType;
  limit?: number;
};

/**
 * 单请求 ring buffer：与 ExecutionTimeline 类似，用 requestId 做键；无 ALS 时 no-op 或走显式 requestId API。
 */
@Injectable()
export class WorldDecisionMemoryService {
  private readonly logger = new Logger(WorldDecisionMemoryService.name);
  private readonly ring = new Map<string, DecisionMemory[]>();

  constructor(
    @Optional() private readonly memoryCtx?: AgentMemoryContextStore,
    @Optional() private readonly executionCtx?: AgentExecutionContextStore,
    @Optional()
    @Inject(WORLD_DECISION_MEMORY_ARCHIVE)
    private readonly archive?: WorldDecisionMemoryArchivePort,
  ) {}

  private resolveRequestKey(): string | null {
    const mem = this.memoryCtx?.get();
    const ex = this.executionCtx?.get();
    const id = mem?.requestId ?? ex?.requestId;
    return typeof id === 'string' && id.trim() !== '' ? id : null;
  }

  append(entry: DecisionMemory): void {
    const key = this.resolveRequestKey();
    if (!key) {
      this.logger.debug('WorldDecisionMemory: skip append (no requestId in ALS)');
      return;
    }
    this.appendForRequest(key, entry);
  }

  appendForRequest(requestId: string, entry: DecisionMemory, maxPerRequest = DEFAULT_MAX_PER_REQUEST): void {
    const key = String(requestId).trim();
    if (!key) {
      return;
    }
    const arr = this.ring.get(key) ?? [];
    arr.push(entry);
    while (arr.length > maxPerRequest) {
      arr.shift();
    }
    this.ring.set(key, arr);
    this.refreshExecutionOverlay(key);
    this.scheduleArchivePersist(key, entry);
  }

  /** 与热 ring 双写：失败不影响主路径；重复 causalityId 由 DB unique 消化 */
  private scheduleArchivePersist(requestId: string, entry: DecisionMemory): void {
    const arch = this.archive;
    if (!arch?.isEnabled()) return;
    const mem = this.memoryCtx?.get();
    const memRid = mem?.requestId != null ? String(mem.requestId).trim() : '';
    const aligned = memRid !== '' && memRid === requestId;
    const tripId = aligned ? mem?.tripId ?? null : null;
    const userId = aligned ? mem?.userId ?? null : null;
    void arch
      .persist({
        requestId,
        tripId: tripId && String(tripId).trim() !== '' ? String(tripId).trim() : null,
        userId: userId && String(userId).trim() !== '' && userId !== 'anonymous' ? String(userId).trim() : null,
        entry,
      })
      .catch((e: unknown) =>
        this.logger.warn(`WorldDecisionMemory archive persist async error: ${e instanceof Error ? e.message : String(e)}`),
      );
  }

  private refreshExecutionOverlay(requestId: string): void {
    const ex = this.executionCtx?.get();
    if (!ex) return;
    applyDecisionRingToExecutionOperationalOverlay(ex, requestId, this);
  }

  listForCurrentRequest(options?: ListDecisionMemoryOptions): DecisionMemory[] {
    const key = this.resolveRequestKey();
    if (!key) {
      return [];
    }
    return this.listForRequest(key, options);
  }

  listForRequest(requestId: string, options?: ListDecisionMemoryOptions): DecisionMemory[] {
    const arr = this.ring.get(String(requestId).trim()) ?? [];
    let out = options?.decisionType
      ? arr.filter((d) => d.decisionType === options.decisionType)
      : [...arr];
    const limit = options?.limit;
    if (typeof limit === 'number' && limit >= 0) {
      out = out.slice(-limit);
    }
    return out;
  }

  clearForRequest(requestId: string): void {
    this.ring.delete(String(requestId).trim());
  }
}
