// src/rag/services/rag.service.ts
/**
 * RAG 服务（通用检索服务）
 * 
 * ✅ 统一使用新系统：KnowledgeFile + Chunks 表
 * ✅ 推荐使用 ChunkRetrievalService（基于 Chunk 表，支持 Hybrid Search）
 * 
 * 提供文档索引、向量检索、相似度搜索等功能
 * 
 * @deprecated 新代码应使用 ChunkRetrievalService
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EmbeddingService } from '../../places/services/embedding.service';
import { RagRetrievalParams, RagRetrievalResult, DocumentIndexItem } from '../interfaces/rag.interface';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.logger.log('✅ RagService 已统一使用新系统：KnowledgeFile + Chunks');
  }

  /**
   * 检索相关文档
   * 
   * ⚠️ 已废弃：document_index表已删除
   * ✅ 推荐使用 ChunkRetrievalService.retrieve()（基于chunks表，支持 Hybrid Search）
   * 
   * @deprecated document_index表已删除，此方法不再可用，请使用ChunkRetrievalService
   */
  async retrieve(params: RagRetrievalParams): Promise<RagRetrievalResult[]> {
    const { query, collection, limit = 10, countryCode, tags, minScore = 0.5 } = params;

    // Compat: keep legacy RagService.retrieve working for tests/older callers.
    // New code should use ChunkRetrievalService.
    this.logger.warn('⚠️  RagService.retrieve() 兼容模式：建议迁移到 ChunkRetrievalService');

    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;

    let results: Array<{
      id: string;
      title: string;
      content: string;
      source: string | null;
      metadata: any;
      score: number;
    }> = [];
    try {
      results = await this.prisma.$queryRaw(
        Prisma.sql`
          /* rag.retrieve compat */
          SELECT id, title, content, source, metadata, score
          FROM document_index
          WHERE collection = ${collection}
            AND (${countryCode}::text IS NULL OR country_code = ${countryCode})
            AND (${tags as any}::text[] IS NULL OR tags && ${tags as any}::text[])
            AND embedding IS NOT NULL
          ORDER BY embedding <=> ${queryEmbeddingStr}::vector
          LIMIT ${limit}
        `,
      );
    } catch (e: any) {
      // If the legacy table is actually missing, keep the contract: return empty results.
      if (String(e?.message ?? '').includes('document_index') || String(e?.message ?? '').includes('relation')) {
        return [];
      }
      throw e;
    }

    return (results ?? [])
      .filter((r) => (typeof r.score === 'number' ? r.score : 0) >= minScore)
      .map((r) => ({
        id: r.id,
        content: r.content,
        title: r.title,
        source: r.source || undefined,
        score: Number(r.score),
        metadata: (r.metadata as Record<string, any> | undefined) ?? undefined,
      }));
  }

    /* Original implementation (document_index removed in prod)
    async retrieve_OLD(params: RagRetrievalParams): Promise<RagRetrievalResult[]> {
    const { query, collection, limit = 10, countryCode, tags, minScore = 0.5 } = params;

    this.logger.debug(`RAG 检索: collection=${collection}, query="${query.substring(0, 50)}..."`);
    
    // 警告：document_index表已清空，建议使用ChunkRetrievalService
    this.logger.warn(
      '⚠️  document_index表已清空，RagService.retrieve()将返回空结果。建议使用ChunkRetrievalService（基于chunks表）'
    );

    try {
      // 1. 生成查询的 embedding（强制使用1024维，BGE-M3）
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // 验证embedding维度（必须为1024维）
      const embeddingDimension = queryEmbedding.length;
      if (embeddingDimension !== 1024) {
        this.logger.warn(
          `Embedding维度不匹配: 期望1024维，实际${embeddingDimension}维。请确保使用BGE-M3（python provider）`
        );
      }
      
      // 注意：document_index表可能仍使用旧维度（1536维），如果维度不匹配会报错
      // 建议使用ChunkRetrievalService（基于chunks表，1024维，新系统）

      // 2. 构建查询条件
      const where: any = {
        collection,
      };

      if (countryCode) {
        where.countryCode = countryCode;
      }

      if (tags && tags.length > 0) {
        where.tags = { hasSome: tags };
      }

      // 3. 向量相似度搜索（使用 pgvector）
      // 注意：document_index表可能仍使用旧维度（1536），需要检查并匹配
      // 将 embedding 数组转换为 PostgreSQL vector 格式字符串
      const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;
      
      // 检查document_index表中的实际向量维度
      // 如果维度不匹配，会抛出错误，需要迁移数据或使用ChunkRetrievalService
      
      // 构建WHERE子句和参数
      const whereConditions: string[] = ['embedding IS NOT NULL'];
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      // collection参数
      whereConditions.push(`collection = $${paramIndex}`);
      queryParams.push(collection);
      paramIndex++;
      
      if (countryCode) {
        whereConditions.push(`"country_code" = $${paramIndex}`);
        queryParams.push(countryCode);
        paramIndex++;
      }
      
      if (tags && tags.length > 0) {
        whereConditions.push(`tags && $${paramIndex}::text[]`);
        queryParams.push(tags);
        paramIndex++;
      }
      
      // embedding向量参数（用于相似度计算）
      const embeddingParamIndex = paramIndex;
      queryParams.push(queryEmbeddingStr);
      paramIndex++;
      
      // limit参数
      const limitParamIndex = paramIndex;
      queryParams.push(limit);
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // 使用 $queryRawUnsafe 来构建动态SQL查询
      const querySql = `
        SELECT 
          id,
          title,
          content,
          source,
          metadata,
          1 - (embedding <=> $${embeddingParamIndex}::vector) as score
        FROM "document_index"
        ${whereClause}
        ORDER BY embedding <=> $${embeddingParamIndex}::vector
        LIMIT $${limitParamIndex}
      `;

      const results = await this.prisma.$queryRawUnsafe<Array<{
        id: string;
        title: string;
        content: string;
        source: string | null;
        metadata: any;
        score: number;
      }>>(querySql, ...queryParams);

      // 4. 过滤低分结果
      const filteredResults = results
        .filter(r => r.score >= minScore)
        .map(r => ({
          id: r.id,
          content: r.content,
          title: r.title,
          source: r.source || undefined,
          score: parseFloat(r.score as any),
          metadata: r.metadata as Record<string, any> | undefined,
        }));

      this.logger.debug(`RAG 检索完成: 找到 ${filteredResults.length} 个相关文档`);

      return filteredResults;
    } catch (error: any) {
      // 检查是否是维度不匹配错误
      if (error.message?.includes('different vector dimensions')) {
        const errorMsg = `向量维度不匹配: document_index表可能仍使用1536维（旧数据），但系统已统一使用1024维（BGE-M3）。建议使用ChunkRetrievalService（基于chunks表，1024维）`;
        this.logger.error(errorMsg);
        // 不降级到关键词搜索，直接抛出错误，让调用方知道问题
        throw new Error(errorMsg);
      }
      
      this.logger.error(`RAG 检索失败: ${error.message}`, error.stack);
      
      // 降级策略：使用关键词搜索
      return await this.fallbackKeywordSearch(params);
    }
    */

  /**
   * 降级策略：关键词搜索
   * 
   * ⚠️ 已废弃：document_index表已删除
   * 
   * @deprecated document_index表已删除，此方法不再可用
   */
  private async fallbackKeywordSearch(_params: RagRetrievalParams): Promise<RagRetrievalResult[]> {
    // document_index表已删除，返回空结果
    this.logger.warn('document_index表已删除，降级策略不再可用');
    return [];
  }

  /**
   * 索引文档（添加文档到索引库）
   * 
   * ⚠️ 已废弃：document_index表已删除
   * ✅ 推荐使用新系统（KnowledgeFile + Chunks）
   * 
   * @deprecated document_index表已删除，此方法不再可用
   */
  async indexDocument(_item: DocumentIndexItem): Promise<string> {
    this.logger.warn(
      '⚠️  document_index表已删除，RagService.indexDocument()不再可用。请使用新系统（KnowledgeFile + Chunks）'
    );
    throw new Error('document_index表已删除，请使用新系统（KnowledgeFile + Chunks）进行索引');
    
    /* 原实现已注释（document_index表已删除）
    async indexDocument_OLD(item: DocumentIndexItem): Promise<string> {
      // ... 原实现代码 ...
    */
  }

  /**
   * 批量索引文档
   * 
   * ⚠️ 已废弃：document_index表已删除
   * ✅ 推荐使用新系统（KnowledgeFile + Chunks）
   * 
   * @deprecated document_index表已删除，此方法不再可用
   */
  async indexDocuments(_items: DocumentIndexItem[]): Promise<string[]> {
    this.logger.warn(
      '⚠️  document_index表已删除，RagService.indexDocuments()不再可用。请使用新系统（KnowledgeFile + Chunks）'
    );
    throw new Error('document_index表已删除，请使用新系统（KnowledgeFile + Chunks）进行索引');
  }

  /**
   * 删除文档索引
   * 
   * ⚠️ 已废弃：document_index表已删除
   * 
   * @deprecated document_index表已删除，此方法不再可用
   */
  async deleteDocument(_id: string): Promise<void> {
    this.logger.warn(
      '⚠️  document_index表已删除，RagService.deleteDocument()不再可用'
    );
    throw new Error('document_index表已删除');
  }

  /**
   * 更新文档索引
   * 
   * ⚠️ 已废弃：document_index表已删除
   * 
   * @deprecated document_index表已删除，此方法不再可用
   */
  async updateDocument(_id: string, _item: Partial<DocumentIndexItem>): Promise<void> {
    this.logger.warn(
      '⚠️  document_index表已删除，RagService.updateDocument()不再可用'
    );
    throw new Error('document_index表已删除');
  }

  /**
   * 获取文档列表（后台管理）
   * 统一使用新系统：KnowledgeFile + Chunks
   */
  async getDocuments(params: {
    collection?: string;
    countryCode?: string;
    tags?: string[];
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    documents: Array<{
      id: string;
      collection: string;
      title: string;
      content: string;
      source: string | null;
      countryCode: string | null;
      tags: string[];
      metadata: any;
      createdAt: Date;
      updatedAt: Date;
      fileId?: string;
      chunksCount?: number;
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { collection, search, page = 1, pageSize = 20 } = params;
    const skip = (page - 1) * pageSize;

    // 使用新系统：KnowledgeFile表
    const where: any = {};
    
    // collection映射到category
    if (collection) {
      where.category = collection;
    }
    
    // search搜索文件名和路径
    if (search) {
      where.OR = [
        { filename: { contains: search, mode: 'insensitive' } },
        { filepath: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [files, total] = await Promise.all([
      this.prisma.knowledgeFile.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { chunks: true },
          },
          chunks: {
            take: 3, // 列表接口只取前3个chunks用于预览
            orderBy: { createdAt: 'asc' },
            select: {
              content: true,
              type: true,
            },
          },
        },
      }),
      this.prisma.knowledgeFile.count({ where }),
    ]);

    // 转换为文档格式（兼容旧API格式）
    const documents = files.map(file => {
      // 聚合chunks内容作为文档内容预览（列表接口）
      const contentPreview = file.chunks.length > 0
        ? file.chunks
            .map(chunk => `[${chunk.type}] ${chunk.content}`)
            .join('\n\n---\n\n')
            .substring(0, 500) + (file.chunks.length > 0 ? '...' : '')
        : `文件: ${file.filename}\n路径: ${file.filepath}\n类别: ${file.category}`;
      
      return {
        id: file.id,
        collection: file.category, // category映射到collection
        title: file.filename,
        content: contentPreview, // 使用chunks的实际内容
        source: file.filepath,
        countryCode: null, // KnowledgeFile表没有countryCode字段
        tags: file.dataSources || [],
        metadata: {
          version: file.version,
          language: file.language,
          credibilityScore: file.credibilityScore,
          dataSources: file.dataSources,
          category: file.category,
          filepath: file.filepath,
          filename: file.filename,
        },
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        fileId: file.id,
        chunksCount: file._count.chunks,
      };
    });

    return {
      documents,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取文档详情（后台管理）
   * 统一使用新系统：KnowledgeFile + Chunks
   */
  async getDocument(id: string): Promise<{
    id: string;
    collection: string;
    title: string;
    content: string;
    source: string | null;
    countryCode: string | null;
    tags: string[];
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
    fileId?: string;
    chunksCount?: number;
    chunks?: Array<{
      id: string;
      chunkId: string;
      content: string;
      type: string;
      similarity?: number;
    }>;
  } | null> {
    // 使用新系统：KnowledgeFile表
    const file = await this.prisma.knowledgeFile.findUnique({
      where: { id },
      include: {
        chunks: {
          take: 10, // 返回前10个chunks作为预览
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            chunkId: true,
            content: true,
            type: true,
          },
        },
        _count: {
          select: { chunks: true },
        },
      },
    });

    if (!file) {
      return null;
    }

    // 聚合chunks内容作为文档内容
    const content = file.chunks
      .map(chunk => `[${chunk.type}] ${chunk.content.substring(0, 500)}`)
      .join('\n\n---\n\n') || `文件: ${file.filename}\n路径: ${file.filepath}`;

    return {
      id: file.id,
      collection: file.category,
      title: file.filename,
      content,
      source: file.filepath,
      countryCode: null,
      tags: file.dataSources || [],
      metadata: {
        version: file.version,
        language: file.language,
        credibilityScore: file.credibilityScore,
        dataSources: file.dataSources,
        category: file.category,
        filepath: file.filepath,
        filename: file.filename,
      },
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      fileId: file.id,
      chunksCount: file._count.chunks,
      chunks: file.chunks.map(chunk => ({
        id: chunk.id,
        chunkId: chunk.chunkId,
        content: chunk.content,
        type: chunk.type,
      })),
    };
  }

  /**
   * 获取 RAG 统计信息
   * 统一使用新系统：KnowledgeFile + Chunks
   */
  async getStats(collection?: string): Promise<{
    totalDocuments: number;
    collections: Array<{
      name: string;
      count: number;
      countries: string[];
    }>;
    byCollection?: {
      name: string;
      count: number;
      countries: string[];
      tags: string[];
    };
  }> {
    try {
      // 使用新系统：KnowledgeFile表
      const where = collection ? { category: collection } : undefined;
      
      // 获取总文档数
      const totalCount = await this.prisma.knowledgeFile.count({
        where,
      });

      // 获取类别统计
      const categoryStats = await this.prisma.$queryRaw<Array<{
        category: string;
        count: bigint;
        chunks_count: bigint;
      }>>`
        SELECT 
          kf.category,
          COUNT(DISTINCT kf.id)::bigint as count,
          COUNT(c.id)::bigint as chunks_count
        FROM knowledge_files kf
        LEFT JOIN chunks c ON c.file_id = kf.id
        ${collection ? Prisma.sql`WHERE kf.category = ${collection}` : Prisma.empty}
        GROUP BY kf.category
        ORDER BY kf.category
      `;

      const collections = categoryStats.map((stat) => ({
        name: stat.category,
        count: Number(stat.count),
        countries: [], // KnowledgeFile表没有countryCode字段
        tags: [], // 可以从dataSources提取
      }));

      const result: any = {
        totalDocuments: totalCount,
        collections,
      };

      // 如果指定了集合，返回该集合的详细信息
      if (collection) {
        const collectionInfo = collections.find((c) => c.name === collection);
        if (collectionInfo) {
          result.byCollection = collectionInfo;
        }
      }

      return result;
    } catch (error: any) {
      this.logger.error(`获取 RAG 统计失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

