// src/skills/plan/gate/plan-gate-propose-safe-alternatives.skill.ts
/**
 * skill.plan.gate.proposeSafeAlternatives
 * 
 * 目的：如果 NEED_CONFIRM/REJECT，必须给替代方案（Neptune 风格）
 * 
 * System 2 技能：需要推理和替代方案生成
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState } from '../shared/plan-state.types';
import { DecisionNeptuneRepairSkill } from '../../decision/decision-neptune-repair.skill';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanGateProposeSafeAlternativesInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
  
  /** 问题描述 */
  issue: string;
}

export interface PlanGateProposeSafeAlternativesOutput extends SkillOutput {
  /** 替代方案 */
  alternatives: Array<{
    type: 'alternative_route' | 'alternative_segment' | 'alternative_timing';
    description: string;
    evidenceComparison: {
      whySafer: string;
      whyMoreExecutable: string;
    };
  }>;
}

@Injectable()
export class PlanGateProposeSafeAlternativesSkill implements Skill<PlanGateProposeSafeAlternativesInput, PlanGateProposeSafeAlternativesOutput> {
  private readonly logger = new Logger(PlanGateProposeSafeAlternativesSkill.name);

  metadata = {
    name: 'plan.gate.proposeSafeAlternatives',
    description: '为被拒绝或需确认的方案生成安全替代方案（Neptune 风格）',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
    @Optional() private readonly neptuneRepair?: DecisionNeptuneRepairSkill,
  ) {}

  async execute(input: PlanGateProposeSafeAlternativesInput): Promise<PlanGateProposeSafeAlternativesOutput> {
    this.logger.debug(`执行 plan.gate.proposeSafeAlternatives: planId=${input.planState.plan_id}, issue=${input.issue}`);

    try {
      // 1. 如果有 Neptune Repair，先尝试使用它
      if (this.neptuneRepair && input.planState.world) {
        try {
          const neptuneResult = await this.neptuneRepair.execute({
            world: input.planState.world as any,
            brokenPlan: input.planState.itinerary as any,
            issue: input.issue,
          });

          if (neptuneResult.repairedPlan) {
            return {
              alternatives: [{
                type: 'alternative_route',
                description: 'Neptune 修复方案',
                evidenceComparison: {
                  whySafer: neptuneResult.replacements?.map(r => r.explanation || '').join(', ') || '已修复安全问题',
                  whyMoreExecutable: '保持路线哲学的前提下替换了不可用路段',
                },
              }],
            };
          }
        } catch (error) {
          this.logger.warn(`Neptune Repair 失败，使用 LLM 生成替代方案: ${error}`);
        }
      }

      // 2. 使用 LLM 生成替代方案
      const userPrompt = this.buildPrompt(input.planState, input.issue);
      const fullPrompt = `你是一位经验丰富的空间修复师（Neptune）。你的任务是为被拒绝或需确认的方案生成安全替代方案。

替代方案类型：
1. alternative_route（替代路线）：选择更安全的路线骨架
2. alternative_segment（替代段）：替换高风险段
3. alternative_timing（替代时间窗）：调整时间避开风险

每个替代方案必须包含：
- type: 替代类型
- description: 具体替代方案描述
- evidenceComparison: 为什么更安全、为什么更可执行

优先推荐保持路线哲学的方案。

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        LlmProvider.ANTHROPIC,
        fullPrompt,
        {
          type: 'object',
          properties: {
            alternatives: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['alternative_route', 'alternative_segment', 'alternative_timing'],
                  },
                  description: { type: 'string' },
                  evidenceComparison: {
                    type: 'object',
                    properties: {
                      whySafer: { type: 'string' },
                      whyMoreExecutable: { type: 'string' },
                    },
                    required: ['whySafer', 'whyMoreExecutable'],
                  },
                },
                required: ['type', 'description', 'evidenceComparison'],
              },
            },
          },
          required: ['alternatives'],
        },
      );

      const result = JSON.parse(resultStr) as PlanGateProposeSafeAlternativesOutput;
      return result;
    } catch (error: any) {
      this.logger.error(`生成替代方案失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(planState: PlanState, issue: string): string {
    const parts: string[] = [];
    
    parts.push(`## 当前方案问题`);
    parts.push(issue);
    
    parts.push(`\n## 当前方案信息`);
    parts.push(`天数: ${planState.constraints.time.days} 天`);
    
    if (planState.gate.reasons.length > 0) {
      parts.push(`\n## 门控原因`);
      planState.gate.reasons.forEach(reason => {
        parts.push(`- ${reason}`);
      });
    }
    
    if (planState.mobility.transferSegments.length > 0) {
      parts.push(`\n## 跨城段`);
      planState.mobility.transferSegments.forEach(seg => {
        parts.push(`- ${seg.from.city} → ${seg.to.city}: ${seg.feasibility}`);
        if (seg.riskFlags.length > 0) {
          seg.riskFlags.forEach(flag => {
            parts.push(`  - 风险: ${flag.type} (${flag.severity}) - ${flag.description}`);
          });
        }
      });
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请生成安全替代方案，说明为什么更安全、为什么更可执行`);
    
    return parts.join('\n');
  }
}
