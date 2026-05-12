// src/rag/services/rag-fallback.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ChunkRetrievalService, ChunkRetrievalParams, ChunkRetrievalResult } from './chunk-retrieval.service';
import { RagRealityPolicyGateService } from './rag-reality-policy-gate.service';
import type { RagSoftWorldScope } from '../reality-policy/rag-soft-world-policy';
import { getBoundDecisionContext } from '../../trips/reality-kernel/reality-context.storage';
import { PrismaService } from '../../prisma/prisma.service';
import { McpToolsService } from './mcp-tools.service';

/**
 * RAG 失败模式与降级策略服务
 *
 * 实现 5 层降级策略：
 * Level 1: Vector RAG (similarity >= 0.75)
 * Level 2: Hybrid RAG (0.60 <= similarity < 0.75)
 * Level 3: Keyword Fallback (0.40 <= similarity < 0.60)
 * Level 4: Web Browse (仅限 RULES/GATE 类查询)
 * Level 5: Graceful Failure (返回官方链接 + 记录数据缺口)
 *
 * 设计原则：
 * - 优先使用高精度方法（向量检索）
 * - 自动降级保证稳定性
 * - 记录每次降级用于改进
 * - 优雅失败而非硬错误
 */

export enum QueryCategory {
  RULES = 'RULES',              // 规则/政策类（需要权威引用）
  GATE = 'GATE',                // Should-Exist Gate 决策
  POI = 'POI',                  // POI 信息查询
  SPATIAL = 'SPATIAL',          // 空间关系推理
  GENERAL = 'GENERAL',          // 一般查询
}

export interface QueryContext {
  category: QueryCategory;
  requiresCitation?: boolean;   // 是否需要引用
  allowWebBrowse?: boolean;     // 是否允许 Web Browse
  userIntent?: string;          // 用户意图
}

export interface RagResult {
  results: ChunkRetrievalResult[];
  method: 'VECTOR_RAG' | 'HYBRID_RAG' | 'KEYWORD_FALLBACK' | 'WEB_BROWSE' | 'GRACEFUL_FAILURE';
  confidence: number;           // 0-1
  fallback?: {
    message: string;
    officialLinks?: string[];
    recordedInGapLog: boolean;
  };
  metadata?: {
    attemptedMethods: string[];
    degradationReason?: string;
    latency?: number;
  };
}

export interface KnowledgeGapLog {
  query: string;
  category: QueryCategory;
  timestamp: Date;
  attemptedMethods: string[];
  source?: string;
  needsIndex: boolean;
  notes?: string;
}

@Injectable()
export class RagFallbackService {
  private readonly logger = new Logger(RagFallbackService.name);

  // 相似度阈值
  private readonly THRESHOLDS = {
    HIGH: 0.75,     // Level 1: Vector RAG
    MEDIUM: 0.60,   // Level 2: Hybrid RAG
    LOW: 0.40,      // Level 3: Keyword Fallback
  };

  constructor(
    private readonly chunkRetrievalService: ChunkRetrievalService,
    private readonly prisma: PrismaService,
    private readonly mcpTools: McpToolsService,
    private readonly ragRealityPolicyGate: RagRealityPolicyGateService,
  ) {}

