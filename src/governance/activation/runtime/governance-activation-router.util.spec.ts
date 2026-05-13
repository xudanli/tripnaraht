import { routeGovernanceActivationsToRuntimeBranch } from './governance-activation-router.util';
import type { HydratedGovernanceRuntimeContext } from '../governance-activation.types';

describe('routeGovernanceActivationsToRuntimeBranch', () => {
  const base = (): HydratedGovernanceRuntimeContext => ({
    snapshot: {
      compactedAt: 1,
      tripId: 't',
      activeRestrictions: [],
      unresolvedBlocks: [],
      dominantPolicies: [],
      latestWorldRisks: [],
      sourceEventIds: [],
      runtimeState: 'NORMAL',
    },
    activations: [],
    pressure: { worldPressure: 0, weather: 0, policyPressure: 0, executionPressure: 0, recoveryPressure: 0 },
    suggestedPolicyAdjustments: [],
    replayedEventCount: 0,
    runtimeState: 'NORMAL',
    driftAssessment: {
      signals: [],
      recoveryQuality: { score: 1, recoveryCycleCount: 0, recurrenceCount: 0 },
      driftPolicySuggestions: [],
    },
    driftInfluences: [],
  });

  it('returns needs_confirmation over replanning', () => {
    const h = base();
    h.activations = [
      { activationType: 'trigger_replanning', sourceEventIds: ['b'], rationale: [], activationConfidence: 1 },
      { activationType: 'require_confirmation', sourceEventIds: ['x'], rationale: [], activationConfidence: 0.5 },
    ];
    h.snapshot.unresolvedBlocks = [{ ledgerEventId: 'b' }];
    expect(routeGovernanceActivationsToRuntimeBranch(h).branchType).toBe('needs_confirmation');
  });

  it('returns halted when suppress present without require_confirmation', () => {
    const h = base();
    h.activations = [{ activationType: 'suppress_execution', sourceEventIds: ['h'], rationale: [], activationConfidence: 1 }];
    expect(routeGovernanceActivationsToRuntimeBranch(h).branchType).toBe('halted');
  });

  it('returns replanning only when open blocks and trigger_replanning', () => {
    const h = base();
    h.activations = [{ activationType: 'trigger_replanning', sourceEventIds: ['b'], rationale: [], activationConfidence: 1 }];
    h.snapshot.unresolvedBlocks = [{ ledgerEventId: 'b' }];
    const d = routeGovernanceActivationsToRuntimeBranch(h);
    expect(d.branchType).toBe('replanning');
    expect(d.replanningIntent).toBeUndefined();
  });

  it('returns normal when trigger_replanning but blocks resolved', () => {
    const h = base();
    h.activations = [{ activationType: 'trigger_replanning', sourceEventIds: ['b'], rationale: [], activationConfidence: 1 }];
    h.snapshot.unresolvedBlocks = [{ ledgerEventId: 'b', resolvedAt: 99, resolutionEventId: 'c' }];
    expect(routeGovernanceActivationsToRuntimeBranch(h).branchType).toBe('normal_execution');
  });
});
