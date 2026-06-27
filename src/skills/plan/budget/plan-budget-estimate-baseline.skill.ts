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
    description: '估算 plan 预算基线与区间（交通/住宿/餐饮/门票/体验/缓冲）。在 PLAN_GEN 早期缺省 budget 或用户询问大概花费时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  /**
   * 从 LLM 响应中提取 JSON（处理可能包含 markdown 代码块标记的情况）
   */
  private extractJSON(response: string): any {
    if (!response || typeof response !== 'string') {
      throw new Error('响应为空或格式不正确');
    }

    let cleaned = response.trim();
    
    // 移除 markdown 代码块标记（更严格的匹配，支持多行）
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试提取 JSON 对象（如果响应中包含其他文本）
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // 再次清理可能的空白字符
    cleaned = cleaned.trim();
    
    try {
      return JSON.parse(cleaned);
    } catch (parseError: any) {
      this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
      this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
      throw parseError;
    }
  }

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
      
      try {
        const budgetBreakdownStr = await this.llmService.callLlmWithSchema(
          LlmProvider.ANTHROPIC,
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
          input.tokenContext,
        );

        const budgetBreakdown = this.extractJSON(budgetBreakdownStr) as BudgetBreakdown;

        return {
          budgetBreakdown,
        };
      } catch (llmError: any) {
        // LLM 调用失败，返回默认预算拆分
        const isTimeout = llmError.message?.includes('超时') || llmError.message?.includes('timeout');
        if (isTimeout) {
          this.logger.warn(`预算估算超时，使用默认预算拆分: ${llmError.message}`);
        } else {
          this.logger.warn(`预算估算失败，使用默认预算拆分: ${llmError.message}`);
        }
        
        return this.getDefaultBudgetBreakdown(input.planState, input.destination);
      }
    } catch (error: any) {
      this.logger.error(`估算预算失败: ${error.message}`, error.stack);
      // 返回默认预算拆分，不抛出异常
      return this.getDefaultBudgetBreakdown(input.planState, input.destination);
    }
  }

  private buildPrompt(planState: PlanState, destination: any): string {
    const parts: string[] = [];
    
    parts.push(`## 行程信息`);
    parts.push(`目的地: ${destination.city || destination.country || '未指定'}`);
    parts.push(`天数: ${this.resolvePlanDays(planState)} 天`);
    
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

  private resolvePlanDays(planState: PlanState): number {
    const days = planState.constraints?.time?.days;
    if (typeof days === 'number' && days > 0) {
      return days;
    }
    const fromSegments = planState.itinerary?.segments?.length ?? 0;
    return fromSegments > 0 ? fromSegments : 1;
  }

  /**
   * 获取默认预算拆分（当 LLM 调用失败时使用）
   */
  private getDefaultBudgetBreakdown(planState: PlanState, _destination: any): PlanBudgetEstimateBaselineOutput {
    const days = this.resolvePlanDays(planState);
    const totalBudget = planState.constraints.budget?.total || 20000; // 默认 2 万
    
    // 简单的默认预算拆分（基于天数）
    const perDayBudget = totalBudget / days;
    
    return {
      budgetBreakdown: {
        categories: [
          {
            category: 'transportation',
            min: perDayBudget * 0.15 * days,
            max: perDayBudget * 0.25 * days,
            estimated: perDayBudget * 0.20 * days,
            assumptions: ['基于默认交通方式估算'],
          },
          {
            category: 'accommodation',
            min: perDayBudget * 0.25 * days,
            max: perDayBudget * 0.40 * days,
            estimated: perDayBudget * 0.30 * days,
            assumptions: ['基于中等档位住宿估算'],
          },
          {
            category: 'food',
            min: perDayBudget * 0.20 * days,
            max: perDayBudget * 0.30 * days,
            estimated: perDayBudget * 0.25 * days,
            assumptions: ['基于目的地消费水平估算'],
          },
          {
            category: 'tickets',
            min: perDayBudget * 0.10 * days,
            max: perDayBudget * 0.20 * days,
            estimated: perDayBudget * 0.15 * days,
            assumptions: ['基于景点门票估算'],
          },
          {
            category: 'experiences',
            min: perDayBudget * 0.05 * days,
            max: perDayBudget * 0.15 * days,
            estimated: perDayBudget * 0.10 * days,
            assumptions: ['基于可选体验项目估算'],
          },
          {
            category: 'buffer',
            min: totalBudget * 0.10,
            max: totalBudget * 0.15,
            estimated: totalBudget * 0.12,
            assumptions: ['应急和意外支出'],
          },
        ],
        confidence: 'low',
        assumptions: ['LLM 调用失败，使用默认预算拆分'],
      },
    };
  }
}
