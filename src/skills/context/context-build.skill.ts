// src/skills/context/context-build.skill.ts
/**
 * tripnara.context.build
 * 
 * P0: 核心上下文编译器
 * 
 * 输入：tripId + 当前 phase + 当前 agent + 用户请求
 * 输出：Context Package（分块、带优先级、带来源、可裁剪）
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextEngineerService } from '../../agent/context-engine/services/context-engineer.service';
import { ContextPackage, ContextPackageOptions } from '../../agent/context-engine/types/context-package.types';

export interface ContextBuildInput extends SkillInput {
  /** Trip ID */
  tripId?: string;
  
  /** 规划阶段 */
  phase: string;
  
  /** 当前 Agent */
  agent: string;
  
  /** 用户请求 */
  userQuery: string;
  
  /** Token 预算（默认 3600） */
  tokenBudget?: number;
  
  /** 是否包含私有块 */
  includePrivate?: boolean;
  
  /** 需要包含的主题块 */
  requiredTopics?: string[];
  
  /** 需要排除的主题块 */
  excludeTopics?: string[];
}

export interface ContextBuildOutput extends SkillOutput {
  /** Context Package */
  contextPackage: ContextPackage;
}

@Injectable()
export class ContextBuildSkill implements Skill<ContextBuildInput, ContextBuildOutput> {
  private readonly logger = new Logger(ContextBuildSkill.name);

  metadata = {
    name: 'context.build',
    description: '构建 Context Package：输入 tripId + phase + agent + 用户请求，输出分块、带优先级、带来源、可裁剪的上下文包',
    version: '1.0.0',
    category: 'rag' as const,
    toolGroup: 'CONTEXT' as const,
  };

  private contextEngineer?: ContextEngineerService;

  constructor(
    private readonly moduleRef: ModuleRef,
  ) {
    // ⚠️ 使用懒加载避免循环依赖死锁
    // ContextEngineerService 在 execute 方法中通过 ModuleRef 获取
  }

  /**
   * 懒加载获取 ContextEngineerService
   * 避免在构造函数中注入，防止循环依赖死锁
   */
  private getContextEngineer(): ContextEngineerService | null {
    if (!this.contextEngineer) {
      try {
        this.contextEngineer = this.moduleRef.get(ContextEngineerService, { strict: false });
      } catch (error) {
        this.logger.warn('无法获取 ContextEngineerService，context.build 功能将不可用');
        return null;
      }
    }
    return this.contextEngineer || null;
  }

  async execute(input: ContextBuildInput): Promise<ContextBuildOutput> {
    this.logger.debug(
      `执行 context.build: tripId=${input.tripId || 'none'}, phase=${input.phase}, agent=${input.agent}`,
    );

    try {
      const options: ContextPackageOptions = {
        tripId: input.tripId,
        phase: input.phase,
        agent: input.agent,
        userQuery: input.userQuery,
        tokenBudget: input.tokenBudget,
        includePrivate: input.includePrivate,
        requiredTopics: input.requiredTopics,
        excludeTopics: input.excludeTopics,
      };

      const contextEngineer = this.getContextEngineer();
      if (!contextEngineer) {
        throw new Error('ContextEngineerService 未注入，context.build 功能不可用');
      }

      const contextPackage = await contextEngineer.build(options);

      return {
        contextPackage,
      };
    } catch (error: any) {
      this.logger.error(`构建 Context Package 失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}