// src/trips/decision/services/decision-log-storage.service.ts
/**
 * Decision Log Storage Service（决策日志存储服务）
 * 
 * 负责将 DecisionLogEntry 写入数据库
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionLogEntry, DecisionStage } from '../shared/decision-result.types';

@Injectable()
export class DecisionLogStorageService {
  private readonly logger = new Logger(DecisionLogStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

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
          metadata: options?.metadata || {},
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
        data: entries.map(entry => ({
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
          metadata: options?.metadata || {},
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
        // 如果 tripId 不是有效的 UUID，记录警告并返回空结果
        this.logger.warn(
          `queryLogs: tripId "${filters.tripId}" 不是有效的 UUID 格式，将跳过该查询条件。` +
          `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        );
        return [];
      }
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

    return logs.map(log => ({
      persona: log.persona as 'ABU' | 'DR_DRE' | 'NEPTUNE',
      action: log.action as 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE',
      explanation: log.explanation,
      reasonCodes: log.reasonCodes,
      evidenceRefs: log.evidenceRefs,
      timestamp: log.timestamp.toISOString(),
      decisionSource: log.decisionSource as 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC',
      decisionStage: ((log as any).decisionStage || 'FINALIZE') as DecisionStage,
    }));
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

      return {
        persona: log.persona as 'ABU' | 'DR_DRE' | 'NEPTUNE',
        action: log.action as 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE',
        explanation: log.explanation,
        reasonCodes: log.reasonCodes,
        evidenceRefs: log.evidenceRefs,
        timestamp: log.timestamp.toISOString(),
        decisionSource: log.decisionSource as 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC',
        decisionStage: ((log as any).decisionStage || 'FINALIZE') as DecisionStage,
      };
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

      return {
        persona: updatedLog.persona as 'ABU' | 'DR_DRE' | 'NEPTUNE',
        action: updatedLog.action as 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE',
        explanation: updatedLog.explanation,
        reasonCodes: updatedLog.reasonCodes,
        evidenceRefs: updatedLog.evidenceRefs,
        timestamp: updatedLog.timestamp.toISOString(),
        decisionSource: updatedLog.decisionSource as 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC',
        decisionStage: ((updatedLog as any).decisionStage || 'FINALIZE') as DecisionStage,
      };
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

