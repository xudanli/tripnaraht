// src/skills/decision/decision-stage.skill.ts
/**
 * tripnara.decision.stage
 * 
 * P0: 决策阶段查询
 * 
 * 查询指定条件下的决策日志，按决策阶段（decisionStage）分组统计
 * 用于 E2E 回放、A/B 测试、错误聚类
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { DecisionStage, DecisionLogEntry, DecisionPersona, DecisionSource } from '../../trips/decision/shared/decision-result.types';

export interface DecisionStageInput extends BaseSkillInput {
  /** Trip ID */
  tripId?: string;
  
  /** 路线方向 ID */
  routeDirectionId?: string;
  
  /** 国家代码 */
  countryCode?: string;
  
  /** 决策阶段过滤（可选） */
  stage?: DecisionStage;
  
  /** 开始日期（ISO 8601） */
  startDate?: string;
  
  /** 结束日期（ISO 8601） */
  endDate?: string;
  
  /** 返回数量限制 */
  limit?: number;
}

export interface DecisionStageOutput extends SkillOutput {
  /** 按阶段分组的日志 */
  stages: Array<{
    stage: DecisionStage;
    count: number;
    logs: DecisionLogEntry[];
  }>;
  
  /** 汇总统计 */
  summary: {
    totalLogs: number;
    stageDistribution: Record<DecisionStage, number>;
    personaDistribution: Record<DecisionPersona, number>;
    sourceDistribution: Record<DecisionSource, number>;
  };
}

@Injectable()
export class DecisionStageSkill implements Skill<DecisionStageInput, DecisionStageOutput> {
  private readonly logger = new Logger(DecisionStageSkill.name);

  metadata = {
    name: 'decision.stage',
    description: '决策阶段查询：按决策阶段（decisionStage）分组统计决策日志，用于 E2E 回放、A/B 测试、错误聚类',
    version: '1.0.0',
    category: 'decision' as const,
  };

  constructor(
    @Optional() private readonly decisionLogStorage?: DecisionLogStorageService,
  ) {}

  async execute(input: DecisionStageInput): Promise<DecisionStageOutput> {
    this.logger.debug(
      `执行 decision.stage: tripId=${input.tripId || 'none'}, stage=${input.stage || 'all'}`,
    );

    try {
      if (!this.decisionLogStorage) {
        throw new Error('DecisionLogStorageService 未注入');
      }

      // 构建查询过滤器
      const filters: Parameters<typeof this.decisionLogStorage.queryLogs>[0] = {
        tripId: input.tripId,
        routeDirectionId: input.routeDirectionId,
        countryCode: input.countryCode,
        decisionStage: input.stage,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        limit: input.limit || 1000,
      };

      // 查询日志
      const logs = await this.decisionLogStorage.queryLogs(filters);

      // 按阶段分组
      const stageMap = new Map<DecisionStage, DecisionLogEntry[]>();
      const personaMap = new Map<DecisionPersona, number>();
      const sourceMap = new Map<DecisionSource, number>();

      // 所有可能的阶段
      const allStages: DecisionStage[] = [
        'ROUTE_PICK',
        'DEM_EVIDENCE',
        'ABU_GATE',
        'PACE_ADJUST',
        'SPATIAL_REPAIR',
        'READINESS',
        'FINALIZE',
        'PLAN_SCORE',
        'PLAN_EDIT',
      ];

      // 初始化所有阶段
      for (const stage of allStages) {
        stageMap.set(stage, []);
      }

      // 分组统计
      for (const log of logs) {
        // 按阶段分组
        const stage = log.decisionStage || 'FINALIZE';
        const stageLogs = stageMap.get(stage) || [];
        stageLogs.push(log);
        stageMap.set(stage, stageLogs);

        // 按人格统计
        const personaCount = personaMap.get(log.persona) || 0;
        personaMap.set(log.persona, personaCount + 1);

        // 按来源统计
        const sourceCount = sourceMap.get(log.decisionSource) || 0;
        sourceMap.set(log.decisionSource, sourceCount + 1);
      }

      // 构建阶段分布
      const stageDistribution: Record<DecisionStage, number> = {
        ROUTE_PICK: 0,
        DEM_EVIDENCE: 0,
        ABU_GATE: 0,
        PACE_ADJUST: 0,
        SPATIAL_REPAIR: 0,
        READINESS: 0,
        FINALIZE: 0,
        PLAN_SCORE: 0,
        PLAN_EDIT: 0,
      };

      for (const [stage, stageLogs] of stageMap.entries()) {
        stageDistribution[stage] = stageLogs.length;
      }

      // 构建返回结果
      const stages = Array.from(stageMap.entries())
        .map(([stage, logs]) => ({
          stage,
          count: logs.length,
          logs,
        }))
        .filter((item) => item.count > 0) // 只返回有日志的阶段
        .sort((a, b) => {
          // 按阶段顺序排序
          const stageOrder: Record<DecisionStage, number> = {
            ROUTE_PICK: 1,
            DEM_EVIDENCE: 2,
            ABU_GATE: 3,
            PACE_ADJUST: 4,
            SPATIAL_REPAIR: 5,
            READINESS: 6,
            FINALIZE: 7,
            PLAN_SCORE: 8,
            PLAN_EDIT: 9,
          };
          return stageOrder[a.stage] - stageOrder[b.stage];
        });

      return {
        stages,
        summary: {
          totalLogs: logs.length,
          stageDistribution,
          personaDistribution: {
            ABU: personaMap.get('ABU') || 0,
            DR_DRE: personaMap.get('DR_DRE') || 0,
            NEPTUNE: personaMap.get('NEPTUNE') || 0,
            EXPECTED_UTILITY: personaMap.get('EXPECTED_UTILITY') || 0,
            USER_ACTION: personaMap.get('USER_ACTION') || 0,
          },
          sourceDistribution: {
            PHYSICAL: sourceMap.get('PHYSICAL') || 0,
            HUMAN: sourceMap.get('HUMAN') || 0,
            PHILOSOPHY: sourceMap.get('PHILOSOPHY') || 0,
            HEURISTIC: sourceMap.get('HEURISTIC') || 0,
            UTILITY: sourceMap.get('UTILITY') || 0,
            USER: sourceMap.get('USER') || 0,
          },
        },
      };
    } catch (error: any) {
      this.logger.error(`决策阶段查询失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
