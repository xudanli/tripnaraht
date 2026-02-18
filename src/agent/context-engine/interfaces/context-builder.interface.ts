/**
 * Context Builder 接口
 *
 * Phase 1: Context Engine 工业化 - 组装原始 blocks（未排序、未裁剪）
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { ContextBlock } from '../types/context-package.types';
import { ContextPackageOptions } from '../types/context-package.types';

/** ContextBuilder 输出（供 Ranker/Compressor 消费） */
export interface ContextBuilderOutput {
  blocks: ContextBlock[];
  skillsCalled: string[];
  toolAllowlist?: Array<{ name: string; reason: string; priority: number }>;
}

/** ContextBuilder 能力接口 */
export interface IContextBuilder {
  buildBlocks(options: ContextPackageOptions): Promise<ContextBuilderOutput>;
}
