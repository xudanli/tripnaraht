// src/rag/services/rag.service.ts
/**
 * RAG 服务（通用检索服务）
 * 
 * 提供文档索引、向量检索、相似度搜索等功能
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
  ) {}

  /**
   * 检索相关文档
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
    this.logger.debug(`索引文档: collection=${item.collection}, title="${item.title.substring(0, 50)}..."`);

    try {
      // 1. 生成 embedding
      const textToEmbed = `${item.title}\n\n${item.content}`;
      const embedding = await this.embeddingService.generateEmbedding(textToEmbed);

      // 2. 保存到数据库
      // 注意：由于 Prisma 不支持直接插入 vector 类型，我们需要使用原始 SQL
      const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "document_index" (
          id, collection, title, content, embedding, source, "country_code", tags, metadata, "created_at", "updated_at"
        )
        VALUES (
          gen_random_uuid(),
          ${item.collection},
          ${item.title},
          ${item.content},
          ${embedding}::vector,
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
      await this.prisma.$executeRaw`
        UPDATE "document_index"
        SET 
          title = COALESCE(${updateData.title}, title),
          content = COALESCE(${updateData.content}, content),
          embedding = ${updateData.embedding}::vector,
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
}

