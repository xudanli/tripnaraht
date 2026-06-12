import { ShadowModeDiffService } from './shadow-mode-diff.service';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';

describe('ShadowModeDiffService', () => {
  const svc = new ShadowModeDiffService();

  it('diffMemorySnapshots reports failurePatterns and routeHealth key deltas', () => {
    const base = {
      travelPreference: { pace: 'SLOW' },
      decisionLedger: { nodes: [{ id: 'n1' }, { id: 'n2' }] },
      failurePatterns: ['fatigue_overload:1'],
      recentTripFeedbacks: [{ tripId: 't1', satisfactionScore: 2, fatigueLevel: 'HIGH' as const, overallSuccess: true, abandoned: false, createdAt: '2026-01-01T00:00:00.000Z', primaryTags: [] }],
      routeHealthByKey: { '1_IS': { routeDirectionId: 1, countryCode: 'IS' } as any },
      activeRouteHealthSnapshot: { routeDirectionId: 1, countryCode: 'IS' } as any,
    } as AgentMemoryContext;

    const next = {
      ...base,
      travelPreference: { pace: 'FAST' },
      decisionLedger: { nodes: [{ id: 'n1' }] },
      failurePatterns: ['visa_policy:1'],
      recentTripFeedbacks: [],
      routeHealthByKey: { '2_IS': { routeDirectionId: 2, countryCode: 'IS' } as any },
      activeRouteHealthSnapshot: { routeDirectionId: 2, countryCode: 'IS' } as any,
    } as AgentMemoryContext;

    const diff = svc.diffMemorySnapshots(base, next);

    expect(diff.failurePatternsDelta.removed).toEqual(['fatigue_overload:1']);
    expect(diff.failurePatternsDelta.added).toEqual(['visa_policy:1']);
    expect(diff.routeHealthKeysDelta.removed).toEqual(['1_IS']);
    expect(diff.routeHealthKeysDelta.added).toEqual(['2_IS']);
    expect(diff.activeRouteHealthChanged).toBe(true);
    expect(diff.travelPreferenceChangedKeys).toContain('pace');
    expect(diff.tripFeedbackTailDelta.removedTripIds).toEqual(['t1']);
    expect(diff.ledgerNodesCountDelta).toBe(1);
  });
});
