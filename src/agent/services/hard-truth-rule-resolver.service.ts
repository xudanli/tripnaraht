import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HARD_TRUTH_GLOBAL_ACTION, HARD_TRUTH_HANDLER_PREFIX, HARD_TRUTH_KEY } from '../constants/hard-truth-rule.constants';

type HardTruthSnapshot = {
  /** When false, skip the F-road vs 2WD hard violation in `GateEvalExecutorService`. */
  gateFroadBlock2wd: boolean;
};

const DEFAULT_SNAPSHOT: HardTruthSnapshot = {
  gateFroadBlock2wd: true,
};

@Injectable()
export class HardTruthRuleResolverService {
  private readonly logger = new Logger(HardTruthRuleResolverService.name);
  private snapshot: HardTruthSnapshot = { ...DEFAULT_SNAPSHOT };
  private lastRefreshMs = 0;

  constructor(private readonly prisma: PrismaService) {}

  getSnapshot(): HardTruthSnapshot {
    return { ...this.snapshot };
  }

  /**
   * Best-effort reload from DB. Uses a short TTL to avoid hammering Prisma on every GATE_EVAL tick.
   */
  async refreshFromDbIfStale(ttlMs = 5_000): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefreshMs < ttlMs) return;
    await this.refreshFromDb();
  }

  async refreshFromDb(): Promise<void> {
    if (!this.prisma.isDbConnected()) {
      this.snapshot = { ...DEFAULT_SNAPSHOT };
      this.lastRefreshMs = Date.now();
      return;
    }
    try {
      const rows = await this.prisma.decisionRuleConfig.findMany({
        where: {
          isActive: true,
          actionName: HARD_TRUTH_GLOBAL_ACTION,
          handlerId: { startsWith: HARD_TRUTH_HANDLER_PREFIX },
        },
      });
      const next: HardTruthSnapshot = { ...DEFAULT_SNAPSHOT };
      for (const r of rows) {
        const hid = String(r.handlerId ?? '');
        const p = r.params;
        const obj = p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
        if (hid === HARD_TRUTH_KEY.GATE_FROAD_BLOCK_2WD) {
          const v = obj.enabled;
          if (typeof v === 'boolean') next.gateFroadBlock2wd = v;
        }
      }
      this.snapshot = next;
      this.lastRefreshMs = Date.now();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        this.snapshot = { ...DEFAULT_SNAPSHOT };
        this.lastRefreshMs = Date.now();
        return;
      }
      this.logger.warn(`HardTruthRuleResolver refresh failed: ${(e as any)?.message ?? String(e)}`);
      this.snapshot = { ...DEFAULT_SNAPSHOT };
      this.lastRefreshMs = Date.now();
    }
  }
}
