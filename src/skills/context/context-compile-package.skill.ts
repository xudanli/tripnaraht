// src/skills/context/context-compile-package.skill.ts
/**
 * tripnara.context.compilePackage
 * 
 * P0: Context OS MCP 统一入口
 * 
 * 将分散的 Context Skills 整合为一个统一入口，外部 Agent 只需调用一个工具
 * 内部协调调用：context-build / compress / evaluate / tools-select / plan-select-slices
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { ContextBuildSkill } from './context-build.skill';
import { ContextCompressSkill } from './context-compress.skill';
import { ContextEvaluateSkill } from './context-evaluate.skill';
import { ToolsSelectSkill } from './tools-select.skill';
import { PlanSelectSlicesSkill } from './plan-select-slices.skill';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';

export interface ContextCompilePackageInput extends BaseSkillInput {
  /** 输入上下文 */
  inputContext: {
    /** 用户请求 */
    userQuery: string;
    /** 规划阶段（可选） */
    planningPhase?: string;
    /** 当前状态（可选） */
    currentState?: {
      tripId?: string;
      phase?: string;
      agent?: string;
      constraints?: string[];
    };
    /** 约束列表（可选） */
    constraints?: string[];
  };
  
  /** 编译选项 */
  options?: {
    /** 是否启用压缩（默认 false） */
    enableCompression?: boolean;
    /** 是否启用评估（默认 false） */
    enableEvaluation?: boolean;
    /** 是否启用工具选择（默认 true） */
    enableToolSelection?: boolean;
    /** 最大 token 数（可选） */
    maxTokens?: number;
    /** 目标压缩比（0-1，可选） */
    targetCompressionRatio?: number;
    /** Token 预算（用于 context-build，默认 3600） */
    tokenBudget?: number;
    /** 是否包含私有块（用于 context-build，默认 false） */
    includePrivate?: boolean;
  };
}

export interface ContextCompilePackageOutput extends SkillOutput {
  /** 公共上下文（可安全共享） */
  publicContext: {
    /** 上下文摘要 */
    summary: string;
    /** 关键事实列表 */
    keyFacts: string[];
    /** 允许的工具列表（工具名称） */
    toolAllowlist: string[];
  };
  
  /** 私有上下文引用（需要权限访问） */
  privateContextRef: {
    /** 上下文 ID */
    contextId: string;
    /** 访问令牌（可选，用于权限验证） */
    accessToken?: string;
  };
  
  /** 工具白名单（基于 tools-select 的结果） */
  toolAllowlist: Array<{
    /** 工具名称 */
    toolName: string;
    /** 推荐原因 */
    reason: string;
    /** 置信度（0-1） */
    confidence: number;
    /** 优先级（0-100） */
    priority?: number;
  }>;
  
  /** 编译元数据 */
  metadata: {
    /** 原始 token 数 */
    originalTokenCount: number;
    /** 压缩后 token 数（如果启用压缩） */
    compressedTokenCount?: number;
    /** 压缩比（如果启用压缩） */
    compressionRatio?: number;
    /** 评估分数（如果启用评估） */
    evaluationScore?: number;
    /** 编译耗时（毫秒） */
    compilationTime: number;
  };
  
  /** 完整的 Context Package（可选，用于调试） */
  contextPackage?: ContextPackage;
}

@Injectable()
export class ContextCompilePackageSkill implements Skill<ContextCompilePackageInput, ContextCompilePackageOutput> {
  private readonly logger = new Logger(ContextCompilePackageSkill.name);

  metadata = {
    name: 'context.compilePackage',
    description: 'Context 编译统一入口：整合 context-build/compress/evaluate/tools-select，输出 public_context / private_context_ref / tool_allowlist',
    version: '1.0.0',
    category: 'rag' as const,
  };

  constructor(
    @Optional() private readonly contextBuild?: ContextBuildSkill,
    @Optional() private readonly contextCompress?: ContextCompressSkill,
    @Optional() private readonly contextEvaluate?: ContextEvaluateSkill,
    @Optional() private readonly toolsSelect?: ToolsSelectSkill,
    @Optional() private readonly planSelectSlices?: PlanSelectSlicesSkill,
  ) {
    if (!this.contextBuild) {
      this.logger.warn('ContextBuildSkill 未注入，context.compilePackage 功能将受限');
    }
    if (!this.toolsSelect) {
      this.logger.warn('ToolsSelectSkill 未注入，工具选择功能将不可用');
    }
  }

