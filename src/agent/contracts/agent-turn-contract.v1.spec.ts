import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import { buildAgentTurnContract } from './agent-turn-contract.v1';

function minimalMemory(overrides: Partial<AgentMemoryContext> = {}): AgentMemoryContext {
  return {
    snapshotId: 'snap-1',
    snapshotVersion: 1,
    requestId: 'req-mem',
    userId: 'u1',
    tripId: 't1',
    userProfile: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: null,
    ledgerRecomputePlan: null,
    recentWorldDecisions: [],
    activeTripState: null,
    recoveryHistory: [],
    failurePatterns: [],
    loadedAt: '2026-05-13T00:00:00.000Z',
    observability: { layers: ['layer_a'] },
    ...overrides,
  };
}

describe('buildAgentTurnContract', () => {
  it('aggregates input, context, scope, budget, profile, and LOCAL affinity', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      trip_id: 'trip-99',
      message: 'hello',
      conversation_context: { locale: 'zh-CN', timezone: 'Asia/Shanghai' },
      meta: { client_profile: 'factory_deterministic' },
      options: {
        max_seconds: 45,
        max_steps: 5,
        dry_run: true,
        allow_webbrowse: false,
        enable_live_tools: ['weather'],
        intent_mode: 'AUTO',
        intent_flags: { live_facts: true },
        execution_model_runtime_hint: '  hint  ',
      },
      preference_profile: {
        cost_sensitivity: 0.5,
        time_sensitivity: 0.6,
      },
    } as RouteAndRunRequestDto;

    const c = buildAgentTurnContract({ request, memory: minimalMemory() });

    expect(c.version).toBe('v1');
    expect(c.input).toMatchObject({
      request_id: 'req-1',
      user_id: 'user-1',
      trip_id: 'trip-99',
      message: 'hello',
      intent_mode: 'AUTO',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
    });
    expect(c.context.snapshot_id).toBe('snap-1');
    expect(c.context.observability_layers).toEqual(['layer_a']);
    expect(c.scope.dry_run).toBe(true);
    expect(c.scope.enable_live_tools).toEqual(['weather']);
    expect(c.scope.live_facts).toBe(true);
    expect(c.budget.max_seconds).toBe(45);
    expect(c.budget.max_steps).toBe(5);
    expect(c.profile.client_profile).toBe('factory_deterministic');
    expect(c.profile.execution_model_runtime_hint).toBe('hint');
    expect(c.preference_weights).toMatchObject({ cost_sensitivity: 0.5, time_sensitivity: 0.6 });
    expect(c.execution_affinity).toBe('LOCAL');
  });

  it('uses camelCase tripId when trip_id empty', () => {
    const request = {
      request_id: 'r',
      user_id: 'u',
      trip_id: '',
      tripId: 'from-camel',
      message: 'm',
    } as RouteAndRunRequestDto;
    const c = buildAgentTurnContract({ request, memory: minimalMemory({ tripId: null }) });
    expect(c.input.trip_id).toBe('from-camel');
  });

  it('maps meta client_profile and readonly_mode to tool_policy_tags', () => {
    const request = {
      request_id: 'r',
      user_id: 'u',
      message: 'x',
      meta: { client_profile: 'SAP_analytics_readonly' },
      options: { readonly_mode: true },
    } as RouteAndRunRequestDto;
    const c = buildAgentTurnContract({ request, memory: minimalMemory() });
    expect(c.scope.tool_policy_tags).toEqual(expect.arrayContaining(['READONLY_GATE', 'SAP_CHAIN_READ_ONLY']));
  });

  it('applies governance pressure to preference weights when hydrated', () => {
    const request = {
      request_id: 'r',
      user_id: 'u',
      trip_id: 't1',
      message: 'm',
      preference_profile: { time_sensitivity: 0.8, effort_sensitivity: 0.7, cost_sensitivity: 0.6 },
    } as RouteAndRunRequestDto;
    const governanceRuntime = {
      snapshot: {
        compactedAt: 1,
        unresolvedBlocks: [],
        activeRestrictions: [],
        dominantPolicies: [],
        latestWorldRisks: [],
        sourceEventIds: [],
        runtimeState: 'NORMAL',
      },
      activations: [],
      pressure: { worldPressure: 1, weather: 1, policyPressure: 0, executionPressure: 0, recoveryPressure: 0 },
      suggestedPolicyAdjustments: [],
      replayedEventCount: 0,
      runtimeState: 'NORMAL',
      driftAssessment: {
        signals: [],
        recoveryQuality: { score: 1, recoveryCycleCount: 0, recurrenceCount: 0 },
        driftPolicySuggestions: [],
      },
      driftInfluences: [],
    } as any;
    const c = buildAgentTurnContract({ request, memory: minimalMemory(), governanceRuntime });
    expect(c.governanceRuntime).toBe(governanceRuntime);
    expect(c.preference_weights?.time_sensitivity).toBeDefined();
    expect(Number(c.preference_weights?.time_sensitivity)).toBeLessThan(0.8);
  });
});
