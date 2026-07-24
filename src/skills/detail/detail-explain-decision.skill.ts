// src/skills/detail/detail-explain-decision.skill.ts
/**
 * skill.detail.explainDecision
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DecisionExplanation } from './shared/detail-state.types';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { loadDecisionLogsForTrip } from './utils/detail-data.util';

export interface DetailExplainDecisionInput extends SkillInput {
  tripId: string;
  decisionId?: string;
  decisionLogs?: any[];
}

export interface DetailExplainDecisionOutput extends SkillOutput {
  explanations: DecisionExplanation[];
  degraded?: boolean;
  degradedReason?: string;
}

@Injectable()
export class DetailExplainDecisionSkill implements Skill<DetailExplainDecisionInput, DetailExplainDecisionOutput> {
  private readonly logger = new Logger(DetailExplainDecisionSkill.name);
  private decisionLogStorage?: DecisionLogStorageService;

  constructor(
    private readonly llmService: LlmService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private getDecisionLogStorage(): DecisionLogStorageService | null {
    if (!this.decisionLogStorage) {
      try {
        this.decisionLogStorage = this.moduleRef.get(DecisionLogStorageService, { strict: false });
      } catch {
        return null;
      }
    }
    return this.decisionLogStorage ?? null;
  }

  metadata = {
    name: 'detail.explainDecision',
    description: 'detail.explainDecision：基于 decision log 生成面向用户的决策解释。在用户查看行程详情页或追问「为什么这样安排」时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: DetailExplainDecisionInput): Promise<DetailExplainDecisionOutput> {
    this.logger.debug(`执行 detail.explainDecision: tripId=${input.tripId}, decisionId=${input.decisionId || 'all'}`);

    let decisionLogs = input.decisionLogs;
    let degraded = false;
    let degradedReason: string | undefined;

    if (!decisionLogs?.length) {
      const storage = this.getDecisionLogStorage();
      if (storage) {
        decisionLogs = await loadDecisionLogsForTrip(storage, input.tripId, input.decisionId);
      } else {
        degraded = true;
        degradedReason = 'DecisionLogStorageService unavailable and decisionLogs not provided';
        decisionLogs = [];
      }
    }

    if (!decisionLogs.length) {
      return {
        explanations: [],
        degraded: true,
        degradedReason: degradedReason || 'No decision logs found for trip',
      };
    }

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
      } catch {
        this.logger.warn(`Failed to parse explanation result: ${explanationResult}`);
      }
    }

    return {
      explanations,
      ...(degraded ? { degraded, degradedReason } : {}),
    };
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
