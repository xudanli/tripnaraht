/**
 * Query Rewriting v1.1 可观测性指标 Schema。
 */

import type { QueryRewriteProfile, QueryRewriteScene } from './query-rewriting.types';

export type QueryRewriteStage1SourceMetric = 'llm' | 'rule_fallback';

export interface QueryRewriteMetrics {
  trace_id: string;
  original_query: string;
  contextualized_query: string;
  scene: QueryRewriteScene | string;
  profile: QueryRewriteProfile;
  duration_ms: number;
  stage1_source: QueryRewriteStage1SourceMetric;
  stage2_deterministic: boolean;
  stage2_generative: boolean;
  confidence: number;
  route_count?: number;
  /** 下游召回绑定（hotel / poi / rag） */
  downstream_total_results?: number;
  zero_result?: boolean;
}

export interface QueryRewriteDownstreamBinding {
  trace_id: string;
  downstream_total_results: number;
  downstream_scene?: string;
}
