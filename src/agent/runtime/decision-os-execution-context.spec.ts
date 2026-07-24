import { DecisionOsExecutionContext } from './decision-os-execution-context';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { PlanDeltaIR } from '../contracts/plan-delta-ir.types';
import { compileLegacyPlanDeltaFromRequest } from './legacy-plan-delta-compiler.util';
import { computeIncrementalResearchScopes } from './compute-incremental-research-scopes.util';
import {
  mapIncrementalScopesToAssetScopes,
  resolveResearchInvalidation,
} from './resolve-research-invalidation.util';

function minimalMemory(overrides: Partial<AgentMemoryContext> = {}): AgentMemoryContext {
  return {
    snapshotId: 'snap-1',
    snapshotVersion: 1,
    requestId: 'req-1',
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
    ...overrides,
  };
}

function createMockDosContext(deltas: PlanDeltaIR[]): DecisionOsExecutionContext {
  const request = {
    request_id: 'req-1',
    user_id: 'user-1',
    message: '把第二天的东京塔换成涩谷',
    trip_id: 'trip-123',
  } as RouteAndRunRequestDto;

  return new DecisionOsExecutionContext({
    request,
    memory: minimalMemory({ tripId: 'trip-123' }),
    planDelta: deltas,
  });
}

describe('DecisionOsExecutionContext', () => {
  it('freezes memory snapshot and exposes narrative projection', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换酒店',
      trip_id: 'trip-1',
    } as RouteAndRunRequestDto;

    const ctx = new DecisionOsExecutionContext({
      request,
      memory: minimalMemory(),
      worldState: {
        revision: 'v1',
        tripId: 'trip-1',
        name: '冰岛行',
        destination: 'IS',
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        days: [],
      },
    });

    expect(ctx.tripId).toBe('trip-1');
    expect(ctx.activeTripSummary).toContain('[系统注入·当前行程摘要]');
    expect(ctx.activeTripSummary).toContain('冰岛行');
    expect(Object.isFrozen(ctx.memorySnapshot)).toBe(true);
    expect(ctx.planDelta).toHaveLength(0);
  });

  it('updateWorldState is the sole mutation path for world state', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: 'test',
      trip_id: 'trip-1',
    } as RouteAndRunRequestDto;

    const ctx = new DecisionOsExecutionContext({
      request,
      memory: minimalMemory(),
      worldState: {
        revision: 'v1',
        tripId: 'trip-1',
        days: [{ date: '2026-06-01', items: [] }],
      },
    });

    ctx.updateWorldState((cur) =>
      cur
        ? {
            ...cur,
            days: [...cur.days, { date: '2026-06-02', items: [] }],
          }
        : null,
    );

    expect(ctx.worldState?.days).toHaveLength(2);
  });

  it('applyNarrativeToConversationContext prepends summary to recent_messages', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: 'test',
      trip_id: 'trip-1',
      conversation_context: { recent_messages: ['用户: hi'] },
    } as RouteAndRunRequestDto;

    const ctx = new DecisionOsExecutionContext({
      request,
      memory: minimalMemory(),
      worldState: {
        revision: 'v1',
        tripId: 'trip-1',
        name: 'Test Trip',
        days: [],
      },
    });

    ctx.applyNarrativeToConversationContext(request);
    expect(request.conversation_context?.recent_messages?.[0]).toContain('[系统注入·当前行程摘要]');
    expect(request.conversation_context?.recent_messages?.[1]).toBe('用户: hi');
  });
});

describe('compileLegacyPlanDeltaFromRequest', () => {
  it('compiles modification_targets when is_replan is true', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换第二天酒店',
      trip_id: 'trip-1',
      options: {
        itinerary_context: { is_replan: true },
        intent_flags: { modification_targets: ['hotel', 'flight'] },
        refinement_signal: { type: 'REPLACEMENT' },
      },
    } as RouteAndRunRequestDto;

    const deltas = compileLegacyPlanDeltaFromRequest(request);
    expect(deltas).toHaveLength(2);
    expect(deltas[0].op).toBe('REPLACE');
    expect(deltas[0].target.type).toBe('HOTEL');
    expect(deltas[0].target.dayIndex).toBe(1);
    expect(deltas[1].target.type).toBe('FLIGHT');
  });

  it('returns empty when not replan and no refinement signal', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '天气怎么样',
      trip_id: 'trip-1',
      options: {
        intent_flags: { modification_targets: ['hotel'] },
      },
    } as RouteAndRunRequestDto;

    expect(compileLegacyPlanDeltaFromRequest(request)).toEqual([]);
  });
});

describe('Decision OS Step 2: Incremental Invalidation Engine', () => {
  it('POI 变更触发 poi+transit 级联失效，且不误伤 hotel', () => {
    const mockPoiDelta: PlanDeltaIR = {
      op: 'REPLACE',
      target: { type: 'POI', dayIndex: 1, id: 'poi_tokyo_tower' },
      payload: { query: '涩谷', patchMeta: {} },
    };

    const mockContext = createMockDosContext([mockPoiDelta]);
    const scopes = computeIncrementalResearchScopes(mockContext);

    const domains = scopes.map((s) => s.domain);
    expect(domains).toContain('poi');
    expect(domains).toContain('transit');
    expect(domains).not.toContain('hotel');

    const transitScope = scopes.find((s) => s.domain === 'transit');
    expect(transitScope?.dayIndex).toBe(1);
    expect(transitScope?.scopeId).toContain('day_1:transit_mesh');
  });

  it('HOTEL delta 仅失效 hotel 域', () => {
    const mockContext = createMockDosContext([
      {
        op: 'REPLACE',
        target: { type: 'HOTEL', dayIndex: 2 },
        payload: { query: '涩谷酒店', patchMeta: {} },
      },
    ]);

    const scopes = computeIncrementalResearchScopes(mockContext);
    expect(scopes.map((s) => s.domain)).toEqual(['hotel']);
    expect(scopes[0].scopeId).toContain('day_2:hotel');
  });

  it('resolveResearchInvalidation 优先 DOS 路径并映射 asset scopes', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换景点',
      trip_id: 'trip-123',
      options: {
        itinerary_context: { is_replan: true },
        intent_flags: { modification_targets: ['poi'] },
        refinement_signal: { type: 'REPLACEMENT' },
      },
    } as RouteAndRunRequestDto;

    const dosCtx = createMockDosContext([
      {
        op: 'REPLACE',
        target: { type: 'POI', dayIndex: 1 },
        payload: { query: '涩谷', patchMeta: {} },
      },
    ]);

    const resolution = resolveResearchInvalidation(request, dosCtx);
    expect(resolution.source).toBe('dos_incremental');
    expect(resolution.assetScopes).toContain('destination');
    expect(resolution.assetScopes).toContain('transport');
    expect(resolution.assetScopes).not.toContain('hotel');

    const mapped = mapIncrementalScopesToAssetScopes(resolution.incrementalScopes);
    expect(mapped).toEqual(expect.arrayContaining(['destination', 'transport']));
  });

  it('无 DOS delta 时降级 legacy NLU', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换酒店',
      trip_id: 'trip-1',
      options: {
        itinerary_context: { is_replan: true },
        intent_flags: { modification_targets: ['hotel'] },
        refinement_signal: { type: 'REPLACEMENT' },
      },
    } as RouteAndRunRequestDto;

    const resolution = resolveResearchInvalidation(request, undefined);
    expect(resolution.source).toBe('legacy_nlu');
    expect(resolution.assetScopes).toContain('hotel');
  });
});
