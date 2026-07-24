// src/agent/memory/persistence/memory-snapshot-persistence.service.ts
import { randomUUID } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import type { DecisionLedgerSnapshot, LedgerAnchorsV1 } from '../decision-ledger/decision-ledger.types';
import { normalizeLedgerAnchorsV1 } from '../decision-ledger/decision-ledger-world-anchor.util';
import { planLedgerRecomputeOrder } from '../decision-ledger/decision-ledger-invalidation.util';
import { hydrateAgentMemoryContextFromPersistence } from '../utils/agent-memory-context-hydrate.util';

const KEY_PREFIX = 'agent:mem_snapshot:v1:';
const TRIP_HEAD_PREFIX = 'agent:mem_snapshot_trip_head:v1:';
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

export type PersistedMemorySnapshotEnvelope = {
  schema: 'v1';
  snapshot_id: string;
  snapshot_version: number;
  request_id: string;
  user_id: string | null;
  trip_id: string | null;
  loaded_at: string;
  payload: Record<string, unknown>;
};

/**
 * P3：snapshot 落盘（Redis cache），供 replay / audit 按 snapshot_id 取回。
 * 无 Redis 时静默跳过。
 */
@Injectable()
export class MemorySnapshotPersistenceService {
  private readonly logger = new Logger(MemorySnapshotPersistenceService.name);

  constructor(@Optional() private readonly redis?: RedisService) {}

  async persistSerializableSnapshot(memory: AgentMemoryContext): Promise<void> {
    if (!this.redis) {
      return;
    }
    try {
      const payload = JSON.parse(JSON.stringify(memory)) as Record<string, unknown>;
      const envelope: PersistedMemorySnapshotEnvelope = {
        schema: 'v1',
        snapshot_id: memory.snapshotId,
        snapshot_version: memory.snapshotVersion,
        request_id: memory.requestId,
        user_id: memory.userId,
        trip_id: memory.tripId,
        loaded_at: memory.loadedAt,
        payload,
      };
      const key = `${KEY_PREFIX}${memory.snapshotId}`;
      await this.redis.set(key, envelope, DEFAULT_TTL_SEC);
      if (memory.tripId && String(memory.tripId).trim() !== '') {
        const tripKey = `${TRIP_HEAD_PREFIX}${String(memory.tripId).trim()}`;
        await this.redis.set(tripKey, { snapshot_id: memory.snapshotId }, DEFAULT_TTL_SEC);
      }
      this.logger.debug(`MemorySnapshotPersistence: stored ${key}`);
    } catch (e: any) {
      this.logger.warn(`MemorySnapshotPersistence: persist failed: ${e?.message ?? e}`);
    }
  }

  async loadBySnapshotId(snapshotId: string): Promise<AgentMemoryContext | null> {
    if (!this.redis) {
      return null;
    }
    try {
      const key = `${KEY_PREFIX}${snapshotId}`;
      const env = await this.redis.get<PersistedMemorySnapshotEnvelope>(key);
      if (!env || env.schema !== 'v1' || !env.payload) {
        return null;
      }
      const raw = env.payload as unknown as Partial<AgentMemoryContext>;
      let decisionLedger = raw.decisionLedger as DecisionLedgerSnapshot | null | undefined;
      if (decisionLedger?.anchors) {
        decisionLedger = {
          ...decisionLedger,
          anchors: normalizeLedgerAnchorsV1(decisionLedger.anchors as Partial<LedgerAnchorsV1> & Pick<LedgerAnchorsV1, 'budget' | 'preference' | 'policy'>),
        };
      }
      const l3Hydrated = hydrateAgentMemoryContextFromPersistence(raw);
      return {
        ...raw,
        ...l3Hydrated,
        decisionLedger: decisionLedger ?? null,
        ledgerRecomputePlan: raw.ledgerRecomputePlan ?? null,
        userBasics: raw.userBasics ?? null,
      } as AgentMemoryContext;
    } catch (e: any) {
      this.logger.warn(`MemorySnapshotPersistence: load failed: ${e?.message ?? e}`);
      return null;
    }
  }

  /** 删除 trip 最新 snapshot 指针，防止 delete 后仍从 stale head 召回 */
  async invalidateTripHead(tripId: string): Promise<void> {
    if (!this.redis) {
      return;
    }
    const tid = String(tripId).trim();
    if (!tid) {
      return;
    }
    try {
      await this.redis.del(`${TRIP_HEAD_PREFIX}${tid}`);
      this.logger.debug(`MemorySnapshotPersistence: invalidated trip head ${tid}`);
    } catch (e: unknown) {
      this.logger.warn(
        `MemorySnapshotPersistence: invalidateTripHead failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** 通过 trip 维度的「最新 snapshot_id 指针」加载最近一次持久化的 AgentMemoryContext */
  async loadLatestContextForTrip(tripId: string): Promise<AgentMemoryContext | null> {
    if (!this.redis) {
      return null;
    }
    const tid = String(tripId).trim();
    if (!tid) {
      return null;
    }
    try {
      const tripKey = `${TRIP_HEAD_PREFIX}${tid}`;
      const head = await this.redis.get<{ snapshot_id: string }>(tripKey);
      if (!head?.snapshot_id) {
        return null;
      }
      return this.loadBySnapshotId(head.snapshot_id);
    } catch (e: any) {
      this.logger.warn(`MemorySnapshotPersistence: loadLatestContextForTrip failed: ${e?.message ?? e}`);
      return null;
    }
  }

  /**
   * 在最新 trip 快照上递增 snapshotVersion，仅替换 decisionLedger（及派生的 ledgerRecomputePlan），并再次落盘。
   */
  async saveLedgerUpdate(tripId: string, nextLedger: DecisionLedgerSnapshot): Promise<AgentMemoryContext | null> {
    const cur = await this.loadLatestContextForTrip(tripId);
    if (!cur?.decisionLedger) {
      return null;
    }
    let ledger: DecisionLedgerSnapshot = { ...nextLedger };
    if (ledger.anchors) {
      ledger = {
        ...ledger,
        anchors: normalizeLedgerAnchorsV1(
          ledger.anchors as Partial<LedgerAnchorsV1> & Pick<LedgerAnchorsV1, 'budget' | 'preference' | 'policy'>,
        ),
      };
    }
    const plan = planLedgerRecomputeOrder(ledger);
    const nextCtx: AgentMemoryContext = {
      ...cur,
      decisionLedger: ledger,
      ledgerRecomputePlan: plan,
      snapshotVersion: cur.snapshotVersion + 1,
      snapshotId: randomUUID(),
      loadedAt: new Date().toISOString(),
    };
    await this.persistSerializableSnapshot(nextCtx);
    return nextCtx;
  }
}
