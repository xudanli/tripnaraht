// src/agent/context-engine/services/context-learning.service.ts
/**
 * Context Learning Service
 * 
 * Context学习服务：学习Context Block的重要性、相关性、压缩策略等
 * 
 * 学习维度：
 * - Block重要性学习：哪些Block对用户决策更重要
 * - Block相关性学习：哪些Block与用户查询更相关
 * - Context压缩策略学习：哪些Block可以压缩或省略
 * - 个性化Context组合学习：不同用户的最优Context组合
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContextPackage, ContextBlock } from '../types/context-package.types';
import { ParallelExecutorService } from '../../../rag/services/parallel-executor.service';
import { ContextPrometheusMetricsService } from './context-prometheus-metrics.service';

export type ContextLearningEventType = 
  | 'context_built' 
  | 'context_used' 
  | 'decision_made' 
  | 'user_feedback';

export interface ContextLearningInput {
  /** 用户ID */
  userId?: string;
  
  /** Trip ID（可选） */
  tripId?: string;
  
  /** 学习事件类型 */
  eventType: ContextLearningEventType;
  
  /** 事件数据 */
  eventData: {
    /** Context Package（如果是context_built事件） */
    contextPackage?: ContextPackage;
    
    /** 使用的Block keys（如果是context_used事件） */
    usedBlocks?: string[];
    
    /** 决策结果（如果是decision_made事件） */
    decisionResult?: {
      accepted: boolean;
      satisfaction?: number; // 0-1
    };
    
    /** 用户反馈（如果是user_feedback事件） */
    feedback?: {
      relevantBlocks?: string[];
      irrelevantBlocks?: string[];
      missingBlocks?: string[];
    };
  };
  
  /** 规划阶段（可选） */
  phase?: string;
  
  /** Agent名称（可选） */
  agent?: string;
  
  /** 用户查询（可选，用于相关性学习） */
  userQuery?: string;
}

export interface ContextLearningOutput {
  /** 学习结果 */
  learningResult: {
    /** 更新的Block优先级 */
    updatedPriorities?: Record<string, number>;
    
    /** 推荐的Block组合 */
    recommendedBlocks?: string[];
    
    /** 学习置信度 */
    confidence: number;
    
    /** 样本数量 */
    sampleSize: number;
  };
}

export interface BlockLearningStats {
  blockKey: string;
  blockType: string;
  importanceScore: number; // 0-1
  relevanceScore?: number; // 0-1
  usageCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  confidence: number;
  sampleSize: number;
}

@Injectable()
export class ContextLearningService {
  private readonly logger = new Logger(ContextLearningService.name);

  // 学习权重配置
  private readonly learningWeights = {
    context_built: 0.1,      // Context构建事件权重较低
    context_used: 0.3,       // Context使用事件权重中等
    decision_made: 0.6,       // 决策结果事件权重较高
    user_feedback: 0.8,      // 用户反馈事件权重最高
  };

  // 学习衰减因子（用于时间衰减）
  private readonly decayFactor = 0.95; // 每次更新时，旧数据权重衰减5%

