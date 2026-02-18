/**
 * Context Ranker Service
 *
 * Phase 2: Context Engine 工业化 - 排序并裁剪块到预算内
 * 职责：按优先级排序、过滤 excludeTopics、裁剪到 tokenBudget
 *
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { Injectable } from '@nestjs/common';
import { ContextBlock } from '../types/context-package.types';
import {
  ContextRankerInput,
  ContextRankerOutput,
  IContextRanker,
} from '../interfaces/context-ranker.interface';
import { estimateTokens } from '../utils/token-estimator';

@Injectable()
export class ContextRankerService implements IContextRanker {
  /**
   * 排序并裁剪块到预算内
   */
  rank(input: ContextRankerInput): ContextRankerOutput {
    const { blocks, tokenBudget, includePrivate = false, excludeTopics } = input;

    // 1. 过滤可见性
    let filteredBlocks = includePrivate
      ? blocks
      : blocks.filter((b) => b.visibility === 'public');

    // 2. 排除指定类型的块
    if (excludeTopics?.length) {
      const excludeSet = new Set(excludeTopics);
      filteredBlocks = filteredBlocks.filter((b) => !excludeSet.has(b.type));
    }

    // 3. 按优先级排序（降序）
    filteredBlocks.sort((a, b) => b.priority - a.priority);

    // 4. 裁剪到预算内
    const trimmedBlocks: ContextBlock[] = [];
    let currentTokens = 0;

    for (const block of filteredBlocks) {
      const blockTokens = block.estimatedTokens ?? estimateTokens([block]);
      if (currentTokens + blockTokens <= tokenBudget) {
        trimmedBlocks.push(block);
        currentTokens += blockTokens;
      } else {
        break;
      }
    }

    const droppedCount = filteredBlocks.length - trimmedBlocks.length;
    return { blocks: trimmedBlocks, droppedCount };
  }
}
