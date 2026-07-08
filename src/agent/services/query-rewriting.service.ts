/**
 * Tripnara 统一 Query Rewriting 服务（两阶段管道）。
 *
 * Stage 1: LLM + Schema 上下文结构化解析
 * Stage 2a: 确定性图谱映射 + 静态扩展（别名/词表/同义词/上下位）
 * Stage 2b: 生成式场景扩展（可选，user_facing 默认开启，agent_internal 默认关闭）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { QueryRewriteInput, QueryRewriteResult } from '../utils/query-rewriting.types';
import {
  assembleQueryRewriteResult,
  buildStage1Prompt,
  getQueryRewriteStage1Schema,
  parseStage1Response,
  postProcessStandardization,
  rewriteQueryWithRules,
  shouldEnableGenerativeExpansion,
} from '../utils/query-rewriting.util';
import { QueryRewritingDictionaryService } from './query-rewriting-dictionary.service';
import { QueryRewriteMetricsService } from './query-rewrite-metrics.service';
import { RedisEntityResolutionProvider } from '../providers/redis-entity-resolution.provider';
import { buildMultiRouteSearchQueries } from '../utils/query-rewriting-multi-route.util';
import { buildStage1FromExactEntity } from '../utils/query-rewriting.util';

@Injectable()
export class QueryRewritingService {
  private readonly logger = new Logger(QueryRewritingService.name);

  constructor(
    private readonly dictionary: QueryRewritingDictionaryService,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly metrics?: QueryRewriteMetricsService,
    @Optional() private readonly entityResolution?: RedisEntityResolutionProvider,
  ) {
    if (!llmService) {
      this.logger.warn('LlmService 未注入，Query Rewriting 将仅使用规则降级');
    }
  }

  /**
   * 统一改写入口。
   */
  async rewrite(input: QueryRewriteInput): Promise<QueryRewriteResult> {
    const started = Date.now();
    const traceId = this.metrics?.createTraceId() ?? `qr_${started}`;
    const query = String(input.query ?? '').trim();

    const finish = async (
      stage1: ReturnType<typeof rewriteQueryWithRules>,
      enrichedInput: QueryRewriteInput,
      meta: {
        stage1_source: 'llm' | 'rules';
        entity_resolution_source?: 'redis_exact' | 'none';
      },
    ): Promise<QueryRewriteResult> => {
      const result = await this.runStage2(stage1, enrichedInput, { stage1_source: meta.stage1_source });
      result.pipeline = {
        stage1_source: result.pipeline?.stage1_source ?? meta.stage1_source,
        stage2_deterministic: result.pipeline?.stage2_deterministic ?? false,
        stage2_generative: result.pipeline?.stage2_generative ?? false,
        ...result.pipeline,
        trace_id: traceId,
        entity_resolution_source: meta.entity_resolution_source ?? 'none',
      };
      const routeCount = buildMultiRouteSearchQueries(result).length;
      this.metrics?.trackQueryRewriteLog(
        this.metrics.buildMetricsFromRewrite(traceId, enrichedInput, result, Date.now() - started, routeCount),
      );
      return result;
    };

    if (!query) {
      const stage1 = rewriteQueryWithRules({ ...input, query: '' });
      return finish(stage1, input, { stage1_source: 'rules' });
    }

    const scene = input.scene ?? 'general';
    const candidateEntities =
      input.options?.candidateEntities ??
      (await this.dictionary.findRoughCandidatesAsync(
        query,
        input.session?.selectedDestination,
        12,
        scene,
      ));

    const enrichedInput: QueryRewriteInput = {
      ...input,
      options: { ...input.options, candidateEntities },
    };

    let stage1 = rewriteQueryWithRules(enrichedInput);
    let stage1Source: 'llm' | 'rules' = 'rules';
    let entityResolutionSource: 'redis_exact' | 'none' = 'none';

    const exactResolution = await this.entityResolution?.tryExactResolution(query, scene);
    if (exactResolution?.skipStage1Llm) {
      stage1 = buildStage1FromExactEntity(enrichedInput, exactResolution);
      stage1Source = 'rules';
      entityResolutionSource = 'redis_exact';
      this.logger.debug(
        `Redis 精确别名命中，跳过 Stage 1 LLM: alias=${exactResolution.matchedAlias} → ${exactResolution.entity.name}`,
      );
      return finish(stage1, enrichedInput, {
        stage1_source: stage1Source,
        entity_resolution_source: entityResolutionSource,
      });
    }

    if (this.llmService) {
      try {
        const kgSection = this.dictionary.buildKnowledgeGraphPromptSection(
          query,
          input.session?.selectedDestination,
        );
        const prompt = buildStage1Prompt(enrichedInput, candidateEntities, kgSection);
        const schema = getQueryRewriteStage1Schema();
        const provider = this.llmService.getDefaultProvider?.() ?? LlmProvider.DEEPSEEK;
        const raw = await this.llmService.callLlmWithSchema(provider, prompt, schema);
        stage1 = parseStage1Response(raw, enrichedInput);
        stage1Source = 'llm';
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Stage 1 LLM 失败，降级规则: ${msg}`);
        stage1 = rewriteQueryWithRules(enrichedInput);
        stage1Source = 'rules';
      }
    }

    return finish(stage1, enrichedInput, {
      stage1_source: stage1Source,
      entity_resolution_source: entityResolutionSource,
    });
  }

  private async runStage2(
    stage1: ReturnType<typeof rewriteQueryWithRules>,
    input: QueryRewriteInput,
    meta: { stage1_source: 'llm' | 'rules' },
  ): Promise<QueryRewriteResult> {
    const candidates = input.options?.candidateEntities ?? [];

    // Stage 2a: 确定性后处理
    const deterministic = postProcessStandardization(stage1, input, {
      normalizeEntity: (raw) => this.dictionary.normalizeEntity(raw),
      constrainDestination: (dest, cands) => this.dictionary.constrainDestination(dest, cands),
      candidateEntities: candidates,
    });
    deterministic.pipeline = {
      stage1_source: meta.stage1_source,
      stage2_deterministic: true,
      stage2_generative: false,
    };

    // Stage 2b: 生成式场景扩展（当前以规则场景词为主，避免二次 LLM 延迟）
    if (!shouldEnableGenerativeExpansion(input)) {
      return deterministic;
    }

    const extraScenario: string[] = [];
    if (this.llmService && deterministic.expansion_routes.scenario.length < 2) {
      try {
        extraScenario.push(...(await this.expandScenarioWithLlm(deterministic.contextualized_query)));
      } catch {
        // 已有规则 scenario，忽略
      }
    }

    const withGenerative = assembleQueryRewriteResult(stage1, input, {
      stage1_source: meta.stage1_source,
      stage2_deterministic: true,
      stage2_generative: extraScenario.length > 0,
    }, extraScenario);

    // 保留 Stage 2a 图谱约束后的 standardized_query
    withGenerative.standardized_query = deterministic.standardized_query;
    withGenerative.contextualized_query = deterministic.contextualized_query;
    return withGenerative;
  }

  /** Stage 2b 轻量 LLM：仅补场景协同词，控制 Token */
  private async expandScenarioWithLlm(contextualizedQuery: string): Promise<string[]> {
    const prompt = `为旅游搜索查询补充最多3个场景协同检索词（JSON 字符串数组），不要解释。
查询: "${contextualizedQuery}"`;
    const provider = this.llmService!.getDefaultProvider?.() ?? LlmProvider.DEEPSEEK;
    const raw = await this.llmService!.callLlmWithSchema(provider, prompt, {
      type: 'array',
      items: { type: 'string' },
      maxItems: 3,
    });
    const parsed = typeof raw === 'string' ? JSON.parse(raw.trim().replace(/^```[\s\S]*?\n|```$/g, '')) : raw;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 3) : [];
  }
}
