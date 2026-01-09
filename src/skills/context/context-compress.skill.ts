// src/skills/context/context-compress.skill.ts
/**
 * tripnara.context.compress
 * 
 * P1: 上下文压缩（递归摘要/剪枝）
 * 
 * 触发条件：
 * - Context Package 超预算（比如 6k tokens 的 60%）
 * - decision_log/countryPack 某类块过长
 * 
 * 压缩目标：保留这三件事
 * - 硬门槛（Abu 拒绝的条件、道路/天气/体能门槛）
 * - 关键决策点（为什么选 A 不选 B）
 * - 失败尝试（哪些方案被否了 + 原因）
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextBlock } from '../../agent/context-engine/types/context-package.types';

export interface ContextCompressInput extends SkillInput {
  /** 需要压缩的块列表 */
  blocks: ContextBlock[];
  
  /** Token 预算 */
  tokenBudget: number;
  
  /** 压缩策略 */
  strategy?: 'aggressive' | 'conservative' | 'balanced'; // 默认 'balanced'
  
  /** 需要保留的关键块 key */
  preserveKeys?: string[];
}

export interface ContextCompressOutput extends SkillOutput {
  /** 压缩后的块列表 */
  compressedBlocks: ContextBlock[];
  
  /** 压缩统计 */
  stats: {
    originalBlocks: number;
    compressedBlocks: number;
    originalTokens: number;
    compressedTokens: number;
    reductionRatio: number; // 压缩比例 (0-1)
    removedKeys: string[];
  };
}

@Injectable()
export class ContextCompressSkill implements Skill<ContextCompressInput, ContextCompressOutput> {
  private readonly logger = new Logger(ContextCompressSkill.name);

  metadata = {
    name: 'context.compress',
    description: '上下文压缩：按预算压缩 blocks（递归摘要/剪枝），保留硬门槛、关键决策点、失败尝试',
    version: '1.0.0',
    category: 'rag' as const,
  };

