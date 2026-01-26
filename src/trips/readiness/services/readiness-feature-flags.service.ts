// src/trips/readiness/services/readiness-feature-flags.service.ts

/**
 * Readiness Feature Flags Service
 * 
 * Feature Flag 管理服务
 * - 支持全局开关（环境变量、数据库）
 * - 支持用户级别开关（数据库）
 * - 支持 A/B 测试配置
 * - 支持实时更新（Redis Pub/Sub）
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class ReadinessFeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(ReadinessFeatureFlagsService.name);
  private readonly featureFlagCache = new Map<string, { enabled: boolean; timestamp: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * 模块初始化：订阅 Feature Flag 更新事件
   */
  async onModuleInit() {
    // TODO: 实现 Redis Pub/Sub 订阅（如果需要实时更新）
    // 当前版本使用缓存 + 数据库查询
  }

  /**
   * 检查是否启用 AI 增强
   */
  async isAIEnhancementEnabled(
    userId?: string,
    feature: string = 'readiness_ai_enhancement',
  ): Promise<boolean> {
    // 1. 全局开关（环境变量，最高优先级）
    const globalEnvFlag = this.configService.get<boolean>(
      `FEATURE_FLAG_${feature.toUpperCase()}`,
    );
    if (globalEnvFlag === false) {
      return false;
    }

    // 2. 全局数据库开关
    const globalFlag = await this.getGlobalFeatureFlag(feature);
    if (globalFlag?.enabled === false) {
      return false;
    }

    // 3. 用户级别开关（如果用户已登录）
    if (userId) {
      const userFlag = await this.getUserFeatureFlag(userId, feature);
      if (userFlag?.enabled === false) {
        return false;
      }
      if (userFlag?.enabled === true) {
        return true;
      }
    }

    // 4. 默认值（配置或数据库）
    return (
      globalFlag?.enabled ??
      this.configService.get<boolean>(`FEATURE_FLAG_${feature.toUpperCase()}_DEFAULT`, false)
    );
  }

  /**
   * 获取全局 Feature Flag（带缓存）
   */
  private async getGlobalFeatureFlag(feature: string) {
    const cacheKey = `feature_flag:global:${feature}`;
    
    // 检查缓存
    const cached = this.featureFlagCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return { enabled: cached.enabled };
    }

    // 查询数据库
    const flag = await this.prisma.globalFeatureFlag.findUnique({
      where: { feature },
    });

    // 缓存
    if (flag) {
      this.featureFlagCache.set(cacheKey, {
        enabled: flag.enabled,
        timestamp: Date.now(),
      });
      return flag;
    }

    return null;
  }

  /**
   * 获取用户 Feature Flag（带缓存）
   */
  private async getUserFeatureFlag(userId: string, feature: string) {
    const cacheKey = `feature_flag:user:${userId}:${feature}`;
    
    // 检查缓存
    const cached = this.featureFlagCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return { enabled: cached.enabled };
    }

    // 查询数据库
    const flag = await this.prisma.userFeatureFlag.findUnique({
      where: {
        user_feature_flag_user_feature_unique: {
          userId,
          feature,
        },
      },
    });

    // 缓存
    if (flag) {
      this.featureFlagCache.set(cacheKey, {
        enabled: flag.enabled,
        timestamp: Date.now(),
      });
      return flag;
    }

    return null;
  }

  /**
   * 更新用户 Feature Flag
   */
  async updateUserFeatureFlag(
    userId: string,
    feature: string,
    enabled: boolean,
  ): Promise<void> {
    await this.prisma.userFeatureFlag.upsert({
      where: {
        user_feature_flag_user_feature_unique: {
          userId,
          feature,
        },
      },
      update: { enabled, updatedAt: new Date() },
      create: {
        userId,
        feature,
        enabled,
      },
    });

    // 失效缓存
    const cacheKey = `feature_flag:user:${userId}:${feature}`;
    this.featureFlagCache.delete(cacheKey);
  }

  /**
   * 更新全局 Feature Flag
   */
  async updateGlobalFeatureFlag(feature: string, enabled: boolean): Promise<void> {
    await this.prisma.globalFeatureFlag.upsert({
      where: { feature },
      update: { enabled, updatedAt: new Date() },
      create: {
        feature,
        enabled,
      },
    });

    // 失效缓存
    const cacheKey = `feature_flag:global:${feature}`;
    this.featureFlagCache.delete(cacheKey);
  }

  /**
   * 获取 A/B 测试分组
   */
  async getABTestGroup(
    userId: string,
    experimentId: string,
  ): Promise<'control' | 'treatment' | null> {
    const feature = `ab_test:${experimentId}`;
    
    // 检查用户是否已分配分组
    const userFlag = await this.getUserFeatureFlag(userId, feature);

    if (userFlag && 'metadata' in userFlag && userFlag.metadata && typeof userFlag.metadata === 'object') {
      const metadata = userFlag.metadata as any;
      if (metadata.group) {
        return metadata.group as 'control' | 'treatment';
      }
    }

    // 分配分组（基于用户 ID 哈希）
    const hash = this.hashUserId(userId);
    const group = hash % 2 === 0 ? 'control' : 'treatment';

    // 保存分组
    await this.prisma.userFeatureFlag.upsert({
      where: {
        user_feature_flag_user_feature_unique: {
          userId,
          feature,
        },
      },
      update: {
        enabled: true, // enabled 表示参与实验
        metadata: { group },
        updatedAt: new Date(),
      },
      create: {
        userId,
        feature,
        enabled: true,
        metadata: { group },
      },
    });

    // 失效缓存
    const cacheKey = `feature_flag:user:${userId}:${feature}`;
    this.featureFlagCache.delete(cacheKey);

    return group;
  }

  /**
   * 用户 ID 哈希（用于稳定分组）
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
