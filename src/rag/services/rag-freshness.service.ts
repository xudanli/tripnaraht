// src/rag/services/rag-freshness.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { McpToolsService } from './mcp-tools.service';
import { ParallelExecutorService } from './parallel-executor.service';

/**
 * RAG 数据新鲜度验证服务
 *
 * 职责：确保 RAG 检索返回的数据是最新的
 *
 * 设计原则：
 * 1. 分级验证策略：根据数据类型设定不同的新鲜度阈值
 * 2. 自动验证触发：检索时自动检查新鲜度
 * 3. 实时数据同步：过期数据自动触发实时验证工具
 * 4. 降级策略：验证失败时标记 STALE，但仍返回数据
 *
 * 数据分类与新鲜度要求：
 * - RULES: 规则/政策类（30天，必须验证）
 * - POI_HOURS: POI 开放时间（7天，必须验证）
 * - POI_INFO: POI 基础信息（90天，不必须）
 * - GATE: 风险/路况数据（1天，必须验证）
 * - WEATHER: 天气数据（实时，必须验证）
 * - GENERAL: 一般知识（180天，不必须）
 */

export enum ChunkCategory {
  RULES = 'RULES',
  POI_HOURS = 'POI_HOURS',
  POI_INFO = 'POI_INFO',
  GATE = 'GATE',
  WEATHER = 'WEATHER',
  GENERAL = 'GENERAL',
}

export enum FreshnessStatus {
  FRESH = 'FRESH',       // 新鲜
  STALE = 'STALE',       // 过期但可用
  EXPIRED = 'EXPIRED',   // 过期且不可用
  VERIFYING = 'VERIFYING', // 验证中
}

export interface FreshnessRule {
  staleDays: number;      // 过期天数阈值
  mustVerify: boolean;    // 是否必须验证
  verifyTool?: string;    // 验证工具名称（MCP Skill）
}

export interface Chunk {
  id: string;
  chunkId: string;
  content: string;
  type: string;
  category?: ChunkCategory;
  lastVerified?: Date;
  metadata?: any;
  embedding?: number[];
}

export interface FreshnessMetadata {
  freshness: FreshnessStatus;
  lastVerified?: Date;
  staleDays?: number;
  verifyTool?: string;
  verifyError?: string;
}

@Injectable()
export class RagFreshnessService {
  private readonly logger = new Logger(RagFreshnessService.name);

  // 新鲜度规则
  private readonly FRESHNESS_RULES: Record<ChunkCategory, FreshnessRule> = {
    [ChunkCategory.RULES]: {
      staleDays: 30,
      mustVerify: true,
      verifyTool: 'web_browse',
    },
    [ChunkCategory.POI_HOURS]: {
      staleDays: 7,
      mustVerify: true,
      verifyTool: 'google_places',
    },
    [ChunkCategory.POI_INFO]: {
      staleDays: 90,
      mustVerify: false,
    },
    [ChunkCategory.GATE]: {
      staleDays: 1,
      mustVerify: true,
      verifyTool: 'road_status,weather_api',
    },
    [ChunkCategory.WEATHER]: {
      staleDays: 0, // 实时数据
      mustVerify: true,
      verifyTool: 'weather_api',
    },
    [ChunkCategory.GENERAL]: {
      staleDays: 180,
      mustVerify: false,
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly mcpTools: McpToolsService,
    @Optional() private readonly parallelExecutor?: ParallelExecutorService,
  ) {}

  /**
   * 确保 Chunks 的新鲜度
   *
   * @param chunks - 待检查的 chunks
   * @param category - chunk 类别
   * @returns 更新后的 chunks（带新鲜度元数据）
   */
  async ensureFreshness(
    chunks: Chunk[],
    category: ChunkCategory
  ): Promise<Chunk[]> {
    if (chunks.length === 0) {
      return chunks;
    }

    const rule = this.FRESHNESS_RULES[category];
    const now = new Date();

    this.logger.debug(
      `[Freshness] 检查新鲜度: category=${category}, chunks=${chunks.length}, rule=${JSON.stringify(rule)}`
    );

    // 分类 chunks：新鲜 vs 过期
    const freshChunks: Chunk[] = [];
    const staleChunks: Chunk[] = [];

    for (const chunk of chunks) {
      const lastVerified = chunk.lastVerified || chunk.metadata?.last_verified_at;
      const daysSince = lastVerified
        ? this.daysSince(new Date(lastVerified))
        : Infinity;

      if (daysSince <= rule.staleDays) {
        // 新鲜
        freshChunks.push({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            freshness: FreshnessStatus.FRESH,
            lastVerified,
            staleDays: daysSince,
          },
        });
      } else {
        // 过期
        staleChunks.push({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            freshness: FreshnessStatus.STALE,
            lastVerified,
            staleDays: daysSince,
          },
        });
      }
    }

