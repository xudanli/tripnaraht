// src/rag/services/local-insight.service.ts
/**
 * Local Insight Service（当地洞察服务）
 * 
 * 用途：
 * - 快速覆盖长尾国家/区域的"软知识"
 * - 提供当地公交买票细节、小镇之间习惯、某些山屋不成文规则、小众区域的一些安全提醒
 * - 不参与硬决策，但提供真实 context
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DecisionContextV0 } from '../../trips/reality-kernel/decision-context.types';
import { resolveRagSoftWorldPolicy } from '../reality-policy/rag-soft-world-policy';
import {
  ChunkRetrievalService,
  type ChunkRetrievalParams,
  type ChunkRetrievalResult,
} from './chunk-retrieval.service';
import { RagRealityPolicyGateService } from './rag-reality-policy-gate.service';
import type { RagSoftWorldScope } from '../reality-policy/rag-soft-world-policy';
import { LlmExtractionService } from './llm-extraction.service';

/**
 * 当地洞察
 */
export interface LocalInsight {
  countryCode: string;
  region?: string;
  tags: string[];              // ['alpine_hut', 'wild_camp', 'f_road', 'public_transport']
  content: string;             // LLM 基于 RAG 生成的小段文字
  evidenceSnippets: string[];  // 原文引用片段
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source?: string;
}

@Injectable()
export class LocalInsightService {
  private readonly logger = new Logger(LocalInsightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkRetrieval: ChunkRetrievalService,
    private readonly llmExtraction: LlmExtractionService,
    private readonly ragRealityPolicyGate: RagRealityPolicyGateService,
  ) {}

  /**
   * 获取或生成 LocalInsight
   */
  async getLocalInsight(
    countryCode: string,
    tags: string[],
    region?: string,
    decisionContext?: DecisionContextV0,
  ): Promise<LocalInsight[]> {
    this.logger.debug(`获取当地洞察: countryCode=${countryCode}, tags=${tags.join(',')}, region=${region}`);

    try {
      const { scope } = resolveRagSoftWorldPolicy(decisionContext);
      if (scope === 'blocked') {
        return [];
      }
      const ragScope: RagSoftWorldScope = scope;
      const ragCollection = ragScope === 'restricted' ? 'legal_rules' : 'local_insights';

      // 1. 先查数据库（缓存）
      // @ts-ignore - Prisma client will be generated after migration
      const cached = await this.prisma.localInsight.findMany({
        where: {
          countryCode,
          tags: { hasSome: tags },
          region: region || undefined,
        },
        orderBy: { lastUpdated: 'desc' },
        take: 10,
      });

      // 如果缓存存在且较新（30天内），直接返回
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentCached = cached.filter(
        (item: any) => item.lastUpdated > thirtyDaysAgo
      );

      if (recentCached.length > 0) {
        this.logger.debug(`使用缓存的当地洞察: ${recentCached.length} 条`);
        return recentCached.map(this.mapToLocalInsight);
      }

      // 2. Chunk 检索 + Reality merge
      const query = `${countryCode} ${region || ''} ${tags.join(' ')} local tips insights`;
      let p: ChunkRetrievalParams = {
        query,
        category: ragCollection,
        limit: 15,
        useHybridSearch: true,
        credibilityMin: 0.35,
      };
      p = this.ragRealityPolicyGate.mergeChunkRetrievalParams(p, ragScope);
      const rows = await this.chunkRetrieval.retrieve(p);
      const snippets = rows.map((r: ChunkRetrievalResult) => {
        const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as { sourceUrl?: string }) : undefined;
        return {
          content: r.content,
          score: r.similarity ?? r.hybridScore,
          source: r.sourceFile || meta?.sourceUrl || null,
        };
      });

      if (snippets.length === 0) {
        this.logger.warn(`未找到相关当地洞察: countryCode=${countryCode}, tags=${tags.join(',')}`);
        return [];
      }

      // 3. LLM 生成 LocalInsight
      const prompt = `Extract local insights from the following text about ${countryCode}${region ? ` (${region})` : ''} related to: ${tags.join(', ')}.

Text:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Please extract local insights and return as a JSON array. Each insight should have:
- content: A concise description of the local insight (2-3 sentences)
- evidenceSnippets: Key quotes from the text (2-3 short snippets)
- confidence: One of "HIGH", "MEDIUM", "LOW" based on how specific and reliable the information is

Return as JSON array.`;

      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            evidenceSnippets: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          },
          required: ['content', 'evidenceSnippets', 'confidence'],
        },
      };

      const insights = await this.llmExtraction.extractStructured<Array<{
        content: string;
        evidenceSnippets: string[];
        confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      }>>(prompt, schema);

      // 4. 保存到数据库
      const savedInsights = await Promise.all(
        insights.map(async (insight: { content: string; evidenceSnippets: string[]; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }) => {
          // @ts-ignore - Prisma client will be generated after migration
          const saved = await this.prisma.localInsight.create({
            data: {
              countryCode,
              region: region || null,
              tags,
              content: insight.content,
              evidenceSnippets: insight.evidenceSnippets,
              confidence: insight.confidence,
              source: snippets[0]?.source || null,
            },
          });
          return this.mapToLocalInsight(saved);
        })
      );

      this.logger.debug(`生成并保存当地洞察: ${savedInsights.length} 条`);

      return savedInsights;
    } catch (error: any) {
      this.logger.error(`获取当地洞察失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 获取特定类型的当地洞察
   */
  async getInsightsByTag(
    countryCode: string,
    tag: string,
    region?: string
  ): Promise<LocalInsight[]> {
    return this.getLocalInsight(countryCode, [tag], region);
  }

  /**
   * 批量获取多个国家的当地洞察
   */
  async getInsightsForCountries(
    countryCodes: string[],
    tags: string[]
  ): Promise<Map<string, LocalInsight[]>> {
    const result = new Map<string, LocalInsight[]>();

    for (const countryCode of countryCodes) {
      try {
        const insights = await this.getLocalInsight(countryCode, tags);
        result.set(countryCode, insights);
      } catch (error: any) {
        this.logger.error(`批量获取当地洞察失败: countryCode=${countryCode}, error=${error.message}`);
        result.set(countryCode, []);
      }
    }

    return result;
  }

  /**
   * 更新当地洞察（手动触发刷新）
   */
  async refreshLocalInsight(
    countryCode: string,
    tags: string[],
    region?: string,
    decisionContext?: DecisionContextV0,
  ): Promise<LocalInsight[]> {
    // 删除旧的洞察
    // @ts-ignore - Prisma client will be generated after migration
    await this.prisma.localInsight.deleteMany({
      where: {
        countryCode,
        tags: { hasSome: tags },
        region: region || undefined,
      },
    });

    // 重新生成
    return this.getLocalInsight(countryCode, tags, region, decisionContext);
  }

  /**
   * 映射数据库模型到 LocalInsight 接口
   */
  private mapToLocalInsight(dbModel: any): LocalInsight {
    return {
      countryCode: dbModel.countryCode,
      region: dbModel.region || undefined,
      tags: dbModel.tags,
      content: dbModel.content,
      evidenceSnippets: dbModel.evidenceSnippets,
      confidence: dbModel.confidence as 'HIGH' | 'MEDIUM' | 'LOW',
      source: dbModel.source || undefined,
    };
  }
}

