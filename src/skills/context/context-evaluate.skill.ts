// src/skills/context/context-evaluate.skill.ts
/**
 * tripnara.context.evaluate
 * 
 * P2: 上下文质量评估
 * 
 * 评估 Context Package 的质量指标：
 * - 命中率：实际使用的块数 / 总块数
 * - 噪音率：低价值块数 / 总块数
 * - 超预算率：实际 Token 数 / Token 预算
 * - 压缩率：压缩后的块数 / 压缩前的块数
 * - 相关性得分：块与查询的相关性平均分
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextBlock, ContextPackage } from '../../agent/context-engine/types/context-package.types';

export interface ContextEvaluateInput extends SkillInput {
  /** Context Package */
  contextPackage: ContextPackage;
  
  /** 实际使用的块 key 列表（可选，用于计算命中率） */
  usedBlockKeys?: string[];
  
  /** 用户查询（用于计算相关性） */
  userQuery?: string;
  
  /** 规划阶段（用于评估匹配度） */
  phase?: string;
}

export interface ContextEvaluateOutput extends SkillOutput {
  /** 评估指标 */
  metrics: {
    /** 总块数 */
    totalBlocks: number;
    
    /** Public 块数 */
    publicBlocks: number;
    
    /** Private 块数 */
    privateBlocks: number;
    
    /** 实际使用的块数（如果有 usedBlockKeys） */
    usedBlocks?: number;
    
    /** 命中率 (0-1)：实际使用的块数 / 总块数 */
    hitRate?: number;
    
    /** 噪音块数（优先级 < 30 的块） */
    noiseBlocks: number;
    
    /** 噪音率 (0-1)：噪音块数 / 总块数 */
    noiseRate: number;
    
    /** 总 Token 数 */
    totalTokens: number;
    
    /** Token 预算 */
    tokenBudget: number;
    
    /** 超预算率 (0-1)：如果 > 1 表示超预算 */
    overBudgetRate: number;
    
    /** 是否超预算 */
    overBudget: boolean;
    
    /** 压缩后的块数（如果已压缩） */
    compressedBlocks?: number;
    
    /** 压缩率 (0-1)：压缩后的块数 / 压缩前的块数 */
    compressionRate?: number;
    
    /** 相关性得分（0-100）：块与查询的相关性平均分 */
    relevanceScore?: number;
    
    /** 块类型分布 */
    blockTypeDistribution: Record<string, number>;
    
    /** 优先级分布 */
    priorityDistribution: {
      high: number;    // priority >= 80
      medium: number;  // 50 <= priority < 80
      low: number;     // priority < 50
    };
  };
  
  /** 评估摘要 */
  summary: {
    /** 整体质量评级：'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' */
    quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    
    /** 主要问题列表 */
    issues: string[];
    
    /** 改进建议 */
    suggestions: string[];
  };
}

@Injectable()
export class ContextEvaluateSkill implements Skill<ContextEvaluateInput, ContextEvaluateOutput> {
  private readonly logger = new Logger(ContextEvaluateSkill.name);

  metadata = {
    name: 'context.evaluate',
    description: '评估 context 包质量：计算命中率、噪音率、超预算率、压缩率与相关性得分。在 context.build/compress 后需 metrics 回归或调优 blocks 时调用。',
    version: '1.0.0',
    category: 'rag' as const,
  };

