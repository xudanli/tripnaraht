/**
 * Tripnara 统一 Query Rewriting 类型定义。
 */

import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';

export type QueryRewriteScene = 'accommodation' | 'hotel' | 'rag' | 'poi' | 'general';

/** 改写调用画像：用户端默认开启生成式扩展，Agent 内部子任务默认关闭以控成本 */
export type QueryRewriteProfile = 'user_facing' | 'agent_internal';

export interface QueryRewriteMessageTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface QueryRewriteSessionContext {
  selectedDestination?: string;
  preferences?: Record<string, unknown>;
  messageHistory?: QueryRewriteMessageTurn[];
}

export interface QueryRewriteSpatioTemporalContext {
  now?: Date;
  locationLabel?: string;
  countryCode?: string;
  /** 绑定行程时的日期窗口，用于 resolveTripTemporalAnchor */
  tripStartYmd?: string;
  tripEndYmd?: string;
}

export interface QueryRewriteOptions {
  /** 是否启用 Stage 2b 生成式场景扩展（默认由 profile 决定） */
  enableGenerativeExpansion?: boolean;
  /** Stage 1 注入的候选实体（外部可预填，否则由 Dictionary 粗筛） */
  candidateEntities?: string[];
}

export interface QueryRewriteInput {
  query: string;
  scene?: QueryRewriteScene;
  profile?: QueryRewriteProfile;
  session?: QueryRewriteSessionContext;
  spatioTemporal?: QueryRewriteSpatioTemporalContext;
  /** POI 检索场景：行程节奏/疲劳/天气等上下文（Stage 2a 确定性后缀） */
  poiContext?: PoiSearchContext;
  options?: QueryRewriteOptions;
}

/** Stage 1 LLM 结构化输出（不含 expansion_routes） */
export interface QueryRewriteStage1Result {
  original_query: string;
  contextualized_query: string;
  standardized_query: StandardizedQuery;
  discard_previous_destination?: boolean;
  confidence: number;
}

export interface QueryRewriteExpansionRoutes {
  synonym: string[];
  hyponym: string[];
  scenario: string[];
}

export interface StandardizedQuery {
  destination?: string;
  poi?: string;
  category?: string;
  rank_level?: string;
  duration?: string;
  time_range?: string;
  filters?: Record<string, unknown>;
}

export interface QueryRewriteResult {
  original_query: string;
  contextualized_query: string;
  expansion_routes: QueryRewriteExpansionRoutes;
  standardized_query: StandardizedQuery;
  confidence: number;
  /** 管道元信息（调试/观测） */
  pipeline?: {
    stage1_source: 'llm' | 'rules';
    stage2_deterministic: boolean;
    stage2_generative: boolean;
    /** v1.1 可观测性：关联下游召回埋点 */
    trace_id?: string;
    /** Week 2 P1：Redis 精确别名命中跳过了 Stage 1 LLM */
    entity_resolution_source?: 'redis_exact' | 'none';
  };
}
