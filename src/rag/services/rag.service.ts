// src/rag/services/rag.service.ts
/**
 * RAG 服务（通用检索服务）
 * 
 * ⚠️ 注意：此服务基于 DocumentIndex 表（旧系统）
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
    this.logger.warn('⚠️ RagService 使用 DocumentIndex 表（旧系统），建议迁移到 ChunkRetrievalService');
  }

  /**
   * 检索相关文档
   * 
   * ⚠️ 基于 DocumentIndex 表（旧系统）
   * ✅ 推荐使用 ChunkRetrievalService.retrieve()（支持 Hybrid Search）
   * 
   * @deprecated 新代码应使用 ChunkRetrievalService
   */
  async retrieve(params: RagRetrievalParams): Promise<RagRetrievalResult[]> {
    const { query, collection, limit = 10, countryCode, tags, minScore = 0.5 } = params;

    this.logger.debug(`RAG 检索: collection=${collection}, query="${query.substring(0, 50)}..."`);

    try {
      // 1. 生成查询的 embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

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
      // 注意：这里需要先确保 DocumentIndex 表有 embedding 字段和索引
      let whereClause = Prisma.sql`WHERE collection = ${collection} AND embedding IS NOT NULL`;
      
      if (countryCode) {
        whereClause = Prisma.sql`${whereClause} AND "country_code" = ${countryCode}`;
      }
      
      if (tags && tags.length > 0) {
        whereClause = Prisma.sql`${whereClause} AND tags && ${tags}::text[]`;
      }

      const results = await this.prisma.$queryRaw<Array<{
        id: string;
        title: string;
        content: string;
        source: string | null;
        metadata: any;
        score: number;
      }>>`
        SELECT 
          id,
          title,
          content,
          source,
          metadata,
          1 - (embedding <=> ${queryEmbedding}::vector) as score
        FROM "document_index"
        ${whereClause}
        ORDER BY embedding <=> ${queryEmbedding}::vector
        LIMIT ${limit}
      `;

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
      this.logger.error(`RAG 检索失败: ${error.message}`, error.stack);
      
      // 降级策略：使用关键词搜索
      return await this.fallbackKeywordSearch(params);
    }
  }

  /**
   * 降级策略：关键词搜索
   */
  private async fallbackKeywordSearch(params: RagRetrievalParams): Promise<RagRetrievalResult[]> {
    const { query, collection, limit = 10, countryCode, tags } = params;

    this.logger.warn('使用降级策略：关键词搜索');

    const where: any = {
      collection,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (countryCode) {
      where.countryCode = countryCode;
    }

    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    const documents = await this.prisma.documentIndex.findMany({
      where,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return documents.map(doc => ({
      id: doc.id,
      content: doc.content,
      title: doc.title,
      source: doc.source || undefined,
      score: 0.5, // 关键词搜索没有相似度分数
      metadata: doc.metadata as Record<string, any> | undefined,
    }));
  }

  /**
   * 索引文档（添加文档到索引库）
   */
  async indexDocument(item: DocumentIndexItem): Promise<string> {
    this.logger.debug(`索引文档: collection=${item.collection}, title="${item.title?.substring(0, 50) || 'untitled'}..."`);

    try {
      // 1. 生成 embedding
      const textToEmbed = `${item.title || ''}\n\n${item.content}`;
      const embedding = await this.embeddingService.generateEmbedding(textToEmbed);

      // 2. 将 embedding 数组转换为 PostgreSQL vector 格式字符串
      // 格式: '[0.1, 0.2, 0.3, ...]'
      const embeddingStr = `[${embedding.join(',')}]`;

      // 3. 保存到数据库
      // 注意：使用字符串格式传递 vector，避免类型推断问题
      const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "document_index" (
          id, collection, title, content, embedding, source, "country_code", tags, metadata, "created_at", "updated_at"
        )
        VALUES (
          gen_random_uuid(),
          ${item.collection},
          ${item.title || 'Untitled'},
          ${item.content},
          ${embeddingStr}::vector,
          ${item.source || null},
          ${item.countryCode || null},
          ${item.tags || []}::text[],
          ${item.metadata ? JSON.stringify(item.metadata) : null}::jsonb,
          NOW(),
          NOW()
        )
        RETURNING id
      `;

      const id = result[0]?.id;
      this.logger.debug(`文档索引完成: id=${id}`);

      return id || '';
    } catch (error: any) {
      this.logger.error(`文档索引失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 批量索引文档
   */
  async indexDocuments(items: DocumentIndexItem[]): Promise<string[]> {
    const ids: string[] = [];

    for (const item of items) {
      try {
        const id = await this.indexDocument(item);
        ids.push(id);
      } catch (error: any) {
        this.logger.error(`批量索引文档失败: ${error.message}`);
      }
    }

    return ids;
  }

  /**
   * 删除文档索引
   */
  async deleteDocument(id: string): Promise<void> {
    await this.prisma.documentIndex.delete({
      where: { id },
    });
  }

  /**
   * 更新文档索引
   */
  async updateDocument(id: string, item: Partial<DocumentIndexItem>): Promise<void> {
    const updateData: any = {};

    if (item.title) updateData.title = item.title;
    if (item.content) {
      updateData.content = item.content;
      // 如果内容更新，重新生成 embedding
      const textToEmbed = `${item.title || ''}\n\n${item.content}`;
      const embedding = await this.embeddingService.generateEmbedding(textToEmbed);
      updateData.embedding = embedding;
    }
    if (item.source !== undefined) updateData.source = item.source;
    if (item.countryCode !== undefined) updateData.countryCode = item.countryCode;
    if (item.tags) updateData.tags = item.tags;
    if (item.metadata) updateData.metadata = item.metadata;

    updateData.updatedAt = new Date();

    // 使用原始 SQL 更新（因为 embedding 字段）
    if (updateData.embedding) {
      // 将 embedding 数组转换为 PostgreSQL vector 格式字符串
      const embeddingStr = `[${updateData.embedding.join(',')}]`;
      
      await this.prisma.$executeRaw`
        UPDATE "document_index"
        SET 
          title = COALESCE(${updateData.title}, title),
          content = COALESCE(${updateData.content}, content),
          embedding = ${embeddingStr}::vector,
          source = COALESCE(${updateData.source}, source),
          "country_code" = COALESCE(${updateData.countryCode}, "country_code"),
          tags = COALESCE(${updateData.tags}::text[], tags),
          metadata = COALESCE(${updateData.metadata}::jsonb, metadata),
          "updated_at" = NOW()
        WHERE id = ${id}
      `;
    } else {
      await this.prisma.documentIndex.update({
        where: { id },
        data: updateData,
      });
    }
  }

  /**
   * 获取文档列表（后台管理）
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
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { collection, countryCode, tags, search, page = 1, pageSize = 20 } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (collection) where.collection = collection;
    if (countryCode) where.countryCode = countryCode;
    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [documents, total] = await Promise.all([
      this.prisma.documentIndex.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          collection: true,
          title: true,
          content: true,
          source: true,
          countryCode: true,
          tags: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.documentIndex.count({ where }),
    ]);

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
  } | null> {
    return this.prisma.documentIndex.findUnique({
      where: { id },
      select: {
        id: true,
        collection: true,
        title: true,
        content: true,
        source: true,
        countryCode: true,
        tags: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 获取 RAG 统计信息
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
      // 获取总文档数
      const totalCount = await this.prisma.documentIndex.count({
        where: collection ? { collection } : undefined,
      });

      // 获取集合统计
      const collectionStats = await this.prisma.$queryRaw<Array<{
        collection: string;
        count: bigint;
        countries: string[];
        tags: string[];
      }>>`
        SELECT 
          d.collection,
          COUNT(*)::bigint as count,
          ARRAY_AGG(DISTINCT d."country_code") FILTER (WHERE d."country_code" IS NOT NULL) as countries,
          (
            SELECT ARRAY_AGG(DISTINCT t.tag)
            FROM "document_index" d2, LATERAL unnest(d2.tags) AS t(tag)
            WHERE d2.collection = d.collection
          ) as tags
        FROM "document_index" d
        ${collection ? Prisma.sql`WHERE d.collection = ${collection}` : Prisma.empty}
        GROUP BY d.collection
        ORDER BY d.collection
      `;

      const collections = collectionStats.map((stat) => ({
        name: stat.collection,
        count: Number(stat.count),
        countries: stat.countries || [],
        tags: stat.tags || [],
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

