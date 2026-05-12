// src/agent/memory/replay/decision-replay.service.ts
import { Injectable, Optional } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import { MemorySnapshotPersistenceService } from '../persistence/memory-snapshot-persistence.service';

export type DecisionReplayInput = {
  request: RouteAndRunRequestDto;
  /** 冻结的 memory snapshot（须含 snapshotId / snapshotVersion）；可与 snapshotId 二选一 */
  memorySnapshot?: AgentMemoryContext;
  /** P3：仅 snapshot_id 时从持久化层拉取 payload */
  snapshotId?: string;
};

/**
 * Phase 2+：可审计决策回放入口（骨架）。
 * 目标：给定 request + memory snapshot 重跑 decision 并 diff — 由 kernel / harness 接具体实现。
 */
@Injectable()
export class DecisionReplayService {
  constructor(
    @Optional() private readonly snapshotPersistence?: MemorySnapshotPersistenceService,
  ) {}

  async loadPersistedSnapshot(snapshotId: string): Promise<AgentMemoryContext | null> {
    return this.snapshotPersistence?.loadBySnapshotId(snapshotId) ?? null;
  }

  async replayAgainstSnapshot(_input: DecisionReplayInput): Promise<{
    ok: boolean;
    message: string;
  }> {
    return {
      ok: false,
      message:
        'DecisionReplayService.replayAgainstSnapshot is not implemented — wire TripDecisionEngine + diff harness here.',
    };
  }
}
