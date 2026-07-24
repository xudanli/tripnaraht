import { Injectable, Logger, Optional } from '@nestjs/common';
import { CacheService } from '../../../common/cache/cache.service';
import {
  EXPLORATION_CHECK_JOB_CACHE_PREFIX,
  EXPLORATION_CHECK_JOB_TTL_SEC,
} from '../config/exploration-check-job.config';

export type ExplorationCheckJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ExplorationCheckJobRecord {
  jobId: string;
  scenarioId: string;
  tripId: string;
  userId?: string;
  status: ExplorationCheckJobStatus;
  createdAt: string;
  completedAt?: string;
  error?: string;
  result?: {
    verdictStatus?: string;
    totalIssueCount: number;
    checkDurationMs: number;
    feasibilitySummary?: {
      mustHandle: number;
      suggestAdjust: number;
      pendingConfirm: number;
    };
    gatewayOpenCount?: number;
    unresolvedPoiCount?: number;
    /** VERDICT_GATEWAY_MISMATCH | POI_CONFIRMATION_REQUIRED */
    diagnosis?: string;
  };
}

/**
 * Check job 存储（Sprint 5）
 * - 进程内 Map 作热缓存
 * - Redis（经 CacheService）作跨 Pod 持久化；不可用时降级内存
 */
@Injectable()
export class ExplorationCheckJobStoreService {
  private readonly logger = new Logger(ExplorationCheckJobStoreService.name);
  private readonly memory = new Map<string, ExplorationCheckJobRecord>();

  constructor(@Optional() private readonly cacheService?: CacheService) {}

  async create(
    input: Omit<ExplorationCheckJobRecord, 'status' | 'createdAt'> & {
      status?: ExplorationCheckJobStatus;
    },
  ): Promise<ExplorationCheckJobRecord> {
    const record: ExplorationCheckJobRecord = {
      ...input,
      status: input.status ?? 'PENDING',
      createdAt: new Date().toISOString(),
    };
    await this.persist(record);
    return record;
  }

  async get(jobId: string): Promise<ExplorationCheckJobRecord | undefined> {
    return this.getInternal(jobId);
  }

  async update(
    jobId: string,
    patch: Partial<ExplorationCheckJobRecord>,
  ): Promise<ExplorationCheckJobRecord | undefined> {
    const existing = await this.getInternal(jobId);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    await this.persist(next);
    return next;
  }

  private cacheKey(jobId: string): string {
    return this.cacheService
      ? this.cacheService.generateKey(EXPLORATION_CHECK_JOB_CACHE_PREFIX, jobId)
      : `${EXPLORATION_CHECK_JOB_CACHE_PREFIX}:${jobId}`;
  }

  private async persist(record: ExplorationCheckJobRecord): Promise<void> {
    this.memory.set(record.jobId, record);
    if (!this.cacheService) return;
    try {
      await this.cacheService.set(
        this.cacheKey(record.jobId),
        record,
        EXPLORATION_CHECK_JOB_TTL_SEC,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Check job cache write failed job=${record.jobId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async getInternal(jobId: string): Promise<ExplorationCheckJobRecord | undefined> {
    const mem = this.memory.get(jobId);
    if (mem) return mem;
    if (!this.cacheService) return undefined;
    try {
      const fromCache = await this.cacheService.get<ExplorationCheckJobRecord>(
        this.cacheKey(jobId),
      );
      if (fromCache) {
        this.memory.set(jobId, fromCache);
        return fromCache;
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Check job cache read failed job=${jobId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return undefined;
  }
}
