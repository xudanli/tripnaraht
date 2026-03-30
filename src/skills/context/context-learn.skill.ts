// src/skills/context/context-learn.skill.ts
/**
 * tripnara.context.learn
 * 
 * P1: Context学习Skill
 * 
 * 输入：学习事件（context_built, context_used, decision_made, user_feedback）
 * 输出：学习结果（更新的Block优先级、推荐的Block组合、学习置信度）
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextLearningService, ContextLearningInput } from '../../agent/context-engine/services/context-learning.service';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';

export interface ContextLearnInput extends SkillInput {
  /** 用户ID */
  userId?: string;
  
  /** Trip ID（可选） */
  tripId?: string;
  
  /** 学习事件类型 */
  eventType: 'context_built' | 'context_used' | 'decision_made' | 'user_feedback';
  
  /** 事件数据 */
  eventData: {
    /** Context Package（如果是context_built事件） */
    contextPackage?: ContextPackage;
    
    /** 使用的Block keys（如果是context_used事件） */
    usedBlocks?: string[];
    
    /** 决策结果（如果是decision_made事件） */
    decisionResult?: {
      accepted: boolean;
      satisfaction?: number; // 0-1
    };
    
    /** 用户反馈（如果是user_feedback事件） */
    feedback?: {
      relevantBlocks?: string[];
      irrelevantBlocks?: string[];
      missingBlocks?: string[];
    };
  };
  
  /** 规划阶段（可选） */
  phase?: string;
  
  /** Agent名称（可选） */
  agent?: string;
  
  /** 用户查询（可选，用于相关性学习） */
  userQuery?: string;
}

export interface ContextLearnOutput extends SkillOutput {
  /** 学习结果 */
  learningResult: {
    /** 更新的Block优先级 */
    updatedPriorities?: Record<string, number>;
    
    /** 推荐的Block组合 */
    recommendedBlocks?: string[];
    
    /** 学习置信度 */
    confidence: number;
    
    /** 样本数量 */
    sampleSize: number;
  };
}

@Injectable()
export class ContextLearnSkill implements Skill<ContextLearnInput, ContextLearnOutput> {
  private readonly logger = new Logger(ContextLearnSkill.name);

  metadata = {
    name: 'context.learn',
    description: '学习Context使用情况：输入学习事件（context_built, context_used, decision_made, user_feedback），输出学习结果（更新的Block优先级、推荐的Block组合、学习置信度）',
    version: '1.0.0',
    category: 'rag' as const,
    toolGroup: 'CONTEXT' as const,
  };

  private contextLearningService?: ContextLearningService;

  constructor(
    private readonly moduleRef: ModuleRef,
  ) {
    // ⚠️ 使用懒加载避免循环依赖死锁
  }

  /**
   * 懒加载获取 ContextLearningService
   */
  private getContextLearningService(): ContextLearningService | null {
    if (!this.contextLearningService) {
      try {
        this.contextLearningService = this.moduleRef.get(ContextLearningService, { strict: false });
      } catch (error) {
        this.logger.warn('无法获取 ContextLearningService，context.learn 功能将不可用');
        return null;
      }
    }
    return this.contextLearningService || null;
  }

  async execute(input: ContextLearnInput): Promise<ContextLearnOutput> {
    this.logger.debug(
      `执行 context.learn: userId=${input.userId || 'none'}, eventType=${input.eventType}`,
    );

    try {
      const contextLearningService = this.getContextLearningService();
      if (!contextLearningService) {
        throw new Error('ContextLearningService 未注入，context.learn 功能不可用');
      }

      const learningInput: ContextLearningInput = {
        userId: input.userId,
        tripId: input.tripId,
        eventType: input.eventType,
        eventData: input.eventData,
        phase: input.phase,
        agent: input.agent,
        userQuery: input.userQuery,
      };

      const result = await contextLearningService.learn(learningInput);

      return {
        learningResult: result.learningResult,
      };
    } catch (error: any) {
      this.logger.error(`Context学习失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
