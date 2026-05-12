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
import { randomUUID } from 'crypto';

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
      const fullPrompt = `你是一位贴心的旅行管家。你的任务是在原计划无法执行时，生成多个兜底方案。

兜底原则：
1. 保持路线哲学和核心体验
2. 最小化对整体行程的影响
3. 提供可行的替代方案
4. 明确说明影响和风险

请生成至少3个不同类型的修复方案：
1. minimal（最小改动）：尽可能保持原计划，只做必要调整
2. experience（体验优先）：优先保证核心体验，可能调整时间或顺序
3. safety（安全优先）：优先保证安全和可行性，可能替换地点或路线

每个方案必须包含：
- id: 方案ID
- type: 方案类型（minimal/experience/safety）
- title: 方案标题（如"最小改动"、"体验优先"、"安全优先"）
- description: 方案描述
- changes: 变更详情数组（每个变更包含 itemId, action, newTime/newPlace）
- impact: 影响评估（arrivalTime, missingPlaces, riskChange）
- recommended: 是否推荐（至少一个方案为true）

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        this.llmService.getDefaultProvider(),
        fullPrompt,
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            triggerReason: { type: 'string' },
            originalPlan: { type: 'object' },
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
            solutions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string', enum: ['minimal', 'experience', 'safety'] },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  changes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        itemId: { type: 'string' },
                        action: { type: 'string', enum: ['modify', 'remove', 'add'] },
                        newTime: { type: 'string' },
                        newPlace: { type: 'object' },
                      },
                    },
                  },
                  impact: {
                    type: 'object',
                    properties: {
                      arrivalTime: { type: 'string' },
                      missingPlaces: { type: 'number' },
                      riskChange: { type: 'string', enum: ['low', 'medium', 'high'] },
                    },
                  },
                  recommended: { type: 'boolean' },
                },
                required: ['id', 'type', 'title', 'description', 'changes', 'impact'],
              },
              minItems: 1,
            },
          },
          required: ['id', 'triggerReason', 'originalPlan', 'explanation', 'impact', 'confidence', 'solutions'],
        },
      );
      
      const result = JSON.parse(resultStr) as any;
      
      // 确保至少有一个方案被标记为推荐
      if (result.solutions && result.solutions.length > 0) {
        const hasRecommended = result.solutions.some((s: any) => s.recommended === true);
        if (!hasRecommended) {
          result.solutions[0].recommended = true;
        }
      }

      const fallbackPlan: FallbackPlan = {
        id: result.id || randomUUID(),
        triggerReason: result.triggerReason,
        originalPlan: result.originalPlan,
        solutions: result.solutions || [],
        explanation: result.explanation,
        impact: result.impact,
        confidence: result.confidence,
      };

      return {
        fallbackPlan,
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
