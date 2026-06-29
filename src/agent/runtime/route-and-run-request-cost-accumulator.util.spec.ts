import {
  getRouteAndRunRequestCost,
  recordRouteAndRunRequestCost,
  resetRouteAndRunRequestCostAccumulatorsForTests,
} from './route-and-run-request-cost-accumulator.util';

describe('route-and-run-request-cost-accumulator.util', () => {
  afterEach(() => resetRouteAndRunRequestCostAccumulatorsForTests());

  it('aggregates per-provider buckets', () => {
    recordRouteAndRunRequestCost('req-1', {
      totalTokens: 100,
      costUsd: 0.01,
      provider: 'openai',
    });
    recordRouteAndRunRequestCost('req-1', {
      totalTokens: 50,
      costUsd: 0.005,
      provider: 'vllm',
    });
    const snap = getRouteAndRunRequestCost('req-1');
    expect(snap?.totalTokens).toBe(150);
    expect(snap?.byProvider.openai?.tokens).toBe(100);
    expect(snap?.byProvider.vllm?.calls).toBe(1);
    expect(snap?.providerSwitchCount).toBe(1);
  });
});
