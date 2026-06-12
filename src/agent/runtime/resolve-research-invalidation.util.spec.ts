import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { DecisionOsExecutionContext } from './decision-os-execution-context';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import {
  mapIncrementalScopesToAssetScopes,
  resolveResearchInvalidation,
} from './resolve-research-invalidation.util';
import { computeIncrementalResearchScopes } from './compute-incremental-research-scopes.util';

function minimalMemory(): AgentMemoryContext {
  return {
    snapshotId: 'snap-1',
    snapshotVersion: 1,
    requestId: 'req-1',
    userId: 'user-1',
    tripId: 'trip-abc',
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

describe('resolveResearchInvalidation', () => {
  it('maps incremental poi+transit to destination+transport asset scopes', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换景点',
      trip_id: 'trip-abc',
    } as RouteAndRunRequestDto;

    const dosCtx = new DecisionOsExecutionContext({
      request,
      memory: minimalMemory(),
      planDelta: [
        {
          op: 'REPLACE',
          target: { type: 'POI', dayIndex: 1, id: 'poi_a' },
          payload: { query: '涩谷', patchMeta: {} },
        },
      ],
    });

    const resolution = resolveResearchInvalidation(request, dosCtx);
    expect(resolution.source).toBe('dos_incremental');
    expect(resolution.incrementalScopes).toHaveLength(2);
    expect(resolution.assetScopes).toEqual(
      expect.arrayContaining(['destination', 'transport']),
    );
    expect(resolution.assetScopes).not.toContain('hotel');
  });

  it('global constraint invalidates all asset domains except common', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '改约束',
      trip_id: 'trip-abc',
    } as RouteAndRunRequestDto;

    const dosCtx = new DecisionOsExecutionContext({
      request,
      memory: minimalMemory(),
      planDelta: [
        {
          op: 'REPLACE',
          target: { type: 'ROUTE_CONSTRAINT' },
          payload: { patchMeta: {} },
        },
      ],
    });

    const incremental = computeIncrementalResearchScopes(dosCtx);
    const mapped = mapIncrementalScopesToAssetScopes(incremental);
    expect(mapped).toEqual(
      expect.arrayContaining(['hotel', 'flight', 'destination', 'transport', 'compliance']),
    );
  });

  it('falls back to legacy when dos context has no planDelta', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换酒店',
      trip_id: 'trip-abc',
      options: {
        itinerary_context: { is_replan: true },
        intent_flags: { modification_targets: ['hotel'] },
        refinement_signal: { type: 'REPLACEMENT' },
      },
    } as RouteAndRunRequestDto;

    const dosCtx = new DecisionOsExecutionContext({
      request,
      memory: minimalMemory(),
      planDelta: [],
    });

    const resolution = resolveResearchInvalidation(request, dosCtx);
    expect(resolution.source).toBe('legacy_nlu');
    expect(resolution.assetScopes).toContain('hotel');
  });
});