  async execute(input: ContextCompilePackageInput): Promise<ContextCompilePackageOutput> {
    const startTime = Date.now();
    this.logger.debug(
      `执行 context.compilePackage: userQuery=${input.inputContext.userQuery.substring(0, 50)}...`,
    );

    try {
      // 1. 构建初始上下文（使用 context-build）
      if (!this.contextBuild) {
        throw new Error('ContextBuildSkill 未注入，无法构建上下文');
      }

      const buildInput = {
        tripId: input.inputContext.currentState?.tripId,
        phase: input.inputContext.planningPhase || input.inputContext.currentState?.phase || 'planning',
        agent: input.inputContext.currentState?.agent || 'planner',
        userQuery: input.inputContext.userQuery,
        tokenBudget: input.options?.tokenBudget || input.options?.maxTokens || 3600,
        includePrivate: input.options?.includePrivate || false,
        requiredTopics: input.inputContext.constraints,
      };

      const buildResult = await this.contextBuild.execute(buildInput);
      const contextPackage = buildResult.contextPackage;

      // 估算原始 token 数（简化实现）
      const originalTokenCount = this.estimateTokenCount(contextPackage);

      // 2. 压缩上下文（如果启用）
      let compressedPackage = contextPackage;
      let compressedTokenCount: number | undefined;
      let compressionRatio: number | undefined;

      if (input.options?.enableCompression && this.contextCompress) {
        try {
          // context-compress 接受 blocks 和 tokenBudget
          const targetTokenCount = input.options.maxTokens || input.options.targetCompressionRatio
            ? Math.floor(originalTokenCount * (input.options.targetCompressionRatio || 0.7))
            : originalTokenCount * 0.7; // 默认压缩到 70%

          const compressInput = {
            blocks: contextPackage.blocks,
            tokenBudget: targetTokenCount,
            strategy: 'balanced' as const,
          };

          const compressResult = await this.contextCompress.execute(compressInput);
          
          // 更新 contextPackage 的 blocks
          compressedPackage = {
            ...contextPackage,
            blocks: compressResult.compressedBlocks,
          };
          
          compressedTokenCount = this.estimateTokenCount(compressedPackage);
          compressionRatio = compressedTokenCount / originalTokenCount;
        } catch (error: any) {
          this.logger.warn(`上下文压缩失败: ${error.message}，使用原始上下文`);
        }
      }

      // 3. 评估上下文（如果启用）
      let evaluationScore: number | undefined;

      if (input.options?.enableEvaluation && this.contextEvaluate) {
        try {
          const evaluateInput = {
            contextPackage: compressedPackage,
            userQuery: input.inputContext.userQuery,
            phase: input.inputContext.planningPhase || input.inputContext.currentState?.phase,
          };

          const evaluateResult = await this.contextEvaluate.execute(evaluateInput);
          // context-evaluate 返回 metrics 和 summary，使用 summary.quality 转换为分数
          const qualityScore: Record<string, number> = {
            EXCELLENT: 90,
            GOOD: 70,
            FAIR: 50,
            POOR: 30,
          };
          evaluationScore = qualityScore[evaluateResult.summary.quality] || evaluateResult.metrics.relevanceScore || 50;
        } catch (error: any) {
          this.logger.warn(`上下文评估失败: ${error.message}`);
        }
      }

      // 4. 工具选择（如果启用，默认启用）
      const enableToolSelection = input.options?.enableToolSelection !== false;
      let toolAllowlist: Array<{
        toolName: string;
        reason: string;
        confidence: number;
        priority?: number;
      }> = [];

      if (enableToolSelection && this.toolsSelect) {
        try {
          const toolsSelectInput = {
            userQuery: input.inputContext.userQuery,
            planningPhase: input.inputContext.planningPhase || input.inputContext.currentState?.phase || 'planning',
            currentState: input.inputContext.currentState,
          };

          const toolsSelectResult = await this.toolsSelect.execute(toolsSelectInput);
          toolAllowlist = toolsSelectResult.tools.map((tool) => ({
            toolName: `tripnara.${tool.name}`,
            reason: tool.reason,
            confidence: tool.priority / 100, // 将 0-100 转换为 0-1
            priority: tool.priority,
          }));
        } catch (error: any) {
          this.logger.warn(`工具选择失败: ${error.message}`);
        }
      }

      // 5. 构建 publicContext（从 Context Package 提取）
      const publicContext = this.extractPublicContext(compressedPackage);

      // 6. 生成 privateContextRef（包含访问令牌）
      const contextId = `ctx-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const accessToken = this.generateAccessToken(contextId);
      const privateContextRef = {
        contextId,
        accessToken,
      };

      // 7. 构建输出
      const compilationTime = Date.now() - startTime;

      return {
        publicContext: {
          summary: publicContext.summary,
          keyFacts: publicContext.keyFacts,
          toolAllowlist: toolAllowlist.map((t) => t.toolName),
        },
        privateContextRef,
        toolAllowlist,
        metadata: {
          originalTokenCount,
          compressedTokenCount,
          compressionRatio,
          evaluationScore,
          compilationTime,
        },
        contextPackage: compressedPackage, // 可选：用于调试
      };
    } catch (error: any) {
      this.logger.error(`Context 编译失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 估算 Context Package 的 token 数（简化实现）
   */
  private estimateTokenCount(contextPackage: ContextPackage): number {
    // 简化实现：统计所有块的文本长度，按 4 字符 = 1 token 估算
    let totalChars = 0;
    for (const block of contextPackage.blocks) {
      totalChars += JSON.stringify(block).length;
    }
    return Math.ceil(totalChars / 4);
  }

  /**
   * 从 Context Package 提取公共上下文
   */
  private extractPublicContext(contextPackage: ContextPackage): {
    summary: string;
    keyFacts: string[];
  } {
    const summary = `Context Package with ${contextPackage.blocks.length} blocks, total priority: ${contextPackage.blocks.reduce((sum, b) => sum + (b.priority || 0), 0)}`;

    const keyFacts: string[] = [];
    // 按优先级排序，取前 5 个
    const sortedBlocks = [...contextPackage.blocks].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const block of sortedBlocks.slice(0, 5)) {
      // 提取前 5 个高优先级块的关键信息
      if (block.text) {
        const fact = block.text.substring(0, 100);
        keyFacts.push(fact);
      }
    }

    return { summary, keyFacts };
  }

  /**
   * 生成访问令牌
   * 
   * 使用简单的加密哈希生成访问令牌，用于访问私有上下文
   * 格式：base64(contextId:timestamp:random)
   */
  private generateAccessToken(contextId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const tokenData = `${contextId}:${timestamp}:${random}`;
    
    // 使用简单的 base64 编码（生产环境可以使用更安全的加密方式）
    const accessToken = Buffer.from(tokenData).toString('base64');
    
    this.logger.debug(`生成访问令牌: contextId=${contextId}, token=${accessToken.substring(0, 20)}...`);
    
    return accessToken;
  }
}
