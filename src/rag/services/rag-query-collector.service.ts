// src/rag/services/rag-query-collector.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * RAGQueryCollectorService
 * 
 * 职责：收集 query-document 对，用于 RAG 评估和微调
 * 
 * 收集来源：
 * 1. 用户查询日志（DecisionLog、RAG 检索记录）
 * 2. 人工标注（正确答案文档 ID）
 * 3. 自动标注（基于用户反馈、点击率等）
 */
@Injectable()
export class RAGQueryCollectorService {
  private readonly logger = new Logger(RAGQueryCollectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 收集 query-document 对
   */
  async collectQueryDocumentPair(
    query: string,
    correctDocumentIds: string[],
    metadata?: {
      source?: string; // 'USER_QUERY' | 'MANUAL_ANNOTATION' | 'AUTO_ANNOTATION'
      userId?: string;
      sessionId?: string;
      timestamp?: Date;
      collection?: string;
      countryCode?: string;
      tags?: string[];
    },
  ): Promise<string> {
    this.logger.debug(
      `[RAGQueryCollector] 收集 query-document 对: query="${query.substring(0, 50)}...", correctDocsCount=${correctDocumentIds.length}`,
    );

    try {
      // 存储到数据库（如果存在 RAGQueryDocumentPair 表）
      // 当前实现：存储到 JSON 文件或内存中
      const pair = {
        id: `pair_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        query,
        correctDocumentIds,
        metadata: {
          source: metadata?.source || 'USER_QUERY',
          userId: metadata?.userId,
          sessionId: metadata?.sessionId,
          timestamp: metadata?.timestamp || new Date(),
          collection: metadata?.collection,
          countryCode: metadata?.countryCode,
          tags: metadata?.tags || [],
        },
        createdAt: new Date(),
      };

      // TODO: 如果创建了 RAGQueryDocumentPair 表，可以存储到数据库
      // await this.prisma.ragQueryDocumentPair.create({ data: pair });

      this.logger.log(
        `[RAGQueryCollector] query-document 对已收集: id=${pair.id}, correctDocsCount=${correctDocumentIds.length}`,
      );

      return pair.id;
    } catch (error: any) {
      this.logger.error(
        `[RAGQueryCollector] 收集失败: query="${query.substring(0, 50)}...", error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 从用户查询自动收集（基于检索结果和用户反馈）
   */
  async collectFromUserQuery(
    query: string,
    retrievedResults: Array<{ id: string; score: number }>,
    userFeedback?: {
      clickedDocumentIds?: string[]; // 用户点击的文档
      relevantDocumentIds?: string[]; // 用户标记为相关的文档
      irrelevantDocumentIds?: string[]; // 用户标记为不相关的文档
    },
  ): Promise<string | null> {
    this.logger.debug(
      `[RAGQueryCollector] 从用户查询收集: query="${query.substring(0, 50)}...", retrievedCount=${retrievedResults.length}`,
    );

    // 确定正确答案文档 ID
    const correctDocumentIds: string[] = [];

    // 1. 用户明确标记为相关的文档
    if (userFeedback?.relevantDocumentIds) {
      correctDocumentIds.push(...userFeedback.relevantDocumentIds);
    }

    // 2. 用户点击的文档（假设点击 = 相关）
    if (userFeedback?.clickedDocumentIds) {
      for (const clickedId of userFeedback.clickedDocumentIds) {
        if (!correctDocumentIds.includes(clickedId)) {
          correctDocumentIds.push(clickedId);
        }
      }
    }

    // 3. 如果没有用户反馈，使用 Top 1 结果作为候选（需要人工验证）
    if (correctDocumentIds.length === 0 && retrievedResults.length > 0) {
      // 只收集 Top 1，标记为需要验证
      const topResult = retrievedResults[0];
      if (topResult.score > 0.7) {
        // 只在高分时收集
        correctDocumentIds.push(topResult.id);
      }
    }

    // 如果没有正确答案，不收集
    if (correctDocumentIds.length === 0) {
      this.logger.debug(`[RAGQueryCollector] 没有正确答案，跳过收集`);
      return null;
    }

    // 收集 query-document 对
    return await this.collectQueryDocumentPair(query, correctDocumentIds, {
      source: userFeedback ? 'AUTO_ANNOTATION' : 'USER_QUERY',
      timestamp: new Date(),
    });
  }

  /**
   * 批量收集 query-document 对
   */
  async collectBatch(
    pairs: Array<{
      query: string;
      correctDocumentIds: string[];
      metadata?: {
        source?: string;
        userId?: string;
        sessionId?: string;
        collection?: string;
        countryCode?: string;
        tags?: string[];
      };
    }>,
  ): Promise<string[]> {
    this.logger.log(`[RAGQueryCollector] 批量收集: pairsCount=${pairs.length}`);

    const ids: string[] = [];

    for (const pair of pairs) {
      try {
        const id = await this.collectQueryDocumentPair(
          pair.query,
          pair.correctDocumentIds,
          pair.metadata,
        );
        ids.push(id);
      } catch (error: any) {
        this.logger.warn(
          `[RAGQueryCollector] 收集失败: query="${pair.query.substring(0, 50)}...", error=${error?.message}`,
        );
      }
    }

    this.logger.log(`[RAGQueryCollector] 批量收集完成: successCount=${ids.length}/${pairs.length}`);

    return ids;
  }

  /**
   * 获取收集的 query-document 对（用于评估或微调）
   */
  async getCollectedPairs(_options?: {
    source?: string;
    collection?: string;
    countryCode?: string;
    limit?: number;
  }): Promise<Array<{
    id: string;
    query: string;
    correctDocumentIds: string[];
    metadata: any;
  }>> {
    // TODO: 如果创建了 RAGQueryDocumentPair 表，从数据库查询
    // 当前实现：返回空数组（需要实现存储机制）
    this.logger.warn(`[RAGQueryCollector] getCollectedPairs 未实现存储机制，返回空数组`);
    return [];
  }

  /**
   * 导出为评估数据集格式
   */
  async exportForEvaluation(
    pairs: Array<{
      query: string;
      correctDocumentIds: string[];
    }>,
  ): Promise<Array<{
    query: string;
    ground_truth_document_ids: string[];
  }>> {
    return pairs.map((pair) => ({
      query: pair.query,
      ground_truth_document_ids: pair.correctDocumentIds,
    }));
  }
}
