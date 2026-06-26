/**
 * Context Compressor Service
 *
 * Phase 3: Context Engine 工业化 - 超预算时智能压缩
 * 职责：学习策略 + context.compress skill + 降级
 *
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ContextBlock } from '../types/context-package.types';
import {
  ContextCompressorInput,
  ContextCompressorOutput,
  IContextCompressor,
} from '../interfaces/context-compressor.interface';
import { estimateTokens } from '../utils/token-estimator';
import { CompressionLearningService } from './compression-learning.service';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../../skills/services/skills-registry.token';

@Injectable()
export class ContextCompressorService implements IContextCompressor {
  private readonly logger = new Logger(ContextCompressorService.name);

  constructor(
    @Optional() private readonly compressionLearning?: CompressionLearningService,
    @Inject(forwardRef(() => SkillsRegistryService))
    @Optional()
    private readonly skillsRegistry?: SkillsRegistryService,
  ) {}

  async compress(input: ContextCompressorInput): Promise<ContextCompressorOutput> {
    const { blocks, tokenBudget, strategy = 'balanced', preserveKeys = [], userId, phase, agent } = input;
    const skillsCalled: string[] = [];

    try {
      // 1. 获取学习到的压缩策略
      let compressionStrategy: { compress: ContextBlock[]; omit: ContextBlock[]; keep: ContextBlock[] } | null = null;
      if (this.compressionLearning) {
        try {
          compressionStrategy = await this.compressionLearning.getCompressionStrategy(
            blocks,
            userId,
            phase,
            agent,
          );
        } catch (error: any) {
          this.logger.warn(`获取压缩策略失败: ${error.message}，使用默认策略`);
        }
      }

      // 2. 先省略可以省略的 Block
      let remainingBlocks = blocks;
      if (compressionStrategy?.omit.length) {
        remainingBlocks = blocks.filter((b) => !compressionStrategy!.omit.includes(b));
        this.logger.debug(`压缩策略: 省略了 ${compressionStrategy.omit.length} 个 Block`);
      }

      // 3. 检查 Token 是否已满足预算
      const currentTokens = estimateTokens(remainingBlocks);
      if (currentTokens <= tokenBudget) {
        return { blocks: remainingBlocks, compressed: false };
      }

      // 4. 调用 context.compress skill
      const effectivePreserveKeys = preserveKeys.length
        ? preserveKeys
        : compressionStrategy?.keep.map((b) => b.key) || [];

      if (this.skillsRegistry) {
        const contextCompressSkill = this.skillsRegistry.getSkill('context.compress');
        if (contextCompressSkill) {
          skillsCalled.push('context.compress');
          const result = await contextCompressSkill.execute({
            blocks: remainingBlocks,
            tokenBudget,
            strategy,
            preserveKeys: effectivePreserveKeys,
          });

          if (result?.compressedBlocks) {
            const compressedTokens = estimateTokens(result.compressedBlocks);
            if (compressedTokens <= tokenBudget) {
              this.logger.debug(
                `压缩完成: 原始=${currentTokens}, 压缩后=${compressedTokens}, ` +
                  `省略=${compressionStrategy?.omit.length || 0}, 压缩=${compressionStrategy?.compress.length || 0}`,
              );
              return {
                blocks: result.compressedBlocks,
                compressed: true,
                skillsCalled,
              };
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn(`调用 context.compress 失败: ${error}，使用简单压缩策略`);
    }

    // 5. 降级：移除优先级 < 30 的块
    const fallback = blocks.filter((b) => b.priority >= 30);
    return { blocks: fallback, compressed: true, skillsCalled };
  }
}
