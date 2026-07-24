import { QueryRewriteMetricsService } from './query-rewrite-metrics.service';

describe('QueryRewriteMetricsService', () => {
  it('trackQueryRewriteLog + bindDownstreamResults 绑定零结果', () => {
    const svc = new QueryRewriteMetricsService();
    const traceId = svc.createTraceId();
    svc.trackQueryRewriteLog({
      trace_id: traceId,
      original_query: '三亚 海景',
      contextualized_query: '三亚 海景酒店',
      scene: 'hotel',
      profile: 'user_facing',
      duration_ms: 42,
      stage1_source: 'llm',
      stage2_deterministic: true,
      stage2_generative: false,
      confidence: 0.9,
      route_count: 4,
    });
    svc.bindDownstreamResults({
      trace_id: traceId,
      downstream_total_results: 0,
      downstream_scene: 'hotel',
    });
    expect(svc.toStage1SourceMetric('rules')).toBe('rule_fallback');
  });

  it('trackAgentInternalRewrite 为 POI 同步管道登记 trace', () => {
    const svc = new QueryRewriteMetricsService();
    const rewrite = {
      original_query: 'test',
      contextualized_query: 'test enriched',
      expansion_routes: { synonym: [], hyponym: [], scenario: [] },
      standardized_query: {},
      confidence: 0.6,
    };
    const traceId = svc.trackAgentInternalRewrite(rewrite, 'poi', 2);
    expect(traceId).toBeTruthy();
    expect(rewrite.pipeline?.trace_id).toBe(traceId);
    svc.bindDownstreamResults({
      trace_id: traceId,
      downstream_total_results: 5,
      downstream_scene: 'poi',
    });
  });
});
