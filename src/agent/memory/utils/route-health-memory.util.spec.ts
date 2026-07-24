import {
  buildActiveRouteHealthSnapshot,
  buildFailurePatternsFromRouteHealth,
  collectL3LookupCandidates,
  normalizeFailureReasonToken,
  resolveRouteHealthFromContext,
  routeHealthSnapshotKey,
} from './route-health-memory.util';

describe('route-health-memory.util', () => {
  it('buildFailurePatternsFromRouteHealth dedupes and caps tokens', () => {
    const patterns = buildFailurePatternsFromRouteHealth(
      {
        commonFailureReasons: ['Fatigue Overload', 'fatigue_overload', 'VISA_POLICY', ''],
      },
      3,
    );
    expect(patterns).toEqual(['fatigue_overload:1', 'visa_policy:1']);
  });

  it('buildActiveRouteHealthSnapshot computes successRate and healthScore', () => {
    const snap = buildActiveRouteHealthSnapshot(
      {
        routeDirectionId: 42,
        countryCode: 'is',
        totalRuns: 10,
        successRuns: 4,
        failureRuns: 6,
        commonFailureReasons: ['fatigue_overload'],
        commonRepairs: ['split_day'],
        lastUpdated: new Date(),
      },
      '2026-06-09T00:00:00.000Z',
    );
    expect(snap.successRate).toBe(0.4);
    expect(snap.countryCode).toBe('IS');
    expect(snap.healthScore).toBeGreaterThan(0);
    expect(snap.healthScore).toBeLessThan(1);
  });

  it('collectL3LookupCandidates prefers active trip route with default country', () => {
    const candidates = collectL3LookupCandidates({
      activeTripState: { tripId: 't1', currentPhase: 'decision', selectedRouteDirectionId: '7', decisionLogSummary: '', artifactsRefs: [], lastUpdated: '' },
      recentDecisions: [
        {
          id: 'd1',
          userId: 'u1',
          countryCode: 'NO',
          month: 7,
          selectedRouteDirectionId: 99,
          rejectedRouteDirectionIds: [],
          keyConstraints: {},
          scoreBreakdown: {},
          explanation: { whySelected: '', whyRejected: [], riskPoints: [] },
          createdAt: new Date(),
        },
      ],
      defaultCountryCode: 'IS',
    });
    expect(candidates[0]).toEqual({ routeDirectionId: 7, countryCode: 'IS' });
    expect(candidates.some((c) => c.routeDirectionId === 99 && c.countryCode === 'NO')).toBe(true);
  });

  it('resolveRouteHealthFromContext reads routeHealthByKey before active snapshot', () => {
    const key = routeHealthSnapshotKey(1, 'IS');
    const byKey = buildActiveRouteHealthSnapshot(
      {
        routeDirectionId: 1,
        countryCode: 'IS',
        totalRuns: 2,
        successRuns: 1,
        failureRuns: 1,
        commonFailureReasons: [],
        commonRepairs: [],
        lastUpdated: new Date(),
      },
      '2026-06-09T00:00:00.000Z',
    );
    const active = { ...byKey, healthScore: 0.99 };
    const resolved = resolveRouteHealthFromContext(
      { routeHealthByKey: { [key]: byKey }, activeRouteHealthSnapshot: active },
      1,
      'IS',
    );
    expect(resolved?.healthScore).toBe(byKey.healthScore);
  });

  it('normalizeFailureReasonToken slugifies reasons', () => {
    expect(normalizeFailureReasonToken('  Fatigue Overload ')).toBe('fatigue_overload');
  });
});
