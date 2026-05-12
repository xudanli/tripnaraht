// src/agent/memory/persistence/memory-snapshot-persistence.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';

const KEY_PREFIX = 'agent:mem_snapshot:v1:';
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
      return env.payload as unknown as AgentMemoryContext;
    } catch (e: any) {
      this.logger.warn(`MemorySnapshotPersistence: load failed: ${e?.message ?? e}`);
      return null;
    }
  }
}
