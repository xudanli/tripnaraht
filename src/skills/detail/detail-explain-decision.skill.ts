// src/skills/detail/detail-explain-decision.skill.ts
/**
 * skill.detail.explainDecision
 * 
 * 目的：解释决策（基于决策日志）
 * 
 * System 2 技能：需要推理和解释
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DecisionExplanation } from './shared/detail-state.types';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';

export interface DetailExplainDecisionInput extends SkillInput {
  /** Trip ID */
  tripId: string;
  
  /** 决策 ID（可选，如果不提供则解释所有决策） */
  decisionId?: string;
  
  /** 决策日志（可选） */
  decisionLogs?: any[];
}

export interface DetailExplainDecisionOutput extends SkillOutput {
  /** 决策解释列表 */
  explanations: DecisionExplanation[];
}

@Injectable()
export class DetailExplainDecisionSkill implements Skill<DetailExplainDecisionInput, DetailExplainDecisionOutput> {
  private readonly logger = new Logger(DetailExplainDecisionSkill.name);

  metadata = {
    name: 'detail.explainDecision',
    description: '解释决策（基于决策日志），生成面向用户的解释',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: DetailExplainDecisionInput): Promise<DetailExplainDecisionOutput> {
    this.logger.debug(`执行 detail.explainDecision: tripId=${input.tripId}, decisionId=${input.decisionId || 'all'}`);

    try {
      // TODO: 从数据库查询决策日志
      const decisionLogs = input.decisionLogs || [];

      const explanations: DecisionExplanation[] = [];

      for (const log of decisionLogs) {
        const userPrompt = this.buildPrompt(log);
        const fullPrompt = `你是一位贴心的旅行管家。你的任务是基于决策日志，生成面向用户的决策解释。

解释原则：
1. 使用第一人称（"我"代表对应的人格）
2. 简洁明了，避免技术术语
3. 说明原因和影响
4. 引用相关证据

${userPrompt}`;
        
        const explanationResult = await this.llmService.callLlmWithSchema(
          LlmProvider.OPENAI,
          fullPrompt,
          {
            type: 'object',
            properties: {
              decisionId: { type: 'string' },
              decisionType: { type: 'string' },
              explanation: { type: 'string' },
              evidence: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    excerpt: { type: 'string' },
                    relevance: { type: 'string' },
                  },
                },
              },
              persona: { type: 'string', enum: ['ABU', 'DR_DRE', 'NEPTUNE'] },
              timestamp: { type: 'string' },
            },
            required: ['decisionId', 'decisionType', 'explanation', 'evidence', 'persona', 'timestamp'],
          },
        );

        try {
          const parsed = JSON.parse(explanationResult);
          explanations.push(parsed as DecisionExplanation);
        } catch (e) {
          this.logger.warn(`Failed to parse explanation result: ${explanationResult}`);
        }
      }

      return {
        explanations,
      };
    } catch (error: any) {
      this.logger.error(`解释决策失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(log: any): string {
    const parts: string[] = [];
    
    parts.push(`## 决策日志`);
    parts.push(JSON.stringify(log, null, 2));
    
    parts.push(`\n## 要求`);
    parts.push(`请生成面向用户的决策解释，使用第一人称，说明原因和影响`);
    
    return parts.join('\n');
  }
}
