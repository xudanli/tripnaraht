// src/skills/plan/constraints/plan-constraints-arbitrate-tradeoffs.skill.ts
/**
 * skill.plan.constraints.arbitrateTradeoffs
 * 
 * 目的：给"最小牺牲"仲裁结果（并要求用户确认关键取舍）
 * 
 * System 2 技能：需要推理和仲裁
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, ConflictDetection } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanConstraintsArbitrateTradeoffsInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
  
  /** 冲突列表 */
  conflicts: ConflictDetection;
}

export interface PlanConstraintsArbitrateTradeoffsOutput extends SkillOutput {
  /** 推荐解决方案 */
  recommendedResolution: {
    action: string;
    description: string;
    impact: string;
  };
  
  /** 备选方案 */
  options: Array<{
    action: string;
    description: string;
    impact: string;
  }>;
  
  /** 是否需要用户确认 */
  userConfirmationRequired: boolean;
}

@Injectable()
export class PlanConstraintsArbitrateTradeoffsSkill implements Skill<PlanConstraintsArbitrateTradeoffsInput, PlanConstraintsArbitrateTradeoffsOutput> {
  private readonly logger = new Logger(PlanConstraintsArbitrateTradeoffsSkill.name);

  metadata = {
    name: 'plan.constraints.arbitrateTradeoffs',
    description: '给"最小牺牲"仲裁结果，并要求用户确认关键取舍',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: PlanConstraintsArbitrateTradeoffsInput): Promise<PlanConstraintsArbitrateTradeoffsOutput> {
    this.logger.debug(`执行 plan.constraints.arbitrateTradeoffs: planId=${input.planState.plan_id}, conflicts=${input.conflicts.conflicts.length}`);

    try {
      const userPrompt = this.buildPrompt(input.planState, input.conflicts);
      const fullPrompt = `你是一位经验丰富的约束仲裁师。你的任务是在多个约束冲突中给出"最小牺牲"的仲裁结果。

仲裁原则：
1. 优先解决 critical 和 high 严重度的冲突
2. 选择对路线哲学影响最小的方案
3. 如果涉及关键取舍，必须标记需要用户确认
4. 提供多个备选方案供用户选择

每个方案必须包含：
- action: 具体行动
- description: 详细描述
- impact: 对整体计划的影响

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        LlmProvider.OPENAI,
        fullPrompt,
        {
          type: 'object',
          properties: {
            recommendedResolution: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                description: { type: 'string' },
                impact: { type: 'string' },
              },
              required: ['action', 'description', 'impact'],
            },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string' },
                  description: { type: 'string' },
                  impact: { type: 'string' },
                },
                required: ['action', 'description', 'impact'],
              },
            },
            userConfirmationRequired: { type: 'boolean' },
          },
          required: ['recommendedResolution', 'options', 'userConfirmationRequired'],
        },
      );

      const result = JSON.parse(resultStr) as PlanConstraintsArbitrateTradeoffsOutput;
      return result;
    } catch (error: any) {
      this.logger.error(`仲裁取舍失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(planState: PlanState, conflicts: ConflictDetection): string {
    const parts: string[] = [];
    
    parts.push(`## 当前计划`);
    parts.push(`天数: ${planState.constraints.time.days} 天`);
    
    parts.push(`\n## 检测到的冲突`);
    conflicts.conflicts.forEach(conflict => {
      parts.push(`- ${conflict.type} (${conflict.severity}): ${conflict.description}`);
      if (conflict.affectedDays) {
        parts.push(`  影响天数: ${conflict.affectedDays.join(', ')}`);
      }
      if (conflict.affectedSegments) {
        parts.push(`  影响段: ${conflict.affectedSegments.join(', ')}`);
      }
    });
    
    parts.push(`\n## 要求`);
    parts.push(`请给出"最小牺牲"的仲裁结果，优先解决 critical 和 high 严重度的冲突`);
    parts.push(`如果涉及关键取舍，标记需要用户确认`);
    
    return parts.join('\n');
  }
}
