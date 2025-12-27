// src/trips/decision/services/decision-log-storage.service.ts
/**
 * Decision Log Storage Service（决策日志存储服务）
 * 
 * 负责将 DecisionLogEntry 写入数据库
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionLogEntry } from '../shared/decision-result.types';

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
    }));
  }
}

