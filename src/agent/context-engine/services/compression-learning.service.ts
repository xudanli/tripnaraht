// src/agent/context-engine/services/compression-learning.service.ts
/**
 * Compression Learning Service
 * 
 * Phase 3.3 优化: 压缩策略学习
 * 
 * 学习哪些 Block 可以压缩或省略，用于优化 Context Package 的 Token 使用
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContextBlock } from '../types/context-package.types';
import { ContextLearningInput } from './context-learning.service';

export interface CompressionLearning {
  blockKey: string;
  blockType: string;
  compressionScore: number; // 0-1，越高表示越可以压缩
  omissionScore: number; // 0-1，越高表示越可以省略
  sampleSize: number;
  confidence: number;
}

export interface CompressionStrategy {
  compress: ContextBlock[]; // 可以压缩的 Block
  omit: ContextBlock[]; // 可以省略的 Block
  keep: ContextBlock[]; // 必须保留的 Block
}

@Injectable()
export class CompressionLearningService {
  private readonly logger = new Logger(CompressionLearningService.name);

  /**
   * Phase 3.3 优化: 压缩学习结果缓存
   */
  private readonly compressionCache = new Map<string, {
    learning: CompressionLearning;
    timestamp: number;
    ttl: number; // 1小时
  }>();
  private readonly cacheTtl = 60 * 60 * 1000; // 1小时

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('压缩策略学习服务已初始化');
  }

  /**
   * Phase 3.3 优化: 学习压缩策略
   * 
   * 从 context_used 事件中学习哪些 Block 被使用，哪些未被使用
   */
  async learnCompressionStrategy(
    event: ContextLearningInput,
  ): Promise<void> {
    if (event.eventType !== 'context_used' || !event.eventData.contextPackage) {
      return;
    }

    if (!this.prisma) {
      this.logger.warn('PrismaService 未注入，压缩策略学习功能不可用');
      return;
    }

    try {
      const usedBlocks = event.eventData.usedBlocks || [];
      const allBlocks = event.eventData.contextPackage.blocks || [];

      // 学习每个 Block 的使用情况
      for (const block of allBlocks) {
        const wasUsed = usedBlocks.includes(block.key);

        // 更新压缩评分
        await this.updateCompressionScore(
          block.key,
          block.type,
          wasUsed ? 0.1 : 0.9, // 未使用的 Block 可以压缩
          wasUsed ? 0.0 : 0.5, // 未使用的 Block 可以省略
          event.userId,
          event.phase,
          event.agent,
        );
      }

      this.logger.debug(
        `压缩策略学习完成: block总数=${allBlocks.length}, 使用=${usedBlocks.length}, ` +
        `未使用=${allBlocks.length - usedBlocks.length}`
      );
    } catch (error: any) {
      this.logger.error(`学习压缩策略失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 更新 Block 压缩评分
   */
  private async updateCompressionScore(
    blockKey: string,
    blockType: string,
    compressionScore: number,
    omissionScore: number,
    userId?: string,
    phase?: string,
    agent?: string,
  ): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      // 查询现有记录（使用 context_used 事件类型作为压缩学习的标识）
      const existing = await this.prisma.contextLearningResult.findFirst({
        where: {
          userId: userId || null,
          blockKey,
          blockType,
          eventType: 'context_used', // 使用 context_used 事件类型
          phase: phase || null,
          agent: agent || null,
        },
      });

      if (existing) {
        // 更新压缩评分（使用 importanceScore 存储 compressionScore，relevanceScore 存储 omissionScore）
        const newCompressionScore = existing.importanceScore * 0.95 + compressionScore * 0.05;
        const newOmissionScore = (existing.relevanceScore || 0) * 0.95 + omissionScore * 0.05;

        await this.prisma.contextLearningResult.update({
          where: { id: existing.id },
          data: {
            importanceScore: Math.max(0, Math.min(1, newCompressionScore)),
            relevanceScore: Math.max(0, Math.min(1, newOmissionScore)),
            sampleSize: existing.sampleSize + 1,
            confidence: Math.min(1.0, (existing.sampleSize + 1) / 10),
            updatedAt: new Date(),
          },
        });
      } else {
        // 创建新记录
        await this.prisma.contextLearningResult.create({
          data: {
            userId: userId || null,
            blockKey,
            blockType,
            eventType: 'context_used',
            importanceScore: compressionScore,
            relevanceScore: omissionScore,
            usageCount: 0,
            positiveFeedbackCount: 0,
            negativeFeedbackCount: 0,
            confidence: 0.1,
            sampleSize: 1,
            phase: phase || null,
            agent: agent || null,
          },
        });
      }

      // 清除缓存（强制下次查询时重新计算）
      const cacheKey = `${blockKey}:${blockType}:${userId || 'global'}:${phase || 'all'}:${agent || 'all'}`;
      this.compressionCache.delete(cacheKey);
    } catch (error: any) {
      this.logger.warn(`更新压缩评分失败: blockKey=${blockKey}, error=${error.message}`);
    }
  }

  /**
   * Phase 3.3 优化: 获取压缩策略
   * 
   * 根据学习结果，返回哪些 Block 可以压缩、哪些可以省略
   */
  async getCompressionStrategy(
    blocks: ContextBlock[],
    userId?: string,
    phase?: string,
    agent?: string,
  ): Promise<CompressionStrategy> {
    if (!this.prisma) {
      // 如果没有数据库，返回默认策略（不压缩）
      return {
        compress: [],
        omit: [],
        keep: blocks,
      };
    }

    try {
      // 获取每个 Block 的压缩评分
      const compressionScores = await Promise.all(
        blocks.map(async (block) => {
          const cacheKey = `${block.key}:${block.type}:${userId || 'global'}:${phase || 'all'}:${agent || 'all'}`;
          
          // 检查缓存
          const cached = this.compressionCache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < cached.ttl) {
            return cached.learning;
          }

          // 从数据库查询
          const result = await this.prisma!.contextLearningResult.findFirst({
            where: {
              userId: userId || null,
              blockKey: block.key,
              blockType: block.type,
              eventType: 'context_used',
              phase: phase || null,
              agent: agent || null,
            },
          });

          const learning: CompressionLearning = {
            blockKey: block.key,
            blockType: block.type,
            compressionScore: result?.importanceScore || 0.5, // 默认中等压缩
            omissionScore: result?.relevanceScore || 0.0, // 默认不省略
            sampleSize: result?.sampleSize || 0,
            confidence: result?.confidence || 0,
          };

          // 更新缓存
          this.compressionCache.set(cacheKey, {
            learning,
            timestamp: Date.now(),
            ttl: this.cacheTtl,
          });

          return learning;
        })
      );

      // 生成压缩策略
      const compress: ContextBlock[] = [];
      const omit: ContextBlock[] = [];
      const keep: ContextBlock[] = [];

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const score = compressionScores[i];

        // 只考虑置信度 >= 0.3 的学习结果
        if (score.confidence >= 0.3) {
          if (score.omissionScore > 0.8) {
            omit.push(block);
          } else if (score.compressionScore > 0.7) {
            compress.push(block);
          } else {
            keep.push(block);
          }
        } else {
          // 置信度低，默认保留
          keep.push(block);
        }
      }

      this.logger.debug(
        `压缩策略生成: 总数=${blocks.length}, 压缩=${compress.length}, ` +
        `省略=${omit.length}, 保留=${keep.length}`
      );

      return {
        compress,
        omit,
        keep,
      };
    } catch (error: any) {
      this.logger.error(`获取压缩策略失败: ${error.message}`, error.stack);
      // 失败时返回默认策略（不压缩）
      return {
        compress: [],
        omit: [],
        keep: blocks,
      };
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.compressionCache.entries()) {
      if (now - value.timestamp >= value.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.compressionCache.delete(key);
    }
  }
}
