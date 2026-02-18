/**
 * Token 估算工具
 *
 * Phase 2: Context Engine 工业化 - 供 ContextRanker、ContextCompressor 共用
 */

import { ContextBlock } from '../types/context-package.types';

/**
 * 估算 blocks 的 Token 数
 * 简单估算：英文 1 token ≈ 4 字符，中文 1 token ≈ 1.5 字符
 * 混合估算（假设 70% 中文，30% 英文）
 */
export function estimateTokens(blocks: ContextBlock[]): number {
  let totalChars = 0;
  for (const block of blocks) {
    totalChars += block.text.length;
    if (block.data) {
      totalChars += JSON.stringify(block.data).length;
    }
  }
  const chineseChars = totalChars * 0.7;
  const englishChars = totalChars * 0.3;
  return Math.ceil(chineseChars / 1.5 + englishChars / 4);
}
