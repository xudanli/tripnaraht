// src/skills/plan/architect/plan-architect-compare-options.skill.ts
/**
 * skill.plan.architect.compareOptions
 * 
 * 目的：把多个方案做"可解释对比"，输出推荐与取舍
 * 
 * System 2 技能：需要推理和对比分析
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanSkeleton, OptionComparison } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanArchitectCompareOptionsInput extends SkillInput {
  /** 要对比的方案列表 */
  options: PlanSkeleton[];
  
  /** 规划上下文（用于理解约束） */
  context?: any;
}

export interface PlanArchitectCompareOptionsOutput extends SkillOutput {
  /** 对比结果 */
  comparison: OptionComparison;
}

@Injectable()
export class PlanArchitectCompareOptionsSkill implements Skill<PlanArchitectCompareOptionsInput, PlanArchitectCompareOptionsOutput> {
  private readonly logger = new Logger(PlanArchitectCompareOptionsSkill.name);

  metadata = {
    name: 'plan.architect.compareOptions',
    description: '对多个行程骨架方案进行可解释对比，输出推荐与取舍理由',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: PlanArchitectCompareOptionsInput): Promise<PlanArchitectCompareOptionsOutput> {
    this.logger.debug(`执行 plan.architect.compareOptions: ${input.options.length} 个方案`);

    try {
      const userPrompt = this.buildPrompt(input.options, input.context);
      const fullPrompt = `你是一位经验丰富的旅行规划师。你的任务是对多个行程骨架方案进行对比分析。

对比维度（固定）：
1. 可执行性（executability）：方案是否现实可行，是否考虑了交通、时间等实际约束
2. 成本（cost）：预算是否合理，是否在用户预算范围内（分数越低越好）
3. 疲劳（fatigue）：节奏是否合理，是否会导致过度疲劳（分数越低越好）
4. 体验密度（experienceDensity）：单位时间内能获得的体验丰富度
5. 风险（risk）：执行过程中的不确定性（天气、交通、安全等）（分数越低越好）
6. 自由度（freedom）：方案的灵活性和可调整空间

每个维度评分 0-100，并给出简要总结。最后给出推荐方案和理由。

${userPrompt}`;
      
      const comparisonStr = await this.llmService.callLlmWithSchema(
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
                  optionId: { type: 'string' },
                  scores: {
                    type: 'object',
                    properties: {
                      executability: { type: 'number' },
                      cost: { type: 'number' },
                      fatigue: { type: 'number' },
                      experienceDensity: { type: 'number' },
                      risk: { type: 'number' },
                      freedom: { type: 'number' },
                    },
                    required: ['executability', 'cost', 'fatigue', 'experienceDensity', 'risk', 'freedom'],
                  },
                  summary: { type: 'string' },
                },
                required: ['optionId', 'scores', 'summary'],
              },
            },
            recommendation: {
              type: 'object',
              properties: {
                optionId: { type: 'string' },
                reason: { type: 'string' },
              },
            },
          },
          required: ['options'],
        },
        input.tokenContext,
      );

      const comparison = JSON.parse(comparisonStr) as OptionComparison;

      return {
        comparison,
      };
    } catch (error: any) {
      this.logger.error(`对比方案失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(options: PlanSkeleton[], context?: any): string {
    const parts: string[] = [];
    
    parts.push(`## 需要对比的方案`);
    options.forEach((option, index) => {
      parts.push(`\n### 方案 ${index + 1}: ${option.name} (ID: ${option.id})`);
      parts.push(`主题: ${option.dayThemes.map(t => `第${t.day}天-${t.theme}`).join(', ')}`);
      parts.push(`锚点: ${option.anchors.map(a => `${a.location}-${a.activity}`).join(', ')}`);
      parts.push(`移动日: ${option.transferDays.map(t => `第${t.day}天 ${t.from}→${t.to}`).join(', ')}`);
      parts.push(`取舍理由: ${option.rationale.philosophy}`);
      parts.push(`优势: ${option.rationale.strengths.join(', ')}`);
      parts.push(`劣势: ${option.rationale.weaknesses.join(', ')}`);
    });
    
    if (context) {
      parts.push(`\n## 约束条件`);
      if (context.constraints?.budget?.total) {
        parts.push(`预算: ${context.constraints.budget.total}`);
      }
      if (context.constraints?.fitness?.level) {
        parts.push(`体力水平: ${context.constraints.fitness.level}`);
      }
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请对以上方案进行对比分析，从以下维度评分（0-100）：`);
    parts.push(`1. 可执行性（executability）`);
    parts.push(`2. 成本（cost，越低越好）`);
    parts.push(`3. 疲劳（fatigue，越低越好）`);
    parts.push(`4. 体验密度（experienceDensity）`);
    parts.push(`5. 风险（risk，越低越好）`);
    parts.push(`6. 自由度（freedom）`);
    parts.push(`\n最后给出推荐方案和理由。`);
    
    return parts.join('\n');
  }
}