  /**
   * 带降级策略的 RAG 查询
   *
   * @param query - 查询字符串
   * @param params - 检索参数
   * @param context - 查询上下文
   * @returns RAG 结果（包含降级信息）
   */
  async queryWithFallback(
    query: string,
    params: ChunkRetrievalParams,
    context: QueryContext
  ): Promise<RagResult> {
    const startTime = Date.now();
    const attemptedMethods: string[] = [];

    this.logger.debug(
      `[Fallback] 开始查询: "${query.substring(0, 50)}...", category=${context.category}`
    );

    const decisionContext = getBoundDecisionContext();
    const { scope } = this.ragRealityPolicyGate.resolve(decisionContext);
    const ragScope: RagSoftWorldScope = scope;
    if (ragScope === 'blocked') {
      return {
        results: [],
        method: 'GRACEFUL_FAILURE',
        confidence: 0,
        fallback: {
          message: 'RAG 访问已按 Reality Policy 阻止',
          officialLinks: [],
          recordedInGapLog: false,
        },
        metadata: {
          attemptedMethods: ['RAG_REALITY_POLICY_BLOCKED'],
          latency: Date.now() - startTime,
        },
      };
    }
    const mergeRag = (p: ChunkRetrievalParams): ChunkRetrievalParams =>
      this.ragRealityPolicyGate.mergeChunkRetrievalParams(p, ragScope);

    try {
      // Level 1: Vector RAG (高精度)
      attemptedMethods.push('VECTOR_RAG');
      const vectorResult = await this.chunkRetrievalService.retrieve(
        mergeRag({
          ...params,
          query,
          useHybridSearch: false,
          limit: params.limit || 10,
        }),
      );

      const maxSimilarity = vectorResult[0]?.similarity || 0;

      if (maxSimilarity >= this.THRESHOLDS.HIGH) {
        this.logger.debug(
          `[Fallback] Level 1 成功: Vector RAG, similarity=${maxSimilarity.toFixed(3)}`
        );
        return {
          results: vectorResult,
          method: 'VECTOR_RAG',
          confidence: maxSimilarity,
          metadata: {
            attemptedMethods,
            latency: Date.now() - startTime,
          },
        };
      }

      // Level 2: Hybrid RAG (中等精度)
      attemptedMethods.push('HYBRID_RAG');
      const hybridResult = await this.chunkRetrievalService.retrieve(
        mergeRag({
          ...params,
          query,
          useHybridSearch: true,
          denseWeight: 0.6,
          sparseWeight: 0.4,
          limit: (params.limit || 10) * 2, // 获取更多候选
        }),
      );

      const maxHybridScore = hybridResult[0]?.hybridScore || hybridResult[0]?.similarity || 0;

      if (maxHybridScore >= this.THRESHOLDS.MEDIUM) {
        this.logger.debug(
          `[Fallback] Level 2 成功: Hybrid RAG, score=${maxHybridScore.toFixed(3)}`
        );
        return {
          results: hybridResult.slice(0, params.limit || 10),
          method: 'HYBRID_RAG',
          confidence: maxHybridScore,
          metadata: {
            attemptedMethods,
            degradationReason: `Vector similarity ${maxSimilarity.toFixed(3)} < threshold ${this.THRESHOLDS.HIGH}`,
            latency: Date.now() - startTime,
          },
        };
      }

      // Level 3: Keyword Fallback (关键词匹配)
      attemptedMethods.push('KEYWORD_FALLBACK');
      const keywordResult = await this.keywordSearch(query, params);

      if (keywordResult.length > 0) {
        this.logger.warn(
          `[Fallback] Level 3 降级: Keyword Fallback, results=${keywordResult.length}`
        );
        return {
          results: keywordResult,
          method: 'KEYWORD_FALLBACK',
          confidence: 0.5, // 低置信度
          metadata: {
            attemptedMethods,
            degradationReason: `Hybrid score ${maxHybridScore.toFixed(3)} < threshold ${this.THRESHOLDS.MEDIUM}`,
            latency: Date.now() - startTime,
          },
        };
      }

      // Level 4: Web Browse (仅限规则类和门控类查询)
      if (
        (context.category === QueryCategory.RULES || context.category === QueryCategory.GATE) &&
        context.allowWebBrowse !== false
      ) {
        attemptedMethods.push('WEB_BROWSE');

        try {
          const webBrowseResult = await this.webBrowseSearch(query, context);

          if (webBrowseResult.success) {
            this.logger.log(
              `[Fallback] Level 4 成功: Web Browse, content_length=${webBrowseResult.content.length}`
            );

            // 将 Web Browse 结果转换为 ChunkRetrievalResult 格式
            const webChunk: ChunkRetrievalResult = {
              id: `web_browse_${Date.now()}`,
              chunkId: `web_browse_${Date.now()}`,
              content: webBrowseResult.content,
              type: 'web_browse',
              credibilityScore: 0.7, // Web Browse 来自官方源，可信度中等偏上
              keywords: this.extractKeywords(query),
              metadata: {
                source: 'WEB_BROWSE',
                url: webBrowseResult.url,
                query: query,
                timestamp: new Date().toISOString(),
              },
              fileId: 'web_browse',
              similarity: 0.6,
              sourceFile: webBrowseResult.url,
            };

            return {
              results: [webChunk],
              method: 'WEB_BROWSE',
              confidence: 0.6,
              metadata: {
                attemptedMethods,
                degradationReason: 'Local RAG data insufficient, fetched from web',
                latency: Date.now() - startTime,
              },
            };
          }
        } catch (webError: any) {
          this.logger.error(`[Fallback] Level 4 Web Browse 失败: ${webError.message}`);
        }

        // Web Browse 失败，记录到数据缺口日志
        await this.recordKnowledgeGap({
          query,
          category: context.category,
          timestamp: new Date(),
          attemptedMethods,
          source: 'WEB_BROWSE_FAILED',
          needsIndex: true,
        });
      }

      // Level 5: Graceful Failure
      attemptedMethods.push('GRACEFUL_FAILURE');
      this.logger.error(
        `[Fallback] Level 5 最终降级: Graceful Failure, query="${query.substring(0, 50)}..."`
      );

      await this.recordKnowledgeGap({
        query,
        category: context.category,
        timestamp: new Date(),
        attemptedMethods,
        needsIndex: true,
      });

      return {
        results: [],
        method: 'GRACEFUL_FAILURE',
        confidence: 0,
        fallback: {
          message: '暂无该信息，建议查阅官方资源',
          officialLinks: this.getOfficialLinks(context.category),
          recordedInGapLog: true,
        },
        metadata: {
          attemptedMethods,
          degradationReason: '所有检索方法均未找到相关结果',
          latency: Date.now() - startTime,
        },
      };

    } catch (error: any) {
      this.logger.error(`[Fallback] 查询失败: ${error.message}`, error.stack);

      // 异常情况也记录到数据缺口
      await this.recordKnowledgeGap({
        query,
        category: context.category,
        timestamp: new Date(),
        attemptedMethods: [...attemptedMethods, 'ERROR'],
        needsIndex: true,
      });

      return {
        results: [],
        method: 'GRACEFUL_FAILURE',
        confidence: 0,
        fallback: {
          message: `查询失败: ${error.message}`,
          officialLinks: this.getOfficialLinks(context.category),
          recordedInGapLog: true,
        },
        metadata: {
          attemptedMethods,
          degradationReason: error.message,
          latency: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Level 3: 关键词搜索（纯 BM25）
   */
  private async keywordSearch(
    query: string,
    params: ChunkRetrievalParams
  ): Promise<ChunkRetrievalResult[]> {
    // 使用 ChunkRetrievalService 的 sparseRetrieve
    // 这里我们直接使用纯关键词匹配（不混合向量）
    const keywords = this.extractKeywords(query);

    if (keywords.length === 0) {
      return [];
    }

    const conditions: string[] = [];
    const paramsList: any[] = [];

    // 关键词 OR 匹配
    const keywordConditions = keywords.map((kw) => {
      const paramIdx = paramsList.length + 1;
      paramsList.push(`%${kw}%`);
      return `(c.content ILIKE $${paramIdx} OR EXISTS(SELECT 1 FROM unnest(c.keywords) AS k WHERE LOWER(k) LIKE LOWER($${paramIdx})))`;
    });
    conditions.push(`(${keywordConditions.join(' OR ')})`);

    if (params.type) {
      conditions.push(`c.type = $${paramsList.length + 1}`);
      paramsList.push(params.type);
    }

    if (params.credibilityMin) {
      conditions.push(`c.credibility_score >= $${paramsList.length + 1}`);
      paramsList.push(params.credibilityMin);
    }

    const whereClause = conditions.join(' AND ');
    paramsList.push(params.limit || 10);

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
        0.5 as similarity
      FROM chunks c
      WHERE ${whereClause}
      LIMIT $${paramsList.length}
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
    }>>(querySql, ...keywords.map(kw => `%${kw}%`), ...paramsList.slice(keywords.length));

    return results.map((r) => ({
      id: r.id,
      chunkId: r.chunk_id,
      content: r.content,
      type: r.type,
      credibilityScore: Number(r.credibility_score),
      keywords: r.keywords || [],
      metadata: r.metadata,
      fileId: r.file_id,
      similarity: 0.5, // 固定低置信度
    }));
  }

  /**
   * 提取关键词（简单分词）
   */
  private extractKeywords(query: string): string[] {
    const cleaned = query
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .trim();

    const words = cleaned
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .filter((w) => !this.isStopWord(w));

    return words;
  }

  /**
   * 判断是否为停用词
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Level 4: Web Browse 搜索
   */
  private async webBrowseSearch(
    query: string,
    context: QueryContext
  ): Promise<{ success: boolean; content: string; url: string }> {
    const officialLinks = this.getOfficialLinks(context.category);

    // 尝试从官方链接中浏览
    for (const url of officialLinks) {
      try {
        const result = await this.mcpTools.webBrowse({
          url,
          query,
          cacheTtlMinutes: context.category === QueryCategory.RULES ? 60 : 30,
        });

        if (result.success && result.content.length > 100) {
          return {
            success: true,
            content: result.content,
            url: result.url,
          };
        }
      } catch (error: any) {
        this.logger.warn(`[WebBrowse] Failed to browse ${url}: ${error.message}`);
        continue;
      }
    }

    return {
      success: false,
      content: '',
      url: '',
    };
  }

  /**
   * 获取官方链接（根据类别）
   */
  private getOfficialLinks(category: QueryCategory): string[] {
    const links: Record<QueryCategory, string[]> = {
      [QueryCategory.RULES]: [
        'https://www.road.is',
        'https://www.safetravel.is',
        'https://www.ferdamalastofa.is',
      ],
      [QueryCategory.GATE]: [
        'https://www.road.is',
        'https://en.vedur.is', // 冰岛气象局
        'https://www.safetravel.is/safety/emergencies',
      ],
      [QueryCategory.POI]: [
        'https://guidetoiceland.is',
        'https://www.visiticeland.com',
      ],
      [QueryCategory.SPATIAL]: [
        'https://www.google.com/maps',
        'https://ja.is/kort', // 冰岛地图
      ],
      [QueryCategory.GENERAL]: [
        'https://www.visiticeland.com',
        'https://guidetoiceland.is',
      ],
    };

    return links[category] || links[QueryCategory.GENERAL];
  }

  /**
   * 记录数据缺口到数据库
   *
   * 用于后续知识库补充和改进
   */
  private async recordKnowledgeGap(gap: KnowledgeGapLog): Promise<void> {
    try {
      // 保存到数据库（使用 RagKnowledgeGap 模型）
      await this.prisma.ragKnowledgeGap.create({
        data: {
          query: gap.query,
          category: gap.category,
          timestamp: new Date(gap.timestamp),
          attemptedMethods: gap.attemptedMethods,
          source: gap.source,
          needsIndex: gap.needsIndex,
          notes: gap.notes,
        },
      });

      this.logger.warn(
        `[KnowledgeGap] 记录数据缺口: query="${gap.query.substring(0, 50)}...", category=${gap.category}, methods=${gap.attemptedMethods.join('→')}`
      );
    } catch (error: any) {
      this.logger.error(`[KnowledgeGap] 记录失败: ${error.message}`);
    }
  }

  /**
   * 获取数据缺口统计（用于分析和改进）
   */
  async getKnowledgeGapStats(_params?: {
    category?: QueryCategory;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<{
    totalGaps: number;
    byCategory: Record<QueryCategory, number>;
    topQueries: Array<{ query: string; count: number }>;
    needsIndexCount: number;
  }> {
    // TODO: 实现统计查询
    // 目前返回占位数据
    return {
      totalGaps: 0,
      byCategory: {
        [QueryCategory.RULES]: 0,
        [QueryCategory.GATE]: 0,
        [QueryCategory.POI]: 0,
        [QueryCategory.SPATIAL]: 0,
        [QueryCategory.GENERAL]: 0,
      },
      topQueries: [],
      needsIndexCount: 0,
    };
  }
}
