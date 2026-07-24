import { Logger } from '@nestjs/common';
import { QueryRewriteMetricsService } from '../services/query-rewrite-metrics.service';
import { bindQueryRewriteDownstreamSafe } from './query-rewrite-metrics-bind.util';

describe('query-rewrite-metrics-bind.util', () => {
  it('bindQueryRewriteDownstreamSafe 在无 trace 时静默跳过', () => {
    const svc = new QueryRewriteMetricsService();
    const spy = jest.spyOn(svc, 'bindDownstreamResults');
    bindQueryRewriteDownstreamSafe(svc, {
      traceId: undefined,
      totalResults: 0,
      downstreamScene: 'poi',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('trackAgentInternalRewrite + bind 形成 POI 闭环', () => {
    const svc = new QueryRewriteMetricsService();
    const rewrite = {
      original_query: 'Iceland attractions',
      contextualized_query: 'Iceland attractions hidden gems',
      expansion_routes: { synonym: [], hyponym: [], scenario: ['hidden'] },
      standardized_query: {},
      confidence: 0.7,
    };
    const traceId = svc.trackAgentInternalRewrite(rewrite, 'poi', 3);
    bindQueryRewriteDownstreamSafe(
      svc,
      { traceId, totalResults: 0, downstreamScene: 'poi' },
      new Logger('test'),
    );
    expect(rewrite.pipeline?.trace_id).toBe(traceId);
  });
});
