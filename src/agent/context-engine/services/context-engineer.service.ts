// src/agent/context-engine/services/context-engineer.service.ts
/**
 * Context Engineer Service
 * 
 * TripNARA 的"上下文编译器"
 * 
 * 输入：tripId + 当前 phase + 当前 agent + 用户请求
 * 输出：Context Package（分块、带优先级、带来源、可裁剪）+ 私有状态对象
 */

import { Injectable, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ContextPackage,
  ContextPackageOptions,
  ContextBlock,
  BlockType,
  BlockProvenance,
  ContextProjection,
  ApiDocCategory,
} from '../types/context-package.types';
import { StateProjection, ProjectionConfig } from '../types/trip-state-projection.types';
import { TripState } from '../../../trips/decision/shared/trip-state.types';
import { LangGraphState } from '../../../trips/decision/orchestration/langgraph-orchestrator.interface';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../../skills/services/skills-registry.token';
import { SKILL_COUNTRY_PACK_GET_BLOCKS, SKILL_PLAN_SELECT_SLICES } from '../../../skills/skills.tokens';
import { Skill } from '../../../skills/interfaces/skill.interface';
import { RedisService } from '../../../redis/redis.service';
import { ContextMetricsService } from './context-metrics.service';
import { ContextPrometheusMetricsService } from './context-prometheus-metrics.service';
import { ContextLearningService } from './context-learning.service';
import { UserProfileService } from './user-profile.service';
import { CompressionLearningService } from './compression-learning.service';
import { DynamicContextSelectorService } from './dynamic-context-selector.service';
import { TripTaskMemoryService } from './trip-task-memory.service';
import { ExecutionHistoryCompressorService } from './execution-history-compressor.service';
import { MemoryService } from '../../../agent/memory/services/memory.service';
import { DEFAULT_TOKEN_BUDGET } from '../constants/token-budget.constants';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../../../trips/decision/optimization/objective-function.interface';
import {
  DEFAULT_DAILY_UTILITY_WEIGHTS,
} from '../../../trips/decision/optimization/daily-utility';

@Injectable()
export class ContextEngineerService {
  private readonly logger = new Logger(ContextEngineerService.name);
  
  /**
   * L1: 内存缓存（最快，5分钟TTL）
   * 缓存 key 格式：细粒度 key（包含所有影响因素）
   */
  private readonly memoryCache = new Map<string, { package: ContextPackage; timestamp: number }>();

  /**
   * L2: Redis 缓存（快速，15分钟TTL）
   * 通过 redisService 访问
   */

  /**
   * L3: 数据库缓存（持久化，用于跨实例共享）
   * 通过 prisma 访问（可选）
   */

  /**
   * 存储的 Context Package（用于后台管理查询）
   * key: packageId, value: ContextPackage
   */
  private readonly packageStore = new Map<string, ContextPackage>();
  
  /**
   * L1 缓存 TTL（毫秒），默认 5 分钟
   */
  private readonly l1CacheTtl = 5 * 60 * 1000;
  
  /**
   * L2 缓存 TTL（毫秒），默认 15 分钟
   */
  private readonly l2CacheTtl = 15 * 60 * 1000;
  
  /**
   * 缓存键前缀（用于 Redis）
   */
  private readonly cacheKeyPrefix = 'context_package:';

  /**
   * In-Flight Request Deduplication: 正在进行的构建任务
   * 避免并发请求重复构建相同的 Context Package
   */
  private readonly inFlightBuilds = new Map<string, Promise<ContextPackage>>();

  // 追踪调用的 skills（用于监控）
  private skillsCalledInBuild: string[] = [];

  constructor(
    @Inject('PrismaService') @Optional() private readonly prisma?: PrismaService,
    @Inject(SKILLS_REGISTRY_TOKEN) @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly metricsService?: ContextMetricsService,
    @Optional() private readonly prometheusMetrics?: ContextPrometheusMetricsService,
    @Optional() private readonly learningService?: ContextLearningService,
    @Optional() private readonly userProfileService?: UserProfileService,
    @Optional() private readonly compressionLearningService?: CompressionLearningService,
    @Optional() private readonly dynamicContextSelector?: DynamicContextSelectorService,
    @Optional() private readonly tripTaskMemory?: TripTaskMemoryService,
    @Optional() private readonly executionHistoryCompressor?: ExecutionHistoryCompressorService,
    @Optional() private readonly memoryService?: MemoryService,
  ) {
    // ContextEngineerService 可以通过 SkillsRegistryService 获取其他 skills
    // 如果 RedisService 可用，使用持久化缓存；否则使用内存缓存
    if (this.redisService) {
      this.logger.log('Context Package 持久化缓存已启用（Redis）');
    } else {
      this.logger.log('Context Package 使用内存缓存（Redis 不可用）');
    }
    
    if (this.metricsService) {
      this.logger.log('Context Package 监控指标已启用');
    }
  }

  /**
   * 构建 Context Package
   * 
   * 核心方法：根据 tripId、phase、agent、userQuery 编译上下文
   * 支持三层缓存：L1内存（5分钟） → L2Redis（15分钟） → L3数据库（可选）
   * 支持 In-Flight Request Deduplication：避免并发请求重复构建
   */
  async build(
    options: ContextPackageOptions,
    useCache: boolean = true,
  ): Promise<ContextPackage> {
    const buildStartTime = Date.now();
    this.logger.debug(
      `Building context package: tripId=${options.tripId}, phase=${options.phase}, agent=${options.agent}`,
    );

    // 0. Context Orchestrator: 动态上下文选择 + 60% Token 预算
    let resolvedOptions = this.resolveOptionsWithDynamicContext(options);

    // 重置 skills 调用追踪
    this.skillsCalledInBuild = [];
    let cacheHit = false;
    const cacheKey = this.buildCacheKey(resolvedOptions);

    // Phase 1 优化: In-Flight Request Deduplication
    // 检查是否有正在进行的相同构建任务
    const inFlightBuild = this.inFlightBuilds.get(cacheKey);
    if (inFlightBuild) {
      this.logger.debug(`🔄 复用正在进行的 Context Package 构建: ${cacheKey}`);
      return inFlightBuild;
    }

    // 1. 三层缓存检查（L1内存 → L2Redis → L3数据库）
    if (useCache) {
      // 1.1 L1: 内存缓存（最快，5分钟TTL）
      const memoryCached = this.memoryCache.get(cacheKey);
      if (memoryCached && Date.now() - memoryCached.timestamp < this.l1CacheTtl) {
        this.logger.debug(`✅ L1缓存命中: ${cacheKey}`);
        cacheHit = true;
        
            // 记录指标
            if (this.metricsService) {
              await this.metricsService.recordMetrics(memoryCached.package, {
            tripId: resolvedOptions.tripId,
            phase: resolvedOptions.phase,
            agent: resolvedOptions.agent,
            buildTimeMs: Date.now() - buildStartTime,
            cacheHit: true,
            cacheLevel: 'L1',
            skillsCalled: [],
            userQuery: resolvedOptions.userQuery,
              });
            }

            // Phase 1.4 优化: 记录 Prometheus 指标
            if (this.prometheusMetrics) {
              this.prometheusMetrics.recordBuild(
                options.phase,
                options.agent,
                Date.now() - buildStartTime,
                true,
                'L1',
              );
            }
        
        return memoryCached.package;
      }
      
      // 1.2 L2: Redis 缓存（快速，15分钟TTL）
      if (this.redisService) {
        try {
          const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
          const cached = await this.redisService.get<ContextPackage>(redisKey);
          if (cached) {
            this.logger.debug(`✅ L2缓存命中: ${cacheKey}`);
            cacheHit = true;
            
            // 回填 L1 缓存
            this.memoryCache.set(cacheKey, {
              package: cached,
              timestamp: Date.now(),
            });
            
            // 记录指标
            if (this.metricsService) {
              await this.metricsService.recordMetrics(cached, {
                tripId: resolvedOptions.tripId,
                phase: resolvedOptions.phase,
                agent: resolvedOptions.agent,
                buildTimeMs: Date.now() - buildStartTime,
                cacheHit: true,
                cacheLevel: 'L2',
                skillsCalled: [],
                userQuery: resolvedOptions.userQuery,
              });
            }

            // Phase 1.4 优化: 记录 Prometheus 指标
            if (this.prometheusMetrics) {
              this.prometheusMetrics.recordBuild(
                resolvedOptions.phase,
                resolvedOptions.agent,
                Date.now() - buildStartTime,
                true,
                'L2',
              );
            }
            
            return cached;
          }
        } catch (error: any) {
          this.logger.warn(`从 L2 Redis 获取缓存失败: ${error.message}`);
        }
      }
      
      // 1.3 L3: 数据库缓存（持久化，可选）
      // TODO: 如果需要跨实例共享，可以从数据库查询
      // 当前暂不实现，因为 Context Package 通常不需要跨实例共享
    }

    // Phase 2.2 优化: 应用学习结果（如果可用）
    const enhancedOptions = await this.applyLearningResults(resolvedOptions);

    // 2. 创建新的构建任务（In-Flight Deduplication）
    const buildPromise = this.doBuild(enhancedOptions, cacheKey);
    this.inFlightBuilds.set(cacheKey, buildPromise);

    try {
      const result = await buildPromise;
      
      // 3. 写入三层缓存
      if (useCache) {
        await this.writeToCache(cacheKey, result);
      }
      
      return result;
    } finally {
      // 4. 完成后从 In-Flight 映射中移除
      this.inFlightBuilds.delete(cacheKey);
    }
  }

