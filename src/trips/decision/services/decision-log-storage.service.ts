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
      await this.prisma.decisionLog.create({
        data: {
          tripId: options?.tripId,
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
      this.logger.debug(`Saved decision log: ${entry.persona} ${entry.action} (${entry.decisionSource})`);
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
      await this.prisma.decisionLog.createMany({
        data: entries.map(entry => ({
          tripId: options?.tripId,
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
      this.logger.debug(`Saved ${entries.length} decision logs`);
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
    decisionStage?: DecisionStage;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<DecisionLogEntry[]> {
    const where: any = {};

    if (filters.tripId) {
      where.tripId = filters.tripId;
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
}