    this.logger.debug(
      `[Freshness] 分类结果: fresh=${freshChunks.length}, stale=${staleChunks.length}`
    );

    // 如果没有过期 chunks，直接返回
    if (staleChunks.length === 0) {
      return freshChunks;
    }

    // 如果不需要强制验证，标记为 STALE 后返回
    if (!rule.mustVerify) {
      this.logger.debug(
        `[Freshness] Category ${category} 不需要强制验证，标记为 STALE 后返回`
      );
      return [...freshChunks, ...staleChunks];
    }

    // 必须验证：调用实时工具更新数据
    this.logger.warn(
      `[Freshness] 发现 ${staleChunks.length} 个过期 chunks，触发验证: tool=${rule.verifyTool}`
    );

    const updatedChunks = await this.verifyAndUpdateBatch(staleChunks, rule);

    return [...freshChunks, ...updatedChunks];
  }

  /**
   * 批量验证并更新 chunks
   * Phase 5.2: 使用并行执行优化
   */
  private async verifyAndUpdateBatch(
    chunks: Chunk[],
    rule: FreshnessRule
  ): Promise<Chunk[]> {
    if (chunks.length === 0) {
      return [];
    }

    // 如果有并行执行器，使用并行模式（Phase 5.2）
    if (this.parallelExecutor && chunks.length > 1) {
      this.logger.debug(
        `[Freshness] 使用并行模式验证 ${chunks.length} 个 chunks`
      );

      const tasks = chunks.map((chunk) => ({
        id: chunk.chunkId,
        operation: async () => this.verifyAndUpdate(chunk, rule),
        timeout: 30000, // 30秒超时
      }));

      const results = await this.parallelExecutor.executeAll(tasks, {
        maxConcurrency: 5, // 最多并行 5 个任务（避免 API 限流）
        taskTimeout: 30000,
        delayMs: 100, // 任务间 100ms 延迟
      });

      // 转换结果
      const updatedChunks = results.map((result, index) => {
        const chunk = chunks[index];
        if (result.success && result.result) {
          return result.result;
        } else {
          // 验证失败，标记为 EXPIRED
          this.logger.error(
            `[Freshness] 并行验证失败: chunkId=${chunk.chunkId}, error=${result.error?.message}`
          );
          return {
            ...chunk,
            metadata: {
              ...chunk.metadata,
              freshness: FreshnessStatus.EXPIRED,
              verifyError: result.error?.message || 'Unknown error',
            },
          };
        }
      });

      const stats = this.parallelExecutor.getStats(results);
      this.logger.log(
        `[Freshness] 并行验证完成: success=${stats.success}/${stats.total}, avgDuration=${stats.avgDuration.toFixed(0)}ms`
      );

      return updatedChunks;
    }

    // 降级：顺序执行（无并行执行器或单个 chunk）
    this.logger.debug(
      `[Freshness] 使用顺序模式验证 ${chunks.length} 个 chunks`
    );

    const updatedChunks: Chunk[] = [];

    for (const chunk of chunks) {
      try {
        const updated = await this.verifyAndUpdate(chunk, rule);
        updatedChunks.push(updated);
      } catch (error: any) {
        this.logger.error(
          `[Freshness] 验证失败: chunkId=${chunk.chunkId}, error=${error.message}`
        );

        // 验证失败，标记为 EXPIRED 但仍返回（降级策略）
        updatedChunks.push({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            freshness: FreshnessStatus.EXPIRED,
            verifyError: error.message,
          },
        });
      }
    }

    return updatedChunks;
  }

  /**
   * 验证并更新单个 chunk
   */
  private async verifyAndUpdate(
    chunk: Chunk,
    rule: FreshnessRule
  ): Promise<Chunk> {
    this.logger.debug(
      `[Freshness] 验证 chunk: chunkId=${chunk.chunkId}, tool=${rule.verifyTool}`
    );

    // 根据 chunk 类型调用不同的验证工具
    let updatedContent: string | null = null;

    if (chunk.category === ChunkCategory.POI_HOURS) {
      // 调用 Google Places API 获取最新开放时间
      try {
        const placeResult = await this.mcpTools.getPlaceDetails({
          place_id: chunk.metadata?.place_id,
          place_name: chunk.metadata?.place_name,
          fields: ['opening_hours'],
          cacheTtlMinutes: 0, // 实时验证不使用缓存
        });

        if (placeResult.success && placeResult.opening_hours) {
          updatedContent = JSON.stringify({
            place_id: placeResult.place_id,
            name: placeResult.name,
            opening_hours: placeResult.opening_hours,
            last_verified: new Date().toISOString(),
          });
          this.logger.log(
            `[Freshness] POI_HOURS 验证成功: ${placeResult.name}`
          );
        } else {
          this.logger.warn(
            `[Freshness] POI_HOURS 验证失败（API 未返回数据）`
          );
        }
      } catch (error: any) {
        this.logger.error(
          `[Freshness] POI_HOURS 验证异常: ${error.message}`
        );
      }
    } else if (chunk.category === ChunkCategory.RULES) {
      // 调用 Web Browse Skill 获取最新规则
      try {
        const webResult = await this.mcpTools.webBrowse({
          url: chunk.metadata?.source_url || chunk.metadata?.url || '',
          query: chunk.content.substring(0, 100), // 使用内容前缀作为查询
          cacheTtlMinutes: 0, // 实时验证不使用缓存
        });

        if (webResult.success && webResult.content) {
          updatedContent = webResult.content;
          this.logger.log(
            `[Freshness] RULES 验证成功: ${webResult.url}`
          );
        } else {
          this.logger.warn(
            `[Freshness] RULES 验证失败（Web Browse 未返回数据）`
          );
        }
      } catch (error: any) {
        this.logger.error(
          `[Freshness] RULES 验证异常: ${error.message}`
        );
      }
    } else if (chunk.category === ChunkCategory.GATE) {
      // 调用实时路况/天气 API
      try {
        const roadResult = await this.mcpTools.getRoadStatus({
          road_id: chunk.metadata?.road_id || chunk.metadata?.road_name || '',
          cacheTtlMinutes: 0, // 实时验证不使用缓存
        });

        if (roadResult.success) {
          updatedContent = JSON.stringify({
            road_id: roadResult.road_id,
            status: roadResult.status,
            conditions: roadResult.conditions,
            last_updated: roadResult.last_updated,
          });
          this.logger.log(
            `[Freshness] GATE/ROAD 验证成功: ${roadResult.road_id} - ${roadResult.status}`
          );
        } else {
          this.logger.warn(
            `[Freshness] GATE/ROAD 验证失败（API 未返回数据）`
          );
        }
      } catch (error: any) {
        this.logger.error(
          `[Freshness] GATE/ROAD 验证异常: ${error.message}`
        );
      }
    } else if (chunk.category === ChunkCategory.WEATHER) {
      // 调用实时天气 API
      try {
        const weatherResult = await this.mcpTools.getWeather({
          location: chunk.metadata?.location || '',
          lat: chunk.metadata?.lat,
          lng: chunk.metadata?.lng,
          cacheTtlMinutes: 0, // 实时验证不使用缓存
        });

        if (weatherResult.success) {
          updatedContent = JSON.stringify({
            location: weatherResult.location,
            timestamp: weatherResult.timestamp,
            temperature: weatherResult.temperature,
            conditions: weatherResult.conditions,
            wind_speed: weatherResult.wind_speed,
            visibility: weatherResult.visibility,
            warnings: weatherResult.warnings,
          });
          this.logger.log(
            `[Freshness] WEATHER 验证成功: ${weatherResult.location} - ${weatherResult.conditions}`
          );
        } else {
          this.logger.warn(
            `[Freshness] WEATHER 验证失败（API 未返回数据）`
          );
        }
      } catch (error: any) {
        this.logger.error(
          `[Freshness] WEATHER 验证异常: ${error.message}`
        );
      }
    }

    // 如果成功获取更新数据，更新 chunk + embedding
    if (updatedContent) {
      const updatedChunk = await this.updateChunk(chunk, updatedContent);
      return {
        ...updatedChunk,
        metadata: {
          ...updatedChunk.metadata,
          freshness: FreshnessStatus.FRESH,
          lastVerified: new Date(),
        },
      };
    }

    // 验证工具暂未实现或失败，返回原 chunk（标记为 STALE）
    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        freshness: FreshnessStatus.STALE,
        verifyError: '验证工具暂未实现',
      },
    };
  }

  /**
   * 更新 chunk 内容和 embedding
   */
  private async updateChunk(
    chunk: Chunk,
    newContent: string
  ): Promise<Chunk> {
    this.logger.log(
      `[Freshness] 更新 chunk: chunkId=${chunk.chunkId}, oldLength=${chunk.content.length}, newLength=${newContent.length}`
    );

    // 1. 生成新 embedding
    const newEmbedding = await this.embeddingService.generateEmbedding(newContent);

    // 2. 更新数据库
    const embeddingStr = `[${newEmbedding.join(',')}]`;

    await this.prisma.$executeRaw`
      UPDATE chunks
      SET
        content = ${newContent},
        embedding = ${embeddingStr}::vector,
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{last_verified_at}',
          to_jsonb(NOW()::text)
        ),
        updated_at = NOW()
      WHERE chunk_id = ${chunk.chunkId}
    `;

    return {
      ...chunk,
      content: newContent,
      embedding: newEmbedding,
      lastVerified: new Date(),
    };
  }

  /**
   * 计算距离今天的天数
   */
  private daysSince(date: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * 获取新鲜度统计
   */
  async getFreshnessStats(params?: {
    category?: ChunkCategory;
  }): Promise<{
    totalChunks: number;
    byFreshness: Record<FreshnessStatus, number>;
    byCategory: Record<ChunkCategory, {
      total: number;
      fresh: number;
      stale: number;
      expired: number;
    }>;
    staleChunks: Array<{
      chunkId: string;
      category: ChunkCategory;
      staleDays: number;
      lastVerified?: Date;
    }>;
  }> {
    // TODO: 实现统计查询
    // 查询所有 chunks 的 last_verified_at
    // 按类别和新鲜度分组统计

    return {
      totalChunks: 0,
      byFreshness: {
        [FreshnessStatus.FRESH]: 0,
        [FreshnessStatus.STALE]: 0,
        [FreshnessStatus.EXPIRED]: 0,
        [FreshnessStatus.VERIFYING]: 0,
      },
      byCategory: {} as any,
      staleChunks: [],
    };
  }

  /**
   * 手动触发新鲜度验证（批量）
   */
  async refreshStaleChunks(params?: {
    category?: ChunkCategory;
    force?: boolean; // 强制刷新所有 chunks
  }): Promise<{
    refreshed: number;
    failed: number;
    skipped: number;
  }> {
    this.logger.log(
      `[Freshness] 手动刷新过期 chunks: category=${params?.category || 'all'}, force=${params?.force || false}`
    );

    // TODO: 实现批量刷新
    // 1. 查询所有过期 chunks
    // 2. 按类别调用验证工具
    // 3. 更新 content + embedding
    // 4. 返回统计

    return {
      refreshed: 0,
      failed: 0,
      skipped: 0,
    };
  }

  /**
   * 定时任务：每日验证过期数据
   *
   * 可以配置为 Cron Job（使用 @nestjs/schedule）
   */
  async dailyFreshnessCheck(): Promise<void> {
    this.logger.log('[Freshness] 开始每日新鲜度检查');

    // 遍历所有类别
    for (const category of Object.values(ChunkCategory)) {
      const rule = this.FRESHNESS_RULES[category as ChunkCategory];

      if (!rule.mustVerify) {
        continue; // 跳过不需要强制验证的类别
      }

      // TODO: 查询该类别的所有过期 chunks
      // TODO: 批量验证并更新

      this.logger.log(
        `[Freshness] 检查类别: ${category}, staleDays=${rule.staleDays}`
      );
    }

    this.logger.log('[Freshness] 每日新鲜度检查完成');
  }
}
