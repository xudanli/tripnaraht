import { mountRouteAndRunEstimatedCostUsd } from './cost-governance-observability.util';
import {
  enrichRouteAndRunCostInPlace,
  resolveRouteAndRunCostEstUsd,
  resolveRouteAndRunTokensEst,
} from './route-and-run-cost-est.util';
import {
  clearRouteAndRunRequestCost,
  recordRouteAndRunRequestCost,
  resetRouteAndRunRequestCostAccumulatorsForTests,
} from './route-and-run-request-cost-accumulator.util';

describe('route-and-run-cost-est.util', () => {
  afterEach(() => {
    resetRouteAndRunRequestCostAccumulatorsForTests();
  });

  it('prefers mounted carrier cost over accumulator', () => {
    const request = { request_id: 'r-mounted' };
    mountRouteAndRunEstimatedCostUsd(request as never, 0.042);
    recordRouteAndRunRequestCost('r-mounted', { totalTokens: 1000, costUsd: 0.01 });
    expect(
      resolveRouteAndRunCostEstUsd({ requestCarrier: request as never, requestId: 'r-mounted' }),
    ).toBe(0.042);
  });

  it('uses LLM usage accumulator when present', () => {
    recordRouteAndRunRequestCost('r-acc', { totalTokens: 2500, costUsd: 0.00375 });
    const request = { request_id: 'r-acc' };
    expect(
      resolveRouteAndRunCostEstUsd({ requestCarrier: request as never, requestId: 'r-acc' }),
    ).toBe(0.00375);
    expect(
      resolveRouteAndRunTokensEst({ requestCarrier: request as never, requestId: 'r-acc' }),
    ).toBe(2500);
    clearRouteAndRunRequestCost('r-acc');
  });

  it('falls back to orchestration totalCost then token heuristic', () => {
    const request = { request_id: 'r-orch' };
    expect(
      resolveRouteAndRunCostEstUsd({
        requestCarrier: request as never,
        orchestrationTotalCost: 0.005,
      }),
    ).toBe(0.005);
    expect(
      resolveRouteAndRunCostEstUsd({
        requestCarrier: request as never,
        agenticTotalTokens: 5000,
      }),
    ).toBe(0.01);
  });

  it('enrichRouteAndRunCostInPlace mounts estimated cost on request', () => {
    const request = { request_id: 'r-enrich' };
    recordRouteAndRunRequestCost('r-enrich', { totalTokens: 1000, costUsd: 0.0015 });
    const out = enrichRouteAndRunCostInPlace(request as never, { requestId: 'r-enrich' });
    expect(out.costEstUsd).toBe(0.0015);
    expect(out.tokensEst).toBe(1000);
    expect((request as { __routeAndRunEstimatedCostUsd?: number }).__routeAndRunEstimatedCostUsd).toBe(
      0.0015,
    );
  });
});
