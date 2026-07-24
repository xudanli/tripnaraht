import {
  buildLlmRoutingAdminSnapshot,
  buildLlmRoutingObservabilityFromAccumulator,
} from './harness-llm-routing-observability.util';
import {
  recordRouteAndRunRequestCost,
  resetRouteAndRunRequestCostAccumulatorsForTests,
} from './route-and-run-request-cost-accumulator.util';

describe('harness-llm-routing-observability.util', () => {
  afterEach(() => resetRouteAndRunRequestCostAccumulatorsForTests());

  it('builds per-request routing slice', () => {
    recordRouteAndRunRequestCost('r1', { totalTokens: 80, costUsd: 0.008, provider: 'deepseek' });
    recordRouteAndRunRequestCost('r1', { totalTokens: 20, costUsd: 0.002, provider: 'vllm' });
    const slice = buildLlmRoutingObservabilityFromAccumulator({
      request: { request_id: 'r1', options: { llm_provider: 'auto' } },
    });
    expect(slice?.schemaId).toBe('tripnara.llm_routing@v1');
    expect(slice?.multi_provider_request).toBe(true);
    expect(slice?.calls_by_provider).toHaveLength(2);
  });

  it('builds admin provider share snapshot', () => {
    const admin = buildLlmRoutingAdminSnapshot({
      source: 'db',
      seriesDays: 7,
      rows: [
        { provider: 'vllm', cost_usd: 3, tokens: 3000, calls: 10 },
        { provider: 'openai', cost_usd: 1, tokens: 500, calls: 2 },
      ],
    });
    expect(admin.providers[0]?.provider).toBe('vllm');
    expect(admin.providers[0]?.share_pct).toBe(75);
  });
});