  async execute(input: ContextCompressInput): Promise<ContextCompressOutput> {
    this.logger.debug(
      `执行 context.compress: blocks=${input.blocks.length}, budget=${input.tokenBudget}`,
    );

    try {
      const strategy = input.strategy || 'balanced';
      const preserveKeys = input.preserveKeys || [];

      // 1. 估算当前 Token 数
      const originalTokens = this.estimateTokens(input.blocks);

      // 2. 如果不超预算，直接返回
      if (originalTokens <= input.tokenBudget) {
        return {
          compressedBlocks: input.blocks,
          stats: {
            originalBlocks: input.blocks.length,
            compressedBlocks: input.blocks.length,
            originalTokens,
            compressedTokens: originalTokens,
            reductionRatio: 0,
            removedKeys: [],
          },
        };
      }

      // 3. 分类块（硬门槛、决策点、失败尝试、其他）
      const categorized = this.categorizeBlocks(input.blocks);

      // 4. 压缩策略
      let compressed: ContextBlock[];
      const removedKeys: string[] = [];

      switch (strategy) {
        case 'aggressive':
          compressed = this.compressAggressive(categorized, input.tokenBudget, preserveKeys, removedKeys);
          break;
        case 'conservative':
          compressed = this.compressConservative(categorized, input.tokenBudget, preserveKeys, removedKeys);
          break;
        default:
          compressed = this.compressBalanced(categorized, input.tokenBudget, preserveKeys, removedKeys);
      }

      // 5. 计算压缩统计
      const compressedTokens = this.estimateTokens(compressed);
      const reductionRatio = 1 - compressedTokens / originalTokens;

      return {
        compressedBlocks: compressed,
        stats: {
          originalBlocks: input.blocks.length,
          compressedBlocks: compressed.length,
          originalTokens,
          compressedTokens,
          reductionRatio,
          removedKeys,
        },
      };
    } catch (error: any) {
      this.logger.error(`上下文压缩失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 分类块
   */
  private categorizeBlocks(blocks: ContextBlock[]): {
    hardThresholds: ContextBlock[]; // 硬门槛
    keyDecisions: ContextBlock[]; // 关键决策点
    failures: ContextBlock[]; // 失败尝试
    others: ContextBlock[]; // 其他
  } {
    const hardThresholds: ContextBlock[] = [];
    const keyDecisions: ContextBlock[] = [];
    const failures: ContextBlock[] = [];
    const others: ContextBlock[] = [];

    for (const block of blocks) {
      if (
        block.type === 'ABU_RULES' ||
        block.type === 'COUNTRY_ROAD_RULES' ||
        block.type === 'COUNTRY_SAFETY' ||
        block.type === 'REJECTION_LOG'
      ) {
        hardThresholds.push(block);
      } else if (
        block.type === 'DECISION_LOG' ||
        block.type === 'PLAN_SUMMARY'
      ) {
        keyDecisions.push(block);
      } else if (
        block.text.toLowerCase().includes('fail') || block.text.toLowerCase().includes('拒绝')
      ) {
        failures.push(block);
      } else {
        others.push(block);
      }
    }

    return { hardThresholds, keyDecisions, failures, others };
  }

  /**
   * 激进压缩：只保留硬门槛和关键决策点
   */
  private compressAggressive(
    categorized: ReturnType<typeof this.categorizeBlocks>,
    tokenBudget: number,
    preserveKeys: string[],
    removedKeys: string[],
  ): ContextBlock[] {
    const compressed: ContextBlock[] = [];

    // 1. 保留硬门槛（最高优先级）
    for (const block of categorized.hardThresholds) {
      if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
        compressed.push(this.summarizeBlock(block, 'short'));
      } else {
        removedKeys.push(block.key);
      }
    }

    // 2. 保留关键决策点（摘要）
    for (const block of categorized.keyDecisions) {
      if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
        compressed.push(this.summarizeBlock(block, 'medium'));
      } else {
        removedKeys.push(block.key);
      }
    }

    // 3. 保留失败尝试（摘要）
    for (const block of categorized.failures) {
      if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
        compressed.push(this.summarizeBlock(block, 'short'));
      } else {
        removedKeys.push(block.key);
      }
    }

    // 4. 其他块全部移除
    for (const block of categorized.others) {
      if (!preserveKeys.includes(block.key)) {
        removedKeys.push(block.key);
      } else {
        compressed.push(this.summarizeBlock(block, 'short'));
      }
    }

    return compressed;
  }

  /**
   * 保守压缩：尽量保留，只做摘要
   */
  private compressConservative(
    categorized: ReturnType<typeof this.categorizeBlocks>,
    tokenBudget: number,
    preserveKeys: string[],
    removedKeys: string[],
  ): ContextBlock[] {
    const compressed: ContextBlock[] = [];
    const allBlocks = [
      ...categorized.hardThresholds,
      ...categorized.keyDecisions,
      ...categorized.failures,
      ...categorized.others,
    ];

    // 按优先级排序
    allBlocks.sort((a, b) => b.priority - a.priority);

    for (const block of allBlocks) {
      const summarized = this.summarizeBlock(block, 'medium');
      if (this.willFit(compressed, summarized, tokenBudget) || preserveKeys.includes(block.key)) {
        compressed.push(summarized);
      } else {
        removedKeys.push(block.key);
      }
    }

    return compressed;
  }

  /**
   * 平衡压缩：保留关键内容，摘要其他
   */
  private compressBalanced(
    categorized: ReturnType<typeof this.categorizeBlocks>,
    tokenBudget: number,
    preserveKeys: string[],
    removedKeys: string[],
  ): ContextBlock[] {
    const compressed: ContextBlock[] = [];

    // 1. 完整保留硬门槛
    for (const block of categorized.hardThresholds) {
      if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
        compressed.push(block);
      } else {
        compressed.push(this.summarizeBlock(block, 'short'));
      }
    }

    // 2. 摘要关键决策点
    for (const block of categorized.keyDecisions) {
      if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
        compressed.push(this.summarizeBlock(block, 'medium'));
      } else {
        removedKeys.push(block.key);
      }
    }

    // 3. 摘要失败尝试
    for (const block of categorized.failures) {
      if (this.willFit(compressed, block, tokenBudget) || preserveKeys.includes(block.key)) {
        compressed.push(this.summarizeBlock(block, 'short'));
      } else {
        removedKeys.push(block.key);
      }
    }

    // 4. 移除低优先级其他块
    categorized.others.sort((a, b) => b.priority - a.priority);
    for (const block of categorized.others) {
      if (preserveKeys.includes(block.key)) {
        compressed.push(this.summarizeBlock(block, 'short'));
      } else if (block.priority >= 50 && this.willFit(compressed, block, tokenBudget)) {
        compressed.push(this.summarizeBlock(block, 'short'));
      } else {
        removedKeys.push(block.key);
      }
    }

    return compressed;
  }

  /**
   * 摘要块（递归摘要）
   */
  private summarizeBlock(block: ContextBlock, level: 'short' | 'medium' | 'long'): ContextBlock {
    const maxLength = { short: 100, medium: 200, long: 500 }[level];
    
    if (block.text.length <= maxLength) {
      return block;
    }

    // 简单摘要：取前 N 个字符 + "..." + 关键信息
    const truncated = block.text.substring(0, maxLength - 50);
    const keyInfo = this.extractKeyInfo(block);
    const summarized = `${truncated}...\n[关键信息] ${keyInfo}`;

    return {
      ...block,
      text: summarized,
      estimatedTokens: Math.ceil(summarized.length / 4),
    };
  }

  /**
   * 提取关键信息
   */
  private extractKeyInfo(block: ContextBlock): string {
    // 提取关键信息（简化实现）
    if (block.data) {
      const keys = Object.keys(block.data).slice(0, 3);
      return keys.map((key) => `${key}: ${JSON.stringify(block.data[key]).substring(0, 30)}`).join(', ');
    }
    return block.text.split('\n').slice(0, 2).join('; ');
  }

  /**
   * 估算 Token 数
   */
  private estimateTokens(blocks: ContextBlock[]): number {
    let totalChars = 0;
    for (const block of blocks) {
      totalChars += block.text.length;
      if (block.data) {
        totalChars += JSON.stringify(block.data).length;
      }
    }
    // 混合估算（假设 70% 中文，30% 英文）
    return Math.ceil((totalChars * 0.7) / 1.5 + (totalChars * 0.3) / 4);
  }

  /**
   * 判断是否会超出预算
   */
  private willFit(blocks: ContextBlock[], newBlock: ContextBlock, tokenBudget: number): boolean {
    const currentTokens = this.estimateTokens(blocks);
    const newBlockTokens = newBlock.estimatedTokens || this.estimateTokens([newBlock]);
    return currentTokens + newBlockTokens <= tokenBudget;
  }
}