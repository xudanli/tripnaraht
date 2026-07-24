import { DecisionParamsInjectorService } from './services/decision-params-injector.service';
import {
  hydrateAgentMemoryContextFromPersistence,
  simulateRedisSnapshotRoundTrip,
} from './utils/agent-memory-context-hydrate.util';
import { createDefaultDecisionParams } from './interfaces/decision-params.interface';
import type { AgentMemoryContext } from './interfaces/agent-memory-context.interface';

describe('Memory OS L4 Consistency & Serialization', () => {
  function buildContextWithL4(): AgentMemoryContext {
    return {
      snapshotId: 'snap-l4',
      snapshotVersion: 1,
      requestId: 'req-l4',
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
      failurePatterns: [],
      recentTripFeedbacks: [
        {
          tripId: 't1',
          satisfactionScore: 2,
          fatigueLevel: 'HIGH',
          overallSuccess: false,
          abandoned: false,
          createdAt: '2026-06-09T00:00:00.000Z',
          primaryTags: [],
        },
        {
          tripId: 't2',
          satisfactionScore: 4,
          fatigueLevel: 'HIGH',
          overallSuccess: true,
          abandoned: false,
          createdAt: '2026-06-08T00:00:00.000Z',
          primaryTags: [],
        },
      ],
      loadedAt: '2026-06-09T00:00:00.000Z',
      observability: { layers: ['L4_trip_feedback'], metadata: {} },
    };
  }

  it('applyDecisionParamsByTripFeedbackSnapshot is identical after Redis round-trip', () => {
    const original = buildContextWithL4();
    const hydrated = simulateRedisSnapshotRoundTrip(original);

    const injector = new DecisionParamsInjectorService(
      {} as any,
      {} as any,
      {} as any,
      { diff: jest.fn() } as any,
      undefined,
    );

    const base = createDefaultDecisionParams();
    base.constraints.maxDailyAscentM = 900;

    const paramsOriginal = injector.applyDecisionParamsByTripFeedbackSnapshot(
      original,
      JSON.parse(JSON.stringify(base)),
    );
    const paramsHydrated = injector.applyDecisionParamsByTripFeedbackSnapshot(
      hydrated,
      JSON.parse(JSON.stringify(base)),
    );

    expect(paramsOriginal.constraints.bufferTimeMin).toBeGreaterThanOrEqual(30);
    expect(paramsOriginal.constraints.maxDailyAscentM).toBeLessThanOrEqual(600);
    expect(paramsOriginal.repairPolicy.preferRestDay).toBe(true);
    expect(paramsOriginal).toEqual(paramsHydrated);
  });

  it('hydrateAgentMemoryContextFromPersistence repairs string satisfaction scores', () => {
    const wire = JSON.stringify(buildContextWithL4());
    const parsed = JSON.parse(wire) as Partial<AgentMemoryContext>;
    parsed.recentTripFeedbacks = [
      {
        ...(parsed.recentTripFeedbacks?.[0] as object),
        satisfactionScore: '2',
      },
    ];

    const hydrated = hydrateAgentMemoryContextFromPersistence(parsed);
    expect(hydrated.recentTripFeedbacks[0].satisfactionScore).toBe(2);
    expect(hydrated.recentTripFeedbacks[0].fatigueLevel).toBe('HIGH');
  });
});
