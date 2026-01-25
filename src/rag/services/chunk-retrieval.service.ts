// src/rag/services/chunk-retrieval.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { RerankingService } from './reranking.service';
import { RAGMonitoringService } from './rag-monitoring.service';
import { QueryExpansionService } from './query-expansion.service';

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
  category?: string;
  fileId?: string;
  // Hybrid Search 参数
  useHybridSearch?: boolean; // 是否使用混合检索
  denseWeight?: number; // Dense 检索权重 (默认 0.7)
  sparseWeight?: number; // Sparse 检索权重 (默认 0.3)
  sparseLimit?: number; // Sparse 检索返回数量 (默认与 limit 相同)
  // Reranking 参数
  useReranking?: boolean; // 是否使用重排序 (默认 false)
  rerankTopK?: number; // 重排序的Top-K数量 (默认 20)
  // Query Expansion 参数
  useQueryExpansion?: boolean; // 是否使用查询扩展 (默认 false)
  maxQueryVariants?: number; // 最大查询变体数量 (默认 3)
}

@Injectable()
export class ChunkRetrievalService {
  private readonly logger = new Logger(ChunkRetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    @Optional() private readonly rerankingService?: RerankingService,
    @Optional() private readonly monitoringService?: RAGMonitoringService,
    @Optional() private readonly queryExpansionService?: QueryExpansionService,
  ) {}

  /**
   * 从 Chunk 表检索相关文档
   * 
   * 支持：
   * - 纯向量检索（Dense retrieval）
   * - 混合检索（Hybrid Search: Dense + Sparse）
   * - 重排序（Reranking: 对Top-K结果重新排序）
   */
  async retrieve(params: ChunkRetrievalParams): Promise<ChunkRetrievalResult[]> {
    const {
      query,
      limit = 10,
      credibilityMin = 0.5,
      type,
      category,
      fileId,
      useHybridSearch = true, // 默认启用混合检索
      denseWeight = 0.7,
      sparseWeight = 0.3,
      useReranking = false, // 默认不启用重排序（因为会增加延迟）
      rerankTopK = 20,
      useQueryExpansion = false, // 默认不启用查询扩展（因为会增加延迟和成本）
      maxQueryVariants = 3,
    } = params;

    this.logger.debug(
      `Chunk 检索: query="${query.substring(0, 50)}...", hybrid=${useHybridSearch}, rerank=${useReranking}, expansion=${useQueryExpansion}`
    );

    const startTime = Date.now();
    let embeddingLatency: number | undefined;

    try {
      let results: ChunkRetrievalResult[];

      // 1. 如果启用查询扩展，生成查询变体并并行检索
      if (useQueryExpansion && this.queryExpansionService) {
        results = await this.retrieveWithExpansion({
          ...params,
          denseWeight,
          sparseWeight,
          maxQueryVariants,
        });
      } else {
        // 2. 执行检索（Hybrid Search 或 Dense Search）
        if (useHybridSearch) {
          results = await this.hybridRetrieve({
            ...params,
            denseWeight,
            sparseWeight,
          });
        } else {
          // 记录Embedding生成时间
          const embeddingStart = Date.now();
          results = await this.denseRetrieve(params);
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
   * Dense检索（纯向量搜索）
   */
  private async denseRetrieve(params: ChunkRetrievalParams): Promise<ChunkRetrievalResult[]> {
    const {
      query,
      limit = 10,
      credibilityMin = 0.5,
      type,
      category,
      fileId,
    } = params;

    // 1. 生成查询的 embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

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

    // 构建 FROM 子句
    let fromClause = 'FROM chunks c';
    if (category) {
      fromClause += ' INNER JOIN knowledge_files kf ON c.file_id = kf.id';
      conditions.push(`kf.category = $${paramsList.length + 1}`);
      paramsList.push(category);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
        1 - (c.embedding <=> $1::vector) as similarity
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
      similarity: number;
    }>>(querySql, ...paramsList);

    return this.formatResults(results, credibilityMin);
  }

  /**
   * Hybrid检索（Dense + Sparse）
   * 
   * 使用 Reciprocal Rank Fusion (RRF) 合并结果
   */
  private async hybridRetrieve(params: ChunkRetrievalParams & { denseWeight: number; sparseWeight: number }): Promise<ChunkRetrievalResult[]> {
    const {
      query,
      limit = 10,
      credibilityMin = 0.5,
      type,
      category,
      fileId,
      denseWeight,
      sparseWeight,
    } = params;

    // 并行执行 Dense 和 Sparse 检索
    const [denseResults, sparseResults] = await Promise.all([
      this.denseRetrieve({ ...params, useHybridSearch: false }),
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

    // 注意：RRF hybridScore 范围很小（约 0.01-0.03），不应使用 credibilityMin 过滤
    // credibilityMin 已在 SQL 查询中用于过滤 credibility_score
    // 这里只需要过滤掉 hybridScore 为 0 或负数的结果
    const filteredResults = mergedResults.filter((r) => {
      const score = r.hybridScore || r.similarity || 0;
      return score > 0;
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
    keywords.forEach((kw, idx) => {
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

    // 格式化结果，使用keyword_score作为similarity
    return results.map((r) => ({
      id: r.id,
      chunkId: r.chunk_id,
      content: r.content,
      type: r.type,
      credibilityScore: parseFloat(String(r.credibility_score)),
      keywords: r.keywords || [],
      metadata: r.metadata as Record<string, any> | undefined,
      fileId: r.file_id,
      similarity: Math.min(parseFloat(String(r.keyword_score)) / 100, 1), // 归一化到0-1
      sparseScore: Math.min(parseFloat(String(r.keyword_score)) / 100, 1),
      sourceFile: fileMap.get(r.file_id),
    }));
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
      .slice(0, limit);

    return merged;
  }

  /**
   * 提取关键词（简单实现）
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

    return words;
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
      similarity: number;
    }>,
    credibilityMin: number
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
    // similarity 的阈值应该更低（如 0.1-0.3），因为向量相似度分布与 credibility 不同
    const similarityThreshold = 0.1; // 向量相似度最低阈值
    const formattedResults = results
      .filter((r) => r.similarity >= similarityThreshold && r.credibility_score >= credibilityMin)
      .map((r) => ({
        id: r.id,
        chunkId: r.chunk_id,
        content: r.content,
        type: r.type,
        credibilityScore: parseFloat(String(r.credibility_score)),
        keywords: r.keywords || [],
        metadata: r.metadata as Record<string, any> | undefined,
        fileId: r.file_id,
        similarity: parseFloat(String(r.similarity)),
        sourceFile: fileMap.get(r.file_id),
      }));

    this.logger.debug(`检索完成: 找到 ${formattedResults.length} 个相关文档`);

    return formattedResults;
  }

  /**
   * 向后兼容方法：混合检索（Chunk + DocumentIndex）
   * @deprecated 使用 retrieve() 方法，已支持 Hybrid Search
   */
  async hybridRetrieveLegacy(params: ChunkRetrievalParams & { useLegacy?: boolean }): Promise<ChunkRetrievalResult[]> {
    const { useLegacy = false, ...chunkParams } = params;

    // 优先使用 Chunk 表（新系统）
    const chunkResults = await this.retrieve(chunkParams);

    // 如果需要，也可以查询 DocumentIndex（向后兼容）
    // 这里暂时只返回 Chunk 结果
    return chunkResults;
  }
}
