/**
 * Query Rewriting 结构化埋点 — 管道出口统一 trackQueryRewriteLog。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';
import type {
  QueryRewriteDownstreamBinding,
  QueryRewriteMetrics,
  QueryRewriteStage1SourceMetric,
} from '../utils/query-rewrite-metrics.types';
import type { QueryRewriteInput, QueryRewriteResult } from '../utils/query-rewriting.types';

@Injectable()
export class QueryRewriteMetricsService {
  private readonly logger = new Logger(QueryRewriteMetricsService.name);
  /** 待绑定下游结果的改写 trace（内存，v1.1 轻量实现） */
  private readonly pendingByTrace = new Map<string, QueryRewriteMetrics>();

  constructor(
    @Optional() private readonly prometheus?: PrometheusMetricsService,
  ) {}

  createTraceId(): string {
    return randomUUID();
  }

  toStage1SourceMetric(source: 'llm' | 'rules'): QueryRewriteStage1SourceMetric {
    return source === 'llm' ? 'llm' : 'rule_fallback';
  }

  /**
   * 管道出口统一埋点（结构化日志 + Prometheus）。
   */
  trackQueryRewriteLog(metrics: QueryRewriteMetrics): void {
    this.pendingByTrace.set(metrics.trace_id, metrics);
    if (this.pendingByTrace.size > 500) {
      const oldest = this.pendingByTrace.keys().next().value;
      if (oldest) this.pendingByTrace.delete(oldest);
    }

    this.logger.log(
      JSON.stringify({
        event: 'query_rewrite',
        ...metrics,
      }),
    );

    this.prometheus?.recordQueryRewrite({
      scene: String(metrics.scene),
      profile: metrics.profile,
      stage1_source: metrics.stage1_source,
      stage2_generative: metrics.stage2_generative,
      duration_ms: metrics.duration_ms,
      confidence: metrics.confidence,
      zero_result: metrics.zero_result ?? false,
    });
  }

  /**
   * agent_internal 同步规则改写登记（POI / ITINERARY 子路径，0 Token）。
   * 须在 bindDownstreamResults 之前调用一次。
   */
  trackAgentInternalRewrite(
    result: QueryRewriteResult,
    scene: string,
    routeCount?: number,
  ): string {
    const traceId = result.pipeline?.trace_id ?? this.createTraceId();
    if (!result.pipeline) {
      result.pipeline = {
        stage1_source: 'rules',
        stage2_deterministic: true,
        stage2_generative: false,
        trace_id: traceId,
      };
    } else {
      result.pipeline.trace_id = traceId;
    }

    this.trackQueryRewriteLog({
      trace_id: traceId,
      original_query: result.original_query,
      contextualized_query: result.contextualized_query,
      scene,
      profile: 'agent_internal',
      duration_ms: 0,
      stage1_source: 'rule_fallback',
      stage2_deterministic: true,
      stage2_generative: false,
      confidence: result.confidence,
      route_count: routeCount,
    });
    return traceId;
  }

  /** 绑定下游召回结果（hotel / poi / rag 搜索完成后调用） */
  bindDownstreamResults(binding: QueryRewriteDownstreamBinding): void {
    const pending = this.pendingByTrace.get(binding.trace_id);
    const zeroResult = binding.downstream_total_results === 0;
    const scene = binding.downstream_scene ?? (pending ? String(pending.scene) : 'unknown');

    if (pending) {
      const enriched: QueryRewriteMetrics = {
        ...pending,
        downstream_total_results: binding.downstream_total_results,
        zero_result: zeroResult,
      };
      this.pendingByTrace.set(binding.trace_id, enriched);
    }

    this.logger.log(
      JSON.stringify({
        event: 'query_rewrite_downstream',
        trace_id: binding.trace_id,
        downstream_scene: binding.downstream_scene,
        downstream_total_results: binding.downstream_total_results,
        zero_result: zeroResult,
        had_pending_trace: Boolean(pending),
      }),
    );

    this.prometheus?.recordQueryRewriteDownstream({
      scene,
      zero_result: zeroResult,
      total_results: binding.downstream_total_results,
    });
  }

  buildMetricsFromRewrite(
    traceId: string,
    input: QueryRewriteInput,
    result: QueryRewriteResult,
    durationMs: number,
    routeCount?: number,
  ): QueryRewriteMetrics {
    const pipeline = result.pipeline;
    return {
      trace_id: traceId,
      original_query: result.original_query,
      contextualized_query: result.contextualized_query,
      scene: input.scene ?? 'general',
      profile: input.profile ?? 'user_facing',
      duration_ms: durationMs,
      stage1_source: this.toStage1SourceMetric(pipeline?.stage1_source ?? 'rules'),
      stage2_deterministic: pipeline?.stage2_deterministic ?? true,
      stage2_generative: pipeline?.stage2_generative ?? false,
      confidence: result.confidence,
      route_count: routeCount,
    };
  }
}
