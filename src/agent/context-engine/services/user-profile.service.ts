// src/agent/context-engine/services/user-profile.service.ts
/**
 * User Profile Service
 * 
 * Phase 3.1 优化: 用户画像学习
 * 
 * 从 Context Learning 事件中提取用户偏好，构建用户画像
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContextLearningInput } from './context-learning.service';

export interface UserProfile {
  userId: string;
  preferredBlockTypes: string[]; // 用户偏好的 Block 类型
  preferredTopics: string[]; // 用户偏好的主题
  blockImportanceScores: Record<string, number>; // Block 重要性评分（0-1）
  lastUpdated: Date;
  sampleSize: number; // 样本数量
  confidence: number; // 置信度（0-1）
}

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  /**
   * Phase 3.1 优化: 用户画像缓存
   */
  private readonly profileCache = new Map<string, {
    profile: UserProfile;
    timestamp: number;
    ttl: number; // 1小时
  }>();
  private readonly cacheTtl = 60 * 60 * 1000; // 1小时

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('用户画像服务已初始化');
  }

  /**
   * Phase 3.1 优化: 从学习事件中学习用户画像
   */
  async learnUserProfile(
    userId: string,
    events: ContextLearningInput[],
  ): Promise<UserProfile> {
    if (!this.prisma) {
      this.logger.warn('PrismaService 未注入，用户画像学习功能不可用');
      return this.createEmptyProfile(userId);
    }

    try {
      // 从学习事件中提取用户偏好
      const profile = await this.buildUserProfile(userId, events);

      // 更新用户画像（保存到数据库）
      await this.updateUserProfile(userId, profile);

      // 更新缓存
      this.profileCache.set(userId, {
        profile,
        timestamp: Date.now(),
        ttl: this.cacheTtl,
      });

      return profile;
    } catch (error: any) {
      this.logger.error(`学习用户画像失败: ${error.message}`, error.stack);
      return this.createEmptyProfile(userId);
    }
  }

  /**
   * 从学习事件构建用户画像
   */
  private async buildUserProfile(
    userId: string,
    events: ContextLearningInput[],
  ): Promise<UserProfile> {
    const preferredBlockTypes = new Map<string, number>();
    const preferredTopics = new Map<string, number>();
    const blockImportanceScores: Record<string, number> = {};

    // 从学习事件中提取偏好
    for (const event of events) {
      if (event.eventType === 'context_built' && event.eventData.contextPackage) {
        const blocks = event.eventData.contextPackage.blocks || [];
        
        for (const block of blocks) {
          // 统计 Block 类型偏好
          const typeCount = preferredBlockTypes.get(block.type) || 0;
          preferredBlockTypes.set(block.type, typeCount + block.priority / 100);

          // 统计主题偏好（从 Block key 提取主题）
          const topic = this.extractTopicFromBlockKey(block.key);
          if (topic) {
            const topicCount = preferredTopics.get(topic) || 0;
            preferredTopics.set(topic, topicCount + block.priority / 100);
          }

          // 记录 Block 重要性评分
          if (!blockImportanceScores[block.key]) {
            blockImportanceScores[block.key] = block.priority / 100;
          } else {
            // 使用加权平均
            blockImportanceScores[block.key] = 
              (blockImportanceScores[block.key] + block.priority / 100) / 2;
          }
        }
      }

      if (event.eventType === 'context_used' && event.eventData.usedBlocks) {
        // 使用的 Block 重要性更高
        for (const blockKey of event.eventData.usedBlocks) {
          if (!blockImportanceScores[blockKey]) {
            blockImportanceScores[blockKey] = 0.7; // 默认重要性
          } else {
            blockImportanceScores[blockKey] = Math.min(1.0, blockImportanceScores[blockKey] + 0.1);
          }
        }
      }

      if (event.eventType === 'user_feedback' && event.eventData.feedback) {
        const { relevantBlocks, irrelevantBlocks } = event.eventData.feedback;
        
        // 相关 Block 重要性提高
        if (relevantBlocks) {
          for (const blockKey of relevantBlocks) {
            if (!blockImportanceScores[blockKey]) {
              blockImportanceScores[blockKey] = 0.8;
            } else {
              blockImportanceScores[blockKey] = Math.min(1.0, blockImportanceScores[blockKey] + 0.2);
            }
          }
        }

        // 不相关 Block 重要性降低
        if (irrelevantBlocks) {
          for (const blockKey of irrelevantBlocks) {
            if (blockImportanceScores[blockKey]) {
              blockImportanceScores[blockKey] = Math.max(0, blockImportanceScores[blockKey] - 0.2);
            }
          }
        }
      }
    }

    // 转换为数组并排序
    const sortedBlockTypes = Array.from(preferredBlockTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10
      .map(([type]) => type);

    const sortedTopics = Array.from(preferredTopics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10
      .map(([topic]) => topic);

    // 计算置信度（基于样本数量）
    const sampleSize = events.length;
    const confidence = Math.min(1.0, sampleSize / 10); // 10个样本达到最大置信度

    return {
      userId,
      preferredBlockTypes: sortedBlockTypes,
      preferredTopics: sortedTopics,
      blockImportanceScores,
      lastUpdated: new Date(),
      sampleSize,
      confidence,
    };
  }

  /**
   * 从 Block key 提取主题
   */
  private extractTopicFromBlockKey(blockKey: string): string | null {
    // Block key 格式通常是: "topic_blockName" 或 "COUNTRY_TOPIC"
    const parts = blockKey.split('_');
    if (parts.length >= 2) {
      return parts[0]; // 返回主题部分
    }
    return null;
  }

  /**
   * 获取用户画像
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    // 检查缓存
    const cached = this.profileCache.get(userId);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      this.logger.debug(`✅ 用户画像缓存命中: userId=${userId}`);
      return cached.profile;
    }

    if (!this.prisma) {
      return null;
    }

    try {
      // 从数据库查询用户的学习记录
      const learningResults = await this.prisma.contextLearningResult.findMany({
        where: {
          userId,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 100, // 最近100条记录
      });

      if (learningResults.length === 0) {
        return null;
      }

      // 构建用户画像（简化版，从学习记录中提取）
      const profile = await this.buildUserProfileFromLearningResults(userId, learningResults);

      // 更新缓存
      this.profileCache.set(userId, {
        profile,
        timestamp: Date.now(),
        ttl: this.cacheTtl,
      });

      return profile;
    } catch (error: any) {
      this.logger.error(`获取用户画像失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 从学习记录构建用户画像
   */
  private async buildUserProfileFromLearningResults(
    userId: string,
    learningResults: any[],
  ): Promise<UserProfile> {
    const preferredBlockTypes = new Map<string, number>();
    const blockImportanceScores: Record<string, number> = {};

    for (const result of learningResults) {
      // 统计 Block 类型偏好
      const typeCount = preferredBlockTypes.get(result.blockType) || 0;
      preferredBlockTypes.set(result.blockType, typeCount + result.importanceScore);

      // 记录 Block 重要性评分
      if (!blockImportanceScores[result.blockKey]) {
        blockImportanceScores[result.blockKey] = result.importanceScore;
      } else {
        // 使用加权平均（考虑置信度）
        blockImportanceScores[result.blockKey] = 
          (blockImportanceScores[result.blockKey] * 0.7 + result.importanceScore * result.confidence * 0.3);
      }
    }

    const sortedBlockTypes = Array.from(preferredBlockTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type]) => type);

    const sampleSize = learningResults.length;
    const confidence = Math.min(1.0, sampleSize / 10);

    return {
      userId,
      preferredBlockTypes: sortedBlockTypes,
      preferredTopics: [], // 从学习记录中难以提取主题
      blockImportanceScores,
      lastUpdated: new Date(),
      sampleSize,
      confidence,
    };
  }

  /**
   * Phase 3.2 优化: 获取个性化 Context 推荐
   */
  async getRecommendedContext(
    userId: string,
    phase: string,
    agent: string,
    globalLearningResult?: {
      recommendedBlocks?: string[];
      confidence: number;
    },
  ): Promise<string[]> {
    // 1. 获取用户画像
    const profile = await this.getUserProfile(userId);
    if (!profile || profile.confidence < 0.3) {
      // 用户画像置信度低，使用全局推荐
      return globalLearningResult?.recommendedBlocks || [];
    }

    // 2. 融合用户画像和全局学习结果
    const recommended = this.fuseRecommendations(
      profile,
      globalLearningResult?.recommendedBlocks || [],
    );

    this.logger.debug(
      `个性化推荐: userId=${userId}, 推荐Block数=${recommended.length}, ` +
      `用户画像置信度=${profile.confidence}, 全局置信度=${globalLearningResult?.confidence || 0}`
    );

    return recommended;
  }

  /**
   * 融合用户画像和全局学习结果
   */
  private fuseRecommendations(
    profile: UserProfile,
    globalRecommended: string[],
  ): string[] {
    const recommended = new Set<string>();

    // 1. 优先添加用户偏好的 Block（重要性高的）
    const userPreferredBlocks = Object.entries(profile.blockImportanceScores)
      .filter(([_, score]) => score >= 0.6) // 重要性 >= 0.6
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5) // Top 5
      .map(([blockKey]) => blockKey);

    for (const blockKey of userPreferredBlocks) {
      recommended.add(blockKey);
    }

    // 2. 添加全局推荐的 Block（如果不在用户偏好中）
    for (const blockKey of globalRecommended) {
      if (!recommended.has(blockKey)) {
        recommended.add(blockKey);
      }
    }

    return Array.from(recommended);
  }

  /**
   * 更新用户画像（保存到数据库）
   */
  private async updateUserProfile(userId: string, profile: UserProfile): Promise<void> {
    // TODO: 如果需要持久化用户画像，可以保存到数据库
    // 当前使用内存缓存，重启后会丢失
    // 可以考虑保存到 UserTravelProfile 表或新建 user_context_profile 表
    this.logger.debug(`用户画像已更新: userId=${userId}, sampleSize=${profile.sampleSize}, confidence=${profile.confidence}`);
  }

  /**
   * 创建空用户画像
   */
  private createEmptyProfile(userId: string): UserProfile {
    return {
      userId,
      preferredBlockTypes: [],
      preferredTopics: [],
      blockImportanceScores: {},
      lastUpdated: new Date(),
      sampleSize: 0,
      confidence: 0,
    };
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.profileCache.entries()) {
      if (now - value.timestamp >= value.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.profileCache.delete(key);
    }
  }
}
