import { buildControlledReplanningContext } from './build-controlled-replanning-context.util';
import { inferReplanningScopeIsolation } from './infer-replanning-scope-isolation.util';
import type { HydratedGovernanceRuntimeContext } from '../activation/governance-activation.types';
import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';

describe('inferReplanningScopeIsolation', () => {
  it('narrows trip intent to segment when Westfjords risk present', () => {
    const snapshot = {
      compactedAt: 1,
      activeRestrictions: [],
      unresolvedBlocks: [],
      dominantPolicies: [],
      latestWorldRisks: ['westfjords_closure'],
      sourceEventIds: [],
    } as any;
    const scope = inferReplanningScopeIsolation({
      snapshot,
      replanningIntent: {
        trigger: 'route_invalidated',
        requiredActions: [],
        preservedConstraints: [],
        forbiddenStrategies: [],
        replanningScope: 'trip',
      } as any,
    });
    expect(scope).toBe('segment');
  });
});

describe('buildControlledReplanningContext', () => {
  it('carries directive, restrictions, and search constraints', () => {
    const directive: RuntimeBranchDirective = {
      branchType: 'replanning',
      sourceActivationIds: ['trigger_replanning:x'],
      replanningIntent: {
        trigger: 'execution_block',
        requiredActions: ['a'],
        preservedConstraints: [],
        forbiddenStrategies: ['fs1'],
        replanningScope: 'trip',
      },
    };
    const hydrated = {
      snapshot: {
        compactedAt: 2,
        tripId: undefined,
        activeRestrictions: ['halt_automated_execution'],
        unresolvedBlocks: [{ ledgerEventId: 'b' }],
        dominantPolicies: ['p1'],
        latestWorldRisks: [],
        sourceEventIds: [],
        runtimeState: 'NORMAL',
      },
      activations: [],
      pressure: { worldPressure: 0.9, weather: 0.9, policyPressure: 0, executionPressure: 0.6, recoveryPressure: 0 },
      suggestedPolicyAdjustments: [],
      replayedEventCount: 1,
      runtimeState: 'NORMAL',
      driftAssessment: {
        signals: [],
        recoveryQuality: { score: 1, recoveryCycleCount: 0, recurrenceCount: 0 },
        driftPolicySuggestions: [],
      },
      driftInfluences: [],
    } as HydratedGovernanceRuntimeContext;
    const ctx = buildControlledReplanningContext({ directive, hydrated });
    expect(ctx.inheritedRestrictions).toContain('halt_automated_execution');
    expect(ctx.forbiddenStrategies).toContain('fs1');
    expect(ctx.planningSearchConstraints.forbidRemoteHighlands).toBe(true);
    expect(ctx.runtimeState).toBe('NORMAL');
    expect(ctx.runtimeStateHint).toBe('REPLANNING');
  });
});
