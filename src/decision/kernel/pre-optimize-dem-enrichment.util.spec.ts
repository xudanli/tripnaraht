import { enrichRoutePlanForOptimize } from './pre-optimize-dem-enrichment.util';

describe('pre-optimize-dem-enrichment.util (PR-4)', () => {
  it('passthrough when guard absent', async () => {
    const plan = { tripId: 't', routeDirectionId: 'rd', segments: [] };
    const result = await enrichRoutePlanForOptimize(plan);
    expect(result.source).toBe('passthrough');
    expect(result.patched).toBe(false);
  });

  it('delegates to StateConsistencyGuard when provided', async () => {
    const plan = { tripId: 't', routeDirectionId: 'rd', segments: [{ segmentId: 's1', dayIndex: 0, distanceKm: 10, ascentM: 0, slopePct: 0 }] };
    const enriched = { ...plan, segments: [{ ...plan.segments[0], ascentM: 120 }] };
    const guard = {
      enrichRoutePlanDraftIfNeeded: jest.fn(async () => ({ plan: enriched, patched: true })),
    };
    const result = await enrichRoutePlanForOptimize(plan, guard);
    expect(result.source).toBe('state_consistency_guard');
    expect(result.patched).toBe(true);
    expect(result.plan.segments[0].ascentM).toBe(120);
  });
});
