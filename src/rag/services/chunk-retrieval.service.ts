// src/rag/services/chunk-retrieval.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { RerankingService } from './reranking.service';
import { RAGMonitoringService } from './rag-monitoring.service';
import { QueryExpansionService } from './query-expansion.service';
import { QueryIntentService } from './query-intent.service';
import { RedisService } from '../../redis/redis.service';
import { ParallelExecutorService } from './parallel-executor.service';
import { HybridSearchConfigService } from './hybrid-search-config.service';
import { expandChunkCategoryForRetrievalFilter } from '../../knowledge-base/chunk-category-derive';

function parseChunkUpdatedAt(v: Date | string | null | undefined): Date | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** pg / Prisma 原始查询可能返回 number、string、Decimal；parseFloat 直接转会得到 NaN */
function parsePgNumeric(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
    try {
      const n = (v as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : NaN;
    } catch {
      return NaN;
    }
  }
  // Prisma.Decimal / decimal.js：toJSON() 常为 string；toString() 常为数字字面量
  if (typeof v === 'object' && v !== null) {
    const jsonish = (v as { toJSON?: () => unknown }).toJSON;
    if (typeof jsonish === 'function') {
      try {
        const j = jsonish.call(v);
        if (typeof j === 'number' && Number.isFinite(j)) return j;
        if (typeof j === 'string') {
          const n = parseFloat(j.replace(/,/g, ''));
          if (Number.isFinite(n)) return n;
        }
      } catch {
        /* ignore */
      }
    }
    try {
      const ts = (v as { toString?: () => string }).toString?.();
      if (ts && ts !== '[object Object]' && /^-?\d/.test(ts.trim())) {
        const n = parseFloat(ts.replace(/,/g, ''));
        if (Number.isFinite(n)) return n;
      }
    } catch {
      /* ignore */
    }
  }
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

/** pg 驱动 / Prisma 原始行里相似度列名可能不一致，做一次归一 */
function pickDenseSimilarityRaw(row: Record<string, unknown>): unknown {
  const direct =
    row.similarity ??
    row.Similarity ??
    (row as { similarity_score?: unknown }).similarity_score;
  if (direct != null) return direct;
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === 'similarity' && v != null) return v;
  }
  return undefined;
}

function pickCredibilityRaw(row: Record<string, unknown>): unknown {
  const direct =
    row.credibility_score ??
    (row as { credibilityScore?: unknown }).credibilityScore;
  if (direct != null) return direct;
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === 'credibility_score' && v != null) return v;
  }
  return undefined;
}

export interface ChunkRetrievalResult {
  id: string;
  chunkId: string;
  content: string;
  type: string;
  credibilityScore: number;
  keywords: string[];
  metadata: any;
  fileId: string;
  similarity: number;
  /** chunks.category，供 CGUS / dominant 统计与时效衰减 */
  category?: string | null;
  /** chunks.updated_at，用于路况类 ageHours */
  chunkUpdatedAt?: Date;
  sourceFile?: string;
  // Hybrid Search 相关字段
  denseScore?: number; // Dense (向量) 检索分数
  sparseScore?: number; // Sparse (关键词) 检索分数
  hybridScore?: number; // 混合检索最终分数
  // Reranking 相关字段
  rerankScore?: number; // 重排序分数
  rerankReason?: string; // 重排序原因
}

export interface ChunkRetrievalParams {
  query: string;
  limit?: number;
  credibilityMin?: number;
  type?: string;
  category?: string; // KnowledgeFile的category (文件级别分类)
  /** Chunk 级分类过滤；支持核心类 + 标签降级展开，见 expandChunkCategoryForRetrievalFilter */
  chunkCategory?: string;
  fileId?: string;
  // Hybrid Search 参数
  useHybridSearch?: boolean; // 是否使用混合检索
  denseWeight?: number; // Dense 检索权重 (默认 0.6)
  sparseWeight?: number; // Sparse 检索权重 (默认 0.4)
  sparseLimit?: number; // Sparse 检索返回数量 (默认与 limit 相同)
  // Reranking 参数
  useReranking?: boolean; // 是否使用重排序 (默认 false)
  rerankTopK?: number; // 重排序的Top-K数量 (默认 20)
  // Query Expansion 参数
  useQueryExpansion?: boolean; // 是否使用查询扩展 (默认 false)
  maxQueryVariants?: number; // 最大查询变体数量 (默认 3)
  // Query Intent 参数
  useIntentClassification?: boolean; // 是否使用意图分类自动过滤 (默认 false)
  /**
   * Hybrid 内层 dense 检索：不在 formatResults 里按向量相似度二次过滤（SQL 已按 credibility 过滤）。
   * 避免余弦略低于 0.01 或驱动返回非标类型导致 Dense=0、RRF 无 dense 分支。
   */
  relaxDenseSimilarityFilter?: boolean;
}

@Injectable()
export class ChunkRetrievalService {
  private readonly logger = new Logger(ChunkRetrievalService.name);

  /**
   * Phase 1.2 优化: RAG 结果缓存
   * L1: 内存缓存（快速，5分钟TTL）
   * L2: Redis 缓存（持久化，15分钟TTL）
   */
  private readonly resultCache = new Map<string, {
    results: ChunkRetrievalResult[];
    timestamp: number;
    version: number; // 缓存版本号，用于一致性检查
  }>();
  private readonly l1CacheTtl = 5 * 60 * 1000; // 5分钟
  private readonly l2CacheTtl = 15 * 60 * 1000; // 15分钟
  private readonly cacheKeyPrefix = 'rag_result:';
  private cacheVersion = 0; // 全局缓存版本，用于批量失效