  /**
   * 实际构建 Context Package（内部方法）
   */
  private async doBuild(
    options: ContextPackageOptions,
    cacheKey: string,
  ): Promise<ContextPackage> {
    const buildStartTime = Date.now();
    const tokenBudget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const blocks: ContextBlock[] = [];

    try {
      // 1. 获取世界模型摘要（含 ExpectedUtility 块，decision 阶段）
      if (options.tripId) {
        const worldBlocks = await this.buildWorldModelBlocks(
          options.tripId,
          options.phase,
        );
        blocks.push(...worldBlocks);
      }

      // 2-3. 并行获取国家包块和计划片段（异步优化）
      const [countryBlocksResult, planBlocksResult] = await Promise.allSettled([
        // 2. 获取国家包块（按主题选择）
        options.requiredTopics && options.requiredTopics.length > 0
          ? this.buildCountryPackBlocks(
              options.tripId,
              options.requiredTopics,
              options.phase,
            )
          : Promise.resolve([]),
        // 3. 获取计划相关片段（Plan RAG）
        options.tripId && this.shouldIncludePlanBlocks(options.phase, options.agent)
          ? this.buildPlanBlocks(
              options.tripId,
              options.phase,
              options.agent,
            )
          : Promise.resolve([]),
      ]);

      // 处理国家包块结果
      if (countryBlocksResult.status === 'fulfilled') {
        blocks.push(...countryBlocksResult.value);
      } else {
        this.logger.warn(`获取国家包块失败: ${countryBlocksResult.reason}`);
      }

      // 处理计划块结果
      if (planBlocksResult.status === 'fulfilled') {
        blocks.push(...planBlocksResult.value);
      } else {
        this.logger.warn(`获取计划块失败: ${planBlocksResult.reason}`);
      }

      // 4. 获取决策日志摘要
      if (options.tripId) {
        const decisionBlocks = await this.buildDecisionLogBlocks(
          options.tripId,
          options.phase,
        );
        blocks.push(...decisionBlocks);
      }

      // 4.5 Context Orchestrator: 读取 TripTaskMemory，注入 Execution Context 摘要
      if (options.tripId && this.tripTaskMemory) {
        const taskBlocks = await this.buildTripTaskMemoryBlocks(options.tripId);
        blocks.push(...taskBlocks);
      }

      // 5. 获取约束和用户画像（含 MemoryService UserTravelProfile）
      if (options.tripId) {
        const constraintBlocks = await this.buildConstraintBlocks(
          options.tripId,
          options.phase,
          options.userId,
        );
        blocks.push(...constraintBlocks);
      }

      // 6. 获取 API 文档块（如果请求）
      if (options.includeApiDocs) {
        const apiDocBlocks = await this.buildApiDocumentationBlocks(
          options.apiDocCategories || ['ALL'],
          options.userQuery,
        );
        blocks.push(...apiDocBlocks);
      }

      // 6.5 Context Orchestrator: 统一调度 tools.select，结果写入 Execution Context
      const includeToolSelection = options.includeToolSelection !== false;
      let toolAllowlist: Array<{ name: string; reason: string; priority: number }> = [];
      if (includeToolSelection && this.skillsRegistry) {
        const { toolBlocks, toolList } = await this.buildToolSelectionBlocks(options);
        blocks.push(...toolBlocks);
        toolAllowlist = toolList;
      }

      // 6.6 Context Orchestrator: 执行历史结构化压缩
      let blocksToSort = blocks;
      if (this.executionHistoryCompressor) {
        blocksToSort = this.executionHistoryCompressor.compress(blocks);
      }

      // 7. 计算 Token 并排序
      const totalTokens = this.estimateTokens(blocksToSort);
      
      // 8. 按优先级排序并裁剪到预算内（应用 excludeTopics 过滤）
      const sortedBlocks = this.sortAndTrimBlocks(
        blocksToSort,
        tokenBudget,
        options.includePrivate || false,
        options.excludeTopics,
      );

      // 9. Phase 3.3 优化: 如果需要，进行智能压缩（使用学习到的压缩策略）
      let finalBlocks = sortedBlocks;
      let compressed = false;
      if (this.estimateTokens(sortedBlocks) > tokenBudget) {
        finalBlocks = await this.compressBlocks(
          sortedBlocks,
          tokenBudget,
          options.userId,
          options.phase,
          options.agent,
        );
        compressed = true;
      }

      const buildTimeMs = Date.now() - buildStartTime;
      const packageId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const contextPackage: ContextPackage = {
        id: packageId,
        tripId: options.tripId,
        phase: options.phase,
        agent: options.agent,
        userQuery: options.userQuery,
        blocks: finalBlocks,
        totalTokens: this.estimateTokens(finalBlocks),
        tokenBudget,
        compressed,
        createdAt: new Date().toISOString(),
        metadata: {
          originalBlocksCount: blocks.length,
          finalBlocksCount: finalBlocks.length,
          buildTimeMs: Date.now() - buildStartTime,
          skillsCalled: [...this.skillsCalledInBuild],
          toolAllowlist: toolAllowlist,
        },
      };

      // 存储 Context Package（用于后台管理查询）
      this.packageStore.set(packageId, contextPackage);
      // 限制存储大小（最多保留 1000 个）
      if (this.packageStore.size > 1000) {
        const oldestKey = Array.from(this.packageStore.keys())[0];
        this.packageStore.delete(oldestKey);
      }

      // 记录监控指标
      if (this.metricsService) {
        await this.metricsService.recordMetrics(contextPackage, {
          tripId: options.tripId,
          phase: options.phase,
          agent: options.agent,
          buildTimeMs: Date.now() - buildStartTime,
          cacheHit: false,
          cacheLevel: 'none',
          skillsCalled: [...this.skillsCalledInBuild],
          userQuery: options.userQuery,
        });
      }

      // Phase 1.4 优化: 记录 Prometheus 指标
      if (this.prometheusMetrics) {
        const buildTimeMs = Date.now() - buildStartTime;
        this.prometheusMetrics.recordBuild(
          options.phase,
          options.agent,
          buildTimeMs,
          false,
          'none',
        );
        this.prometheusMetrics.recordTokenUsage(
          options.phase,
          options.agent,
          contextPackage.totalTokens,
          contextPackage.tokenBudget,
        );
        this.prometheusMetrics.recordBlockStats(
          options.phase,
          options.agent,
          contextPackage.blocks.map((b) => ({
            type: b.type,
            priority: b.priority,
            visibility: b.visibility,
          })),
        );
      }

      return contextPackage;
    } catch (error) {
      this.logger.error(`Failed to build context package: ${error}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Context Orchestrator: 解析选项（动态上下文选择 + 60% Token 预算）
   */
  private resolveOptionsWithDynamicContext(options: ContextPackageOptions): ContextPackageOptions {
    let result = { ...options };

    // 1. 动态上下文选择（当未显式提供 requiredTopics 或 excludeTopics 时）
    if (this.dynamicContextSelector && options.userQuery) {
      const dynamic = this.dynamicContextSelector.select(
        options.userQuery,
        options.phase,
        options.agent,
      );
      if (!result.requiredTopics?.length) {
        result = { ...result, requiredTopics: dynamic.requiredTopics };
      }
      if (!result.excludeTopics?.length) {
        result = { ...result, excludeTopics: dynamic.excludeBlockTypes };
      }
    }

    // 2. 60% Token 预算（当未显式指定时）
    if (result.tokenBudget == null) {
      result = { ...result, tokenBudget: DEFAULT_TOKEN_BUDGET };
    }

    return result;
  }

  /**
   * 构建缓存 key（Phase 1 优化：细粒度 key，包含所有影响因素）
   * 
   * 包含因素：
   * - tripId
   * - phase
   * - agent
   * - requiredTopics（排序后）
   * - excludeTopics（排序后）
   * - tokenBudget
   * - userQuery hash（前100字符的hash，用于区分不同查询）
   * - includePrivate（是否包含私有块）
   */
  private buildCacheKey(options: ContextPackageOptions): string {
    const topics = options.requiredTopics?.sort().join(',') || '';
    const excludeTopics = options.excludeTopics?.sort().join(',') || '';
    const includePrivate = options.includePrivate ? 'true' : 'false';
    
    // 计算 userQuery hash（前100字符）
    let queryHash = '';
    if (options.userQuery) {
      const queryText = options.userQuery.substring(0, 100).trim().toLowerCase();
      // 简单的 hash 函数（使用字符串的字符码和）
      queryHash = this.simpleHash(queryText);
    }
    
    return `tripId:${options.tripId || 'none'}:phase:${options.phase}:agent:${options.agent}:topics:${topics}:excludeTopics:${excludeTopics}:budget:${options.tokenBudget || 3600}:includePrivate:${includePrivate}:queryHash:${queryHash}`;
  }

  /**
   * 简单的 hash 函数（用于 userQuery）
   * 使用字符码和，快速且足够区分不同查询
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Phase 2.2 + Phase 3.2 优化: 应用学习结果和个性化推荐到 Context Package 构建
   * 
   * 1. 获取全局学习结果
   * 2. 获取个性化推荐（如果提供了 userId）
   * 3. 融合并应用到 requiredTopics
   */
  private async applyLearningResults(
    options: ContextPackageOptions,
  ): Promise<ContextPackageOptions> {
    if (!this.learningService) {
      return options;
    }

    try {
      // 1. 获取全局学习结果
      const globalLearningResult = await this.learningService.getLearningResult(
        undefined, // 全局学习结果
        options.phase,
        options.agent,
      );

      // 2. Phase 3.2 优化: 获取个性化推荐（如果提供了 userId）
      let personalizedRecommended: string[] = [];
      if (options.userId && this.userProfileService) {
        personalizedRecommended = await this.userProfileService.getRecommendedContext(
          options.userId,
          options.phase,
          options.agent,
          {
            recommendedBlocks: globalLearningResult.recommendedBlocks,
            confidence: globalLearningResult.confidence,
          },
        );
      } else {
        // 没有 userId 或 userProfileService，使用全局推荐
        personalizedRecommended = globalLearningResult.recommendedBlocks || [];
      }

      // 3. 如果推荐结果置信度较低，不应用
      const useGlobal = !options.userId || !this.userProfileService;
      const confidence = useGlobal 
        ? globalLearningResult.confidence 
        : Math.max(globalLearningResult.confidence, 0.3); // 个性化推荐至少需要 0.3 置信度

      if (confidence < 0.3 || globalLearningResult.sampleSize < 5) {
        this.logger.debug(
          `学习结果置信度较低，不应用: confidence=${confidence}, sampleSize=${globalLearningResult.sampleSize}`
        );
        return options;
      }

      // 4. 应用推荐的 Block 组合
      if (personalizedRecommended.length > 0) {
        const recommended = personalizedRecommended.filter(
          (block) => !options.requiredTopics?.includes(block)
        );
        
        if (recommended.length > 0) {
          this.logger.debug(
            `应用${useGlobal ? '全局' : '个性化'}推荐: 添加推荐Block=${recommended.length}个, ` +
            `confidence=${confidence}, userId=${options.userId || 'none'}`
          );
          
          return {
            ...options,
            requiredTopics: [
              ...(options.requiredTopics || []),
              ...recommended,
            ],
          };
        }
      }

      return options;
    } catch (error: any) {
      this.logger.warn(`应用学习结果失败: ${error.message}`);
      return options; // 失败时返回原始 options
    }
  }

  /**
   * 写入三层缓存（Phase 1 优化）
   * 
   * L1: 内存缓存（5分钟TTL）
   * L2: Redis 缓存（15分钟TTL）
   * L3: 数据库缓存（可选，暂不实现）
   */
  private async writeToCache(
    cacheKey: string,
    contextPackage: ContextPackage,
  ): Promise<void> {
    // L1: 写入内存缓存（同步，立即可用）
    this.memoryCache.set(cacheKey, {
      package: contextPackage,
      timestamp: Date.now(),
    });
    
    // 清理过期内存缓存
    this.cleanExpiredMemoryCache();
    
    // L2: 写入 Redis 缓存（异步，不阻塞）
    if (this.redisService) {
      try {
        const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
        const ttlSeconds = Math.floor(this.l2CacheTtl / 1000);
        await this.redisService.set(redisKey, contextPackage, ttlSeconds);
        this.logger.debug(`✅ Context Package 已存入 L2 Redis: ${cacheKey} (TTL: ${ttlSeconds}s)`);
      } catch (error: any) {
        this.logger.warn(`存入 L2 Redis 失败: ${error.message}`);
      }
    }
    
    // L3: 数据库缓存（可选，暂不实现）
    // TODO: 如果需要跨实例共享，可以写入数据库
  }

  /**
   * 清理过期内存缓存
   */
  private cleanExpiredMemoryCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.memoryCache.entries()) {
      if (now - value.timestamp >= this.l1CacheTtl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.memoryCache.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger.debug(`清理了 ${expiredKeys.length} 个过期内存缓存`);
    }

    // 如果内存缓存太大（超过 100 个），清理最旧的 20%
    if (this.memoryCache.size > 100) {
      const entries = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.memoryCache.delete(entries[i][0]);
      }
      this.logger.debug(`内存缓存过大，清理了最旧的 ${toRemove} 个条目`);
    }
  }

  /**
   * 清除缓存（内存 + Redis）
   */
  async clearCache(): Promise<void> {
    const memorySize = this.memoryCache.size;
    this.memoryCache.clear();
    this.logger.debug(`清除了 ${memorySize} 个内存缓存条目`);

    // 清除 Redis 缓存（使用通配符删除）
    if (this.redisService) {
      try {
        // 注意：RedisService 可能不支持通配符删除，这里简化实现
        // 实际应该使用 SCAN + DEL 或 Lua 脚本
        this.logger.debug('Redis 缓存通过 TTL 自动过期，无需手动清除');
      } catch (error: any) {
        this.logger.warn(`清除 Redis 缓存失败: ${error.message}`);
      }
    }
  }

  /**
   * 获取缓存统计
   */
  async getCacheStats(): Promise<{ 
    memorySize: number; 
    memoryKeys: string[];
    redisEnabled: boolean;
  }> {
    return {
      memorySize: this.memoryCache.size,
      memoryKeys: Array.from(this.memoryCache.keys()),
      redisEnabled: this.redisService !== undefined,
    };
  }

  /**
   * 构建世界模型块
   */
  private async buildWorldModelBlocks(
    tripId: string,
    phase: string,
  ): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];

    try {
      // 从数据库获取 Trip 信息
      if (this.prisma) {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          include: {
            TripDay: {
              include: {
                ItineraryItem: true,
              },
            },
          },
        });

        if (trip) {
          // 构建世界模型摘要
          blocks.push({
            key: 'WORLD_MODEL',
            type: 'WORLD_MODEL',
            text: `目的地: ${trip.destination}, 日期: ${trip.startDate.toISOString().split('T')[0]} - ${trip.endDate.toISOString().split('T')[0]}`,
            priority: 90,
            visibility: 'public',
            provenance: {
              source: 'db',
              identifier: `trip:${tripId}`,
              timestamp: new Date().toISOString(),
            },
          });

          // Context Orchestrator: decision 阶段注入 ExpectedUtility 决策公式摘要
          // Phase 2 v1: DailyUtility 新公式 + 三项惩罚
          if (phase?.toLowerCase() === 'decision') {
            const dw = DEFAULT_DAILY_UTILITY_WEIGHTS;
            const ow = DEFAULT_OBJECTIVE_WEIGHTS;
            blocks.push({
              key: 'EXPECTED_UTILITY',
              type: 'WORLD_MODEL',
              text:
                `ExpectedUtility(plan) = Σ_day Utility(day) - RiskPenalty - FatiguePenalty - UncertaintyPenalty. ` +
                `Utility(day) = w_exp×ExperienceScore + w_cost×CostEfficiency + w_time×TimeEfficiency + w_comfort×ComfortScore + w_safety×SafetyScore. ` +
                `DailyUtility权重: w_exp=${dw.w_exp}, w_cost=${dw.w_cost}, w_time=${dw.w_time}, w_comfort=${dw.w_comfort}, w_safety=${dw.w_safety}. ` +
                `(Legacy 8维: safety=${ow.safety}, experience=${ow.experienceDensity})`,
              priority: 85,
              visibility: 'public',
              provenance: {
                source: 'computed',
                identifier: 'DailyUtilityCalculatorService',
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to build world model blocks: ${error}`);
    }

    return blocks;
  }

