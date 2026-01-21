// src/skills/plan/architect/plan-architect-generate-skeleton.skill.ts
/**
 * skill.plan.architect.generateSkeleton
 * 
 * 目的：从目标与约束生成 2-3 套"行程骨架方案"（紧凑/均衡/松弛）
 * 
 * System 2 技能：需要推理和取舍
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanContext, PlanSkeletonSet, PlanSkeleton } from '../shared/plan-state.types';
import { WorldBuildContextSkill } from '../../world/world-build-context.skill';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

export interface PlanArchitectGenerateSkeletonInput extends SkillInput {
  /** 规划上下文 */
  context: PlanContext;
  
  /** Trip ID（可选，用于构建世界模型） */
  tripId?: string;
  
  /** 世界模型上下文（可选，如果已构建） */
  world?: any;
}

export interface PlanArchitectGenerateSkeletonOutput extends SkillOutput {
  /** 行程骨架方案集 */
  skeletonSet: PlanSkeletonSet;
  
  /** 使用的证据 */
  evidence?: any[];
}

@Injectable()
export class PlanArchitectGenerateSkeletonSkill implements Skill<PlanArchitectGenerateSkeletonInput, PlanArchitectGenerateSkeletonOutput> {
  private readonly logger = new Logger(PlanArchitectGenerateSkeletonSkill.name);

  metadata = {
    name: 'plan.architect.generateSkeleton',
    description: '从目标与约束生成 2-3 套行程骨架方案（紧凑/均衡/松弛），包含每天主题、锚点、移动日和取舍理由',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
    @Optional() private readonly worldBuildContext?: WorldBuildContextSkill,
  ) {}

