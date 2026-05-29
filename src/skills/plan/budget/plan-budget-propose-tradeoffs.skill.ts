// src/skills/plan/budget/plan-budget-propose-tradeoffs.skill.ts
/**
 * skill.plan.budget.proposeTradeoffs
 * 
 * 目的：给出"最小牺牲"的降本方案（不破坏路线哲学）
 * 
 * System 2 技能：需要推理和取舍
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../../interfaces/skill.interface';
import { PlanState } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanBudgetProposeTradeoffsInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
  
  /** 需要节省的金额 */
  targetSavings: number;
}

export interface PlanBudgetProposeTradeoffsOutput extends SkillOutput {
  /** 降本方案列表 */
  options: Array<{
    action: string;
    savings: number;
    sacrifice: string;
    impact: {
      pace?: string;
      experience?: string;
      risk?: string;
    };
  }>;
}

@Injectable()
export class PlanBudgetProposeTradeoffsSkill implements Skill<PlanBudgetProposeTradeoffsInput, PlanBudgetProposeTradeoffsOutput> {
  private readonly logger = new Logger(PlanBudgetProposeTradeoffsSkill.name);

  metadata: SkillMetadata = {
    name: 'plan.budget.proposeTradeoffs',
    description:
      'plan.budget.proposeTradeoffs：提出 plan 最小牺牲的降本 tradeoff 方案，保持路线哲学。在 budget.detectOverrun 报超支且需可选减负方案时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['planState', 'targetSavings'],
      typeChecks: {
        targetSavings: {
          type: 'number',
          min: 0,
        },
      },
    },
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: PlanBudgetProposeTradeoffsInput): Promise<PlanBudgetProposeTradeoffsOutput> {
    this.logger.debug(`执行 plan.budget.proposeTradeoffs: planId=${input.planState.plan_id}, targetSavings=${input.targetSavings}`);

    try {
      const userPrompt = this.buildPrompt(input.planState, input.targetSavings);
      const fullPrompt = `你是一位经验丰富的旅行预算规划师。你的任务是在不破坏路线哲学的前提下，给出"最小牺牲"的降本方案。

降本方案类型：
1. 换城市：选择消费水平更低的替代城市
2. 减少移动日：合并行程，减少跨城交通
3. 换交通方式：选择更经济的交通方式（如大巴替代火车）
4. 降低住宿档位：从豪华降为中等，或从中等降为经济
5. 减少付费体验：减少或替换高成本的体验项目

每个方案必须包含：
- action: 具体行动
- savings: 能节省的金额
- sacrifice: 牺牲什么（体验、便利性等）
- impact: 对节奏/体验/风险的影响

优先推荐对路线哲学影响最小的方案。

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        LlmProvider.ANTHROPIC,
        fullPrompt,
        {
          type: 'object',
          properties: {
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string' },
                  savings: { type: 'number' },
                  sacrifice: { type: 'string' },
                  impact: {
                    type: 'object',
                    properties: {
                      pace: { type: 'string' },
                      experience: { type: 'string' },
                      risk: { type: 'string' },
                    },
                  },
                },
                required: ['action', 'savings', 'sacrifice', 'impact'],
              },
            },
          },
          required: ['options'],
        },
        input.tokenContext,
      );

      const result = JSON.parse(resultStr) as PlanBudgetProposeTradeoffsOutput;
      return result;
    } catch (error: any) {
      this.logger.error(`生成降本方案失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(planState: PlanState, targetSavings: number): string {
    const parts: string[] = [];
    
    parts.push(`## 当前计划`);
    parts.push(`目的地: ${planState.constraints.time.days} 天行程`);
    parts.push(`总预算: ${planState.constraints.budget?.total || '未指定'} ${planState.constraints.budget?.currency || 'CNY'}`);
    parts.push(`需要节省: ${targetSavings} ${planState.constraints.budget?.currency || 'CNY'}`);
    
    if (planState.budget.breakdown) {
      parts.push(`\n## 当前预算拆分`);
      planState.budget.breakdown.categories.forEach(cat => {
        parts.push(`${cat.category}: ${cat.estimated} (${cat.min}-${cat.max})`);
      });
    }
    
    if (planState.mobility.transferSegments.length > 0) {
      parts.push(`\n跨城段数: ${planState.mobility.transferSegments.length}`);
    }
    
    if (planState.constraints.accommodation?.level) {
      parts.push(`住宿档位: ${planState.constraints.accommodation.level}`);
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请给出"最小牺牲"的降本方案，目标节省 ${targetSavings} ${planState.constraints.budget?.currency || 'CNY'}`);
    parts.push(`每个方案必须说明：能省多少钱、牺牲什么、对节奏/体验/风险的影响`);
    
    return parts.join('\n');
  }
}
