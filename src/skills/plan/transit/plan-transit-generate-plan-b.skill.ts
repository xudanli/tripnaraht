// src/skills/plan/transit/plan-transit-generate-plan-b.skill.ts
/**
 * skill.plan.transit.generatePlanB
 * 
 * 目的：为高风险段生成 Plan B（替代城市、替代交通、替代时间窗）
 * 
 * System 2 技能：需要推理和替代方案生成
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { TransferSegment } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanTransitGeneratePlanBInput extends SkillInput {
  /** 高风险段 */
  segment: TransferSegment;
  
  /** 原计划上下文 */
  context?: any;
}

export interface PlanTransitGeneratePlanBOutput extends SkillOutput {
  /** Plan B 选项 */
  planBOptions: Array<{
    type: 'alternative_city' | 'alternative_transport' | 'alternative_timing';
    description: string;
    impact: {
      budget?: string;
      pace?: string;
      risk?: string;
    };
    recommendation: string;
  }>;
}

@Injectable()
export class PlanTransitGeneratePlanBSkill implements Skill<PlanTransitGeneratePlanBInput, PlanTransitGeneratePlanBOutput> {
  private readonly logger = new Logger(PlanTransitGeneratePlanBSkill.name);

  metadata = {
    name: 'plan.transit.generatePlanB',
    description: '为高风险段生成 Plan B（替代城市、替代交通、替代时间窗）',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: PlanTransitGeneratePlanBInput): Promise<PlanTransitGeneratePlanBOutput> {
    this.logger.debug(`执行 plan.transit.generatePlanB: segmentId=${input.segment.id}`);

    try {
      const userPrompt = this.buildPrompt(input.segment, input.context);
      const fullPrompt = `你是一位经验丰富的交通规划师。你的任务是为高风险段生成 Plan B 替代方案。

Plan B 类型：
1. alternative_city（替代城市）：选择可达性更好的替代目的地
2. alternative_transport（替代交通）：选择更可靠的交通方式
3. alternative_timing（替代时间窗）：调整出发/到达时间避开风险

每个 Plan B 必须包含：
- type: 替代类型
- description: 具体替代方案描述
- impact: 对预算/节奏/风险的影响
- recommendation: 推荐理由

优先推荐对整体行程影响最小的方案。

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        LlmProvider.ANTHROPIC,
        fullPrompt,
        {
          type: 'object',
          properties: {
            planBOptions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['alternative_city', 'alternative_transport', 'alternative_timing'],
                  },
                  description: { type: 'string' },
                  impact: {
                    type: 'object',
                    properties: {
                      budget: { type: 'string' },
                      pace: { type: 'string' },
                      risk: { type: 'string' },
                    },
                  },
                  recommendation: { type: 'string' },
                },
                required: ['type', 'description', 'impact', 'recommendation'],
              },
            },
          },
          required: ['planBOptions'],
        },
        input.tokenContext,
      );

      const result = JSON.parse(resultStr) as PlanTransitGeneratePlanBOutput;
      return result;
    } catch (error: any) {
      this.logger.error(`生成 Plan B 失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(segment: TransferSegment, _context?: any): string {
    const parts: string[] = [];
    
    parts.push(`## 高风险段信息`);
    parts.push(`起点: ${segment.from.city}`);
    parts.push(`终点: ${segment.to.city}`);
    parts.push(`可达性: ${segment.feasibility}`);
    
    if (segment.riskFlags.length > 0) {
      parts.push(`\n## 风险标记`);
      segment.riskFlags.forEach(flag => {
        parts.push(`- ${flag.type}: ${flag.severity} - ${flag.description}`);
      });
    }
    
    if (segment.availableModes && segment.availableModes.length > 0) {
      parts.push(`\n## 可用交通方式`);
      segment.availableModes.forEach(mode => {
        parts.push(`- ${mode.mode}: ${mode.time}分钟, ${mode.cost}元, 可靠性${mode.reliability}`);
      });
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请为这个高风险段生成 Plan B 替代方案，包括：替代城市、替代交通、替代时间窗`);
    parts.push(`每个方案说明对预算/节奏/风险的影响`);
    
    return parts.join('\n');
  }
}
