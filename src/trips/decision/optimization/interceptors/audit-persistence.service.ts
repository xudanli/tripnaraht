/**
 * Decision OS 审计日志持久化服务
 * 
 * 将内存审计日志异步写入数据库，支持：
 * - 批量写入
 * - 失败重试
 * - 数据导出
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AuditLogEntry, AuditLogService } from './decision-interceptor.service';

// ========== 类型定义 ==========

export interface AuditPersistenceConfig {
  enabled: boolean;
  batchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  retentionDays: number;
}

export interface PersistenceStats {
  totalPersisted: number;
  totalFailed: number;
  pendingCount: number;
  lastFlushTime?: string;
  lastError?: string;
}

export interface AuditQueryFilter {
  userId?: string;
  action?: string;
  resource?: string;
  startTime?: Date;
  endTime?: Date;
  statusCode?: number;
  limit?: number;
  offset?: number;
}

export interface AuditExportOptions {
  format: 'json' | 'csv' | 'ndjson';
  filter?: AuditQueryFilter;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
}

// ========== 持久化存储接口 ==========

export interface AuditPersistenceStore {
  save(entries: AuditLogEntry[]): Promise<void>;
  query(filter: AuditQueryFilter): Promise<AuditLogEntry[]>;
  count(filter: AuditQueryFilter): Promise<number>;
  deleteOlderThan(date: Date): Promise<number>;
}

// ========== 内存持久化存储（用于测试） ==========

export class InMemoryAuditStore implements AuditPersistenceStore {
  private readonly entries: AuditLogEntry[] = [];

  async save(entries: AuditLogEntry[]): Promise<void> {
    this.entries.push(...entries);
  }

  async query(filter: AuditQueryFilter): Promise<AuditLogEntry[]> {
    let results = [...this.entries];

    if (filter.userId) {
      results = results.filter(e => e.userId === filter.userId);
    }
    if (filter.action) {
      results = results.filter(e => e.action === filter.action);
    }
    if (filter.resource) {
      results = results.filter(e => e.resource === filter.resource);
    }
    if (filter.statusCode !== undefined) {
      results = results.filter(e => e.statusCode === filter.statusCode);
    }
    if (filter.startTime) {
      results = results.filter(e => new Date(e.timestamp) >= filter.startTime!);
    }
    if (filter.endTime) {
      results = results.filter(e => new Date(e.timestamp) <= filter.endTime!);
    }

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;

    return results.slice(offset, offset + limit);
  }

  async count(filter: AuditQueryFilter): Promise<number> {
    const results = await this.query({ ...filter, limit: undefined, offset: undefined });
    return results.length;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const before = this.entries.length;
    const toKeep = this.entries.filter(e => new Date(e.timestamp) >= date);
    this.entries.length = 0;
    this.entries.push(...toKeep);
    return before - this.entries.length;
  }

  getAll(): AuditLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}

// ========== 审计日志持久化服务 ==========

@Injectable()
export class AuditPersistenceService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditPersistenceService.name);
  private readonly config: AuditPersistenceConfig;
  private readonly store: AuditPersistenceStore;
  private readonly pendingQueue: AuditLogEntry[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;
  private stats: PersistenceStats = {
    totalPersisted: 0,
    totalFailed: 0,
    pendingCount: 0,
  };

  constructor(
    store?: AuditPersistenceStore,
    config?: Partial<AuditPersistenceConfig>,
  ) {
    this.store = store ?? new InMemoryAuditStore();
    this.config = {
      enabled: config?.enabled ?? true,
      batchSize: config?.batchSize ?? 100,
      flushIntervalMs: config?.flushIntervalMs ?? 5000,
      maxRetries: config?.maxRetries ?? 3,
      retentionDays: config?.retentionDays ?? 90,
    };

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  onModuleDestroy(): void {
    this.stopFlushTimer();
    this.flush().catch(err => {
      this.logger.error(`Final flush failed: ${err.message}`);
    });
  }

  async persist(entry: AuditLogEntry): Promise<void> {
    if (!this.config.enabled) return;

    this.pendingQueue.push(entry);
    this.stats.pendingCount = this.pendingQueue.length;

    if (this.pendingQueue.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async persistBatch(entries: AuditLogEntry[]): Promise<void> {
    if (!this.config.enabled) return;

    this.pendingQueue.push(...entries);
    this.stats.pendingCount = this.pendingQueue.length;

    if (this.pendingQueue.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.pendingQueue.length === 0) return;

    const batch = this.pendingQueue.splice(0, this.config.batchSize);
    this.stats.pendingCount = this.pendingQueue.length;

    let retries = 0;
    let lastError: Error | undefined;

    while (retries < this.config.maxRetries) {
      try {
        await this.store.save(batch);
        this.stats.totalPersisted += batch.length;
        this.stats.lastFlushTime = new Date().toISOString();
        this.logger.debug(`[Audit] Persisted ${batch.length} entries`);
        return;
      } catch (error) {
        lastError = error as Error;
        retries++;
        this.logger.warn(`[Audit] Persist failed (attempt ${retries}): ${lastError.message}`);
        await this.delay(1000 * retries);
      }
    }

    this.stats.totalFailed += batch.length;
    this.stats.lastError = lastError?.message;
    this.logger.error(`[Audit] Failed to persist ${batch.length} entries after ${retries} retries`);

    this.pendingQueue.unshift(...batch);
    this.stats.pendingCount = this.pendingQueue.length;
  }

  async query(filter: AuditQueryFilter): Promise<AuditLogEntry[]> {
    return this.store.query(filter);
  }

  async count(filter: AuditQueryFilter): Promise<number> {
    return this.store.count(filter);
  }

  async export(options: AuditExportOptions): Promise<string> {
    const entries = await this.store.query(options.filter ?? {});

    const processedEntries = entries.map(entry => {
      const processed = { ...entry };
      if (!options.includeRequestBody) {
        delete processed.requestBody;
      }
      if (!options.includeResponseBody) {
        delete processed.responseBody;
      }
      return processed;
    });

    switch (options.format) {
      case 'json':
        return JSON.stringify(processedEntries, null, 2);

      case 'ndjson':
        return processedEntries.map(e => JSON.stringify(e)).join('\n');

      case 'csv':
        return this.toCSV(processedEntries);

      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  async cleanup(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const deleted = await this.store.deleteOlderThan(cutoffDate);
    this.logger.log(`[Audit] Cleaned up ${deleted} entries older than ${this.config.retentionDays} days`);

    return deleted;
  }

  getStats(): PersistenceStats {
    return { ...this.stats };
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        this.logger.error(`Scheduled flush failed: ${err.message}`);
      });
    }, this.config.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private toCSV(entries: AuditLogEntry[]): string {
    if (entries.length === 0) return '';

    const headers = [
      'id', 'timestamp', 'requestId', 'userId', 'action', 'resource',
      'method', 'path', 'statusCode', 'durationMs', 'ipAddress',
    ];

    const rows = entries.map(entry => 
      headers.map(h => {
        const value = (entry as any)[h];
        if (value === undefined || value === null) return '';
        const str = String(value);
        return str.includes(',') || str.includes('"') 
          ? `"${str.replace(/"/g, '""')}"` 
          : str;
      }).join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }
}

// ========== 集成审计服务 ==========

@Injectable()
export class IntegratedAuditService extends AuditLogService {
  private readonly persistence: AuditPersistenceService;

  constructor(persistence?: AuditPersistenceService) {
    super();
    this.persistence = persistence ?? new AuditPersistenceService();
  }

  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const fullEntry = super.log(entry);

    this.persistence.persist(fullEntry).catch(err => {
      console.error(`Failed to persist audit log: ${err.message}`);
    });

    return fullEntry;
  }

  async queryPersisted(filter: AuditQueryFilter): Promise<AuditLogEntry[]> {
    return this.persistence.query(filter);
  }

  async exportLogs(options: AuditExportOptions): Promise<string> {
    return this.persistence.export(options);
  }

  getPersistenceStats(): PersistenceStats {
    return this.persistence.getStats();
  }
}