  /**
   * 构建国家包块
   */
  private async buildCountryPackBlocks(
    tripId: string | undefined,
    topics: string[],
    phase: string,
  ): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];

    try {
      // 1. 从 tripId 获取国家代码
      let countryCode: string | undefined;
      if (tripId && this.prisma) {
        try {
          const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { destination: true },
          });
          // destination 应该是 ISO 3166-1 alpha-2 格式（如 'IS', 'JP'）
          // 如果包含下划线，提取第一部分；否则直接使用
          if (trip?.destination) {
            const dest = trip.destination.trim().toUpperCase();
            // 如果包含下划线，提取第一部分（如 'IS_WINTER' -> 'IS'）
            // 否则直接使用（如 'IS' -> 'IS'）
            countryCode = dest.includes('_') ? dest.split('_')[0] : dest;
            // 验证格式（应该是2个大写字母）
            if (countryCode.length === 2 && /^[A-Z]{2}$/.test(countryCode)) {
              // 格式正确
            } else {
              this.logger.warn(`国家代码格式不正确: ${countryCode}，期望 ISO 3166-1 alpha-2 格式`);
              countryCode = undefined;
            }
          }
        } catch (error: any) {
          this.logger.warn(`获取行程信息失败: ${error?.message || error}`);
        }
      }

      if (!countryCode) {
        this.logger.warn(`无法获取国家代码 (tripId: ${tripId})，跳过国家包块`);
        return blocks;
      }

      if (!this.skillsRegistry) {
        this.logger.warn(`SkillsRegistryService 未注入，跳过国家包块`);
        return blocks;
      }

      // 2. 调用 countryPack.getBlocks skill
      const countryPackGetBlocksSkill = this.skillsRegistry.getSkill('countryPack.getBlocks');
      if (countryPackGetBlocksSkill) {
        this.skillsCalledInBuild.push('countryPack.getBlocks');
        const result = await countryPackGetBlocksSkill.execute({
          packId: countryCode,
          topics: topics as any[],
          phase,
        });

        if (result.blocks) {
          blocks.push(...result.blocks);
        }

        if (result.missingTopics && result.missingTopics.length > 0) {
          this.logger.debug(`国家包缺失主题: ${result.missingTopics.join(', ')}`);
        }
      } else {
        this.logger.warn(`找不到 countryPack.getBlocks skill`);
      }
    } catch (error) {
      this.logger.warn(`构建国家包块失败: ${error}`);
      // 不抛出错误，返回空数组，继续执行
    }

    return blocks;
  }

  /**
   * Context Orchestrator: 统一调度 tools.select，构建工具选择块
   * 结果作为 SYSTEM_CAPABILITY 块注入，并写入 metadata.toolAllowlist
   */
  private async buildToolSelectionBlocks(
    options: ContextPackageOptions,
  ): Promise<{
    toolBlocks: ContextBlock[];
    toolList: Array<{ name: string; reason: string; priority: number }>;
  }> {
    const toolBlocks: ContextBlock[] = [];
    const toolList: Array<{ name: string; reason: string; priority: number }> = [];

    if (!this.skillsRegistry) {
      return { toolBlocks, toolList };
    }

    const toolsSelectSkill = this.skillsRegistry.getSkill('tools.select');
    if (!toolsSelectSkill) {
      this.logger.debug('tools.select skill 未注册，跳过工具选择');
      return { toolBlocks, toolList };
    }

    try {
      this.skillsCalledInBuild.push('tools.select');
      const result = await toolsSelectSkill.execute({
        userQuery: options.userQuery,
        planningPhase: options.phase,
        currentState: {
          tripId: options.tripId,
          phase: options.phase,
          agent: options.agent,
        },
      });

      if (result.tools?.length > 0) {
        for (const t of result.tools) {
          toolList.push({ name: t.name, reason: t.reason, priority: t.priority });
        }

        // 精简文本：只列出工具名与推荐原因，控制 Token
        const toolSummary = result.tools
          .map(
            (t) =>
              `- ${t.name}: ${t.description?.substring(0, 60) || t.reason} (${t.reason})`,
          )
          .join('\n');

        toolBlocks.push({
          key: 'TOOL_SELECTION',
          type: 'SYSTEM_CAPABILITY',
          text: `推荐工具 (${result.totalTools}个):\n${toolSummary}`,
          priority: 75,
          visibility: 'public',
          provenance: {
            source: 'skill',
            identifier: 'tools.select',
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error: any) {
      this.logger.warn(`tools.select 调用失败: ${error?.message}`);
    }

    return { toolBlocks, toolList };
  }

  /**
   * Context Orchestrator: 构建 TripTaskMemory 块（Execution Context 摘要）
   */
  private async buildTripTaskMemoryBlocks(tripId: string): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];
    if (!this.tripTaskMemory) {
      this.logger.warn(
        `[Phase0 降级] tripId=${tripId} 但 TripTaskMemoryService 未注入，任务记忆不可用。影响：无法注入当前阶段/决策摘要到 Context`,
      );
      return blocks;
    }

    try {
      const memory = await this.tripTaskMemory.get(tripId);
      if (!memory) return blocks;

      const text = [
        `当前阶段: ${memory.currentPhase}`,
        memory.selectedRouteDirectionId && `已选路线: ${memory.selectedRouteDirectionId}`,
        memory.decisionLogSummary && `决策摘要: ${memory.decisionLogSummary.substring(0, 300)}`,
        memory.artifactsRefs?.length && `artifacts: ${memory.artifactsRefs.length} 个`,
      ]
        .filter(Boolean)
        .join('; ');

      blocks.push({
        key: 'TRIP_TASK_MEMORY',
        type: 'DECISION_LOG',
        text,
        priority: 70,
        visibility: 'public',
        provenance: {
          source: 'memory',
          identifier: 'TripTaskMemory',
          timestamp: memory.lastUpdated,
        },
      });
    } catch (error: any) {
      this.logger.warn(`读取 TripTaskMemory 失败: ${error?.message}`);
    }
    return blocks;
  }

  /**
   * 判断是否需要包含计划块
   */
  private shouldIncludePlanBlocks(phase: string, agent: string): boolean {
    // DrDre 和 Neptune 需要计划片段
    return agent === 'DrDre' || agent === 'Neptune' || phase.includes('adjust') || phase.includes('repair');
  }

  /**
   * 构建计划块（Plan RAG）
   */
  private async buildPlanBlocks(
    tripId: string,
    phase: string,
    agent: string,
  ): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];

    try {
      if (!this.skillsRegistry) {
        this.logger.warn(`SkillsRegistryService 未注入，跳过计划块`);
        return blocks;
      }

      // 根据 phase 和 agent 确定需要哪些计划片段
      const scope: string[] = [];

      // DrDre 和 Neptune 需要当前相关的片段
      if (agent === 'DrDre' || agent === 'Neptune') {
        // 简化：默认获取最近一天的片段
        scope.push('day:1');
        scope.push('rejection:last');
      } else if (phase.includes('adjust') || phase.includes('repair')) {
        // 调整/修复阶段需要更多上下文
        scope.push('rejection:last');
      }

      // 调用 plan.selectSlices skill
      const planSelectSlicesSkill = this.skillsRegistry.getSkill('plan.selectSlices');
      if (planSelectSlicesSkill && scope.length > 0) {
        this.skillsCalledInBuild.push('plan.selectSlices');
        const result = await planSelectSlicesSkill.execute({
          tripId,
          scope,
          phase,
        });

        if (result.blocks) {
          blocks.push(...result.blocks);
        }
      } else if (scope.length === 0) {
        this.logger.debug(`当前 phase=${phase}, agent=${agent} 不需要计划块`);
      } else {
        this.logger.warn(`找不到 plan.selectSlices skill`);
      }
    } catch (error) {
      this.logger.warn(`构建计划块失败: ${error}`);
      // 不抛出错误，返回空数组，继续执行
    }

    return blocks;
  }

  /**
   * 构建决策日志块
   */
  private async buildDecisionLogBlocks(
    tripId: string,
    phase: string,
  ): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];

    try {
      if (this.prisma) {
        // 获取最近的决策日志
        const recentLogs = await this.prisma.decisionLog.findMany({
          where: { tripId },
          orderBy: { timestamp: 'desc' },
          take: 5,
        });

        if (recentLogs.length > 0) {
          const logSummary = recentLogs
            .map(
              (log) =>
                `[${log.persona}] ${log.action}: ${log.explanation} (${log.reasonCodes.join(', ')})`,
            )
            .join('\n');

          blocks.push({
            key: 'DECISION_LOG',
            type: 'DECISION_LOG',
            text: `最近的决策日志:\n${logSummary}`,
            priority: 70,
            visibility: 'public',
            provenance: {
              source: 'db',
              identifier: `decision_logs:trip:${tripId}`,
              timestamp: new Date().toISOString(),
            },
            data: {
              logCount: recentLogs.length,
              logs: recentLogs.map((log) => ({
                persona: log.persona,
                action: log.action,
                explanation: log.explanation,
                reasonCodes: log.reasonCodes,
                timestamp: log.timestamp.toISOString(),
              })),
            },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to build decision log blocks: ${error}`);
    }

    return blocks;
  }

  /**
   * 构建约束块
   * @param userId 用户 ID（可选，用于从 MemoryService 读取 UserTravelProfile）
   */
  private async buildConstraintBlocks(
    tripId: string,
    phase: string,
    userId?: string,
  ): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];

    try {
      if (!this.prisma) {
        return blocks;
      }

      // 从 Trip 中获取约束信息
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          budgetConfig: true,
          pacingConfig: true,
          metadata: true,
        },
      });

      if (trip) {
        const constraints: string[] = [];

        // 从 budgetConfig 提取预算约束
        if (trip.budgetConfig) {
          const budget = trip.budgetConfig as any;
          if (budget.maxBudget) {
            constraints.push(`预算限制: ${budget.maxBudget} ${budget.currency || '元'}`);
          }
        }

        // 从 pacingConfig 提取节奏约束
        if (trip.pacingConfig) {
          const pacing = trip.pacingConfig as any;
          if (pacing.pace) {
            constraints.push(`节奏偏好: ${pacing.pace}`);
          }
        }

        // 从 metadata 提取其他约束
        if (trip.metadata) {
          const metadata = trip.metadata as any;
          if (metadata.constraints && Array.isArray(metadata.constraints)) {
            constraints.push(...metadata.constraints.map((c: any) => String(c)));
          }
        }

        if (constraints.length > 0) {
          blocks.push({
            key: 'CONSTRAINTS',
            type: 'CONSTRAINTS',
            text: `约束条件:\n${constraints.join('\n')}`,
            priority: 75,
            visibility: 'public',
            provenance: {
              source: 'db',
              identifier: `trip:${tripId}:constraints`,
              timestamp: new Date().toISOString(),
            },
            data: {
              constraints,
            },
          });
        }

        // 用户画像：合并 Trip metadata + MemoryService UserTravelProfile
        let userProfileData: Record<string, unknown> | undefined = (trip.metadata as any)?.userProfile;
        if (userId && !this.memoryService) {
          this.logger.warn(
            `[Phase0 降级] userId=${userId} 已提供但 MemoryService 未注入，UserTravelProfile 个性化不可用。影响：buildConstraintBlocks 无法从 Memory 读取用户偏好`,
          );
        }
        if (userId && this.memoryService) {
          try {
            const memoryProfile = await this.memoryService.getUserTravelProfile(userId);
            if (memoryProfile) {
              userProfileData = {
                ...memoryProfile,
                ...userProfileData,
                companions: memoryProfile.companions ?? userProfileData?.companions,
                deviceInfo: memoryProfile.deviceInfo ?? userProfileData?.deviceInfo,
                timeWindow: memoryProfile.timeWindow ?? userProfileData?.timeWindow,
                emotionalState: memoryProfile.emotionalState ?? userProfileData?.emotionalState,
              } as Record<string, unknown>;
            }
          } catch (e: any) {
            this.logger.debug(`读取 MemoryService UserTravelProfile 失败: ${e?.message}`);
          }
        }
        if (userProfileData && Object.keys(userProfileData).length > 0) {
          const profileText = JSON.stringify(userProfileData);
          blocks.push({
            key: 'USER_PROFILE',
            type: 'USER_PROFILE',
            text: `用户画像: ${profileText.substring(0, 300)}`,
            priority: 60,
            visibility: 'public',
            provenance: {
              source: userId && this.memoryService ? 'memory' : 'db',
              identifier: userId ? `memory:user:${userId}` : `trip:${tripId}:userProfile`,
              timestamp: new Date().toISOString(),
            },
            data: userProfileData,
          });
        }
      }
    } catch (error) {
      this.logger.warn(`构建约束块失败: ${error}`);
      // 不抛出错误，返回已获取的块
    }

    return blocks;
  }

  /**
   * 构建 API 文档块
   * 
   * 根据请求的类别返回相应的 API 文档信息
   */
  private async buildApiDocumentationBlocks(
    categories: ApiDocCategory[],
    userQuery: string,
  ): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];
    const includeAll = categories.includes('ALL');

    try {
      // ROLL API 文档
      if (includeAll || categories.includes('ROLL')) {
        blocks.push({
          key: 'API_DOC_ROLL',
          type: 'API_DOCUMENTATION',
          text: this.getRollApiSummary(),
          priority: 40,
          visibility: 'public',
          provenance: {
            source: 'computed',
            identifier: 'api-docs:roll',
            timestamp: new Date().toISOString(),
          },
          data: {
            category: 'ROLL',
            endpoints: this.getRollEndpoints(),
          },
        });
      }

      // 后台管理 API 文档
      if (includeAll || categories.includes('ADMIN')) {
        blocks.push({
          key: 'API_DOC_ADMIN',
          type: 'API_DOCUMENTATION',
          text: this.getAdminApiSummary(),
          priority: 35,
          visibility: 'public',
          provenance: {
            source: 'computed',
            identifier: 'api-docs:admin',
            timestamp: new Date().toISOString(),
          },
          data: {
            category: 'ADMIN',
            endpoints: this.getAdminEndpoints(),
          },
        });
      }

      // Context Engine API 文档
      if (includeAll || categories.includes('CONTEXT')) {
        blocks.push({
          key: 'API_DOC_CONTEXT',
          type: 'API_DOCUMENTATION',
          text: this.getContextApiSummary(),
          priority: 45,
          visibility: 'public',
          provenance: {
            source: 'computed',
            identifier: 'api-docs:context',
            timestamp: new Date().toISOString(),
          },
          data: {
            category: 'CONTEXT',
            endpoints: this.getContextEndpoints(),
          },
        });
      }

      // Training API 文档
      if (includeAll || categories.includes('TRAINING')) {
        blocks.push({
          key: 'API_DOC_TRAINING',
          type: 'API_DOCUMENTATION',
          text: this.getTrainingApiSummary(),
          priority: 30,
          visibility: 'public',
          provenance: {
            source: 'computed',
            identifier: 'api-docs:training',
            timestamp: new Date().toISOString(),
          },
          data: {
            category: 'TRAINING',
            endpoints: this.getTrainingEndpoints(),
          },
        });
      }

      // Agent API 文档
      if (includeAll || categories.includes('AGENT')) {
        blocks.push({
          key: 'API_DOC_AGENT',
          type: 'API_DOCUMENTATION',
          text: this.getAgentApiSummary(),
          priority: 50,
          visibility: 'public',
          provenance: {
            source: 'computed',
            identifier: 'api-docs:agent',
            timestamp: new Date().toISOString(),
          },
          data: {
            category: 'AGENT',
            endpoints: this.getAgentEndpoints(),
          },
        });
      }

      // Trips API 文档
      if (includeAll || categories.includes('TRIPS')) {
        blocks.push({
          key: 'API_DOC_TRIPS',
          type: 'API_DOCUMENTATION',
          text: this.getTripsApiSummary(),
          priority: 55,
          visibility: 'public',
          provenance: {
            source: 'computed',
            identifier: 'api-docs:trips',
            timestamp: new Date().toISOString(),
          },
          data: {
            category: 'TRIPS',
            endpoints: this.getTripsEndpoints(),
          },
        });
      }

      // Decision API 文档
      if (includeAll || categories.includes('DECISION')) {
        blocks.push({
          key: 'API_DOC_DECISION',
          type: 'API_DOCUMENTATION',
          text: this.getDecisionApiSummary(),
          priority: 45,
          visibility: 'public',
          provenance: {
            source: 'computed',
            identifier: 'api-docs:decision',
            timestamp: new Date().toISOString(),
          },
          data: {
            category: 'DECISION',
            endpoints: this.getDecisionEndpoints(),
          },
        });
      }

      this.logger.debug(`构建了 ${blocks.length} 个 API 文档块`);
    } catch (error) {
      this.logger.warn(`构建 API 文档块失败: ${error}`);
    }

    return blocks;
  }

  // ==================== API 文档内容方法 ====================

  private getRollApiSummary(): string {
    return `ROLL 架构 API:
- GET /api/training/roll/metrics - 获取 ROLL 监控指标
- GET /api/training/roll/workers/status - 获取 Workers 状态
- GET /api/training/roll/health - 健康检查
- POST /api/training/roll/ab-test/create - 创建 A/B 测试实验
- POST /api/training/roll/ab-test/analyze - 分析 A/B 测试结果
- GET /api/training/roll/ab-test/should-use - 检查是否使用 ROLL

Python Bridge Service (localhost:8001):
- POST /api/actor/generate-trajectory - 生成轨迹
- POST /api/reward/compute - 计算奖励
- POST /api/policy/predict - 策略推理
- POST /api/training/start - 启动训练`;
  }

  private getRollEndpoints(): any[] {
    return [
      { method: 'GET', path: '/api/training/roll/metrics', description: '获取 ROLL 监控指标' },
      { method: 'GET', path: '/api/training/roll/workers/status', description: '获取 Workers 状态' },
      { method: 'GET', path: '/api/training/roll/health', description: '健康检查' },
      { method: 'POST', path: '/api/training/roll/ab-test/create', description: '创建 A/B 测试实验' },
      { method: 'POST', path: '/api/training/roll/ab-test/analyze', description: '分析 A/B 测试结果' },
      { method: 'GET', path: '/api/training/roll/ab-test/should-use', description: '检查是否使用 ROLL' },
    ];
  }

  private getAdminApiSummary(): string {
    return `后台管理 API:
Agent 管理:
- GET /api/agent/admin/runs/stats - 获取运行统计
- GET /api/agent/admin/performance - 性能分析
- GET /api/agent/admin/runs - 运行列表
- GET /api/agent/admin/runs/:id - 运行详情
- POST /api/agent/admin/runs/:id/cancel - 取消运行
- GET /api/agent/admin/attempts - Attempt 列表

Context 管理:
- GET /api/context/admin/metrics - Context 指标
- GET /api/context/admin/packages - Package 列表
- GET /api/context/admin/analytics - 使用分析`;
  }

  private getAdminEndpoints(): any[] {
    return [
      { method: 'GET', path: '/api/agent/admin/runs/stats', description: '获取运行统计' },
      { method: 'GET', path: '/api/agent/admin/performance', description: '性能分析' },
      { method: 'GET', path: '/api/agent/admin/runs', description: '运行列表' },
      { method: 'GET', path: '/api/agent/admin/runs/:id', description: '运行详情' },
      { method: 'POST', path: '/api/agent/admin/runs/:id/cancel', description: '取消运行' },
      { method: 'GET', path: '/api/context/admin/metrics', description: 'Context 指标' },
      { method: 'GET', path: '/api/context/admin/packages', description: 'Package 列表' },
    ];
  }

  private getContextApiSummary(): string {
    return `Context Engine API:
- POST /api/context/build - 构建 Context Package
- POST /api/context/compress - 压缩 Context
- POST /api/context/project-state - 获取项目状态
- POST /api/context/write-back - 写回数据
- GET /api/context/metrics - 获取 Context 指标

参数说明:
- tripId: 行程 ID
- phase: 规划阶段 (INITIAL_PLANNING, REFINEMENT, FINALIZATION)
- agent: Agent 类型 (planning-assistant, journey-assistant)
- tokenBudget: Token 预算 (默认 8000)
- includeApiDocs: 是否包含 API 文档`;
  }

  private getContextEndpoints(): any[] {
    return [
      { method: 'POST', path: '/api/context/build', description: '构建 Context Package' },
      { method: 'POST', path: '/api/context/compress', description: '压缩 Context' },
      { method: 'POST', path: '/api/context/project-state', description: '获取项目状态' },
      { method: 'POST', path: '/api/context/write-back', description: '写回数据' },
      { method: 'GET', path: '/api/context/metrics', description: '获取 Context 指标' },
    ];
  }

  private getTrainingApiSummary(): string {
    return `训练相关 API:
轨迹收集:
- POST /api/training/trajectories/collect - 收集规划轨迹
- POST /api/training/trajectories/:id/validate - 验证轨迹质量
- GET /api/training/trajectories/by-request/:requestId - 按请求ID查找轨迹

批次处理:
- POST /api/training/batches/prepare - 准备训练批次
- POST /api/training/batches/:id/export/jsonl - 导出 JSONL 格式

训练任务:
- POST /api/training/jobs - 创建训练任务
- POST /api/training/jobs/:id/start - 启动训练
- GET /api/training/jobs/:id - 获取任务状态`;
  }

  private getTrainingEndpoints(): any[] {
    return [
      { method: 'POST', path: '/api/training/trajectories/collect', description: '收集规划轨迹' },
      { method: 'POST', path: '/api/training/batches/prepare', description: '准备训练批次' },
      { method: 'POST', path: '/api/training/jobs', description: '创建训练任务' },
      { method: 'GET', path: '/api/training/jobs/:id', description: '获取任务状态' },
    ];
  }

  private getAgentApiSummary(): string {
    return `Agent 相关 API:
核心接口:
- POST /api/agent/route-and-run - 智能路由和执行
- POST /api/agent/plan-execute - 规划执行
- GET /api/agent/status/:runId - 获取执行状态

规划工作台:
- POST /api/planning-workbench/start - 开始规划会话
- POST /api/planning-workbench/message - 发送消息
- GET /api/planning-workbench/session/:id - 获取会话状态`;
  }

  private getAgentEndpoints(): any[] {
    return [
      { method: 'POST', path: '/api/agent/route-and-run', description: '智能路由和执行' },
      { method: 'POST', path: '/api/agent/plan-execute', description: '规划执行' },
      { method: 'GET', path: '/api/agent/status/:runId', description: '获取执行状态' },
      { method: 'POST', path: '/api/planning-workbench/start', description: '开始规划会话' },
    ];
  }

  private getTripsApiSummary(): string {
    return `行程相关 API:
行程管理:
- POST /api/trips - 创建行程
- GET /api/trips/:id - 获取行程详情
- PUT /api/trips/:id - 更新行程
- DELETE /api/trips/:id - 删除行程
- GET /api/trips/user/:userId - 获取用户行程列表

行程天:
- POST /api/trips/:id/days - 添加行程天
- GET /api/trips/:id/days - 获取行程天列表
- PUT /api/trips/:id/days/:dayId - 更新行程天`;
  }

  private getTripsEndpoints(): any[] {
    return [
      { method: 'POST', path: '/api/trips', description: '创建行程' },
      { method: 'GET', path: '/api/trips/:id', description: '获取行程详情' },
      { method: 'PUT', path: '/api/trips/:id', description: '更新行程' },
      { method: 'DELETE', path: '/api/trips/:id', description: '删除行程' },
      { method: 'GET', path: '/api/trips/user/:userId', description: '获取用户行程列表' },
    ];
  }

  private getDecisionApiSummary(): string {
    return `决策相关 API:
决策管理:
- POST /api/decision/create - 创建决策
- GET /api/decision/:id - 获取决策详情
- POST /api/decision/:id/approve - 批准决策
- POST /api/decision/:id/reject - 拒绝决策

审批流程:
- GET /api/approvals/pending - 获取待审批列表
- POST /api/approvals/:id/action - 执行审批动作

统计:
- GET /api/decision-stats/overview - 决策统计概览
- GET /api/decision-stats/by-type - 按类型统计`;
  }

  private getDecisionEndpoints(): any[] {
    return [
      { method: 'POST', path: '/api/decision/create', description: '创建决策' },
      { method: 'GET', path: '/api/decision/:id', description: '获取决策详情' },
      { method: 'POST', path: '/api/decision/:id/approve', description: '批准决策' },
      { method: 'GET', path: '/api/approvals/pending', description: '获取待审批列表' },
      { method: 'GET', path: '/api/decision-stats/overview', description: '决策统计概览' },
    ];
  }

  /**
   * 估算 Token 数
   */
  private estimateTokens(blocks: ContextBlock[]): number {
    // 简单估算：英文 1 token ≈ 4 字符，中文 1 token ≈ 1.5 字符
    let totalChars = 0;
    for (const block of blocks) {
      totalChars += block.text.length;
      if (block.data) {
        totalChars += JSON.stringify(block.data).length;
      }
    }

    // 混合估算（假设 70% 中文，30% 英文）
    const chineseChars = totalChars * 0.7;
    const englishChars = totalChars * 0.3;
    const tokens = Math.ceil(chineseChars / 1.5 + englishChars / 4);

    return tokens;
  }

  /**
   * 排序并裁剪块
   */
  private sortAndTrimBlocks(
    blocks: ContextBlock[],
    tokenBudget: number,
    includePrivate: boolean,
    excludeBlockTypes?: string[],
  ): ContextBlock[] {
    // 过滤可见性
    let filteredBlocks = includePrivate
      ? blocks
      : blocks.filter((b) => b.visibility === 'public');

    // Context Orchestrator: 排除指定类型的块
    if (excludeBlockTypes?.length) {
      const excludeSet = new Set(excludeBlockTypes);
      filteredBlocks = filteredBlocks.filter((b) => !excludeSet.has(b.type));
    }

    // 按优先级排序
    filteredBlocks.sort((a, b) => b.priority - a.priority);

    // 裁剪到预算内
    const trimmedBlocks: ContextBlock[] = [];
    let currentTokens = 0;

    for (const block of filteredBlocks) {
      const blockTokens = block.estimatedTokens || this.estimateTokens([block]);
      if (currentTokens + blockTokens <= tokenBudget) {
        trimmedBlocks.push(block);
        currentTokens += blockTokens;
      } else {
        break;
      }
    }

    return trimmedBlocks;
  }

  /**
   * Phase 3.3 优化: 压缩块（使用学习到的压缩策略）
   * 
   * 1. 获取压缩策略（哪些可以压缩、哪些可以省略）
   * 2. 先省略可以省略的 Block
   * 3. 再压缩可以压缩的 Block
   * 4. 如果还不够，使用 context.compress skill
   */
  private async compressBlocks(
    blocks: ContextBlock[],
    tokenBudget: number,
    userId?: string,
    phase?: string,
    agent?: string,
  ): Promise<ContextBlock[]> {
    try {
      // Phase 3.3 优化: 获取学习到的压缩策略
      let strategy: { compress: ContextBlock[]; omit: ContextBlock[]; keep: ContextBlock[] } | null = null;
      if (this.compressionLearningService) {
        try {
          strategy = await this.compressionLearningService.getCompressionStrategy(
            blocks,
            userId,
            phase,
            agent,
          );
        } catch (error: any) {
          this.logger.warn(`获取压缩策略失败: ${error.message}，使用默认策略`);
        }
      }

      // 1. 先省略可以省略的 Block
      let remainingBlocks = blocks;
      if (strategy && strategy.omit.length > 0) {
        remainingBlocks = blocks.filter((block) => !strategy!.omit.includes(block));
        this.logger.debug(`压缩策略: 省略了 ${strategy.omit.length} 个 Block`);
      }

      // 2. 检查 Token 是否已满足预算
      let currentTokens = this.estimateTokens(remainingBlocks);
      if (currentTokens <= tokenBudget) {
        return remainingBlocks;
      }

      // 3. 压缩可以压缩的 Block（使用 context.compress skill）
      if (this.skillsRegistry) {
        const contextCompressSkill = this.skillsRegistry.getSkill('context.compress');
        if (contextCompressSkill) {
          this.skillsCalledInBuild.push('context.compress');
          
          // Phase 3.3 优化: 优先压缩学习到的可压缩 Block
          const blocksToCompress = strategy?.compress || remainingBlocks;
          
          const result = await contextCompressSkill.execute({
            blocks: remainingBlocks,
            tokenBudget,
            strategy: 'balanced',
            preserveKeys: strategy?.keep.map((b) => b.key) || [], // 保留必须保留的 Block
          });

          if (result.compressedBlocks) {
            const compressedTokens = this.estimateTokens(result.compressedBlocks);
            if (compressedTokens <= tokenBudget) {
              this.logger.debug(
                `压缩完成: 原始=${currentTokens}, 压缩后=${compressedTokens}, ` +
                `省略=${strategy?.omit.length || 0}, 压缩=${strategy?.compress.length || 0}`
              );
              return result.compressedBlocks;
            }
          }
        }
      }
      
      // 如果 compress skill 失败，记录到调用列表（用于监控）
      // 即使压缩失败，也记录了尝试
    } catch (error) {
      this.logger.warn(`调用 context.compress skill 失败: ${error}，使用简单压缩策略`);
    }

    // 降级方案：简单压缩（移除优先级 < 30 的块）
    const compressed = [...blocks];
    return compressed.filter((b) => b.priority >= 30);
  }

  /**
   * 投影状态为 Public/Private
   */
  async projectState(
    state: TripState | LangGraphState,
    config?: ProjectionConfig,
  ): Promise<StateProjection> {
    const cfg: ProjectionConfig = {
      decisionLogLimit: 5,
      rejectionLogLimit: 3,
      tokenBudget: 3600,
      ...config,
    };

    try {
      // 判断是 TripState 还是 LangGraphState
      const isTripState = 'user_intent' in state;
      
      if (isTripState) {
        return await this.projectTripState(state as TripState, cfg);
      } else {
        return await this.projectLangGraphState(state as LangGraphState, cfg);
      }
    } catch (error: any) {
      this.logger.error(`状态投影失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 投影 TripState
   */
  private async projectTripState(state: TripState, config: ProjectionConfig): Promise<StateProjection> {
    // 1. 构建 Public State
    const decisionLogSummary = (state.decision_log || [])
      .slice(-config.decisionLogLimit!)
      .map((entry) => ({
        agent: entry.agent,
        action: entry.action,
        reasonCode: entry.reasonCode || '',
        explanation: entry.explanation,
        timestamp: entry.timestamp,
      }));

    const rejectionLogSummary = (state.rejection_log || []).slice(-config.rejectionLogLimit!);

    const planSummary = state.plan
      ? {
          totalDays: state.plan.days?.length || 0,
          totalSegments: state.plan.days?.reduce((sum: number, day: any) => sum + (day.segments?.length || 0), 0) || 0,
          keyHighlights: state.plan.days?.slice(0, 3).map((d: any) => d.summary || d.name || '') || [],
        }
      : undefined;

    const publicState = {
      user_intent: state.user_intent,
      strategy_mode: state.strategy_mode,
      strategy_params_summary: state.strategy_params
        ? JSON.stringify(state.strategy_params).substring(0, 200)
        : undefined,
      world_summary: {
        countryCode: state.world?.physical?.countryCode,
        season: state.world?.physical?.month?.toString() || undefined,
        routeDirectionId: (state.world?.routeDirection as any)?.id || undefined,
        routeDirectionName: state.world?.routeDirection?.name,
      },
      planning_phase: state.planning_phase,
      riskSignals: state.metadata?.riskSignals as string[] | undefined,
      decisionLogSummary,
      rejectionLogSummary: rejectionLogSummary.length > 0 ? rejectionLogSummary : undefined,
      planSummary,
      topCountryBlocks: state.metadata?.topCountryBlocks as string[] | undefined,
    };

    // 2. 构建 Private State
    const privateState = {
      fullState: config.includeFullState ? state : undefined,
      toolRawOutputs: {},
      debugLogs: [],
      longLists: {
        pois: state.metadata?.poiListRef as string | undefined,
        segments: state.metadata?.segmentListRef as string | undefined,
      },
      largeFileRefs: {
        gpx: state.metadata?.gpxRef as string | undefined,
        geojson: state.metadata?.geojsonRef as string | undefined,
      },
      intermediateResults: state.metadata?.intermediateResults as Record<string, any> | undefined,
    };

    // 3. 计算 Token 数
    const publicText = JSON.stringify(publicState);
    const tokenCount = Math.ceil((publicText.length * 0.7) / 1.5 + (publicText.length * 0.3) / 4);

    // 4. 检查是否需要裁剪
    let truncated = false;
    if (config.tokenBudget && tokenCount > config.tokenBudget) {
      truncated = true;
      // 这里可以进一步裁剪 publicState（简化实现：先返回）
      this.logger.warn(`Public state token count (${tokenCount}) exceeds budget (${config.tokenBudget})`);
    }

    return {
      public: publicState,
      private: privateState,
      metadata: {
        projectedAt: new Date().toISOString(),
        tokenCount,
        truncated,
      },
    };
  }

  /**
   * 投影 LangGraphState
   */
  private async projectLangGraphState(state: LangGraphState, config: ProjectionConfig): Promise<StateProjection> {
    const publicState = {
      user_intent: state.userQuery || '',
      planning_phase: state.planningPhase || '',
      strategy_mode: state.strategyMode,
      world_summary: {
        countryCode: state.extractedParams?.countryCode,
        routeDirectionId: state.extractedParams?.routeDirectionId
          ? parseInt(state.extractedParams.routeDirectionId, 10)
          : undefined,
      },
      decisionLogSummary: [],
      planSummary: undefined,
    };

    const privateState = {
      fullLangGraphState: config.includeFullState ? state : undefined,
      toolRawOutputs: {
        coreToolOutput: state.coreToolOutput ? 'REF:coreToolOutput' : undefined,
      },
      debugLogs: state.metadata?.debugLogs as string[] | undefined || [],
      longLists: {},
      largeFileRefs: {},
      intermediateResults: state.metadata?.intermediateResults as Record<string, any> | undefined,
    };

    const publicText = JSON.stringify(publicState);
    const tokenCount = Math.ceil((publicText.length * 0.7) / 1.5 + (publicText.length * 0.3) / 4);
    const truncated = config.tokenBudget ? tokenCount > config.tokenBudget : false;

    return {
      public: publicState,
      private: privateState,
      metadata: {
        projectedAt: new Date().toISOString(),
        tokenCount,
        truncated,
      },
    };
  }

  /**
   * 写入回写（Write Back）
   * 
   * 每个节点最后调用：保存 scratchpad、decisionLogDelta、artifactsRefs
   * 同时更新 TripTaskMemory（当提供 tripId 或可从 tripRunId 解析时）
   */
  async writeBack(
    tripRunId: string,
    attemptNumber: number,
    scratchpad: {
      planOutline?: string;
      openQuestions?: string[];
      constraintsAssumed?: string[];
      nextActions?: string[];
      failureNotes?: string;
    },
    decisionLogDelta?: any[],
    artifactsRefs?: Record<string, string>,
    options?: { tripId?: string; phase?: import('../interfaces/trip-task-memory.interface').TripTaskPhase },
  ): Promise<void> {
    try {
      // Context Orchestrator: 更新 TripTaskMemory
      if (this.tripTaskMemory) {
        let tripId = options?.tripId;
        if (!tripId && this.prisma) {
          const tripRun = await this.prisma.tripRun.findUnique({
            where: { id: tripRunId },
            select: { tripId: true },
          });
          tripId = tripRun?.tripId ?? undefined;
        }
        if (tripId) {
          await this.tripTaskMemory.updateFromWriteBack(tripId, {
            scratchpad,
            artifactsRefs,
            ...(options?.phase && { phase: options.phase }),
          });
        }
      }

      if (this.prisma) {
        // 更新或创建 TripAttempt
        await this.prisma.tripAttempt.upsert({
          where: {
            tripRunId_attemptNumber: {
              tripRunId,
              attemptNumber,
            },
          },
          update: {
            planOutline: scratchpad.planOutline,
            openQuestions: scratchpad.openQuestions || [],
            constraintsAssumed: scratchpad.constraintsAssumed || [],
            nextActions: scratchpad.nextActions || [],
            failureNotes: scratchpad.failureNotes,
            artifacts: artifactsRefs || {},
            updatedAt: new Date(),
          },
          create: {
            id: `attempt_${tripRunId}_${attemptNumber}`,
            tripRunId,
            attemptNumber,
            planOutline: scratchpad.planOutline,
            openQuestions: scratchpad.openQuestions || [],
            constraintsAssumed: scratchpad.constraintsAssumed || [],
            nextActions: scratchpad.nextActions || [],
            failureNotes: scratchpad.failureNotes,
            artifacts: artifactsRefs || {},
            status: 'IN_PROGRESS',
          },
        });

        // 如果有决策日志增量，保存它们
        if (decisionLogDelta && decisionLogDelta.length > 0) {
          // 这里调用 decision log storage service
          // 暂时跳过，由专门的 skill 处理
        }
      }
    } catch (error) {
      this.logger.error(`Failed to write back: ${error}`, error instanceof Error ? error.stack : undefined);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 获取 Context Package 列表（用于后台管理）
   */
  getPackages(options: {
    page?: number;
    limit?: number;
    tripId?: string;
    phase?: string;
    agent?: string;
    startTime?: string;
    endTime?: string;
    search?: string;
  }): { packages: ContextPackage[]; total: number; page: number; limit: number; totalPages: number } {
    let packages = Array.from(this.packageStore.values());

    // 过滤
    if (options.tripId) {
      packages = packages.filter((p) => p.tripId === options.tripId);
    }
    if (options.phase) {
      packages = packages.filter((p) => p.phase === options.phase);
    }
    if (options.agent) {
      packages = packages.filter((p) => p.agent === options.agent);
    }
    if (options.startTime) {
      packages = packages.filter((p) => p.createdAt >= options.startTime!);
    }
    if (options.endTime) {
      packages = packages.filter((p) => p.createdAt <= options.endTime!);
    }
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      packages = packages.filter(
        (p) =>
          p.userQuery.toLowerCase().includes(searchLower) ||
          (p.tripId && p.tripId.toLowerCase().includes(searchLower)),
      );
    }

    // 按时间倒序排序
    packages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 分页
    const page = options.page || 1;
    const limit = options.limit || 20;
    const total = packages.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedPackages = packages.slice(skip, skip + limit);

    return {
      packages: paginatedPackages,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * 根据 ID 获取 Context Package（用于后台管理）
   */
  getPackageById(packageId: string): ContextPackage | undefined {
    return this.packageStore.get(packageId);
  }
}