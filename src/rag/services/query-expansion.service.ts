// src/rag/services/query-expansion.service.ts
/**
 * 查询扩展服务 — 统一复用 QueryRewritingService + expansion_routes 多路召回。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { QueryRewritingService } from '../../agent/services/query-rewriting.service';
import { QUERY_REWRITE_FULL_SCHEMA } from '../../agent/schemas/query-rewrite.schema';
import type {
  QueryRewriteExpansionRoutes,
  QueryRewriteProfile,
  QueryRewriteResult,
} from '../../agent/utils/query-rewriting.types';
import {
  buildMultiRouteFromExpansionRoutes,
  buildMultiRouteSearchQueries,
  mergeMultiRouteResults,
  type MultiRouteSearchQuery,
} from '../../agent/utils/query-rewriting-multi-route.util';
import { ChunkRetrievalResult } from './chunk-retrieval.service';

export interface QueryExpansionParams {
  query: string;
  maxVariants?: number;
  /** @deprecated 使用 profile + useRewrite */
  useLLM?: boolean;
  useRewrite?: boolean;
  profile?: QueryRewriteProfile;
  selectedDestination?: string;
  messageHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ExpandedQuery {
  original: string;
  contextualizedQuery: string;
  /** 完整改写结果（与 QueryRewriting 管道同一 Schema 语义） */
  rewrite?: QueryRewriteResult;
  expansion_routes: QueryRewriteExpansionRoutes;
  /** 多路并行检索计划（含 route 类型与 weight） */
  routes: MultiRouteSearchQuery[];
  variants: string[];
  allQueries: string[];
}

@Injectable()
export class QueryExpansionService {
  private readonly logger = new Logger(QueryExpansionService.name);
  private readonly DEFAULT_MAX_VARIANTS = 3;

  /** 与 QueryRewriting 管道对齐的完整 Schema（供外部校验/文档） */
  static readonly FULL_SCHEMA = QUERY_REWRITE_FULL_SCHEMA;

  constructor(
    @Optional() private readonly queryRewritingService?: QueryRewritingService,
  ) {
    if (!queryRewritingService) {
      this.logger.warn('QueryRewritingService 未注入，查询扩展将使用本地同义词降级');
    }
  }

  async expandQuery(params: QueryExpansionParams): Promise<ExpandedQuery> {
    const {
      query,
      maxVariants = this.DEFAULT_MAX_VARIANTS,
      useLLM = true,
      useRewrite = true,
      profile = 'user_facing',
      selectedDestination,
      messageHistory,
    } = params;

    this.logger.debug(
      `查询扩展: query="${query.substring(0, 50)}...", maxVariants=${maxVariants}, profile=${profile}`,
    );

    const agentInternal = profile === 'agent_internal';
    const shouldRewrite = useRewrite && !agentInternal && useLLM && !!this.queryRewritingService;

    try {
      if (shouldRewrite) {
        return await this.expandViaQueryRewriting({
          query,
          maxVariants,
          profile,
          selectedDestination,
          messageHistory,
        });
      }
      return this.expandWithSynonyms(query, maxVariants);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`查询扩展失败，降级到简单扩展: ${msg}`);
      return this.expandWithSynonyms(query, maxVariants);
    }
  }

  private async expandViaQueryRewriting(args: {
    query: string;
    maxVariants: number;
    profile: QueryRewriteProfile;
    selectedDestination?: string;
    messageHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<ExpandedQuery> {
    const rewrite = await this.queryRewritingService!.rewrite({
      query: args.query,
      scene: 'rag',
      profile: args.profile,
      session: {
        selectedDestination: args.selectedDestination,
        messageHistory: args.messageHistory,
      },
      options: {
        enableGenerativeExpansion: args.profile !== 'agent_internal',
      },
    });

    const routes = buildMultiRouteSearchQueries(rewrite, {
      maxPerRoute: args.maxVariants,
    });
    const primary = rewrite.contextualized_query || args.query;
    const variants = routes.filter((r) => r.route !== 'primary').map((r) => r.query);

    return {
      original: args.query,
      contextualizedQuery: primary,
      rewrite,
      expansion_routes: rewrite.expansion_routes,
      routes,
      variants,
      allQueries: routes.map((r) => r.query),
    };
  }

  private expandWithSynonyms(query: string, maxVariants: number): ExpandedQuery {
    const synonymMap: Record<string, string[]> = {
      租车: ['汽车租赁', '租用车辆'],
      保险: ['保障', '保护'],
      路线: ['路径', '行程', '路线规划'],
      景点: ['旅游景点', '景点推荐', '必游景点'],
      酒店: ['住宿', '旅馆', '宾馆'],
      餐厅: ['饭店', '餐馆', '美食'],
    };

    const expansion_routes: QueryRewriteExpansionRoutes = {
      synonym: [],
      hyponym: [],
      scenario: [],
    };
    const words = query.split(/\s+/);

    for (const word of words) {
      if (synonymMap[word]) {
        for (const synonym of synonymMap[word]) {
          if (synonym !== word && expansion_routes.synonym.length < maxVariants) {
            const variant = query.replace(word, synonym);
            if (!expansion_routes.synonym.includes(variant)) {
              expansion_routes.synonym.push(variant);
            }
          }
        }
      }
    }

    if (expansion_routes.synonym.length === 0) {
      if (!query.startsWith('如何') && !query.startsWith('什么') && !query.startsWith('哪里')) {
        expansion_routes.synonym.push(`如何${query}`);
        if (expansion_routes.synonym.length < maxVariants) {
          expansion_routes.synonym.push(`${query}是什么`);
        }
      }
    }

    const routes = buildMultiRouteFromExpansionRoutes(query, expansion_routes, maxVariants);
    const variants = routes.filter((r) => r.route !== 'primary').map((r) => r.query);

    return {
      original: query,
      contextualizedQuery: query,
      expansion_routes,
      routes,
      variants: variants.slice(0, maxVariants),
      allQueries: routes.map((r) => r.query),
    };
  }

  mergeResults(
    resultsMap: Map<string, ChunkRetrievalResult[]>,
    primaryQuery: string,
    limit: number,
    routes?: MultiRouteSearchQuery[],
  ): ChunkRetrievalResult[] {
    if (routes?.length) {
      return mergeMultiRouteResults(resultsMap, routes, limit, {
        idFn: (r) => r.id,
        scoreFn: (r) => r.hybridScore ?? r.similarity ?? 0,
        attachScore: (r, score) => ({ ...r, similarity: score }),
      });
    }

    const resultScores = new Map<string, { result: ChunkRetrievalResult; score: number }>();
    const originalResults = resultsMap.get(primaryQuery) || [];
    originalResults.forEach((result) => {
      const existing = resultScores.get(result.id);
      const score = (result.hybridScore || result.similarity || 0) * 1.0;
      if (!existing || score > existing.score) {
        resultScores.set(result.id, { result, score });
      }
    });

    let variantIndex = 0;
    for (const [q, results] of resultsMap.entries()) {
      if (q === primaryQuery) continue;
      const weight = 0.7 / (variantIndex + 1);
      results.forEach((result) => {
        const existing = resultScores.get(result.id);
        const score = (result.hybridScore || result.similarity || 0) * weight;
        if (!existing || score > existing.score) {
          resultScores.set(result.id, { result, score });
        }
      });
      variantIndex++;
    }

    return [...resultScores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ result, score }) => ({ ...result, similarity: score }));
  }
}
