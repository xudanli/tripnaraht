// src/trips/decision/services/decision-log-storage.service.ts
/**
 * Decision Log Storage Service（决策日志存储服务）
 * 
 * 负责将 DecisionLogEntry 写入数据库
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  analyzeDecisionLogTraceability,
  type DecisionLogTraceabilityResult,
} from '../contracts/decision-log-traceability.contract';
import {
  DecisionLogEntry,
  DecisionPersona,
  DecisionSource,
  DecisionStage,
  DecisionAction,
} from '../shared/decision-result.types';
import {
  extractJepaTraceFromMetadata,
  mergeMetadataWithJepaTrace,
} from '../shared/decision-trace-jepa.types';
import {
  mergeTriggeredAssertions,
  normalizeHardRuleSnapshot,
} from '../shared/hard-rule-snapshot.types';
import { deriveFactsFromMetadata } from '../shared/fact-derivation.util';

@Injectable()
export class DecisionLogStorageService {
  private readonly logger = new Logger(DecisionLogStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort: derive `metadata.assertions_triggered` from `metadata.details.evidence`.
   * This ensures QA/DPO mining works even when callers forget to write facts explicitly.
   */
  private enrichMetadataWithFacts(params: {
    metadata: Record<string, unknown>;
    entry: Pick<DecisionLogEntry, 'reasonCodes' | 'timestamp' | 'action'>;
  }): Record<string, unknown> {
    const meta = params.metadata ?? {};
    const existing = normalizeHardRuleSnapshot(meta).assertions_triggered;
    if (existing.length > 0) return meta;

    const facts = deriveFactsFromMetadata({
      metadata: meta,
      reasonCodes: params.entry.reasonCodes,
      timestampIso: params.entry.timestamp,
    });
    if (facts.length === 0) return meta;
    const merged = mergeTriggeredAssertions(meta, facts);
    return { ...meta, ...merged };
  }

  /** Map Prisma row → `DecisionLogEntry` (includes `metadata.jepaTrace` when present). */
  private mapRowToDecisionLogEntry(log: {
    persona: string;
    action: string;
    explanation: string;
    reasonCodes: string[];
    evidenceRefs: string[];
    timestamp: Date;
    decisionSource: string;
    decisionStage?: string | null;
    metadata?: unknown;
  }): DecisionLogEntry {
    const entry: DecisionLogEntry = {
      persona: log.persona as DecisionPersona,
      action: log.action as DecisionAction,
      explanation: log.explanation,
      reasonCodes: log.reasonCodes,
      evidenceRefs: log.evidenceRefs,
      timestamp: log.timestamp.toISOString(),
      decisionSource: log.decisionSource as DecisionSource,
      decisionStage: ((log as { decisionStage?: string }).decisionStage || 'FINALIZE') as DecisionStage,
    };
    if (log.metadata && typeof log.metadata === 'object') {
      entry.metadata = log.metadata as Record<string, unknown>;
    }
    const jt = extractJepaTraceFromMetadata(log.metadata);
    if (jt) {
      entry.jepaTrace = jt;
    }
    return entry;
  }

  /** 集成/预发：`DECISION_LOG_STRICT_WRITE=1` 时，traceability **errors** 将 **跳过** `create`/`createMany` */
  private isDecisionLogStrictWrite(): boolean {
    const v = process.env.DECISION_LOG_STRICT_WRITE;
    return v === '1' || v === 'true';
  }

  /**
   * TD-04：写入/读出时记录可追溯性结论；默认不阻断持久化（严格模式见 `isDecisionLogStrictWrite`）
   */
  private logTraceabilityAnalysis(
    entries: DecisionLogEntry[],
    phase: 'save' | 'read',
    tripHint?: string,
  ): DecisionLogTraceabilityResult {
    const r = analyzeDecisionLogTraceability(entries);
    if (r.errors.length === 0 && r.warnings.length === 0) {
      return r;
    }
    const hint = tripHint ? ` context=${tripHint}` : '';
    if (r.errors.length > 0) {
      const sample = r.errors.slice(0, 5).join('; ');
      this.logger.warn(
        `[TD-04][${phase}]${hint} ${r.errors.length} traceability error(s): ${sample}${r.errors.length > 5 ? '…' : ''}`,
      );
    }
    if (r.warnings.length > 0) {
      const sample = r.warnings.slice(0, 3).join('; ');
      this.logger.warn(
        `[TD-04][${phase}]${hint} ${r.warnings.length} traceability warning(s): ${sample}${r.warnings.length > 3 ? '…' : ''}`,
      );
    }
    return r;
  }

  /**
   * 验证 UUID 格式
   */
  private isValidUUID(str: string | null | undefined): boolean {
    if (!str) {
      return false;
    }
    // UUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * 保存单个决策日志条目
   */
  async saveLogEntry(
    entry: DecisionLogEntry,
    options?: {
      tripId?: string;
      countryCode?: string;
      routeDirectionId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const tr = this.logTraceabilityAnalysis([entry], 'save', options?.tripId);
      if (this.isDecisionLogStrictWrite() && tr.errors.length > 0) {
        this.logger.error(
          `[TD-04][save] DECISION_LOG_STRICT_WRITE: skip persist (${tr.errors.length} traceability error(s))`,
        );
        return;
      }

      // 验证 tripId 是否为有效的 UUID，如果不是则设置为 null
      const validTripId = options?.tripId && this.isValidUUID(options.tripId) 
        ? options.tripId 
        : null;

      // 如果 tripId 不是有效的 UUID，记录警告
      if (options?.tripId && !this.isValidUUID(options.tripId)) {
        this.logger.warn(
          `tripId "${options.tripId}" 不是有效的 UUID 格式，将设置为 null。` +
          `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        );
      }

      await this.prisma.decisionLog.create({
        data: {
          tripId: validTripId,
          countryCode: options?.countryCode,
          routeDirectionId: options?.routeDirectionId,
          persona: entry.persona,
          action: entry.action,
          decisionSource: entry.decisionSource,
          decisionStage: entry.decisionStage,
          explanation: entry.explanation,
          reasonCodes: entry.reasonCodes,
          evidenceRefs: entry.evidenceRefs || [],
          timestamp: new Date(entry.timestamp),
          metadata: mergeMetadataWithJepaTrace(
            this.enrichMetadataWithFacts({
              metadata: {
                ...(((options?.metadata as Record<string, unknown> | undefined) ?? undefined) || {}),
                ...((entry.metadata ?? {}) as Record<string, unknown>),
              },
              entry: { reasonCodes: entry.reasonCodes, timestamp: entry.timestamp, action: entry.action },
            }),
            entry.jepaTrace,
          ) as Prisma.InputJsonValue,
        },
      });
      this.logger.debug(`Saved decision log: ${entry.persona} ${entry.action} (${entry.decisionSource})${validTripId ? ` for tripId: ${validTripId}` : ''}`);
    } catch (error) {
      this.logger.error(`Failed to save decision log: ${error}`, error instanceof Error ? error.stack : undefined);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 批量保存决策日志条目
   */
  async saveLogEntries(
    entries: DecisionLogEntry[],
    options?: {
      tripId?: string;
      countryCode?: string;
      routeDirectionId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    try {
      const tr = this.logTraceabilityAnalysis(entries, 'save', options?.tripId);
      if (this.isDecisionLogStrictWrite() && tr.errors.length > 0) {
        this.logger.error(
          `[TD-04][save] DECISION_LOG_STRICT_WRITE: skip batch persist (${tr.errors.length} traceability error(s))`,
        );
        return;
      }

      // 验证 tripId 是否为有效的 UUID，如果不是则设置为 null
      const validTripId = options?.tripId && this.isValidUUID(options.tripId) 
        ? options.tripId 
        : null;

      // 如果 tripId 不是有效的 UUID，记录警告
      if (options?.tripId && !this.isValidUUID(options.tripId)) {
        this.logger.warn(
          `tripId "${options.tripId}" 不是有效的 UUID 格式，将设置为 null。` +
          `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        );
      }

      await this.prisma.decisionLog.createMany({
        data: entries.map((entry) => ({
          tripId: validTripId,
          countryCode: options?.countryCode,
          routeDirectionId: options?.routeDirectionId,
          persona: entry.persona,
          action: entry.action,
          decisionSource: entry.decisionSource,
          decisionStage: entry.decisionStage,
          explanation: entry.explanation,
          reasonCodes: entry.reasonCodes,
          evidenceRefs: entry.evidenceRefs || [],
          timestamp: new Date(entry.timestamp),
          metadata: mergeMetadataWithJepaTrace(
            this.enrichMetadataWithFacts({
              metadata: {
                ...(((options?.metadata as Record<string, unknown> | undefined) ?? undefined) || {}),
                ...((entry.metadata ?? {}) as Record<string, unknown>),
              },
              entry: { reasonCodes: entry.reasonCodes, timestamp: entry.timestamp, action: entry.action },
            }),
            entry.jepaTrace,
          ) as Prisma.InputJsonValue,
        })),
      });
      this.logger.debug(`Saved ${entries.length} decision logs${validTripId ? ` for tripId: ${validTripId}` : ' (no tripId)'}`);
    } catch (error) {
      this.logger.error(`Failed to save decision logs: ${error}`, error instanceof Error ? error.stack : undefined);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 查询决策日志
   */
  async queryLogs(filters: {
    tripId?: string;
    requestId?: string;
    countryCode?: string;
    routeDirectionId?: string;
    persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
    action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    decisionStage?: DecisionStage;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<DecisionLogEntry[]> {
    const where: any = {};

    // 验证 tripId 是否为有效的 UUID，如果不是则跳过该查询条件
    if (filters.tripId) {
      if (this.isValidUUID(filters.tripId)) {
        where.tripId = filters.tripId;
      } else {
        // Replay / request-bound reads may use requestId instead of a persisted trip UUID.
        this.logger.warn(
          `queryLogs: tripId "${filters.tripId}" 不是有效的 UUID 格式，将跳过该查询条件。` +
            `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
        );
        if (!filters.requestId) {
          return [];
        }
      }
    }
    if (filters.requestId) {
      where.metadata = {
        path: ['requestId'],
        equals: filters.requestId,
      };
    }
    if (filters.countryCode) {
      where.countryCode = filters.countryCode;
    }
    if (filters.routeDirectionId) {
      where.routeDirectionId = filters.routeDirectionId;
    }
    if (filters.persona) {
      where.persona = filters.persona;
    }
    if (filters.decisionSource) {
      where.decisionSource = filters.decisionSource;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.decisionStage) {
      where.decisionStage = filters.decisionStage;
    }
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    const logs = await this.prisma.decisionLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 1000,
    });

    const mapped = logs.map((log) => this.mapRowToDecisionLogEntry(log));

    this.logTraceabilityAnalysis(mapped, 'read', filters.tripId ?? filters.requestId);

    return mapped;
  }

  /**
   * 根据 ID 获取单个决策日志
   */
  async getLogById(logId: string): Promise<DecisionLogEntry | null> {
    try {
      const log = await this.prisma.decisionLog.findUnique({
        where: { id: logId },
      });

      if (!log) {
        return null;
      }

      const entry = this.mapRowToDecisionLogEntry(log);
      this.logTraceabilityAnalysis([entry], 'read', log.tripId ?? undefined);
      return entry;
    } catch (error: any) {
      this.logger.error(`获取决策日志失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新决策日志的元数据
   */
  async updateLogMetadata(
    logId: string,
    metadata: Record<string, any>,
  ): Promise<DecisionLogEntry> {
    try {
      // 先获取现有日志
      const existingLog = await this.prisma.decisionLog.findUnique({
        where: { id: logId },
      });

      if (!existingLog) {
        throw new Error(`决策日志 ${logId} 不存在`);
      }

      // 合并元数据
      const updatedMetadata = {
        ...((existingLog.metadata as Record<string, any>) || {}),
        ...metadata,
      };

      // 更新日志
      const updatedLog = await this.prisma.decisionLog.update({
        where: { id: logId },
        data: {
          metadata: updatedMetadata,
        },
      });

      const entry = this.mapRowToDecisionLogEntry(updatedLog);
      this.logTraceabilityAnalysis([entry], 'read', updatedLog.tripId ?? undefined);
      return entry;
    } catch (error: any) {
      this.logger.error(`更新决策日志元数据失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 分页查询决策日志（后台管理）
   */
  async queryLogsPaginated(filters: {
    tripId?: string;
    userId?: string; // 通过 tripId 关联查询
    persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
    action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    items: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.tripId) {
      where.tripId = filters.tripId;
    }
    if (filters.persona) {
      where.persona = filters.persona;
    }
    if (filters.decisionSource) {
      where.decisionSource = filters.decisionSource;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    // 如果提供了 userId，需要通过 Trip 关联查询
    if (filters.userId) {
      where.trip = {
        collaborators: {
          some: {
            userId: filters.userId,
          },
        },
      };
    }

    // 排序
    const orderBy: any = {};
    const sortBy = filters.sortBy || 'timestamp';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    // 查询总数
    const total = await this.prisma.decisionLog.count({ where });

    // 查询数据
    const logs = await this.prisma.decisionLog.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    });

    // 转换为响应格式
    const items = logs.map(log => ({
      id: log.id,
      tripId: log.tripId,
      userId: undefined, // 需要关联查询
      persona: log.persona,
      action: log.action,
      explanation: log.explanation,
      reasonCodes: log.reasonCodes,
      decisionSource: log.decisionSource,
      decisionStage: (log as any).decisionStage || 'FINALIZE',
      timestamp: log.timestamp.toISOString(),
      countryCode: log.countryCode,
      routeDirectionId: log.routeDirectionId,
      metadata: log.metadata || {},
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取决策日志详情（包含完整信息）
   */
  async getLogDetailById(logId: string): Promise<any | null> {
    try {
      const log = await this.prisma.decisionLog.findUnique({
        where: { id: logId },
        include: {
          outcomes: true,
        },
      });

      if (!log) {
        return null;
      }

      return {
        id: log.id,
        tripId: log.tripId,
        countryCode: log.countryCode,
        routeDirectionId: log.routeDirectionId,
        persona: log.persona,
        action: log.action,
        decisionSource: log.decisionSource,
        decisionStage: (log as any).decisionStage || 'FINALIZE',
        explanation: log.explanation,
        reasonCodes: log.reasonCodes,
        evidenceRefs: log.evidenceRefs,
        timestamp: log.timestamp.toISOString(),
        metadata: log.metadata || {},
        availableOptions: (log as any).availableOptions,
        userChoice: (log as any).userChoice,
        userReasoning: (log as any).userReasoning,
        confidenceLevel: (log as any).confidenceLevel,
        systemRecommendation: (log as any).systemRecommendation,
        alignmentScore: (log as any).alignmentScore,
        outcomes: log.outcomes || [],
      };
    } catch (error: any) {
      this.logger.error(`获取决策日志详情失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 查询原始决策日志（用于导出）
   */
  async queryRawLogs(filters: {
    tripId?: string;
    persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
    action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    const where: any = {};

    if (filters.tripId) {
      where.tripId = filters.tripId;
    }
    if (filters.persona) {
      where.persona = filters.persona;
    }
    if (filters.decisionSource) {
      where.decisionSource = filters.decisionSource;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    return await this.prisma.decisionLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 10000,
    });
  }
}

