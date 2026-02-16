// src/agent/context-engine/services/execution-history-compressor.service.ts
/**
 * Execution History Compressor
 *
 * Context Orchestrator: 执行历史结构化压缩
 * 将 DECISION_LOG / PLAN_DAY / PLAN_SEGMENT / REJECTION_LOG / TOOL_OUTPUT 压缩为摘要
 * 参考：docs/CONTEXT_ORCHESTRATOR_IMPLEMENTATION_PLAN.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { ContextBlock } from '../types/context-package.types';

const EXECUTION_BLOCK_TYPES = new Set([
  'DECISION_LOG',
  'PLAN_DAY',
  'PLAN_SEGMENT',
  'REJECTION_LOG',
  'TOOL_OUTPUT',
]);

/** 单块最大字符数（压缩后） */
const MAX_CHARS_PER_BLOCK: Record<string, number> = {
  DECISION_LOG: 400,
  PLAN_DAY: 200,
  PLAN_SEGMENT: 150,
  REJECTION_LOG: 200,
  TOOL_OUTPUT: 150,
};

const DEFAULT_MAX_CHARS = 200;

@Injectable()
export class ExecutionHistoryCompressorService {
  private readonly logger = new Logger(ExecutionHistoryCompressorService.name);

  /**
   * 压缩执行历史相关的 blocks
   */
  compress(blocks: ContextBlock[]): ContextBlock[] {
    return blocks.map((block) => {
      if (!EXECUTION_BLOCK_TYPES.has(block.type)) {
        return block;
      }
      return this.compressBlock(block);
    });
  }

  private compressBlock(block: ContextBlock): ContextBlock {
    const maxChars = MAX_CHARS_PER_BLOCK[block.type] ?? DEFAULT_MAX_CHARS;
    if (block.text.length <= maxChars) {
      return block;
    }

    const compressedText = this.compressTextByType(block.type, block.text, maxChars);
    this.logger.debug(
      `压缩 ${block.type} block "${block.key}": ${block.text.length} → ${compressedText.length} 字符`,
    );

    return {
      ...block,
      text: compressedText,
      estimatedTokens: Math.ceil(compressedText.length / 2.5),
    };
  }

  private compressTextByType(type: string, text: string, maxChars: number): string {
    switch (type) {
      case 'DECISION_LOG':
        return this.compressDecisionLog(text, maxChars);
      case 'PLAN_DAY':
      case 'PLAN_SEGMENT':
        return this.compressPlanBlock(text, maxChars);
      case 'REJECTION_LOG':
        return this.compressRejectionLog(text, maxChars);
      case 'TOOL_OUTPUT':
        return this.compressToolOutput(text, maxChars);
      default:
        return text.substring(0, maxChars) + (text.length > maxChars ? '...' : '');
    }
  }

  private compressDecisionLog(text: string, maxChars: number): string {
    const lines = text.split('\n').filter(Boolean);
    if (lines.length <= 3) {
      return text.length <= maxChars ? text : text.substring(0, maxChars) + '...';
    }
    // 保留前 2 条 + 摘要
    const head = lines.slice(0, 2).join('\n');
    const summary = `... 共 ${lines.length} 条决策`;
    const combined = head + '\n' + summary;
    return combined.length <= maxChars ? combined : head.substring(0, maxChars - summary.length - 5) + '...\n' + summary;
  }

  private compressPlanBlock(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    // 取首句 + 省略提示
    const firstLine = text.split('\n')[0] || text.substring(0, 80);
    return firstLine.length >= maxChars - 10
      ? firstLine.substring(0, maxChars - 10) + '...'
      : firstLine + ' [节略]';
  }

  private compressRejectionLog(text: string, maxChars: number): string {
    const lines = text.split('\n').filter(Boolean);
    if (lines.length <= 2) {
      return text.length <= maxChars ? text : text.substring(0, maxChars) + '...';
    }
    const count = lines.length;
    const sample = lines[0].substring(0, 80);
    return `[${count} 条拒绝] ${sample}${sample.length >= 60 ? '...' : ''}`;
  }

  private compressToolOutput(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const lines = text.split('\n').filter(Boolean);
    const count = lines.length;
    return `[${count} 个工具输出] 详见 privateState`;
  }
}
