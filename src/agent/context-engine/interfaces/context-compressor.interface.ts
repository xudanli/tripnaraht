/**
 * Context Compressor 接口
 *
 * Phase 3: Context Engine 工业化 - 超预算时智能压缩
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { ContextBlock } from '../types/context-package.types';

/** ContextCompressor 输入 */
export interface ContextCompressorInput {
  blocks: ContextBlock[];
  tokenBudget: number;
  strategy?: 'aggressive' | 'conservative' | 'balanced';
  preserveKeys?: string[];
  userId?: string;
  phase?: string;
  agent?: string;
}

/** ContextCompressor 输出 */
export interface ContextCompressorOutput {
  blocks: ContextBlock[];
  compressed: boolean;
  skillsCalled?: string[];
}

/** ContextCompressor 能力接口 */
export interface IContextCompressor {
  compress(input: ContextCompressorInput): Promise<ContextCompressorOutput>;
}
