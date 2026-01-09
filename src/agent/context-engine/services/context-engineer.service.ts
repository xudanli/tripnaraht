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

@Injectable()
export class ContextEngineerService {
  private readonly logger = new Logger(ContextEngineerService.name);
  
  /**
   * 内存缓存：已构建的 Context Package（基于 cacheKey）
   * 缓存 key 格式：`tripId:${tripId}:phase:${phase}:agent:${agent}:topics:${topics.join(',')}`
   */
  private readonly memoryCache = new Map<string, { package: ContextPackage; timestamp: number }>();
  
  /**
   * 缓存 TTL（毫秒），默认 5 分钟
   */
  private readonly cacheTtl = 5 * 60 * 1000;
  
  /**
   * 缓存键前缀（用于 Redis）
   */
  private readonly cacheKeyPrefix = 'context_package:';

  // 追踪调用的 skills（用于监控）
  private skillsCalledInBuild: string[] = [];

  constructor(
    @Inject('PrismaService') @Optional() private readonly prisma?: PrismaService,
    @Inject(SKILLS_REGISTRY_TOKEN) @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly metricsService?: ContextMetricsService,
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
   * 支持缓存：如果相同参数在缓存 TTL 内，直接返回缓存的包
   */
  async build(
    options: ContextPackageOptions,
    useCache: boolean = true,
  ): Promise<ContextPackage> {
    const buildStartTime = Date.now();
    this.logger.debug(
      `Building context package: tripId=${options.tripId}, phase=${options.phase}, agent=${options.agent}`,
    );

    // 重置 skills 调用追踪
    this.skillsCalledInBuild = [];
    let cacheHit = false;

    // 1. 检查缓存（优先 Redis，降级到内存缓存）
    if (useCache) {
      const cacheKey = this.buildCacheKey(options);
      
      // 1.1 尝试从 Redis 获取
      if (this.redisService) {
        try {
          const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
          const cached = await this.redisService.get<ContextPackage>(redisKey);
          if (cached) {
            this.logger.debug(`使用 Redis 缓存的 Context Package: ${cacheKey}`);
            cacheHit = true;
            
            // 记录指标
            if (this.metricsService) {
              await this.metricsService.recordMetrics(cached, {
                tripId: options.tripId,
                phase: options.phase,
                agent: options.agent,
                buildTimeMs: Date.now() - buildStartTime,
                cacheHit: true,
                skillsCalled: [],
                userQuery: options.userQuery,
              });
            }
            
            return cached;
          }
        } catch (error: any) {
          this.logger.warn(`从 Redis 获取缓存失败，降级到内存缓存: ${error.message}`);
        }
      }
      
      // 1.2 尝试从内存缓存获取
      const memoryCached = this.memoryCache.get(cacheKey);
      if (memoryCached && Date.now() - memoryCached.timestamp < this.cacheTtl) {
        this.logger.debug(`使用内存缓存的 Context Package: ${cacheKey}`);
        cacheHit = true;
        
        // 记录指标
        if (this.metricsService) {
          await this.metricsService.recordMetrics(memoryCached.package, {
            tripId: options.tripId,
            phase: options.phase,
            agent: options.agent,
            buildTimeMs: Date.now() - buildStartTime,
            cacheHit: true,
            skillsCalled: [],
            userQuery: options.userQuery,
          });
        }
        
        return memoryCached.package;
      }
    }

    const tokenBudget = options.tokenBudget || 3600; // 默认 60% of 6k
    const blocks: ContextBlock[] = [];

    try {
      // 1. 获取世界模型摘要
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

      // 5. 获取约束和用户画像
      if (options.tripId) {
        const constraintBlocks = await this.buildConstraintBlocks(
          options.tripId,
          options.phase,
        );
        blocks.push(...constraintBlocks);
      }

      // 6. 计算 Token 并排序
      const totalTokens = this.estimateTokens(blocks);
      
      // 7. 按优先级排序并裁剪到预算内
      const sortedBlocks = this.sortAndTrimBlocks(blocks, tokenBudget, options.includePrivate || false);

      // 8. 如果需要，进行压缩
      let finalBlocks = sortedBlocks;
      let compressed = false;
      if (this.estimateTokens(sortedBlocks) > tokenBudget) {
        finalBlocks = await this.compressBlocks(sortedBlocks, tokenBudget);
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
        },
      };

      // 2. 存入缓存（优先 Redis，同时写入内存缓存）
      if (useCache) {
        const cacheKey = this.buildCacheKey(options);
        
        // 2.1 存入 Redis（持久化）
        if (this.redisService) {
          try {
            const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
            const ttlSeconds = Math.floor(this.cacheTtl / 1000);
            await this.redisService.set(redisKey, contextPackage, ttlSeconds);
            this.logger.debug(`Context Package 已存入 Redis: ${cacheKey} (TTL: ${ttlSeconds}s)`);
          } catch (error: any) {
            this.logger.warn(`存入 Redis 失败，降级到内存缓存: ${error.message}`);
          }
        }
        
        // 2.2 存入内存缓存（快速访问）
        this.memoryCache.set(cacheKey, {
          package: contextPackage,
          timestamp: Date.now(),
        });
        
        // 清理过期内存缓存（简单的 LRU 策略）
        this.cleanExpiredMemoryCache();
      }

      // 3. 记录监控指标
      if (this.metricsService) {
        await this.metricsService.recordMetrics(contextPackage, {
          tripId: options.tripId,
          phase: options.phase,
          agent: options.agent,
          buildTimeMs,
          cacheHit,
          skillsCalled: [...this.skillsCalledInBuild],
          userQuery: options.userQuery,
        });
      }

      return contextPackage;
    } catch (error) {
      this.logger.error(`Failed to build context package: ${error}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * 构建缓存 key
   */
  private buildCacheKey(options: ContextPackageOptions): string {
    const topics = options.requiredTopics?.sort().join(',') || '';
    const excludeTopics = options.excludeTopics?.sort().join(',') || '';
    return `tripId:${options.tripId || 'none'}:phase:${options.phase}:agent:${options.agent}:topics:${topics}:excludeTopics:${excludeTopics}:budget:${options.tokenBudget || 3600}`;
  }

  /**
   * 清理过期内存缓存
   */
  private cleanExpiredMemoryCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.memoryCache.entries()) {
      if (now - value.timestamp >= this.cacheTtl) {
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
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { destination: true },
        });
        // 简化：从 destination 提取国家代码（实际应该更智能）
        if (trip?.destination) {
          // 尝试从 destination 中提取国家代码
          countryCode = trip.destination.split('_')[0] || trip.destination;
        }
      }

      if (!countryCode || !this.skillsRegistry) {
        this.logger.warn(`无法获取国家代码或 SkillsRegistryService 未注入，跳过国家包块`);
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
   */
  private async buildConstraintBlocks(
    tripId: string,
    phase: string,
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

        // 如果有用户画像信息
        if (trip.metadata) {
          const metadata = trip.metadata as any;
          if (metadata.userProfile) {
            blocks.push({
              key: 'USER_PROFILE',
              type: 'USER_PROFILE',
              text: `用户画像: ${JSON.stringify(metadata.userProfile).substring(0, 200)}`,
              priority: 60,
              visibility: 'public',
              provenance: {
                source: 'db',
                identifier: `trip:${tripId}:userProfile`,
                timestamp: new Date().toISOString(),
              },
              data: metadata.userProfile,
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn(`构建约束块失败: ${error}`);
      // 不抛出错误，返回已获取的块
    }

    return blocks;
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
  ): ContextBlock[] {
    // 过滤可见性
    let filteredBlocks = includePrivate
      ? blocks
      : blocks.filter((b) => b.visibility === 'public');

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
   * 压缩块（递归摘要/剪枝）
   */
  private async compressBlocks(
    blocks: ContextBlock[],
    tokenBudget: number,
  ): Promise<ContextBlock[]> {
    try {
      // 调用 tripnara.context.compress skill
      if (this.skillsRegistry) {
        const contextCompressSkill = this.skillsRegistry.getSkill('context.compress');
        if (contextCompressSkill) {
          this.skillsCalledInBuild.push('context.compress');
          const result = await contextCompressSkill.execute({
            blocks,
            tokenBudget,
            strategy: 'balanced',
          });

          if (result.compressedBlocks) {
            return result.compressedBlocks;
          }
        }
      }
      
      // 如果 compress skill 失败，记录到调用列表（用于监控）
      // 即使压缩失败，也记录了尝试
    } catch (error) {
      this.logger.warn(`调用 context.compress skill 失败: ${error}，使用简单压缩策略`);
    }

    // 降级方案：简单压缩
    const compressed = [...blocks];
    // 简单压缩：移除优先级 < 30 的块
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
  ): Promise<void> {
    try {
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
}