/**
 * Context Ranker 接口
 *
 * Phase 2: Context Engine 工业化 - 排序并裁剪块到预算内
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { ContextBlock } from '../types/context-package.types';

/** ContextRanker 输入 */
export interface ContextRankerInput {
  blocks: ContextBlock[];
  tokenBudget: number;
  includePrivate?: boolean;
  excludeTopics?: string[];
}

/** ContextRanker 输出 */
export interface ContextRankerOutput {
  blocks: ContextBlock[];
  droppedCount: number;
}

/** ContextRanker 能力接口 */
export interface IContextRanker {
  rank(input: ContextRankerInput): ContextRankerOutput;
}
