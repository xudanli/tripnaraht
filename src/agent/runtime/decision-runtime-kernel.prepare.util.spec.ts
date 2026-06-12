import { prepareDecisionRuntimeTick } from './decision-runtime-kernel.prepare.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';

function minimalMemory(): AgentMemoryContext {
  return {
    snapshotId: 'snap-k',
    snapshotVersion: 1,
    requestId: 'req-k',
    userId: 'user-1',
    tripId: 'trip-1',
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
    recentTripFeedbacks: [],
    loadedAt: new Date().toISOString(),
    observability: { layers: [] },
  };
}

describe('prepareDecisionRuntimeTick', () => {
  it('records MEMORY_HYDRATE and MVCC_FREEZE phases', async () => {
    const memory = minimalMemory();
    const result = await prepareDecisionRuntimeTick(
      {
        memoryContextAssembler: {
          loadForRouteAndRun: async () => memory,
          buildObservability: () => ({ revision: 'v1', loaded: true }),
        },
        hydrateRequestFitnessIfNeeded: async () => undefined,
        agentExecutionContextFactory: {
          createFromFrozenMemory: (m) => ({
            requestId: m.requestId,
            snapshotId: m.snapshotId,
            snapshotVersion: m.snapshotVersion,
            executionBinding: {
              snapshot_id: m.snapshotId,
              snapshot_version: m.snapshotVersion,
              request_id: m.requestId,
            },
          }),
        },
        getEntryResponses: () => ({
          createReplayMemoryPersistenceUnavailableResponse: () => ({}) as any,
          createReplayMemorySnapshotNotFoundResponse: () => ({}) as any,
        }),
      },
      {
        request_id: 'req-k',
        user_id: 'user-1',
        message: 'hello',
        trip_id: 'trip-1',
      } as RouteAndRunRequestDto,
      Date.now(),
    );

    expect(result.earlyResponse).toBeUndefined();
    expect(result.bundle.memory.snapshotId).toBe('snap-k');
    const phases = result.bundle.tickObs.phases.map((p) => p.phase);
    expect(phases).toContain('MEMORY_HYDRATE');
    expect(phases).toContain('LEDGER_RECONCILE');
    expect(phases).toContain('MVCC_FREEZE');
    expect(Object.isFrozen(result.bundle.memory)).toBe(true);
  });
});