  /**
   * Phase 2.3 优化: 学习结果缓存
   * 缓存 key 格式: `${userId || 'global'}:${phase || 'all'}:${agent || 'all'}`
   */
  private readonly learningResultCache = new Map<string, {
    result: {
      updatedPriorities?: Record<string, number>;
      recommendedBlocks?: string[];
      confidence: number;
      sampleSize: number;
    };
    timestamp: number;
    ttl: number; // 1小时
  }>();
  private readonly cacheTtl = 60 * 60 * 1000; // 1小时

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly parallelExecutor?: ParallelExecutorService,
    @Optional() private readonly metrics?: ContextPrometheusMetricsService,
  ) {
    this.logger.log('Context学习服务已初始化');
    if (this.parallelExecutor) {
      this.logger.log('✅ 批量学习优化已启用');
    }
    if (this.metrics) {
      this.logger.log('✅ Prometheus指标收集已启用');
    }
  }

  /**
   * 学习Context使用情况
   */
  async learn(input: ContextLearningInput): Promise<ContextLearningOutput> {
    this.logger.debug(`学习Context: userId=${input.userId || 'none'}, eventType=${input.eventType}`);

    const startTime = Date.now();
    const phase = input.phase || 'unknown';
    const agent = input.agent || 'unknown';

    if (!this.prisma) {
      this.logger.warn('PrismaService 未注入，Context学习功能不可用');
      return {
        learningResult: {
          confidence: 0,
          sampleSize: 0,
        },
      };
    }

    try {
      const weight = this.learningWeights[input.eventType] || 0.1;

      // 根据事件类型处理不同的学习逻辑
      switch (input.eventType) {
        case 'context_built':
          await this.learnFromContextBuilt(input, weight);
          break;
        case 'context_used':
          await this.learnFromContextUsed(input, weight);
          break;
        case 'decision_made':
          await this.learnFromDecisionMade(input, weight);
          break;
        case 'user_feedback':
          await this.learnFromUserFeedback(input, weight);
          break;
      }

      // 获取学习结果
      const learningResult = await this.getLearningResult(input.userId, input.phase, input.agent);

      // 记录 Prometheus 指标
      if (this.metrics) {
        const processingTimeMs = Date.now() - startTime;
        this.metrics.recordLearningEvent(input.eventType, phase, agent, processingTimeMs);

        // 更新学习统计指标
        if (learningResult.updatedPriorities) {
          const blockTypes = new Set<string>();
          for (const blockKey of Object.keys(learningResult.updatedPriorities)) {
            // 从 blockKey 提取 blockType（例如 'COUNTRY_WEATHER'）
            const blockType = blockKey.split('_').slice(0, -1).join('_') || blockKey;
            blockTypes.add(blockType);
          }
          for (const blockType of blockTypes) {
            this.metrics.recordPriorityUpdate(phase, agent, blockType);
          }
        }

        // 更新置信度和样本大小指标（如果有推荐块）
        if (learningResult.recommendedBlocks && learningResult.recommendedBlocks.length > 0) {
          for (const blockKey of learningResult.recommendedBlocks.slice(0, 10)) { // 限制前10个
            this.metrics.updateLearningStats(
              phase,
              agent,
              blockKey,
              learningResult.confidence,
              learningResult.sampleSize,
            );
          }
        }
      }

      return {
        learningResult,
      };
    } catch (error: any) {
      this.logger.error(`Context学习失败: ${error.message}`, error.stack);
      // 即使失败也记录指标
      if (this.metrics) {
        const processingTimeMs = Date.now() - startTime;
        this.metrics.recordLearningEvent(input.eventType, phase, agent, processingTimeMs);
      }
      return {
        learningResult: {
          confidence: 0,
          sampleSize: 0,
        },
      };
    }
  }

  /**
   * 从Context构建事件学习
   */
  private async learnFromContextBuilt(
    input: ContextLearningInput,
    weight: number,
  ): Promise<void> {
    if (!input.eventData.contextPackage || !this.prisma) {
      return;
    }

    const blocks = input.eventData.contextPackage.blocks || [];
    
    // 学习每个Block的重要性（基于优先级）
    for (const block of blocks) {
      await this.updateBlockImportance(
        input.userId,
        input.tripId,
        block.key,
        block.type,
        block.priority / 100, // 转换为0-1范围
        weight,
        input.phase,
        input.agent,
      );
    }
  }

  /**
   * 从Context使用事件学习
   */
  private async learnFromContextUsed(
    input: ContextLearningInput,
    weight: number,
  ): Promise<void> {
    if (!input.eventData.usedBlocks || !this.prisma) {
      return;
    }

    // 学习使用的Block的重要性
    for (const blockKey of input.eventData.usedBlocks) {
      await this.updateBlockUsage(
        input.userId,
        input.tripId,
        blockKey,
        weight,
        input.phase,
        input.agent,
      );
    }
  }

  /**
   * 从决策结果学习
   */
  private async learnFromDecisionMade(
    input: ContextLearningInput,
    weight: number,
  ): Promise<void> {
    if (!input.eventData.decisionResult || !this.prisma) {
      return;
    }

    const { accepted, satisfaction = 0.5 } = input.eventData.decisionResult;
    
    // 如果决策被接受且满意度高，提高相关Block的重要性
    if (accepted && satisfaction >= 0.7) {
      // 这里需要知道哪些Block参与了决策
      // 暂时使用context_built事件中的Block
      if (input.eventData.contextPackage) {
        const blocks = input.eventData.contextPackage.blocks || [];
        for (const block of blocks) {
          await this.updateBlockFeedback(
            input.userId,
            input.tripId,
            block.key,
            block.type,
            true, // 正面反馈
            weight * satisfaction, // 根据满意度调整权重
            input.phase,
            input.agent,
          );
        }
      }
    } else if (!accepted || satisfaction < 0.3) {
      // 决策被拒绝或满意度低，降低相关Block的重要性
      if (input.eventData.contextPackage) {
        const blocks = input.eventData.contextPackage.blocks || [];
        for (const block of blocks) {
          await this.updateBlockFeedback(
            input.userId,
            input.tripId,
            block.key,
            block.type,
            false, // 负面反馈
            weight * (1 - satisfaction),
            input.phase,
            input.agent,
          );
        }
      }
    }
  }

  /**
   * 从用户反馈学习
   */
  private async learnFromUserFeedback(
    input: ContextLearningInput,
    weight: number,
  ): Promise<void> {
    if (!input.eventData.feedback || !this.prisma) {
      return;
    }

    const { relevantBlocks = [], irrelevantBlocks = [], missingBlocks = [] } = input.eventData.feedback;

    // 学习相关Block的重要性
    for (const blockKey of relevantBlocks) {
      await this.updateBlockFeedback(
        input.userId,
        input.tripId,
        blockKey,
        'UNKNOWN', // 类型未知，后续可以从Context Package中获取
        true,
        weight,
        input.phase,
        input.agent,
      );
    }

    // 学习不相关Block的重要性（降低）
    for (const blockKey of irrelevantBlocks) {
      await this.updateBlockFeedback(
        input.userId,
        input.tripId,
        blockKey,
        'UNKNOWN',
        false,
        weight,
        input.phase,
        input.agent,
      );
    }

    // 学习缺失Block的重要性（提高，因为用户需要）
    for (const blockKey of missingBlocks) {
      await this.updateBlockImportance(
        input.userId,
        input.tripId,
        blockKey,
        'UNKNOWN',
        0.8, // 高优先级
        weight,
        input.phase,
        input.agent,
      );
    }
  }

  /**
   * 更新Block重要性
   */
  private async updateBlockImportance(
    userId: string | undefined,
    tripId: string | undefined,
    blockKey: string,
    blockType: string,
    importanceScore: number,
    weight: number,
    phase?: string,
    agent?: string,
  ): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      // 查找或创建学习记录（使用findFirst因为userId可能为空）
      const existing = await this.prisma.contextLearningResult.findFirst({
        where: {
          userId: userId || null,
          blockKey,
          eventType: 'context_built',
          phase: phase || null,
          agent: agent || null,
        },
      });

      if (existing) {
        // 更新现有记录（使用加权平均和时间衰减）
        const oldScore = existing.importanceScore;
        const newScore = oldScore * this.decayFactor + importanceScore * weight;
        const newSampleSize = existing.sampleSize + 1;
        const newConfidence = Math.min(1.0, newSampleSize / 10); // 置信度随样本数增加

        await this.prisma.contextLearningResult.update({
          where: { id: existing.id },
          data: {
            importanceScore: newScore,
            sampleSize: newSampleSize,
            confidence: newConfidence,
            updatedAt: new Date(),
          },
        });
      } else {
        // 创建新记录
        // 检查是否已存在（防止并发创建）
        const duplicate = await this.prisma.contextLearningResult.findFirst({
          where: {
            userId: userId || null,
            blockKey,
            eventType: 'context_built',
            phase: phase || null,
            agent: agent || null,
          },
        });

        if (!duplicate) {
          await this.prisma.contextLearningResult.create({
            data: {
              userId: userId || null,
              tripId: tripId || null,
              eventType: 'context_built',
              blockKey,
              blockType,
              importanceScore,
              usageCount: 0,
              positiveFeedbackCount: 0,
              negativeFeedbackCount: 0,
              confidence: 0.1, // 初始置信度较低
              sampleSize: 1,
              phase: phase || null,
              agent: agent || null,
            },
          });
        }
      }
    } catch (error: any) {
      this.logger.warn(`更新Block重要性失败: blockKey=${blockKey}, error=${error.message}`);
    }
  }

  /**
   * 更新Block使用情况
   */
  private async updateBlockUsage(
    userId: string | undefined,
    tripId: string | undefined,
    blockKey: string,
    weight: number,
    phase?: string,
    agent?: string,
  ): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      const existing = await this.prisma.contextLearningResult.findFirst({
        where: {
          userId: userId || null,
          blockKey,
          eventType: 'context_used',
          phase: phase || null,
          agent: agent || null,
        },
      });

      if (existing) {
        await this.prisma.contextLearningResult.update({
          where: { id: existing.id },
          data: {
            usageCount: existing.usageCount + 1,
            importanceScore: Math.min(1.0, existing.importanceScore + weight * 0.1), // 使用增加重要性
            sampleSize: existing.sampleSize + 1,
            confidence: Math.min(1.0, (existing.sampleSize + 1) / 10),
            updatedAt: new Date(),
          },
        });
      } else {
        // 检查是否已存在（防止并发创建）
        const duplicate = await this.prisma.contextLearningResult.findFirst({
          where: {
            userId: userId || null,
            blockKey,
            eventType: 'context_used',
            phase: phase || null,
            agent: agent || null,
          },
        });

        if (!duplicate) {
          await this.prisma.contextLearningResult.create({
            data: {
              userId: userId || null,
              tripId: tripId || null,
              eventType: 'context_used',
              blockKey,
              blockType: 'UNKNOWN',
              importanceScore: weight * 0.5, // 初始重要性
              usageCount: 1,
              positiveFeedbackCount: 0,
              negativeFeedbackCount: 0,
              confidence: 0.1,
              sampleSize: 1,
              phase: phase || null,
              agent: agent || null,
            },
          });
        }
      }
    } catch (error: any) {
      this.logger.warn(`更新Block使用情况失败: blockKey=${blockKey}, error=${error.message}`);
    }
  }

  /**
   * 更新Block反馈
   */
  private async updateBlockFeedback(
    userId: string | undefined,
    tripId: string | undefined,
    blockKey: string,
    blockType: string,
    isPositive: boolean,
    weight: number,
    phase?: string,
    agent?: string,
  ): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      const existing = await this.prisma.contextLearningResult.findFirst({
        where: {
          userId: userId || null,
          blockKey,
          eventType: 'user_feedback',
          phase: phase || null,
          agent: agent || null,
        },
      });

      if (existing) {
        const newPositiveCount = isPositive 
          ? existing.positiveFeedbackCount + 1 
          : existing.positiveFeedbackCount;
        const newNegativeCount = !isPositive 
          ? existing.negativeFeedbackCount + 1 
          : existing.negativeFeedbackCount;
        
        // 根据反馈调整重要性
        const feedbackScore = newPositiveCount / (newPositiveCount + newNegativeCount + 1);
        const newImportanceScore = existing.importanceScore * this.decayFactor + feedbackScore * weight;
        
        await this.prisma.contextLearningResult.update({
          where: { id: existing.id },
          data: {
            importanceScore: Math.max(0, Math.min(1, newImportanceScore)),
            positiveFeedbackCount: newPositiveCount,
            negativeFeedbackCount: newNegativeCount,
            sampleSize: existing.sampleSize + 1,
            confidence: Math.min(1.0, (existing.sampleSize + 1) / 10),
            updatedAt: new Date(),
          },
        });
      } else {
        // 检查是否已存在（防止并发创建）
        const duplicate = await this.prisma.contextLearningResult.findFirst({
          where: {
            userId: userId || null,
            blockKey,
            eventType: 'user_feedback',
            phase: phase || null,
            agent: agent || null,
          },
        });

        if (!duplicate) {
          await this.prisma.contextLearningResult.create({
            data: {
              userId: userId || null,
              tripId: tripId || null,
              eventType: 'user_feedback',
              blockKey,
              blockType,
              importanceScore: isPositive ? weight * 0.7 : weight * 0.3,
              usageCount: 0,
              positiveFeedbackCount: isPositive ? 1 : 0,
              negativeFeedbackCount: !isPositive ? 1 : 0,
              confidence: 0.1,
              sampleSize: 1,
              phase: phase || null,
              agent: agent || null,
            },
          });
        }
      }
    } catch (error: any) {
      this.logger.warn(`更新Block反馈失败: blockKey=${blockKey}, error=${error.message}`);
    }
  }

  /**
   * 获取学习结果
   * 
   * Phase 2.3 优化: 添加学习结果缓存（1小时TTL）
   */
  async getLearningResult(
    userId?: string,
    phase?: string,
    agent?: string,
  ): Promise<{
    updatedPriorities?: Record<string, number>;
    recommendedBlocks?: string[];
    confidence: number;
    sampleSize: number;
  }> {
    // Phase 2.3 优化: 检查缓存
    const cacheKey = `${userId || 'global'}:${phase || 'all'}:${agent || 'all'}`;
    const cached = this.learningResultCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      this.logger.debug(`✅ 学习结果缓存命中: ${cacheKey}`);
      return cached.result;
    }

    if (!this.prisma) {
      return {
        confidence: 0,
        sampleSize: 0,
      };
    }

    try {
      // 查询用户的学习记录（如果提供了userId）
      const where: any = {};
      if (userId) {
        where.userId = userId;
      }
      if (phase) {
        where.phase = phase;
      }
      if (agent) {
        where.agent = agent;
      }

      const results = await this.prisma.contextLearningResult.findMany({
        where,
        orderBy: [
          { importanceScore: 'desc' },
          { confidence: 'desc' },
        ],
        take: 100, // 限制返回数量
      });

      if (results.length === 0) {
        return {
          confidence: 0,
          sampleSize: 0,
        };
      }

      // 计算平均置信度和样本数
      const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
      const totalSampleSize = results.reduce((sum, r) => sum + r.sampleSize, 0);
      const avgConfidence = totalConfidence / results.length;

      // 构建优先级映射（将重要性评分转换为优先级0-100）
      const updatedPriorities: Record<string, number> = {};
      const recommendedBlocks: string[] = [];

      for (const result of results) {
        // 只考虑置信度较高的结果
        if (result.confidence >= 0.3) {
          updatedPriorities[result.blockKey] = Math.round(result.importanceScore * 100);
          
          // 推荐重要性高且置信度高的Block
          if (result.importanceScore >= 0.6 && result.confidence >= 0.5) {
            recommendedBlocks.push(result.blockKey);
          }
        }
      }

      const result = {
        updatedPriorities,
        recommendedBlocks,
        confidence: avgConfidence,
        sampleSize: totalSampleSize,
      };

      // Phase 2.3 优化: 更新缓存
      this.learningResultCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        ttl: this.cacheTtl,
      });

      // 清理过期缓存
      this.cleanExpiredCache();

      return result;
    } catch (error: any) {
      this.logger.error(`获取学习结果失败: ${error.message}`, error.stack);
      return {
        confidence: 0,
        sampleSize: 0,
      };
    }
  }

  /**
   * Phase 2.1 优化: 批量学习
   * 
   * 并行处理多个学习事件，提高效率
   */
  async batchLearn(
    events: ContextLearningInput[],
    options?: {
      batchSize?: number; // 默认 100
      maxConcurrency?: number; // 默认 5
    }
  ): Promise<ContextLearningOutput[]> {
    if (events.length === 0) {
      return [];
    }

    const batchSize = options?.batchSize || 100;
    const maxConcurrency = options?.maxConcurrency || 5;

    this.logger.log(`批量学习开始: 事件数=${events.length}, batchSize=${batchSize}, maxConcurrency=${maxConcurrency}`);

    // 如果没有并行执行器，使用顺序处理
    if (!this.parallelExecutor) {
      this.logger.warn('ParallelExecutor 不可用，使用顺序处理');
      const results: ContextLearningOutput[] = [];
      for (const event of events) {
        try {
          const result = await this.learn(event);
          results.push(result);
        } catch (error: any) {
          this.logger.error(`批量学习失败: eventType=${event.eventType}, error=${error.message}`);
          results.push({
            learningResult: {
              confidence: 0,
              sampleSize: 0,
            },
          });
        }
      }
      return results;
    }

    // 将事件分批处理
    const batches: ContextLearningInput[][] = [];
    for (let i = 0; i < events.length; i += batchSize) {
      batches.push(events.slice(i, i + batchSize));
    }

    const allResults: ContextLearningOutput[] = [];

    // 并行处理每个批次
    for (const batch of batches) {
      const tasks = batch.map((event, index) => ({
        id: `${event.eventType}_${index}_${Date.now()}`,
        operation: async () => {
          try {
            return await this.learn(event);
          } catch (error: any) {
            this.logger.error(`批量学习失败: eventType=${event.eventType}, error=${error.message}`);
            return {
              learningResult: {
                confidence: 0,
                sampleSize: 0,
              },
            } as ContextLearningOutput;
          }
        },
        timeout: 10000, // 10秒超时
      }));

      const batchResults = await this.parallelExecutor.executeAll(tasks, {
        maxConcurrency,
        taskTimeout: 10000,
        delayMs: 50, // 任务间 50ms 延迟
      });

      // 提取结果
      for (const result of batchResults) {
        if (result.success && result.result) {
          allResults.push(result.result);
        } else {
          this.logger.error(`批量学习任务失败: ${result.id}, error=${result.error?.message}`);
          allResults.push({
            learningResult: {
              confidence: 0,
              sampleSize: 0,
            },
          });
        }
      }
    }

    const stats = this.parallelExecutor.getStats(
      allResults.map((r, i) => ({
        id: `result_${i}`,
        success: r.learningResult.sampleSize > 0,
        duration: 0, // 批量学习不追踪单个任务耗时
      }))
    );

    this.logger.log(
      `批量学习完成: 总数=${events.length}, 成功=${stats.success}, ` +
      `失败=${stats.failed}, 平均置信度=${allResults.reduce((sum, r) => sum + r.learningResult.confidence, 0) / allResults.length}`
    );

    return allResults;
  }

  /**
   * Phase 2.3 优化: 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.learningResultCache.entries()) {
      if (now - value.timestamp >= value.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.learningResultCache.delete(key);
    }

    // 如果缓存太大（超过 1000 个），清理最旧的 20%
    if (this.learningResultCache.size > 1000) {
      const entries = Array.from(this.learningResultCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.learningResultCache.delete(entries[i][0]);
      }
      this.logger.debug(`学习结果缓存过大，清理了最旧的 ${toRemove} 个条目`);
    }
  }

  /**
   * 获取Block学习统计
   */
  async getBlockLearningStats(
    blockKey: string,
    userId?: string,
    phase?: string,
    agent?: string,
  ): Promise<BlockLearningStats | null> {
    if (!this.prisma) {
      return null;
    }

    try {
      const where: any = { blockKey };
      if (userId) {
        where.userId = userId;
      }
      if (phase) {
        where.phase = phase;
      }
      if (agent) {
        where.agent = agent;
      }

      const results = await this.prisma.contextLearningResult.findMany({
        where,
      });

      if (results.length === 0) {
        return null;
      }

      // 聚合所有事件类型的结果
      const aggregated = {
        blockKey,
        blockType: results[0].blockType,
        importanceScore: 0,
        relevanceScore: undefined as number | undefined,
        usageCount: 0,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        confidence: 0,
        sampleSize: 0,
      };

      for (const result of results) {
        aggregated.importanceScore += result.importanceScore * result.confidence;
        aggregated.usageCount += result.usageCount;
        aggregated.positiveFeedbackCount += result.positiveFeedbackCount;
        aggregated.negativeFeedbackCount += result.negativeFeedbackCount;
        aggregated.sampleSize += result.sampleSize;
      }

      // 归一化重要性评分
      const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
      if (totalConfidence > 0) {
        aggregated.importanceScore /= totalConfidence;
      }

      // 计算平均置信度
      aggregated.confidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

      return aggregated;
    } catch (error: any) {
      this.logger.error(`获取Block学习统计失败: ${error.message}`, error.stack);
      return null;
    }
  }
}
