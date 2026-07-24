// src/skills/plan/transit/plan-transit-suggest-modes.skill.ts
/**
 * skill.plan.transit.suggestModes
 * 
 * 目的：同一段 A→B 给出多模式对比（飞机/火车/大巴/自驾）
 * 
 * System 2 技能：需要推理和对比
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanTransitSuggestModesInput extends SkillInput {
  /** 起点 */
  from: {
    city: string;
    coordinates?: [number, number];
  };
  
  /** 终点 */
  to: {
    city: string;
    coordinates?: [number, number];
  };
  
  /** 日期（可选） */
  date?: string;
}

export interface PlanTransitSuggestModesOutput extends SkillOutput {
  /** 交通方式对比 */
  modes: Array<{
    mode: 'flight' | 'train' | 'bus' | 'self_drive' | 'other';
    time: number; // 分钟
    cost: number;
    reliability: 'high' | 'medium' | 'low';
    effort: 'low' | 'medium' | 'high';
    recommendation: string;
    whyRecommended?: string;
    whyNotRecommended?: string;
  }>;
}

@Injectable()
export class PlanTransitSuggestModesSkill implements Skill<PlanTransitSuggestModesInput, PlanTransitSuggestModesOutput> {
  private readonly logger = new Logger(PlanTransitSuggestModesSkill.name);

  metadata = {
    name: 'plan.transit.suggestModes',
    description: '对比 plan transit 同段 A→B 多模式交通（飞机/火车/大巴/自驾）。在跨城段 mode 选择或 budget/时间权衡时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: PlanTransitSuggestModesInput): Promise<PlanTransitSuggestModesOutput> {
    this.logger.debug(`执行 plan.transit.suggestModes: ${input.from.city} → ${input.to.city}`);

    try {
      const userPrompt = this.buildPrompt(input);
      const fullPrompt = `你是一位经验丰富的交通规划师。你的任务是为同一段 A→B 给出多模式交通对比。

交通方式：
1. flight（飞机）：速度快但成本高，适合长距离
2. train（火车）：平衡速度和成本，适合中长距离
3. bus（大巴）：成本低但时间长，适合短距离或预算有限
4. self_drive（自驾）：灵活但需要租车，适合多目的地
5. other（其他）：轮渡、包车等

每个方式需要评估：
- time: 总耗时（分钟）
- cost: 预估成本
- reliability: 可靠性（high/medium/low）
- effort: 所需精力（low/medium/high）
- recommendation: 推荐理由或为什么不推荐

优先推荐平衡时间、成本和可靠性的方案。

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        LlmProvider.ANTHROPIC,
        fullPrompt,
        {
          type: 'object',
          properties: {
            modes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  mode: {
                    type: 'string',
                    enum: ['flight', 'train', 'bus', 'self_drive', 'other'],
                  },
                  time: { type: 'number' },
                  cost: { type: 'number' },
                  reliability: { type: 'string', enum: ['high', 'medium', 'low'] },
                  effort: { type: 'string', enum: ['low', 'medium', 'high'] },
                  recommendation: { type: 'string' },
                  whyRecommended: { type: 'string' },
                  whyNotRecommended: { type: 'string' },
                },
                required: ['mode', 'time', 'cost', 'reliability', 'effort', 'recommendation'],
              },
            },
          },
          required: ['modes'],
        },
        input.tokenContext,
      );

      const result = JSON.parse(resultStr) as PlanTransitSuggestModesOutput;
      return result;
    } catch (error: any) {
      this.logger.error(`建议交通方式失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(input: PlanTransitSuggestModesInput): string {
    const parts: string[] = [];
    
    parts.push(`## 路线信息`);
    parts.push(`起点: ${input.from.city}`);
    parts.push(`终点: ${input.to.city}`);
    if (input.date) {
      parts.push(`日期: ${input.date}`);
    }
    if (input.from.coordinates && input.to.coordinates) {
      // 可以计算距离（简化版）
      parts.push(`坐标: ${input.from.coordinates} → ${input.to.coordinates}`);
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请为这段路线提供多种交通方式对比，包括：飞机、火车、大巴、自驾`);
    parts.push(`每个方式评估：时间、成本、可靠性、所需精力，并给出推荐理由`);
    
    return parts.join('\n');
  }
}
