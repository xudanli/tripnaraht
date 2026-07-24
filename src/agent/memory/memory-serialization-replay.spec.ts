import { DecisionParamsInjectorService } from './services/decision-params-injector.service';
import { MemorySnapshotPersistenceService } from './persistence/memory-snapshot-persistence.service';
import { simulateRedisSnapshotRoundTrip } from './utils/agent-memory-context-hydrate.util';
import { createDefaultDecisionParams } from './interfaces/decision-params.interface';
import type { AgentMemoryContext } from './interfaces/agent-memory-context.interface';

describe('Memory OS Replay Hydrate Verification', () => {
  function buildContextWithL3(healthScore: number): AgentMemoryContext {
    return {
      snapshotId: 'snap-replay-1',
      snapshotVersion: 1,
      requestId: 'req-replay-1',
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
        successRate: 0.5,
        healthScore,
        totalRuns: 10,
        successRuns: 5,
        failureRuns: 5,
        commonFailureReasons: ['fatigue_overload'],
        commonRepairs: [],
        loadedAt: '2026-06-09T00:00:00.000Z',
      },
      routeHealthByKey: {
        '123_IS': {
          routeDirectionId: 123,
          countryCode: 'IS',
          successRate: 0.5,
          healthScore,
          totalRuns: 10,
          successRuns: 5,
          failureRuns: 5,
          commonFailureReasons: ['fatigue_overload'],
          commonRepairs: [],
          loadedAt: '2026-06-09T00:00:00.000Z',
        },
      },
      loadedAt: '2026-06-09T00:00:00.000Z',
      observability: { layers: ['L3_route_health'] },
    };
  }

  async function scoreWithContext(ctx: AgentMemoryContext, baseScore = 80): Promise<number> {
    const getRouteDirectionHealth = jest.fn().mockResolvedValue({
      routeDirectionId: 123,
      countryCode: 'IS',
      totalRuns: 100,
      successRuns: 99,
      failureRuns: 1,
      commonFailureReasons: [],
      commonRepairs: [],
      lastUpdated: new Date(),
    });

    const injector = new DecisionParamsInjectorService(
      { getRouteDirectionHealth } as any,
      {} as any,
      {} as any,
      { diff: jest.fn() } as any,
      { get: jest.fn().mockReturnValue(ctx) } as any,
    );

    return injector.adjustRouteDirectionScore(123, 'IS', baseScore, createDefaultDecisionParams());
  }

  it('Injector score is identical before and after Redis round-trip hydrate', async () => {
    const original = buildContextWithL3(0.2);
    const hydrated = simulateRedisSnapshotRoundTrip(original);

    const scoreOriginal = await scoreWithContext(original);
    const scoreHydrated = await scoreWithContext(hydrated);

    expect(scoreHydrated).toBe(scoreOriginal);
    expect(scoreOriginal).toBeCloseTo(80 * (0.5 + 0.2 * 0.5));
  });

  it('MemorySnapshotPersistenceService.loadBySnapshotId applies hydrate guard', async () => {
    const original = buildContextWithL3(0.35);
    const envelope = {
      schema: 'v1' as const,
      snapshot_id: original.snapshotId,
      snapshot_version: original.snapshotVersion,
      request_id: original.requestId,
      user_id: original.userId,
      trip_id: original.tripId,
      loaded_at: original.loadedAt,
      payload: JSON.parse(JSON.stringify(original)),
    };

    envelope.payload.routeHealthByKey['123_IS'].healthScore = '0.35';
    envelope.payload.routeHealthByKey['123_IS'].routeDirectionId = '123';

    const redis = {
      get: jest.fn().mockResolvedValue(envelope),
      set: jest.fn(),
    };

    const persistence = new MemorySnapshotPersistenceService(redis as any);
    const loaded = await persistence.loadBySnapshotId(original.snapshotId);

    expect(loaded?.routeHealthByKey?.['123_IS']?.healthScore).toBe(0.35);
    expect(loaded?.routeHealthByKey?.['123_IS']?.routeDirectionId).toBe(123);

    const scoreLoaded = await scoreWithContext(loaded!);
    const scoreOriginal = await scoreWithContext(original);
    expect(scoreLoaded).toBe(scoreOriginal);
  });
});