  async execute(input: PlanArchitectGenerateSkeletonInput): Promise<PlanArchitectGenerateSkeletonOutput> {
    this.logger.debug(`执行 plan.architect.generateSkeleton: destination=${input.context.destination.city || input.context.destination.country}, days=${input.context.days}`);

    try {
      // 1. 构建世界模型上下文（如果需要）
      let world = input.world;
      if (!world && input.tripId && this.worldBuildContext) {
        const worldResult = await this.worldBuildContext.execute({ tripId: input.tripId });
        world = worldResult.world;
      }

      // 2. 使用 LLM 生成骨架方案（System 2 推理）
      const userPrompt = this.buildPrompt(input.context, world);
      const fullPrompt = `你是一位经验丰富的旅行规划师（Trip Architect）。你的任务是基于用户的目标和约束，生成 2-3 套不同的行程骨架方案。

每套方案必须包含：
1. 每天的主题和描述
2. 关键锚点（必须去的城市/活动）
3. 移动日安排
4. 清晰的取舍理由（为什么选择这个节奏/路线哲学）

方案类型：
- 紧凑型：最大化体验密度，适合时间有限但想多看多体验的用户
- 均衡型：平衡体验和休息，适合大多数用户
- 松弛型：节奏较慢，适合注重深度体验和休息的用户

输出必须是结构化的 JSON，包含 rationale（取舍理由），必须可解释。

${userPrompt}`;
      
      // 使用 Claude (Anthropic) API，超时时间根据行程天数动态调整
      const llmCallPromise = this.llmService.callLlmWithSchema(
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
                  id: { type: 'string' },
                  name: { type: 'string' },
                  dayThemes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        day: { type: 'number' },
                        theme: { type: 'string' },
                        description: { type: 'string' },
                      },
                      required: ['day', 'theme'],
                    },
                  },
                  anchors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        day: { type: 'number' },
                        location: { type: 'string' },
                        activity: { type: 'string' },
                        priority: { type: 'string', enum: ['anchor', 'core', 'optional'] },
                      },
                      required: ['day', 'location', 'activity', 'priority'],
                    },
                  },
                  transferDays: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        day: { type: 'number' },
                        from: { type: 'string' },
                        to: { type: 'string' },
                        mode: { type: 'string' },
                      },
                      required: ['day', 'from', 'to'],
                    },
                  },
                  rationale: {
                    type: 'object',
                    properties: {
                      philosophy: { type: 'string' },
                      tradeoffs: { type: 'array', items: { type: 'string' } },
                      strengths: { type: 'array', items: { type: 'string' } },
                      weaknesses: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['philosophy', 'tradeoffs', 'strengths', 'weaknesses'],
                  },
                },
                required: ['id', 'name', 'dayThemes', 'anchors', 'transferDays', 'rationale'],
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
      );

      // 增加超时时间到 60 秒（对于复杂行程方案）
      const timeoutMs = input.context.days > 7 ? 90000 : 60000; // 长行程 90 秒，短行程 60 秒
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`LLM 调用超时（${timeoutMs / 1000}秒）`));
        }, timeoutMs);
      });

      let skeletonSetStr: string;
      try {
        skeletonSetStr = await Promise.race([llmCallPromise, timeoutPromise]);
      } catch (error: any) {
        // 区分超时错误和其他错误
        const isTimeout = error.message?.includes('超时') || error.message?.includes('timeout');
        if (isTimeout) {
          this.logger.warn(`LLM 调用超时，使用默认方案: ${error.message}`);
        } else {
          this.logger.error(`LLM 调用失败，使用默认方案: ${error.message}`);
        }
        // 返回默认骨架方案
        return this.getDefaultSkeletonSet(input.context);
      }

      let skeletonSet: PlanSkeletonSet;
      try {
        skeletonSet = JSON.parse(skeletonSetStr) as PlanSkeletonSet;
      } catch (parseError: any) {
        this.logger.error(`解析 LLM 响应失败: ${parseError.message}, 响应: ${skeletonSetStr?.substring(0, 200)}`);
        // 返回默认骨架方案
        return this.getDefaultSkeletonSet(input.context);
      }

      return {
        skeletonSet,
        evidence: [],
      };
    } catch (error: any) {
      this.logger.error(`生成行程骨架失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(context: PlanContext, world?: any): string {
    const parts: string[] = [];
    
    parts.push(`## 规划任务`);
    parts.push(`目的地: ${context.destination.city || context.destination.country || context.destination.region || '未指定'}`);
    parts.push(`天数: ${context.days} 天`);
    if (context.travelMode) {
      parts.push(`交通模式: ${context.travelMode}`);
    }
    if (context.mustDo && context.mustDo.length > 0) {
      parts.push(`必去: ${context.mustDo.join(', ')}`);
    }
    if (context.mustAvoid && context.mustAvoid.length > 0) {
      parts.push(`必避: ${context.mustAvoid.join(', ')}`);
    }
    
    if (context.constraints) {
      parts.push(`\n## 约束条件`);
      if (context.constraints.budget?.total) {
        parts.push(`预算: ${context.constraints.budget.total} ${context.constraints.budget.currency || 'CNY'}`);
      }
      if (context.constraints.fitness?.level) {
        parts.push(`体力水平: ${context.constraints.fitness.level}`);
      }
      if (context.constraints.accommodation?.level) {
        parts.push(`住宿档位: ${context.constraints.accommodation.level}`);
      }
    }
    
    if (world) {
      parts.push(`\n## 世界模型信息`);
      parts.push(`路线方向: ${world.routeDirection?.name || '未指定'}`);
      if (world.physical) {
        parts.push(`地形信息: 已加载`);
      }
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请生成 2-3 套行程骨架方案，每套方案必须包含：`);
    parts.push(`1. 每天的主题和描述`);
    parts.push(`2. 关键锚点（必须去的城市/活动）`);
    parts.push(`3. 移动日安排`);
    parts.push(`4. 清晰的取舍理由（为什么选择这个节奏/路线哲学）`);
    
    return parts.join('\n');
  }

  /**
   * 获取默认骨架方案（当 LLM 调用失败时使用）
   */
  private getDefaultSkeletonSet(context: PlanContext): PlanArchitectGenerateSkeletonOutput {
    const days = context.days;
    const destination = context.destination.city || context.destination.country || '目的地';
    
    // 生成一个简单的默认方案
    const defaultOption: PlanSkeleton = {
      id: 'default_1',
      name: '均衡型方案',
      dayThemes: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        theme: `第${i + 1}天`,
        description: `在${destination}的第${i + 1}天行程`,
      })),
      anchors: [
        {
          day: 1,
          location: destination,
          activity: '抵达并适应',
          priority: 'anchor' as const,
        },
      ],
      transferDays: [],
      rationale: {
        philosophy: '均衡型方案，适合大多数用户',
        tradeoffs: ['平衡体验和休息'],
        strengths: ['节奏适中', '适合初次到访'],
        weaknesses: ['可能需要更多时间探索'],
      },
    };

    return {
      skeletonSet: {
        options: [defaultOption],
        recommendation: {
          optionId: 'default_1',
          reason: '默认方案，LLM 调用失败时使用',
        },
      },
      evidence: [],
    };
  }
}
