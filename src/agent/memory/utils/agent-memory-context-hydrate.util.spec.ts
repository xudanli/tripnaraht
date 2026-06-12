import {
  hydrateAgentMemoryContextFromPersistence,
  simulateRedisSnapshotRoundTrip,
} from './agent-memory-context-hydrate.util';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';

describe('agent-memory-context-hydrate.util', () => {
  const baseContext = {
    snapshotId: 'snap-1',
    snapshotVersion: 1,
    requestId: 'req-1',
    userId: 'u1',
    tripId: 't1',
    userProfile: null,
    userBasics: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: null,
    ledgerRecomputePlan: null,
    recentWorldDecisions: [],
    activeTripState: null,
    recoveryHistory: [],
    failurePatterns: ['fatigue_overload:1'],
    recentTripFeedbacks: [],
    activeRouteHealthSnapshot: {
      routeDirectionId: 123,
      countryCode: 'IS',
      successRate: 0.4,
      healthScore: 0.2,
      totalRuns: 10,
      successRuns: 4,
      failureRuns: 6,
      commonFailureReasons: ['fatigue_overload'],
      commonRepairs: [],
      loadedAt: '2026-06-09T00:00:00.000Z',
    },
    routeHealthByKey: {
      '123_IS': {
        routeDirectionId: 123,
        countryCode: 'IS',
        successRate: 0.4,
        healthScore: 0.2,
        totalRuns: 10,
        successRuns: 4,
        failureRuns: 6,
        commonFailureReasons: ['fatigue_overload'],
        commonRepairs: [],
        loadedAt: '2026-06-09T00:00:00.000Z',
      },
    },
    loadedAt: '2026-06-09T00:00:00.000Z',
    observability: { layers: ['L3_route_health'], metadata: { L3_ok: true } },
  } satisfies AgentMemoryContext;

  it('simulateRedisSnapshotRoundTrip preserves L3 index and failurePatterns', () => {
    const hydrated = simulateRedisSnapshotRoundTrip(baseContext);

    expect(hydrated.failurePatterns).toEqual(['fatigue_overload:1']);
    expect(hydrated.routeHealthByKey?.['123_IS']?.healthScore).toBe(0.2);
    expect(hydrated.activeRouteHealthSnapshot?.routeDirectionId).toBe(123);
    expect(hydrated.observability.metadata).toEqual({ L3_ok: true });
    expect(hydrated.recentTripFeedbacks).toEqual([]);
  });

  it('hydrateAgentMemoryContextFromPersistence repairs degraded JSON types', () => {
    const wire = JSON.stringify(baseContext);
    const parsed = JSON.parse(wire) as Partial<AgentMemoryContext>;
    parsed.routeHealthByKey = {
      '123_IS': {
        ...(parsed.routeHealthByKey as Record<string, unknown>)['123_IS'],
        routeDirectionId: '123',
        healthScore: '0.2',
        totalRuns: '10',
      },
    };

    const hydrated = hydrateAgentMemoryContextFromPersistence(parsed);

    expect(hydrated.routeHealthByKey?.['123_IS']?.routeDirectionId).toBe(123);
    expect(hydrated.routeHealthByKey?.['123_IS']?.healthScore).toBe(0.2);
    expect(hydrated.failurePatterns).toEqual(['fatigue_overload:1']);
  });
});
