// src/skills/plan/pace/plan-pace-adjust-schedule.skill.ts
/**
 * skill.plan.pace.adjustSchedule
 * 
 * 目的：用户说"太累/太赶"，给出节奏调整方案（不破坏主线）
 * 
 * System 2 技能：需要推理和结构调整
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanPaceAdjustScheduleInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
  
  /** 用户反馈 */
  userFeedback: 'too_tired' | 'too_rushed' | 'too_relaxed';
}

export interface PlanPaceAdjustScheduleOutput extends SkillOutput {
  /** 调整后的时间线 */
  adjustedTimeline: {
    days: number;
    changes: Array<{
      day: number;
      action: 'delete' | 'replace' | 'move' | 'add_rest';
      description: string;
    }>;
  };
  
  /** 变更差异 */
  diff: {
    deleted: string[];
    replaced: string[];
    moved: Array<{ from: number; to: number }>;
    added: string[];
  };
  
  /** 影响评估 */
  impact: {
    experience?: string;
    budget?: string;
    feasibility?: string;
  };
}

@Injectable()
export class PlanPaceAdjustScheduleSkill implements Skill<PlanPaceAdjustScheduleInput, PlanPaceAdjustScheduleOutput> {
  private readonly logger = new Logger(PlanPaceAdjustScheduleSkill.name);

  metadata = {
    name: 'plan.pace.adjustSchedule',
    description: 'plan.pace.adjustSchedule：根据用户反馈 adjust plan 节奏（太累/太赶），不破坏主线。在用户反馈 pace 过载/过赶且已有 planState 时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: PlanPaceAdjustScheduleInput): Promise<PlanPaceAdjustScheduleOutput> {
    this.logger.debug(`执行 plan.pace.adjustSchedule: planId=${input.planState.plan_id}, feedback=${input.userFeedback}`);

    try {
      const userPrompt = this.buildPrompt(input.planState, input.userFeedback);
      const fullPrompt = `你是一位经验丰富的节奏规划师（Dr.Dre）。你的任务是根据用户反馈调整行程节奏，但不破坏主线。

调整策略：
- too_tired（太累）：减少每日活动、插入休息日、延长停留时间
- too_rushed（太赶）：合并或删除次要活动、减少移动日
- too_relaxed（太松弛）：增加活动密度、优化时间利用

调整原则：
1. 保持路线哲学和核心锚点不变
2. 优先调整次要活动
3. 最小化对预算和可达性的影响
4. 明确说明每个变更的影响

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        LlmProvider.ANTHROPIC,
        fullPrompt,
        {
          type: 'object',
          properties: {
            adjustedTimeline: {
              type: 'object',
              properties: {
                days: { type: 'number' },
                changes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      day: { type: 'number' },
                      action: {
                        type: 'string',
                        enum: ['delete', 'replace', 'move', 'add_rest'],
                      },
                      description: { type: 'string' },
                    },
                    required: ['day', 'action', 'description'],
                  },
                },
              },
              required: ['days', 'changes'],
            },
            diff: {
              type: 'object',
              properties: {
                deleted: { type: 'array', items: { type: 'string' } },
                replaced: { type: 'array', items: { type: 'string' } },
                moved: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      from: { type: 'number' },
                      to: { type: 'number' },
                    },
                  },
                },
                added: { type: 'array', items: { type: 'string' } },
              },
              required: ['deleted', 'replaced', 'moved', 'added'],
            },
            impact: {
              type: 'object',
              properties: {
                experience: { type: 'string' },
                budget: { type: 'string' },
                feasibility: { type: 'string' },
              },
            },
          },
          required: ['adjustedTimeline', 'diff', 'impact'],
        },
        input.tokenContext,
      );

      const result = JSON.parse(resultStr) as PlanPaceAdjustScheduleOutput;
      return result;
    } catch (error: any) {
      this.logger.error(`调整节奏失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(planState: PlanState, feedback: string): string {
    const parts: string[] = [];
    
    parts.push(`## 当前计划`);
    parts.push(`天数: ${planState.constraints.time.days} 天`);
    parts.push(`用户反馈: ${feedback === 'too_tired' ? '太累' : feedback === 'too_rushed' ? '太赶' : '太松弛'}`);
    
    if (planState.pace.fatigueScore) {
      parts.push(`当前疲劳评分: ${planState.pace.fatigueScore.paceScore}/100`);
      if (planState.pace.fatigueScore.fatigueDrivers.length > 0) {
        parts.push(`疲劳驱动因素:`);
        planState.pace.fatigueScore.fatigueDrivers.forEach(driver => {
          parts.push(`- ${driver.type}: ${driver.description} (严重度: ${driver.severity})`);
        });
      }
    }
    
    if (planState.mobility.transferSegments.length > 0) {
      parts.push(`跨城段数: ${planState.mobility.transferSegments.length}`);
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请根据用户反馈调整节奏，但不破坏主线`);
    parts.push(`说明：删除了什么、替换了什么、移动了什么、新增了什么`);
    parts.push(`评估对体验/预算/可达性的影响`);
    
    return parts.join('\n');
  }
}
