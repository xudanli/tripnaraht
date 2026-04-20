// src/skills/decision/decision-log-append.skill.ts
/**
 * tripnara.decision.logAppend
 * 
 * P1: 决策日志写入（可检索事件流）
 * 
 * 把三人格输出写入可检索事件流
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';

export interface DecisionLogAppendInput extends SkillInput {
  /** Trip ID */
  tripId?: string;
  
  /** 国家代码 */
  countryCode?: string;
  
  /** 路线方向 ID */
  routeDirectionId?: string;
  
  /** 决策日志条目 */
  entries: Array<{
    /** Agent 名称（Abu / Dr.Dre / Neptune） */
    persona: string;
    
    /** 动作类型 */
    action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    
    /** 原因代码 */
    reasonCodes: string[];
    
    /** 详细说明 */
    explanation: string;
    
    /** 决策来源 */
    decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
    
    /** 决策阶段 */
    decisionStage?: 'ROUTE_PICK' | 'DEM_EVIDENCE' | 'ABU_GATE' | 'PACE_ADJUST' | 'SPATIAL_REPAIR' | 'READINESS' | 'FINALIZE';
    
    /** 证据引用 */
    evidenceRefs?: string[];
    
    /** 时间戳（可选，默认现在） */
    timestamp?: string;

    /** Optional structured metadata for replay/audit (merged into DB metadata). */
    metadata?: Record<string, any>;

    /** Optional JEPA trace payload stored in metadata.jepaTrace */
    jepaTrace?: Record<string, any>;
  }>;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

export interface DecisionLogAppendOutput extends SkillOutput {
  /** 写入成功的条目数 */
  writtenCount: number;
  
  /** 写入的日志 ID 列表 */
  logIds: string[];
  
  /** 写入结果摘要 */
  summary: {
    totalEntries: number;
    successfulEntries: number;
    failedEntries: number;
    errors?: string[];
  };
}

@Injectable()
export class DecisionLogAppendSkill implements Skill<DecisionLogAppendInput, DecisionLogAppendOutput> {
  private readonly logger = new Logger(DecisionLogAppendSkill.name);

  metadata = {
    name: 'decision.logAppend',
    description: '决策日志写入：把三人格输出写入可检索事件流',
    version: '1.0.0',
    category: 'decision' as const,
  };

  constructor(
    @Inject('PrismaService') @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly decisionLogStorage?: DecisionLogStorageService,
  ) {}

  async execute(input: DecisionLogAppendInput): Promise<DecisionLogAppendOutput> {
    this.logger.debug(
      `执行 decision.logAppend: tripId=${input.tripId || 'none'}, entries=${input.entries.length}`,
    );

    const logIds: string[] = [];
    const errors: string[] = [];
    let successfulEntries = 0;

    try {
      if (!this.decisionLogStorage) {
        throw new Error('DecisionLogStorageService 未注入');
      }

      // 批量写入
      const logEntries: DecisionLogEntry[] = input.entries.map((entry) => ({
        persona: entry.persona as any,
        action: entry.action,
        reasonCodes: entry.reasonCodes,
        explanation: entry.explanation,
        decisionSource: (entry.decisionSource || 'HEURISTIC') as any,
        decisionStage: (entry.decisionStage || 'FINALIZE') as any,
        evidenceRefs: entry.evidenceRefs || [],
        timestamp: entry.timestamp || new Date().toISOString(),
        metadata: entry.metadata,
        jepaTrace: entry.jepaTrace as any,
      }));

      // 使用 DecisionLogStorageService 批量保存
      await this.decisionLogStorage.saveLogEntries(logEntries, {
        tripId: input.tripId,
        countryCode: input.countryCode,
        routeDirectionId: input.routeDirectionId,
        metadata: input.metadata,
      });

      // 从数据库获取写入的日志 ID（简化实现）
      if (this.prisma && input.tripId) {
        const savedLogs = await this.prisma.decisionLog.findMany({
          where: {
            tripId: input.tripId,
          },
          orderBy: {
            timestamp: 'desc',
          },
          take: input.entries.length,
        });

        logIds.push(...savedLogs.map((log) => log.id));
        successfulEntries = savedLogs.length;
      } else {
        successfulEntries = input.entries.length;
      }

      return {
        writtenCount: successfulEntries,
        logIds,
        summary: {
          totalEntries: input.entries.length,
          successfulEntries,
          failedEntries: input.entries.length - successfulEntries,
          errors: errors.length > 0 ? errors : undefined,
        },
      };
    } catch (error: any) {
      this.logger.error(`决策日志写入失败: ${error.message}`, error.stack);
      errors.push(error.message);

      return {
        writtenCount: successfulEntries,
        logIds,
        summary: {
          totalEntries: input.entries.length,
          successfulEntries,
          failedEntries: input.entries.length - successfulEntries,
          errors,
        },
      };
    }
  }
}