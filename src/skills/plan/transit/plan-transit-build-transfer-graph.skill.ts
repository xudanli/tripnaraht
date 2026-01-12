// src/skills/plan/transit/plan-transit-build-transfer-graph.skill.ts
/**
 * skill.plan.transit.buildTransferGraph
 * 
 * 目的：把跨城段、关键换乘段抽成"可达图"，识别不可达/高风险段
 * 
 * System 1 技能：快速构建和标记
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, TransferSegment } from '../shared/plan-state.types';

export interface PlanTransitBuildTransferGraphInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
}

export interface PlanTransitBuildTransferGraphOutput extends SkillOutput {
  /** 可达图 */
  transferGraph: {
    segments: TransferSegment[];
    riskSegments: string[]; // segment IDs with high risk
    infeasibleSegments: string[]; // segment IDs that are infeasible
  };
}

@Injectable()
export class PlanTransitBuildTransferGraphSkill implements Skill<PlanTransitBuildTransferGraphInput, PlanTransitBuildTransferGraphOutput> {
  private readonly logger = new Logger(PlanTransitBuildTransferGraphSkill.name);

  metadata = {
    name: 'plan.transit.buildTransferGraph',
    description: '构建跨城段可达图，识别不可达/高风险段',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanTransitBuildTransferGraphInput): Promise<PlanTransitBuildTransferGraphOutput> {
    this.logger.debug(`执行 plan.transit.buildTransferGraph: planId=${input.planState.plan_id}`);

    try {
      const segments = input.planState.mobility.transferSegments;
      
      // 分析每个段的可达性和风险
      const analyzedSegments = segments.map(segment => {
        const analyzed = { ...segment };
        
        // 标记风险（简化版，实际应该调用交通API）
        if (analyzed.riskFlags.length > 0) {
          const hasHighRisk = analyzed.riskFlags.some(flag => flag.severity === 'high');
          if (hasHighRisk) {
            analyzed.feasibility = 'needs_confirmation';
          }
        }
        
        // 如果没有可用交通方式，标记为不可达
        if (!analyzed.availableModes || analyzed.availableModes.length === 0) {
          analyzed.feasibility = 'infeasible';
        }
        
        return analyzed;
      });

      const riskSegments = analyzedSegments
        .filter(s => s.riskFlags.some(f => f.severity === 'high'))
        .map(s => s.id);

      const infeasibleSegments = analyzedSegments
        .filter(s => s.feasibility === 'infeasible')
        .map(s => s.id);

      return {
        transferGraph: {
          segments: analyzedSegments,
          riskSegments,
          infeasibleSegments,
        },
      };
    } catch (error: any) {
      this.logger.error(`构建可达图失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
