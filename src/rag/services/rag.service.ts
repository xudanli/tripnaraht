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

import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EmbeddingService } from '../../places/services/embedding.service';
import { IndexingService } from '../../knowledge-base/services/indexing.service';
import type { KBFileData } from '../../knowledge-base/interfaces/knowledge-base.interface';
import { RagRetrievalParams, RagRetrievalResult, DocumentIndexItem } from '../interfaces/rag.interface';
import {
  assertSubTypeAllowed,
  canonicalFromStoredCategory,
  expandCollectionForFilter,
  normalizeCollectionForWrite,
  outboundCollection,
} from '../taxonomy/knowledge-taxonomy';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly indexingService: IndexingService,
  ) {
    this.logger.log('✅ RagService 已统一使用新系统：KnowledgeFile + Chunks');
  }

  /** 将管理端正文解析为 JSON 对象或保留纯文本 */
  private parseDocumentContent(content: string): unknown {
    const trimmed = content.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(content) as unknown;
      } catch {
        /* 非法 JSON，按原文存储 */
      }
    }
    return content;
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
   * 删除知识库文档（`knowledge_files`）。关联 `chunks` 由 Prisma 关系 `onDelete: Cascade` 一并删除。
   */
  async deleteDocument(id: string): Promise<void> {
    const existing = await this.prisma.knowledgeFile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw Object.assign(new Error('文档不存在'), { code: 'NOT_FOUND' });
    }
    await this.prisma.knowledgeFile.delete({ where: { id } });
    this.logger.log(`已删除 RAG 文档（KnowledgeFile）: ${id}`);
  }

  /**
   * 管理端新建：写入 knowledge_files 并分块、向量化（与磁盘 Loader 索引链路一致）。
   */
  async createKnowledgeDocument(item: DocumentIndexItem): Promise<string> {
    const title = item.title?.trim();
    const collection = item.collection?.trim();
    const contentRaw = item.content;

    if (!title) {
      throw new Error('title 不能为空');
    }
    if (!collection) {
      throw new Error('collection 不能为空');
    }
    if (
      contentRaw === undefined ||
      contentRaw === null ||
      String(contentRaw).trim() === ''
    ) {
      throw new Error('content 不能为空');
    }

    const contentStr =
      typeof contentRaw === 'string' ? contentRaw : String(contentRaw);
    const parsed = this.parseDocumentContent(contentStr);

    const slug =
      title
        .replace(/[^\w\u4e00-\u9fa5.-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'doc';
    const filename = `${slug}_${randomUUID().slice(0, 12)}.json`;

    const canonical = normalizeCollectionForWrite(collection);
    assertSubTypeAllowed(canonical, item.subType);

    const kbFile: KBFileData = {
      filename,
      filepath: filename,
      content: parsed,
      metadata: {
        version: '1.0.0',
        credibility_score: 0.85,
        language: 'zh-CN',
        data_sources: item.tags ?? [],
        last_updated: new Date().toISOString(),
      },
    };

    const fileId = await this.indexingService.indexSingleFile(kbFile, canonical);

    await this.prisma.knowledgeFile.update({
      where: { id: fileId },
      data: {
        countryCode: item.countryCode?.trim() || null,
        source: item.source?.trim() || null,
        dataSources: item.tags ?? [],
        subType: item.subType?.trim() || null,
        adminMetadata: (item.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    return fileId;
  }

  /**
   * 更新知识库文档（KnowledgeFile + Chunks）：部分字段更新；传入 content 时会删除旧 chunks 并重新分块、向量化。
   */
  async updateDocument(id: string, item: Partial<DocumentIndexItem>): Promise<void> {
    const existing = await this.prisma.knowledgeFile.findUnique({ where: { id } });
    if (!existing) {
      throw Object.assign(new Error('文档不存在'), { code: 'NOT_FOUND' });
    }

    const touched =
      item.title !== undefined ||
      item.collection !== undefined ||
      item.subType !== undefined ||
      item.countryCode !== undefined ||
      item.source !== undefined ||
      item.tags !== undefined ||
      item.metadata !== undefined ||
      item.content !== undefined;

    if (!touched) {
      return;
    }

    const data: Prisma.KnowledgeFileUpdateInput = {
      lastUpdated: new Date(),
    };

    if (item.title !== undefined) {
      const name = item.title.trim();
      if (!name) {
        throw new Error('title 不能为空');
      }
      if (name !== existing.filename) {
        const clash = await this.prisma.knowledgeFile.findFirst({
          where: { filename: name, NOT: { id } },
          select: { id: true },
        });
        if (clash) {
          throw new Error(`文件名已存在: ${name}`);
        }
      }
      data.filename = name;
      data.filepath = name;
    }

    if (item.collection !== undefined) {
      data.category = normalizeCollectionForWrite(item.collection.trim());
    }

    if (item.subType !== undefined) {
      const effectiveCanon =
        item.collection !== undefined
          ? normalizeCollectionForWrite(item.collection.trim())
          : canonicalFromStoredCategory(existing.category);
      assertSubTypeAllowed(effectiveCanon, item.subType);
      data.subType = item.subType?.trim() ? item.subType.trim() : null;
    }

    if (item.countryCode !== undefined) {
      const cc = item.countryCode.trim();
      data.countryCode = cc || null;
    }

    if (item.source !== undefined) {
      const s = item.source.trim();
      data.source = s || null;
    }

    if (item.tags !== undefined) {
      data.dataSources = item.tags;
    }

    if (item.metadata !== undefined) {
      const prev =
        existing.adminMetadata &&
        typeof existing.adminMetadata === 'object' &&
        !Array.isArray(existing.adminMetadata)
          ? (existing.adminMetadata as Record<string, unknown>)
          : {};
      data.adminMetadata = { ...prev, ...item.metadata } as Prisma.InputJsonValue;
    }

    let updated = existing;
    try {
      updated = await this.prisma.knowledgeFile.update({
        where: { id },
        data,
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new Error('文件名已存在');
      }
      throw e;
    }

    if (item.content !== undefined) {
      const parsed = this.parseDocumentContent(item.content);
      const kbFile: KBFileData = {
        filename: updated.filename,
        filepath: updated.filepath,
        content: parsed,
        metadata: {
          version: updated.version,
          credibility_score: updated.credibilityScore,
          language: updated.language,
          data_sources: updated.dataSources,
          last_updated: updated.lastUpdated.toISOString(),
        },
      };
      await this.indexingService.replaceChunksForFile(
        id,
        kbFile,
        updated.category,
      );
    }
  }

  /**
   * 获取文档列表（后台管理）
   * 统一使用新系统：KnowledgeFile + Chunks
   */
  async getDocuments(params: {
    collection?: string;
    subType?: string;
    countryCode?: string;
    tags?: string[];
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    documents: Array<{
      id: string;
      collection: string;
      subType?: string;
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
    const { collection, subType, countryCode, tags, search, page = 1, pageSize = 20 } =
      params;
    const skip = (page - 1) * pageSize;

    // 使用新系统：KnowledgeFile表
    const where: any = {};

    if (collection?.trim()) {
      where.category = { in: expandCollectionForFilter(collection.trim()) };
    }

    if (subType?.trim()) {
      where.subType = subType.trim();
    }

    if (countryCode) {
      where.countryCode = countryCode;
    }

    if (tags && tags.length > 0) {
      where.dataSources = { hasSome: tags };
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
        collection: outboundCollection(file.category),
        subType: file.subType ?? undefined,
        title: file.filename,
        content: contentPreview, // 使用chunks的实际内容
        source: file.source ?? file.filepath,
        countryCode: file.countryCode ?? null,
        tags: file.dataSources || [],
        metadata: {
          version: file.version,
          language: file.language,
          credibilityScore: file.credibilityScore,
          dataSources: file.dataSources,
          category: file.category,
          filepath: file.filepath,
          filename: file.filename,
          ...(typeof file.adminMetadata === 'object' &&
          file.adminMetadata !== null &&
          !Array.isArray(file.adminMetadata)
            ? (file.adminMetadata as Record<string, unknown>)
            : {}),
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
    subType?: string;
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

    // 聚合全文（管理端编辑需要完整正文；列表接口仍用截断预览）
    const content =
      file.chunks.length > 0
        ? file.chunks
            .map(chunk => `[${chunk.type}] ${chunk.content}`)
            .join('\n\n---\n\n')
        : `文件: ${file.filename}\n路径: ${file.filepath}`;

    return {
      id: file.id,
      collection: outboundCollection(file.category),
      subType: file.subType ?? undefined,
      title: file.filename,
      content,
      source: file.source ?? file.filepath,
      countryCode: file.countryCode ?? null,
      tags: file.dataSources || [],
      metadata: {
        version: file.version,
        language: file.language,
        credibilityScore: file.credibilityScore,
        dataSources: file.dataSources,
        category: file.category,
        filepath: file.filepath,
        filename: file.filename,
        ...(typeof file.adminMetadata === 'object' &&
        file.adminMetadata !== null &&
        !Array.isArray(file.adminMetadata)
          ? (file.adminMetadata as Record<string, unknown>)
          : {}),
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
      rawCategory: string;
      count: number;
      countries: string[];
    }>;
    byCollection?: {
      name: string;
      rawCategory: string;
      count: number;
      countries: string[];
      tags: string[];
    };
    /** 按表中 category + sub_type 聚合（迁移期 sub_type 可为空） */
    byCategoryAndSubType: Array<{
      collectionCanonical: string;
      rawCategory: string;
      subType: string | null;
      count: number;
    }>;
  }> {
    try {
      const where =
        collection?.trim() !== undefined && collection.trim() !== ''
          ? { category: { in: expandCollectionForFilter(collection.trim()) } }
          : undefined;

      const totalCount = await this.prisma.knowledgeFile.count({ where });

      const categoryGroups = await this.prisma.knowledgeFile.groupBy({
        by: [Prisma.KnowledgeFileScalarFieldEnum.category],
        where,
        _count: true,
      });

      const collections = categoryGroups.map((row) => ({
        name: outboundCollection(row.category),
        rawCategory: row.category,
        count: row._count,
        countries: [] as string[],
      }));

      const breakdown = await this.prisma.knowledgeFile.groupBy({
        by: [
          Prisma.KnowledgeFileScalarFieldEnum.category,
          Prisma.KnowledgeFileScalarFieldEnum.subType,
        ],
        where,
        _count: true,
      });

      const byCategoryAndSubType = breakdown.map((row) => ({
        collectionCanonical: outboundCollection(row.category),
        rawCategory: row.category,
        subType: row.subType,
        count: row._count,
      }));

      const result: any = {
        totalDocuments: totalCount,
        collections,
        byCategoryAndSubType,
      };

      if (collection?.trim()) {
        result.byCollection = {
          name: outboundCollection(collection.trim()),
          rawCategory: expandCollectionForFilter(collection.trim()).join('|'),
          count: totalCount,
          countries: [],
          tags: [],
        };
      }

      return result;
    } catch (error: any) {
      this.logger.error(`获取 RAG 统计失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

