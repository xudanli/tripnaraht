import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import type { LedgerPendingAuditPayloadV1 } from './ledger-pending-audit.types';

const KEY_PREFIX = 'agent:ledger_pending_audit:v1:';
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

/**
 * 将 MCP 侧 world 刷新结果暂存，供下一次 route_and_run 在 Assembler 与装配账本合并。
 * 无 Redis 时 no-op。
 */
@Injectable()
export class LedgerPendingAuditStoreService {
  private readonly logger = new Logger(LedgerPendingAuditStoreService.name);

  constructor(@Optional() private readonly redis?: RedisService) {}

  isEnabled(): boolean {
    return !!this.redis;
  }

  async save(tripId: string, payload: LedgerPendingAuditPayloadV1, ttlSec = DEFAULT_TTL_SEC): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(`${KEY_PREFIX}${tripId}`, payload, ttlSec);
      this.logger.debug(`LedgerPendingAudit: saved trip=${tripId}`);
    } catch (e: any) {
      this.logger.warn(`LedgerPendingAudit: save failed: ${e?.message ?? e}`);
    }
  }

  /** 读取并删除（至多一次消费）。 */
  async consume(tripId: string): Promise<LedgerPendingAuditPayloadV1 | null> {
    if (!this.redis) return null;
    try {
      const key = `${KEY_PREFIX}${tripId}`;
      const v = await this.redis.get<LedgerPendingAuditPayloadV1>(key);
      if (v) {
        await this.redis.del(key);
      }
      return v ?? null;
    } catch (e: any) {
      this.logger.warn(`LedgerPendingAudit: consume failed: ${e?.message ?? e}`);
      return null;
    }
  }
}
