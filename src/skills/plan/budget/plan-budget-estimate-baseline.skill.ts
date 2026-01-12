// src/skills/plan/budget/plan-budget-estimate-baseline.skill.ts
/**
 * skill.plan.budget.estimateBaseline
 * 
 * 目的：快速给出预算拆分与区间估算（交通/住宿/餐饮/门票/体验/缓冲）
 * 
 * System 1 技能：快速估算
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { BudgetBreakdown, PlanState } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanBudgetEstimateBaselineInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
  
  /** 目的地信息 */
  destination: {
    country?: string;
    city?: string;
  };
}

export interface PlanBudgetEstimateBaselineOutput extends SkillOutput {
  /** 预算拆分 */
  budgetBreakdown: BudgetBreakdown;
}

@Injectable()
export class PlanBudgetEstimateBaselineSkill implements Skill<PlanBudgetEstimateBaselineInput, PlanBudgetEstimateBaselineOutput> {
  private readonly logger = new Logger(PlanBudgetEstimateBaselineSkill.name);

  metadata = {
    name: 'plan.budget.estimateBaseline',
    description: '快速给出预算拆分与区间估算（交通/住宿/餐饮/门票/体验/缓冲）',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: PlanBudgetEstimateBaselineInput): Promise<PlanBudgetEstimateBaselineOutput> {
    this.logger.debug(`执行 plan.budget.estimateBaseline: planId=${input.planState.plan_id}`);

    try {
      const userPrompt = this.buildPrompt(input.planState, input.destination);
      const fullPrompt = `你是一位经验丰富的旅行预算规划师。你的任务是基于行程信息快速估算预算拆分。

预算类别：
1. transportation（交通）：包括跨城交通、市内交通
2. accommodation（住宿）：根据住宿档位估算
3. food（餐饮）：根据目的地和天数估算
4. tickets（门票）：景点门票、活动门票
5. experiences（体验）：特殊体验、向导等
6. buffer（缓冲）：应急和意外支出，通常占总预算的 10-15%

每个类别需要提供：
- min: 最低估算
- max: 最高估算
- estimated: 最可能值
- assumptions: 假设条件（例如：酒店档位、交通方式、旺季/淡季）

confidence: 估算的置信度（low/medium/high）

${userPrompt}`;
      
      const budgetBreakdownStr = await this.llmService.callLlmWithSchema(
        LlmProvider.OPENAI,
        fullPrompt,
        {
          type: 'object',
          properties: {
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    enum: ['transportation', 'accommodation', 'food', 'tickets', 'experiences', 'buffer'],
                  },
                  min: { type: 'number' },
                  max: { type: 'number' },
                  estimated: { type: 'number' },
                  assumptions: { type: 'array', items: { type: 'string' } },
                },
                required: ['category', 'min', 'max', 'estimated', 'assumptions'],
              },
            },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            assumptions: { type: 'array', items: { type: 'string' } },
          },
          required: ['categories', 'confidence', 'assumptions'],
        },
      );

      const budgetBreakdown = JSON.parse(budgetBreakdownStr) as BudgetBreakdown;

      return {
        budgetBreakdown,
      };
    } catch (error: any) {
      this.logger.error(`估算预算失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(planState: PlanState, destination: any): string {
    const parts: string[] = [];
    
    parts.push(`## 行程信息`);
    parts.push(`目的地: ${destination.city || destination.country || '未指定'}`);
    parts.push(`天数: ${planState.constraints.time.days} 天`);
    
    if (planState.constraints.budget?.total) {
      parts.push(`总预算: ${planState.constraints.budget.total} ${planState.constraints.budget.currency || 'CNY'}`);
    }
    
    if (planState.constraints.travelMode) {
      parts.push(`交通模式: ${planState.constraints.travelMode}`);
    }
    
    if (planState.constraints.accommodation?.level) {
      parts.push(`住宿档位: ${planState.constraints.accommodation.level}`);
    }
    
    if (planState.mobility.transferSegments.length > 0) {
      parts.push(`跨城段数: ${planState.mobility.transferSegments.length}`);
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请快速估算预算拆分，包括：交通、住宿、餐饮、门票、体验、缓冲`);
    parts.push(`每个类别提供 min/max/estimated 和 assumptions`);
    
    return parts.join('\n');
  }
}