  async execute(input: ContextEvaluateInput): Promise<ContextEvaluateOutput> {
    this.logger.debug(
      `执行 context.evaluate: blocks=${input.contextPackage.blocks.length}, tokens=${input.contextPackage.totalTokens}`,
    );

    try {
      const blocks = input.contextPackage.blocks;
      const totalBlocks = blocks.length;
      const publicBlocks = blocks.filter((b) => b.visibility === 'public').length;
      const privateBlocks = blocks.filter((b) => b.visibility === 'private').length;

      // 1. 计算命中率（如果有 usedBlockKeys）
      let hitRate: number | undefined;
      let usedBlocks: number | undefined;
      if (input.usedBlockKeys && input.usedBlockKeys.length > 0) {
        const usedSet = new Set(input.usedBlockKeys);
        usedBlocks = blocks.filter((b) => usedSet.has(b.key)).length;
        hitRate = usedBlocks / totalBlocks;
      }

      // 2. 计算噪音率（优先级 < 30 的块）
      const noiseBlocks = blocks.filter((b) => b.priority < 30).length;
      const noiseRate = noiseBlocks / totalBlocks;

      // 3. 计算超预算率
      const totalTokens = input.contextPackage.totalTokens;
      const tokenBudget = input.contextPackage.tokenBudget;
      const overBudgetRate = totalTokens / tokenBudget;
      const overBudget = overBudgetRate > 1;

      // 4. 计算压缩率（如果有元数据）
      let compressionRate: number | undefined;
      let compressedBlocks: number | undefined;
      if (input.contextPackage.compressed && input.contextPackage.metadata) {
        const originalBlocks = input.contextPackage.metadata.originalBlocksCount as number | undefined;
        if (originalBlocks && originalBlocks > 0) {
          compressedBlocks = totalBlocks;
          compressionRate = compressedBlocks / originalBlocks;
        }
      }

      // 5. 计算相关性得分（如果有 userQuery）
      let relevanceScore: number | undefined;
      if (input.userQuery) {
        relevanceScore = this.calculateRelevanceScore(blocks, input.userQuery, input.phase);
      }

      // 6. 计算块类型分布
      const blockTypeDistribution: Record<string, number> = {};
      for (const block of blocks) {
        blockTypeDistribution[block.type] = (blockTypeDistribution[block.type] || 0) + 1;
      }

      // 7. 计算优先级分布
      const priorityDistribution = {
        high: blocks.filter((b) => b.priority >= 80).length,
        medium: blocks.filter((b) => b.priority >= 50 && b.priority < 80).length,
        low: blocks.filter((b) => b.priority < 50).length,
      };

      // 8. 构建指标
      const metrics = {
        totalBlocks,
        publicBlocks,
        privateBlocks,
        usedBlocks,
        hitRate,
        noiseBlocks,
        noiseRate,
        totalTokens,
        tokenBudget,
        overBudgetRate,
        overBudget,
        compressedBlocks,
        compressionRate,
        relevanceScore,
        blockTypeDistribution,
        priorityDistribution,
      };

      // 9. 评估质量并生成建议
      const { quality, issues, suggestions } = this.evaluateQuality(metrics, input.contextPackage);

      return {
        metrics,
        summary: {
          quality,
          issues,
          suggestions,
        },
      };
    } catch (error: any) {
      this.logger.error(`上下文评估失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 计算相关性得分
   */
  private calculateRelevanceScore(blocks: ContextBlock[], userQuery: string, phase?: string): number {
    const queryLower = userQuery.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    
    let totalScore = 0;
    let blockCount = 0;

    for (const block of blocks) {
      let blockScore = block.priority; // 基础分数
      
      // 关键词匹配加分
      const blockTextLower = block.text.toLowerCase();
      const matchedWords = queryWords.filter((word) => 
        blockTextLower.includes(word) || block.key.toLowerCase().includes(word)
      );
      blockScore += matchedWords.length * 5;

      // Phase 匹配加分
      if (phase) {
        const phaseRelevantTypes: Record<string, string[]> = {
          planning: ['WORLD_MODEL', 'COUNTRY_VISA', 'COUNTRY_SAFETY'],
          decision: ['ABU_RULES', 'DECISION_LOG', 'COUNTRY_ROAD_RULES'],
          adjustment: ['PLAN_DAY', 'PLAN_SEGMENT', 'DECISION_LOG'],
          repair: ['REJECTION_LOG', 'PLAN_SEGMENT', 'DECISION_LOG'],
        };

        const phaseKey = phase.toLowerCase();
        const relevantTypes = phaseRelevantTypes[phaseKey] || [];
        if (relevantTypes.includes(block.type)) {
          blockScore += 10;
        }
      }

      totalScore += Math.min(100, blockScore);
      blockCount++;
    }

    return blockCount > 0 ? Math.round(totalScore / blockCount) : 0;
  }

  /**
   * 评估质量并生成建议
   */
  private evaluateQuality(
    metrics: ContextEvaluateOutput['metrics'],
    _contextPackage: ContextPackage,
  ): {
    quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    // 1. 检查超预算
    if (metrics.overBudget) {
      issues.push(`超预算 ${((metrics.overBudgetRate - 1) * 100).toFixed(1)}%`);
      suggestions.push('建议启用压缩或减少块数量');
      score -= 20;
    } else {
      score += 20;
    }

    // 2. 检查噪音率
    if (metrics.noiseRate > 0.3) {
      issues.push(`噪音率过高: ${(metrics.noiseRate * 100).toFixed(1)}%`);
      suggestions.push('建议移除低优先级块或启用压缩');
      score -= 15;
    } else if (metrics.noiseRate > 0.1) {
      issues.push(`噪音率中等: ${(metrics.noiseRate * 100).toFixed(1)}%`);
      suggestions.push('可以考虑压缩低优先级块');
      score -= 5;
    } else {
      score += 15;
    }

    // 3. 检查命中率（如果有）
    if (metrics.hitRate !== undefined) {
      if (metrics.hitRate < 0.5) {
        issues.push(`命中率较低: ${(metrics.hitRate * 100).toFixed(1)}%`);
        suggestions.push('建议优化块选择策略，提高相关性');
        score -= 15;
      } else if (metrics.hitRate < 0.7) {
        issues.push(`命中率中等: ${(metrics.hitRate * 100).toFixed(1)}%`);
        suggestions.push('可以考虑优化块选择');
        score -= 5;
      } else {
        score += 15;
      }
    }

    // 4. 检查相关性得分（如果有）
    if (metrics.relevanceScore !== undefined) {
      if (metrics.relevanceScore < 50) {
        issues.push(`相关性得分较低: ${metrics.relevanceScore}`);
        suggestions.push('建议改进块选择算法，提高相关性');
        score -= 10;
      } else if (metrics.relevanceScore < 70) {
        issues.push(`相关性得分中等: ${metrics.relevanceScore}`);
        suggestions.push('可以考虑优化块选择');
        score -= 5;
      } else {
        score += 10;
      }
    }

    // 5. 检查块数量
    if (metrics.totalBlocks === 0) {
      issues.push('没有块，可能是构建失败');
      suggestions.push('检查 Context Package 构建逻辑');
      score -= 30;
    } else if (metrics.totalBlocks < 3) {
      issues.push('块数量过少，可能信息不足');
      suggestions.push('检查是否遗漏了必要的块');
      score -= 10;
    } else if (metrics.totalBlocks > 20) {
      issues.push('块数量过多，可能影响性能');
      suggestions.push('建议启用压缩或优化块选择');
      score -= 5;
    } else {
      score += 10;
    }

    // 6. 检查压缩率（如果已压缩）
    if (metrics.compressionRate !== undefined) {
      if (metrics.compressionRate > 0.8) {
        issues.push(`压缩效果不明显: ${(metrics.compressionRate * 100).toFixed(1)}%`);
        suggestions.push('建议使用更激进的压缩策略');
        score -= 5;
      } else if (metrics.compressionRate < 0.3) {
        issues.push(`压缩过度: ${(metrics.compressionRate * 100).toFixed(1)}%`);
        suggestions.push('建议使用保守的压缩策略，避免丢失重要信息');
        score -= 10;
      }
    }

    // 7. 检查 Public/Private 比例
    if (metrics.publicBlocks === 0 && metrics.totalBlocks > 0) {
      issues.push('没有 Public 块，无法构建 prompt');
      suggestions.push('确保至少有一些 visibility="public" 的块');
      score -= 20;
    }

    // 确定质量评级
    let quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    if (score >= 70) {
      quality = 'EXCELLENT';
    } else if (score >= 50) {
      quality = 'GOOD';
    } else if (score >= 30) {
      quality = 'FAIR';
    } else {
      quality = 'POOR';
    }

    // 如果没有问题，添加肯定信息
    if (issues.length === 0) {
      suggestions.push('Context Package 质量良好，无需调整');
    }

    return {
      quality,
      issues,
      suggestions,
    };
  }
}