  /**
   * Phase 1.2 优化: In-Flight Request Deduplication
   * 避免并发请求重复检索
   */
  private readonly inFlightRetrievals = new Map<string, {
    promise: Promise<ChunkRetrievalResult[]>;
    timestamp: number;
  }>();
  private readonly inFlightTimeout = 30 * 1000; // 30秒超时清理

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    @Optional() private readonly rerankingService?: RerankingService,
    @Optional() private readonly monitoringService?: RAGMonitoringService,
    @Optional() private readonly queryExpansionService?: QueryExpansionService,
    @Optional() private readonly queryIntentService?: QueryIntentService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly parallelExecutor?: ParallelExecutorService,
    @Optional() private readonly hybridSearchConfig?: HybridSearchConfigService,
  ) {
    if (this.redisService) {
      this.logger.log('✅ RAG 结果缓存已启用（Redis）');
    } else {
      this.logger.log('⚠️ RAG 结果缓存使用内存缓存（Redis 不可用）');
    }

    if (this.parallelExecutor) {
      this.logger.log('✅ 批量检索优化已启用');
    }

    if (this.hybridSearchConfig) {
      this.logger.log('✅ Hybrid Search 动态权重配置已启用');
    } else {
      this.logger.log('⚠️ Hybrid Search 使用默认权重');
    }
  }

  /**
   * 从 Chunk 表检索相关文档
   * 
   * Phase 1.2 优化:
   * - 结果缓存（L1内存 + L2Redis）
   * - In-Flight Request Deduplication
   * 
   * 支持：
   * - 纯向量检索（Dense retrieval）
   * - 混合检索（Hybrid Search: Dense + Sparse）
   * - 重排序（Reranking: 对Top-K结果重新排序）
   */
  async retrieve(params: ChunkRetrievalParams): Promise<ChunkRetrievalResult[]> {
    const cacheKey = this.buildCacheKey(params);

    // Phase 1.2 优化: In-Flight Request Deduplication（带超时清理）
    this.cleanExpiredInFlightRetrievals();
    const inFlightEntry = this.inFlightRetrievals.get(cacheKey);
    if (inFlightEntry) {
      this.logger.debug(`🔄 复用正在进行的 RAG 检索: ${cacheKey}`);
      return inFlightEntry.promise;
    }

    // Phase 1.2 优化: 检查缓存（带版本一致性检查）
    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      this.logger.debug(`✅ RAG 缓存命中: ${cacheKey}`);
      return cached;
    }

    // 创建新的检索任务
    const retrievalPromise = this.doRetrieve(params, cacheKey);
    this.inFlightRetrievals.set(cacheKey, {
      promise: retrievalPromise,
      timestamp: Date.now(),
    });

    try {
      const results = await retrievalPromise;

      // 写入缓存（带版本号）
      await this.writeToCache(cacheKey, results);

      return results;
    } finally {
      // 完成后从 In-Flight 映射中移除
      this.inFlightRetrievals.delete(cacheKey);
    }
  }

  /**
   * 清理过期的 In-Flight 检索（防止内存泄漏）
   */
  private cleanExpiredInFlightRetrievals(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.inFlightRetrievals.entries()) {
      if (now - entry.timestamp > this.inFlightTimeout) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.inFlightRetrievals.delete(key);
      this.logger.debug(`清理过期的 In-Flight 检索: ${key}`);
    }
  }

  /**
   * 批量失效缓存（用于知识库更新后）
   */
  invalidateCache(pattern?: string): void {
    this.cacheVersion++; // 递增全局版本号
    if (pattern) {
      // 按模式失效
      const keysToDelete: string[] = [];
      for (const key of this.resultCache.keys()) {
        if (key.includes(pattern)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.resultCache.delete(key);
      }
      this.logger.debug(`按模式失效缓存: ${pattern}, 清理了 ${keysToDelete.length} 个条目`);
    } else {
      // 全部失效
      this.resultCache.clear();
      this.logger.debug('全部失效 L1 缓存');
    }

    // 异步清理 Redis 缓存
    if (this.redisService) {
      this.invalidateRedisCache(pattern).catch((error) => {
        this.logger.warn(`清理 Redis 缓存失败: ${error.message}`);
      });
    }
  }

  /**
   * 失效 Redis 缓存
   * 注意：由于 RedisService 不支持 scan，这里使用简化的失效策略
   * 实际生产环境建议使用 Redis SCAN 或维护一个 key 列表
   */
  private async invalidateRedisCache(pattern?: string): Promise<void> {
    if (!this.redisService) return;

    try {
      // 简化策略：只支持全部失效
      // 如果需要按模式失效，建议在 Redis 中维护一个 key 列表
      if (pattern) {
        this.logger.warn(`按模式失效 Redis 缓存暂不支持（pattern=${pattern}），跳过`);
        return;
      }

      // 清理所有 RAG 缓存：由于无法 scan，这里只能记录日志
      // 实际生产环境建议：
      // 1. 使用 Redis SCAN 命令
      // 2. 维护一个 key 列表（SET）
      // 3. 使用 Redis 的 EXPIRE 机制自动失效
      this.logger.debug('Redis 缓存失效：依赖 TTL 自动清理');
    } catch (error: any) {
      this.logger.error(`清理 Redis 缓存失败: ${error.message}`);
    }
  }

  /**
   * Phase 1.2 优化: 实际执行检索（内部方法）
   */
  private async doRetrieve(
    params: ChunkRetrievalParams,
    _cacheKey: string,
  ): Promise<ChunkRetrievalResult[]> {
    let query = params.query;
    const {
      limit = 10,
      useHybridSearch = true, // 默认启用混合检索（推荐，对中文查询更有效）
      denseWeight: paramDenseWeight,
      sparseWeight: paramSparseWeight,
      useReranking = false, // 默认不启用重排序（因为会增加延迟）
      rerankTopK = 20,
      useQueryExpansion = false, // 默认不启用查询扩展（因为会增加延迟和成本）
      maxQueryVariants = 3,
      useIntentClassification = false, // 是否启用意图分类
    } = params;
    let chunkCategory = params.chunkCategory; // 可能被意图分类覆盖

    // 动态权重配置：根据查询类型调整权重
    let denseWeight = paramDenseWeight;
    let sparseWeight = paramSparseWeight;
    if (this.hybridSearchConfig && (denseWeight === undefined || sparseWeight === undefined)) {
      const dynamicWeights = this.hybridSearchConfig.getWeightsForQuery(query);
      denseWeight = denseWeight ?? dynamicWeights.denseWeight;
      sparseWeight = sparseWeight ?? dynamicWeights.sparseWeight;
    } else {
      // 使用传入的权重或默认值
      denseWeight = denseWeight ?? 0.6;
      sparseWeight = sparseWeight ?? 0.4;
    }

    // 0. 意图分类（如果启用且未手动指定chunkCategory）
    let intentInfo: string | undefined;
    if (useIntentClassification && this.queryIntentService && !chunkCategory) {
      const intent = this.queryIntentService.classifyIntent(query);
      if (this.queryIntentService.shouldFilterByCategory(intent)) {
        chunkCategory = intent.suggestedChunkCategory;
        intentInfo = `${intent.type}(${intent.confidence.toFixed(2)})`;
        this.logger.debug(
          `🎯 意图分类: ${intent.type} → chunkCategory=${chunkCategory}, reason: ${intent.reasoning}`
        );
      }
      // 使用增强的查询（添加同义词）
      if (intent.expandedKeywords.length > 0) {
        const enhancedQuery = this.queryIntentService.enhanceQuery(query);
        this.logger.debug(`📝 查询增强: "${query}" → "${enhancedQuery}"`);
        query = enhancedQuery;
      }
    }

    this.logger.debug(
      `Chunk 检索: query="${query.substring(0, 50)}...", hybrid=${useHybridSearch}, denseWeight=${denseWeight}, sparseWeight=${sparseWeight}, rerank=${useReranking}, expansion=${useQueryExpansion}${intentInfo ? `, intent=${intentInfo}` : ''}`
    );

    const startTime = Date.now();
    let embeddingLatency: number | undefined;

    // 更新params中的chunkCategory（如果被意图分类修改）
    const updatedParams = { ...params, query, chunkCategory };

    try {
      let results: ChunkRetrievalResult[];

      // 1. 如果启用查询扩展，生成查询变体并并行检索
      if (useQueryExpansion && this.queryExpansionService) {
        results = await this.retrieveWithExpansion({
          ...updatedParams,
          denseWeight,
          sparseWeight,
          maxQueryVariants,
        });
      } else {
        // 2. 执行检索（Hybrid Search 或 Dense Search）
        if (useHybridSearch) {
          results = await this.hybridRetrieve({
            ...updatedParams,
            denseWeight,
            sparseWeight,
          });
        } else {
          // 记录Embedding生成时间
          const embeddingStart = Date.now();
          results = await this.denseRetrieve(updatedParams);
          embeddingLatency = Date.now() - embeddingStart;
        }
      }

      // 3. 如果启用重排序，对Top-K结果重新排序
      if (useReranking && this.rerankingService && results.length > 0) {
        const rerankedResults = await this.rerankingService.rerank({
          query,
          results,
          topK: rerankTopK,
          returnTop: limit,
        });
        
        this.logger.debug(
          `Reranking完成: 原始=${results.length}, 重排序后=${rerankedResults.length}`
        );
        
        // 记录监控指标
        if (this.monitoringService) {
          const totalLatency = Date.now() - startTime;
          this.monitoringService.recordRetrieval({
            query,
            latency: totalLatency,
            embeddingLatency,
            resultCount: rerankedResults.length,
            useHybridSearch,
            useReranking: true,
          });
        }
        
        return rerankedResults;
      }

      const finalResults = results.slice(0, limit);
      
      // 记录监控指标
      if (this.monitoringService) {
        const totalLatency = Date.now() - startTime;
        this.monitoringService.recordRetrieval({
          query,
          latency: totalLatency,
          embeddingLatency,
          resultCount: finalResults.length,
          useHybridSearch,
          useReranking: false,
        });
      }

      return finalResults;
    } catch (error: any) {
      // 记录错误
      if (this.monitoringService) {
        const totalLatency = Date.now() - startTime;
        this.monitoringService.recordRetrieval({
          query,
          latency: totalLatency,
          embeddingLatency,
          resultCount: 0,
          error: error.message,
          useHybridSearch,
          useReranking,
        });
      }
      
      this.logger.error(`Chunk 检索失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 使用查询扩展进行检索
   */
  private async retrieveWithExpansion(
    params: ChunkRetrievalParams & { denseWeight: number; sparseWeight: number; maxQueryVariants: number }
  ): Promise<ChunkRetrievalResult[]> {
    const {
      query,
      limit = 10,
      useHybridSearch = true,
      denseWeight,
      sparseWeight,
      maxQueryVariants,
      ...restParams
    } = params;

    // 1. 生成查询变体
    const expanded = await this.queryExpansionService!.expandQuery({
      query,
      maxVariants: maxQueryVariants,
    });

    this.logger.debug(
      `查询扩展: 原始="${query}", 变体=${expanded.variants.length}, 总计=${expanded.allQueries.length}`
    );

    // 2. 并行检索所有查询（原始 + 变体）
    const retrievalPromises = expanded.allQueries.map((q) => {
      if (useHybridSearch) {
        return this.hybridRetrieve({
          ...restParams,
          query: q,
          limit: limit * 2, // 获取更多结果用于合并
          denseWeight,
          sparseWeight,
        });
      } else {
        return this.denseRetrieve({
          ...restParams,
          query: q,
          limit: limit * 2,
        });
      }
    });

    const allResults = await Promise.all(retrievalPromises);

    // 3. 构建结果映射（query -> results）
    const resultsMap = new Map<string, ChunkRetrievalResult[]>();
    expanded.allQueries.forEach((q, index) => {
      resultsMap.set(q, allResults[index]);
    });

    // 4. 合并结果（使用QueryExpansionService的合并策略）
    const mergedResults = this.queryExpansionService!.mergeResults(
      resultsMap,
      query,
      limit
    );

    this.logger.debug(
      `查询扩展检索完成: 原始查询结果=${allResults[0]?.length || 0}, 合并后=${mergedResults.length}`
    );

    return mergedResults;
  }

  /**
   * API chunkCategory → 数据库细分标签（OR）；非映射值则精确匹配单列。
   */
  private appendChunkCategoryFilter(
    conditions: string[],
    paramsList: unknown[],
    chunkCategory: string | undefined,
    logLabel: string,
  ): void {
    if (!chunkCategory?.trim()) return;
    const labels = expandChunkCategoryForRetrievalFilter(chunkCategory);
    if (labels.length === 0) return;
    const start = paramsList.length + 1;
    const parts = labels.map((_, i) => `c.category = $${start + i}`);
    conditions.push(`(${parts.join(' OR ')})`);
    labels.forEach((l) => paramsList.push(l));
    this.logger.debug(`🎯 ${logLabel}: chunkCategory=${chunkCategory} → ${labels.join(', ')}`);
  }

  /**
   * Dense检索（纯向量搜索）
   */
  private async denseRetrieve(params: ChunkRetrievalParams): Promise<ChunkRetrievalResult[]> {
    const {
      query,
      limit = 10,
      credibilityMin = 0.5,
      type,
      category,
      chunkCategory,
      fileId,
    } = params;

    // 1. 生成查询的 embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    
    // 检查是否为零向量（embedding生成失败时的降级策略）
    const isZeroVector = queryEmbedding.every(v => v === 0);
    if (isZeroVector) {
      this.logger.warn(
        `⚠️ Dense检索: 查询embedding是零向量，可能API调用失败。查询: "${query.substring(0, 50)}..."`
      );
      // 返回空结果，让调用方知道embedding生成失败
      return [];
    }
    
    this.logger.debug(
      `Dense检索: 查询embedding生成成功，维度=${queryEmbedding.length}, 非零值=${queryEmbedding.filter(v => v !== 0).length}`
    );

    // 2. 构建查询条件
    const conditions: string[] = [];
    const paramsList: any[] = [JSON.stringify(queryEmbedding), limit];

    conditions.push('c.embedding IS NOT NULL');

    if (type) {
      conditions.push(`c.type = $${paramsList.length + 1}`);
      paramsList.push(type);
    }

    if (credibilityMin) {
      conditions.push(`c.credibility_score >= $${paramsList.length + 1}`);
      paramsList.push(credibilityMin);
    }

    if (fileId) {
      conditions.push(`c.file_id = $${paramsList.length + 1}::uuid`);
      paramsList.push(fileId);
    }

    this.appendChunkCategoryFilter(conditions, paramsList, chunkCategory, 'Dense检索');

    // 构建 FROM 子句
    let fromClause = 'FROM chunks c';
    if (category) {
      fromClause += ' INNER JOIN knowledge_files kf ON c.file_id = kf.id';
      conditions.push(`kf.category = $${paramsList.length + 1}`);
      paramsList.push(category);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    this.logger.debug(`Dense检索: conditions=${conditions.join(', ')}`);

    // 3. 向量相似度搜索
    const querySql = `
      SELECT 
        c.id,
        c.chunk_id,
        c.content,
        c.type,
        c.credibility_score,
        c.keywords,
        c.metadata,
        c.file_id,
        c.category,
        c.updated_at AS chunk_updated_at,
        COALESCE((1 - (c.embedding <=> $1::vector))::double precision, 0) AS similarity
      ${fromClause}
      ${whereClause}
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
    `;

    const results = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      chunk_id: string;
      content: string;
      type: string;
      credibility_score: number;
      keywords: string[];
      metadata: any;
      file_id: string;
      category: string | null;
      chunk_updated_at: Date | string | null;
      similarity: number;
    }>>(querySql, ...paramsList);

    return this.formatResults(results, credibilityMin, params.relaxDenseSimilarityFilter === true);
  }

  /**
   * Hybrid检索（Dense + Sparse）
   * 
   * 使用 Reciprocal Rank Fusion (RRF) 合并结果
   */
  private async hybridRetrieve(params: ChunkRetrievalParams & { denseWeight: number; sparseWeight: number }): Promise<ChunkRetrievalResult[]> {
    const {
      limit = 10,
      chunkCategory, // 重要：确保chunkCategory被正确传递
      denseWeight,
      sparseWeight,
    } = params;

    this.logger.debug(
      `Hybrid检索参数: chunkCategory=${chunkCategory || 'N/A'}, denseWeight=${denseWeight}, sparseWeight=${sparseWeight}`
    );

    // 并行执行 Dense 和 Sparse 检索
    const [denseResults, sparseResults] = await Promise.all([
      this.denseRetrieve({ ...params, useHybridSearch: false, relaxDenseSimilarityFilter: true }),
      this.sparseRetrieve({ ...params }),
    ]);

    // 使用 RRF (Reciprocal Rank Fusion) 合并结果
    const mergedResults = this.mergeWithRRF(
      denseResults,
      sparseResults,
      denseWeight,
      sparseWeight,
      limit
    );

    // 注意：RRF hybridScore 范围很小（约 0.001-0.05），不应使用常规similarity阈值过滤
    // credibilityMin 已在 SQL 查询中用于过滤 credibility_score
    // Hybrid Search使用更宽松的阈值，只过滤掉明显无意义的结果
    const filteredResults = mergedResults.filter((r) => {
      const sim = parsePgNumeric(r.similarity);
      const hybrid = typeof r.hybridScore === 'number' && Number.isFinite(r.hybridScore) ? r.hybridScore : 0;
      const score = hybrid || (Number.isFinite(sim) ? sim : 0) || r.sparseScore || r.denseScore || 0;
      const credibility = r.credibilityScore || 0;
      // Hybrid Search: 只要分数>0且credibility满足要求即可
      return score > 0 && credibility >= (params.credibilityMin || 0);
    });

    this.logger.debug(
      `Hybrid检索完成: Dense=${denseResults.length}, Sparse=${sparseResults.length}, Merged=${filteredResults.length}`
    );

    return filteredResults;
  }

  /**
   * Sparse检索（关键词搜索）
   */
  private async sparseRetrieve(params: ChunkRetrievalParams): Promise<ChunkRetrievalResult[]> {
    const {
      query,
      limit = 10,
      credibilityMin = 0.5,
      type,
      category,
      chunkCategory,
      fileId,
    } = params;

    // 提取关键词（简单分词，实际可以使用更复杂的NLP）
    const keywords = this.extractKeywords(query);

    if (keywords.length === 0) {
      return [];
    }

    // 构建查询条件
    const conditions: string[] = [];
    const paramsList: any[] = [];

    // 关键词匹配：在content或keywords字段中搜索
    const keywordConditions = keywords.map((kw) => {
      const paramIdx = paramsList.length + 1;
      paramsList.push(`%${kw}%`);
      return `(c.content ILIKE $${paramIdx} OR EXISTS(SELECT 1 FROM unnest(c.keywords) AS kw WHERE LOWER(kw) LIKE LOWER($${paramIdx})))`;
    });
    conditions.push(`(${keywordConditions.join(' OR ')})`);

    if (type) {
      conditions.push(`c.type = $${paramsList.length + 1}`);
      paramsList.push(type);
    }

    if (credibilityMin) {
      conditions.push(`c.credibility_score >= $${paramsList.length + 1}`);
      paramsList.push(credibilityMin);
    }

    if (fileId) {
      conditions.push(`c.file_id = $${paramsList.length + 1}::uuid`);
      paramsList.push(fileId);
    }

    this.appendChunkCategoryFilter(conditions, paramsList, chunkCategory, 'Sparse检索');

    // 构建 FROM 子句
    let fromClause = 'FROM chunks c';
    if (category) {
      fromClause += ' INNER JOIN knowledge_files kf ON c.file_id = kf.id';
      conditions.push(`kf.category = $${paramsList.length + 1}`);
      paramsList.push(category);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    paramsList.push(limit * 2); // 获取更多结果用于评分

    // 构建关键词匹配分数计算
    const scoreParts: string[] = [];
    keywords.forEach((_kw, idx) => {
      const paramIdx = idx + 1;
      scoreParts.push(`
        (
          -- content中的匹配数
          (LENGTH(LOWER(c.content)) - LENGTH(REPLACE(LOWER(c.content), LOWER($${paramIdx}), ''))) / NULLIF(LENGTH($${paramIdx}), 0) +
          -- keywords数组中的匹配数（每个匹配+1）
          (SELECT COUNT(*) FROM unnest(c.keywords) AS kw WHERE LOWER(kw) LIKE LOWER($${paramIdx}))
        )
      `);
    });
    const scoreCalculation = scoreParts.length > 0
      ? `(${scoreParts.join(' + ')})::float / GREATEST(LENGTH(c.content), 1) * 100`
      : '0';

    // 关键词搜索SQL
    const querySql = `
      SELECT 
        c.id,
        c.chunk_id,
        c.content,
        c.type,
        c.credibility_score,
        c.keywords,
        c.metadata,
        c.file_id,
        c.category,
        c.updated_at AS chunk_updated_at,
        ${scoreCalculation} as keyword_score
      ${fromClause}
      ${whereClause}
      ORDER BY keyword_score DESC
      LIMIT $${paramsList.length}
    `;

    // 准备参数：先放关键词（用于匹配和评分），再放其他条件
    const allParams = [...keywords.map(kw => `%${kw}%`), ...paramsList.slice(keywords.length)];

    const results = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      chunk_id: string;
      content: string;
      type: string;
      credibility_score: number;
      keywords: string[];
      metadata: any;
      file_id: string;
      category: string | null;
      chunk_updated_at: Date | string | null;
      keyword_score: number;
    }>>(querySql, ...allParams);

    // 获取文件信息
    const fileIds = [...new Set(results.map((r) => r.file_id))];
    const files = fileIds.length > 0 ? await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      filename: string;
    }>>(
      `SELECT id, filename FROM knowledge_files WHERE id = ANY($1::uuid[])`,
      fileIds
    ) : [];

    const fileMap = new Map<string, string>();
    files.forEach((f: any) => {
      fileMap.set(f.id, f.filename);
    });

    // 格式化结果，使用 keyword_score 作为 similarity（须 parsePgNumeric：避免 Decimal → NaN）
    return results.map((r) => {
      const ks = parsePgNumeric(r.keyword_score);
      const norm = Number.isFinite(ks) ? Math.min(ks / 100, 1) : 0;
      return {
        id: r.id,
        chunkId: r.chunk_id,
        content: r.content,
        type: r.type,
        credibilityScore: parsePgNumeric(r.credibility_score) || 0,
        keywords: r.keywords || [],
        metadata: r.metadata as Record<string, any> | undefined,
        fileId: r.file_id,
        category: r.category,
        chunkUpdatedAt: parseChunkUpdatedAt(r.chunk_updated_at),
        similarity: norm,
        sparseScore: norm,
        sourceFile: fileMap.get(r.file_id),
      };
    });
  }

  /**
   * 使用 RRF (Reciprocal Rank Fusion) 合并结果
   */
  private mergeWithRRF(
    denseResults: ChunkRetrievalResult[],
    sparseResults: ChunkRetrievalResult[],
    denseWeight: number,
    sparseWeight: number,
    limit: number
  ): ChunkRetrievalResult[] {
    const k = 60; // RRF常数
    const resultMap = new Map<string, ChunkRetrievalResult>();

    // 处理 Dense 结果
    denseResults.forEach((result, index) => {
      const rrfScore = denseWeight / (k + index + 1);
      const existing = resultMap.get(result.id);
      if (existing) {
        existing.hybridScore = (existing.hybridScore || 0) + rrfScore;
        existing.denseScore = result.similarity;
      } else {
        resultMap.set(result.id, {
          ...result,
          hybridScore: rrfScore,
          denseScore: result.similarity,
        });
      }
    });

    // 处理 Sparse 结果
    sparseResults.forEach((result, index) => {
      const rrfScore = sparseWeight / (k + index + 1);
      const existing = resultMap.get(result.id);
      if (existing) {
        existing.hybridScore = (existing.hybridScore || 0) + rrfScore;
        existing.sparseScore = result.sparseScore || result.similarity;
      } else {
        resultMap.set(result.id, {
          ...result,
          hybridScore: rrfScore,
          sparseScore: result.sparseScore || result.similarity,
        });
      }
    });

    // 按混合分数排序
    const merged = Array.from(resultMap.values())
      .sort((a, b) => (b.hybridScore || 0) - (a.hybridScore || 0))
      .slice(0, limit)
      .map((r) => {
        let sim = parsePgNumeric(r.similarity);
        if (!Number.isFinite(sim) || sim <= 0) {
          const h = r.hybridScore ?? 0;
          const fallback = r.sparseScore ?? r.denseScore ?? 0;
          sim =
            Number.isFinite(h) && h > 0
              ? Math.min(1, h * 18)
              : Number.isFinite(fallback) && fallback > 0
                ? fallback
                : 0;
        }
        return { ...r, similarity: sim };
      });

    return merged;
  }

  /**
   * 中英文同义词映射表
   * 用于Sparse检索的关键词扩展
   */
  private readonly SYNONYM_MAP: Record<string, string[]> = {
    // 路线相关
    '环岛': ['ring road', 'ring-road', 'route 1', '一号公路', '环线'],
    '环线': ['ring road', 'ring-road', '环岛'],
    '自驾': ['driving', 'self-drive', 'car rental', '驾车', '开车'],
    '路线': ['route', 'itinerary', '行程', '路径'],
    '行程': ['itinerary', 'route', '路线', '规划'],
    // 天气相关
    '天气': ['weather', 'climate', '气候', '气温'],
    '气候': ['climate', 'weather', '天气'],
    '极光': ['aurora', 'northern lights', '北极光'],
    '季节': ['season', 'monthly', '月份'],
    // 景点相关
    '蓝湖': ['blue lagoon', '蓝色温泉'],
    '冰河湖': ['jökulsárlón', 'jokulsarlon', '杰古沙龙', '冰川湖'],
    '瀑布': ['waterfall', 'foss'],
    '冰川': ['glacier', 'ice'],
    '温泉': ['hot spring', 'geothermal'],
    '黑沙滩': ['black sand beach', 'reynisfjara'],
    // 住宿相关 - 增强关键词以提高accommodations召回
    '住宿': ['accommodation', 'accommodations', 'hotel', 'stay', 'lodging', 'booking', '酒店', '旅馆', '民宿'],
    '酒店': ['hotel', 'accommodation', 'accommodations', 'lodging', '住宿'],
    '旅馆': ['guesthouse', 'hostel', 'accommodation', '住宿'],
    '民宿': ['airbnb', 'guesthouse', 'accommodation', '住宿'],
    // 安全相关
    '安全': ['safety', 'risk', 'danger', '危险', '注意'],
    '危险': ['danger', 'risk', 'hazard', '安全'],
    '注意': ['caution', 'warning', 'note', '小心'],
    // 租车相关
    '租车': ['car rental', 'rent a car', '租赁'],
    '保险': ['insurance', '全险'],
    '四驱': ['4x4', '4wd', 'suv', '四驱车'],
    // 英文同义词
    'ring road': ['环岛', '环线', 'route 1'],
    'blue lagoon': ['蓝湖', '蓝色温泉'],
    'weather': ['天气', '气候', 'climate'],
    'safety': ['安全', '注意事项', 'risk'],
    'accommodation': ['住宿', '酒店', 'hotel'],
  };

  /**
   * 意图关键词boost配置
   * 当查询包含特定意图关键词时，优先添加核心关键词以提高召回
   */
  private readonly INTENT_BOOST: Record<string, { triggers: string[]; boostKeywords: string[] }> = {
    accommodation: {
      triggers: ['住宿', '酒店', '旅馆', '民宿', 'hotel', 'accommodation', 'stay', 'lodging'],
      boostKeywords: ['accommodations', 'accommodation', 'hotel', 'booking'],
    },
    route: {
      triggers: ['路线', '环岛', '行程', 'route', 'ring road'],
      boostKeywords: ['ring-road', 'route', 'itinerary'],
    },
    weather: {
      triggers: ['天气', '气候', '温度', 'weather', 'climate'],
      boostKeywords: ['climate', 'weather', 'seasonal'],
    },
  };

  /**
   * 提取关键词（增强版：支持同义词扩展 + 意图boost）
   */
  private extractKeywords(query: string): string[] {
    // 移除标点符号，转换为小写，分词
    const cleaned = query
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .trim();

    // 分词（中文按字符，英文按单词）
    const words = cleaned
      .split(/\s+/)
      .filter((w) => w.length >= 2) // 过滤太短的词
      .filter((w) => !this.isStopWord(w)); // 过滤停用词

    // 同义词扩展
    const expandedWords = new Set<string>(words);
    
    // 检查原始查询中的关键词短语
    const queryLower = query.toLowerCase();
    for (const [key, synonyms] of Object.entries(this.SYNONYM_MAP)) {
      if (queryLower.includes(key.toLowerCase())) {
        synonyms.forEach(syn => expandedWords.add(syn.toLowerCase()));
        this.logger.debug(`🔄 关键词扩展: "${key}" → [${synonyms.join(', ')}]`);
      }
    }

    // 检查分词后的词
    for (const word of words) {
      const synonyms = this.SYNONYM_MAP[word];
      if (synonyms) {
        synonyms.forEach(syn => expandedWords.add(syn.toLowerCase()));
      }
    }

    // 意图boost：将核心关键词放到数组前面（增加权重）
    const result = Array.from(expandedWords);
    const boostedKeywords: string[] = [];
    
    for (const [intent, config] of Object.entries(this.INTENT_BOOST)) {
      const triggered = config.triggers.some(t => queryLower.includes(t.toLowerCase()));
      if (triggered) {
        this.logger.debug(`🎯 意图boost: ${intent} → [${config.boostKeywords.join(', ')}]`);
        // 将boost关键词添加到结果前面（优先匹配）
        config.boostKeywords.forEach(kw => {
          if (!boostedKeywords.includes(kw.toLowerCase())) {
            boostedKeywords.push(kw.toLowerCase());
          }
        });
      }
    }
    
    // 将boost关键词放到最前面
    return [...boostedKeywords, ...result.filter(w => !boostedKeywords.includes(w))];
  }

  /**
   * 判断是否为停用词
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'must'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * 格式化结果
   */
  private async formatResults(
    results: Array<{
      id: string;
      chunk_id: string;
      content: string;
      type: string;
      credibility_score: number;
      keywords: string[];
      metadata: any;
      file_id: string;
      category?: string | null;
      chunk_updated_at?: Date | string | null;
      similarity: number;
    }>,
    credibilityMin: number,
    relaxSimilarityFilter = false,
  ): Promise<ChunkRetrievalResult[]> {
    // 获取文件信息
    const fileIds = [...new Set(results.map((r) => r.file_id))];
    const files = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      filename: string;
    }>>(
      `SELECT id, filename FROM knowledge_files WHERE id = ANY($1::uuid[])`,
      fileIds
    );

    const fileMap = new Map<string, string>();
    files.forEach((f: any) => {
      fileMap.set(f.id, f.filename);
    });

    // 格式化结果 - 注意：credibilityMin 用于过滤 credibility_score，不是 similarity
    // similarity 的阈值应该更低，因为向量相似度分布与 credibility 不同
    // 对于中文查询，向量相似度可能较低，需要大幅降低阈值
    // 使用动态阈值：如果credibilityMin很低（如0.0），则几乎不过滤similarity
    // 对于诊断模式（credibilityMin=0.0），完全移除similarity阈值，只依赖排序
    // Hybrid 内层 dense：不在此处按向量分过滤，交给 RRF；单独 dense 路径仍用阈值压制噪声
    const similarityThreshold =
      relaxSimilarityFilter || credibilityMin <= 0.0 ? 0 : 0.01;
    const formattedResults = results
      .filter((r) => {
        const row = r as Record<string, unknown>;
        const similarity = parsePgNumeric(pickDenseSimilarityRaw(row));
        let credibility = parsePgNumeric(pickCredibilityRaw(row));
        // Hybrid 内层 dense：SQL 已保证 c.credibility_score >= credibilityMin，JS 解析失败时不应丢行
        if (!Number.isFinite(credibility) && relaxSimilarityFilter) {
          credibility = credibilityMin;
        }
        // 对于相似度，使用动态阈值（诊断模式时完全不过滤）
        // 对于credibility，使用传入的阈值
        const similarityPass =
          similarityThreshold === 0 ? true : Number.isFinite(similarity) && similarity >= similarityThreshold;
        return similarityPass && Number.isFinite(credibility) && credibility >= credibilityMin;
      })
      .map((r) => {
        const row = r as Record<string, unknown>;
        let credOut = parsePgNumeric(pickCredibilityRaw(row));
        if (!Number.isFinite(credOut) && relaxSimilarityFilter) {
          credOut = credibilityMin;
        }
        return {
        id: r.id,
        chunkId: r.chunk_id,
        content: r.content,
        type: r.type,
        credibilityScore: Number.isFinite(credOut) ? credOut : 0,
        keywords: r.keywords || [],
        metadata: r.metadata as Record<string, any> | undefined,
        fileId: r.file_id,
        category: r.category ?? undefined,
        chunkUpdatedAt: parseChunkUpdatedAt(r.chunk_updated_at),
        similarity: parsePgNumeric(pickDenseSimilarityRaw(row)) || 0,
        sourceFile: fileMap.get(r.file_id),
      };
      });

    // 详细日志：记录过滤前后的结果数
    const beforeFilter = results.length;
    const afterFilter = formattedResults.length;
    this.logger.debug(
      `检索完成: 原始结果=${beforeFilter}, 过滤后=${afterFilter}, ` +
      `阈值=${similarityThreshold}, credibilityMin=${credibilityMin}`
    );
    
    // 如果过滤后结果为空但原始结果不为空，记录警告
    if (beforeFilter > 0 && afterFilter === 0) {
      const sims = results
        .map((r) => parsePgNumeric(pickDenseSimilarityRaw(r as Record<string, unknown>)))
        .filter((n) => Number.isFinite(n));
      const maxSim = sims.length ? Math.max(...sims) : NaN;
      const minSim = sims.length ? Math.min(...sims) : NaN;
      this.logger.warn(
        `⚠️ 所有结果被过滤: 最高相似度=${Number.isFinite(maxSim) ? maxSim.toFixed(4) : 'NaN'}, ` +
          `最低相似度=${Number.isFinite(minSim) ? minSim.toFixed(4) : 'NaN'}, 阈值=${similarityThreshold}`,
      );
    }

    return formattedResults;
  }

  /**
   * 向后兼容方法：混合检索（Chunk + DocumentIndex）
   * @deprecated 使用 retrieve() 方法，已支持 Hybrid Search
   */
  async hybridRetrieveLegacy(params: ChunkRetrievalParams & { useLegacy?: boolean }): Promise<ChunkRetrievalResult[]> {
    const { useLegacy: _useLegacy = false, ...chunkParams } = params;

    // 优先使用 Chunk 表（新系统）
    const chunkResults = await this.retrieve(chunkParams);

    // 如果需要，也可以查询 DocumentIndex（向后兼容）
    // 这里暂时只返回 Chunk 结果
    return chunkResults;
  }

  /**
   * Phase 1.2 优化: 构建缓存 key
   */
  private buildCacheKey(params: ChunkRetrievalParams): string {
    const {
      query,
      limit = 10,
      credibilityMin = 0.5,
      type,
      category,
      chunkCategory,
      fileId,
      useHybridSearch = true,
      denseWeight = 0.6,
      sparseWeight = 0.4,
      useReranking = false,
      rerankTopK = 20,
      useQueryExpansion = false,
      maxQueryVariants = 3,
      useIntentClassification = false,
    } = params;

    // 计算 query hash（前100字符）
    const queryHash = this.simpleHash(query.substring(0, 100).trim().toLowerCase());

    return `query:${queryHash}:limit:${limit}:credibilityMin:${credibilityMin}:type:${type || 'none'}:category:${category || 'none'}:chunkCategory:${chunkCategory || 'none'}:fileId:${fileId || 'none'}:hybrid:${useHybridSearch}:denseWeight:${denseWeight}:sparseWeight:${sparseWeight}:rerank:${useReranking}:rerankTopK:${rerankTopK}:expansion:${useQueryExpansion}:maxVariants:${maxQueryVariants}:intent:${useIntentClassification}`;
  }

  /**
   * Phase 1.2 优化: 简单的 hash 函数
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
   * Phase 1.2 优化: 从缓存获取结果
   */
  private async getCachedResult(cacheKey: string): Promise<ChunkRetrievalResult[] | null> {
    // L1: 检查内存缓存
    const memoryCached = this.resultCache.get(cacheKey);
    if (memoryCached && Date.now() - memoryCached.timestamp < this.l1CacheTtl) {
      // 检查版本一致性
      if (memoryCached.version === this.cacheVersion) {
        this.logger.debug(`✅ L1缓存命中: ${cacheKey}`);
        return memoryCached.results;
      } else {
        // 版本不匹配，删除旧缓存
        this.resultCache.delete(cacheKey);
        this.logger.debug(`L1缓存版本不匹配，已删除: ${cacheKey}`);
      }
    }

    // L2: 检查 Redis 缓存
    if (this.redisService) {
      try {
        const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
        const cached = await this.redisService.get<{ results: ChunkRetrievalResult[]; version: number }>(redisKey);
        if (cached && cached.version === this.cacheVersion) {
          this.logger.debug(`✅ L2缓存命中: ${cacheKey}`);

          // 回填 L1 缓存
          this.resultCache.set(cacheKey, {
            results: cached.results,
            timestamp: Date.now(),
            version: cached.version,
          });

          return cached.results;
        } else if (cached) {
          // 版本不匹配，删除 Redis 缓存
          await this.redisService.del(redisKey);
          this.logger.debug(`L2缓存版本不匹配，已删除: ${cacheKey}`);
        }
      } catch (error: any) {
        this.logger.warn(`从 L2 Redis 获取缓存失败: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Phase 1.2 优化: 写入缓存
   */
  private async writeToCache(
    cacheKey: string,
    results: ChunkRetrievalResult[],
  ): Promise<void> {
    // L1: 写入内存缓存（同步，立即可用）
    this.resultCache.set(cacheKey, {
      results,
      timestamp: Date.now(),
      version: this.cacheVersion,
    });

    // 清理过期内存缓存
    this.cleanExpiredCache();

    // L2: 写入 Redis 缓存（异步，不阻塞）
    if (this.redisService) {
      try {
        const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
        const ttlSeconds = Math.floor(this.l2CacheTtl / 1000);
        await this.redisService.set(
          redisKey,
          { results, version: this.cacheVersion },
          ttlSeconds,
        );
        this.logger.debug(`✅ RAG 结果已存入 L2 Redis: ${cacheKey} (TTL: ${ttlSeconds}s)`);
      } catch (error: any) {
        this.logger.warn(`存入 L2 Redis 失败: ${error.message}`);
      }
    }
  }

  /**
   * Phase 1.2 优化: 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.resultCache.entries()) {
      if (now - value.timestamp >= this.l1CacheTtl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.resultCache.delete(key);
    }

    // 如果内存缓存太大（超过 500 个），清理最旧的 20%
    if (this.resultCache.size > 500) {
      const entries = Array.from(this.resultCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.resultCache.delete(entries[i][0]);
      }
      this.logger.debug(`RAG 结果缓存过大，清理了最旧的 ${toRemove} 个条目`);
    }
  }

  /**
   * Phase 1.2 优化: 批量检索
   * 
   * 并行执行多个检索请求，提高性能
   */
  async batchRetrieve(
    queries: ChunkRetrievalParams[],
    options?: {
      maxConcurrency?: number;
      taskTimeout?: number;
    }
  ): Promise<Map<string, ChunkRetrievalResult[]>> {
    if (!this.parallelExecutor) {
      this.logger.warn('ParallelExecutor 不可用，使用顺序执行');
      const results = new Map<string, ChunkRetrievalResult[]>();
      for (const query of queries) {
        const cacheKey = this.buildCacheKey(query);
        const result = await this.retrieve(query);
        results.set(cacheKey, result);
      }
      return results;
    }

    const maxConcurrency = options?.maxConcurrency || 10;
    const taskTimeout = options?.taskTimeout || 5000;

    const tasks = queries.map((query) => ({
      id: this.buildCacheKey(query),
      operation: async () => this.retrieve(query),
      timeout: taskTimeout,
    }));

    const results = await this.parallelExecutor.executeAll(tasks, {
      maxConcurrency,
      taskTimeout,
      delayMs: 50, // 任务间 50ms 延迟，避免 API 限流
    });

    const resultMap = new Map<string, ChunkRetrievalResult[]>();
    for (let i = 0; i < queries.length; i++) {
      const task = tasks[i];
      const result = results[i];
      if (result.success && result.result) {
        resultMap.set(task.id, result.result);
      } else {
        this.logger.error(`批量检索失败: ${task.id}, error: ${result.error?.message}`);
        resultMap.set(task.id, []); // 失败时返回空数组
      }
    }

    const stats = this.parallelExecutor.getStats(results);
    // 计算总耗时（使用最大 duration 作为近似值，或使用 avgDuration * total）
    const totalTimeMs = Math.round(stats.avgDuration * stats.total);
    this.logger.log(
      `批量检索完成: 总数=${queries.length}, 成功=${stats.success}, ` +
      `失败=${stats.failed}, 总耗时≈${totalTimeMs}ms, ` +
      `平均耗时=${Math.round(stats.avgDuration)}ms`
    );

    return resultMap;
  }
}
