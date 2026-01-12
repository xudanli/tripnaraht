// src/skills/exec/exec-fallback.skill.ts
/**
 * skill.exec.fallback
 * 
 * 目的：生成兜底方案（当原计划无法执行时）
 * 
 * System 2 技能：需要推理和替代方案生成
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { FallbackPlan } from './shared/execution-state.types';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';

export interface ExecFallbackInput extends SkillInput {
  /** Trip ID */
  tripId: string;
  
  /** 触发原因 */
  triggerReason: string;
  
  /** 原计划 */
  originalPlan: any;
  
  /** 当前状态 */
  currentState?: any;
}

export interface ExecFallbackOutput extends SkillOutput {
  /** 兜底方案 */
  fallbackPlan: FallbackPlan;
}

@Injectable()
export class ExecFallbackSkill implements Skill<ExecFallbackInput, ExecFallbackOutput> {
  private readonly logger = new Logger(ExecFallbackSkill.name);

  metadata = {
    name: 'exec.fallback',
    description: '生成兜底方案（当原计划无法执行时），保持路线哲学',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: ExecFallbackInput): Promise<ExecFallbackOutput> {
    this.logger.debug(`执行 exec.fallback: tripId=${input.tripId}, reason=${input.triggerReason}`);

    try {
      const userPrompt = this.buildPrompt(input);
      const fullPrompt = `你是一位贴心的旅行管家。你的任务是在原计划无法执行时，生成兜底方案。

兜底原则：
1. 保持路线哲学和核心体验
2. 最小化对整体行程的影响
3. 提供可行的替代方案
4. 明确说明影响和风险

输出必须包含：
- 兜底计划
- 解释（为什么需要兜底，为什么这个方案可行）
- 影响分析（时间、预算、体验）
- 置信度（low/medium/high）

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        LlmProvider.OPENAI,
        fullPrompt,
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            triggerReason: { type: 'string' },
            originalPlan: { type: 'object' },
            fallbackPlan: { type: 'object' },
            explanation: { type: 'string' },
            impact: {
              type: 'object',
              properties: {
                schedule: { type: 'string' },
                budget: { type: 'string' },
                experience: { type: 'string' },
              },
            },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['id', 'triggerReason', 'originalPlan', 'fallbackPlan', 'explanation', 'impact', 'confidence'],
        },
      );
      
      const result = JSON.parse(resultStr) as FallbackPlan;

      return {
        fallbackPlan: result as FallbackPlan,
      };
    } catch (error: any) {
      this.logger.error(`生成兜底方案失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(input: ExecFallbackInput): string {
    const parts: string[] = [];
    
    parts.push(`## 触发原因`);
    parts.push(input.triggerReason);
    
    parts.push(`\n## 原计划`);
    parts.push(JSON.stringify(input.originalPlan, null, 2));
    
    if (input.currentState) {
      parts.push(`\n## 当前状态`);
      parts.push(JSON.stringify(input.currentState, null, 2));
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请生成兜底方案，保持路线哲学，最小化影响`);
    
    return parts.join('\n');
  }
}
