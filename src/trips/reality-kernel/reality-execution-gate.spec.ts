import type { RealityPolicyEvaluateResult } from './reality-policy-engine.types';
import {
  bindExecutionDecisionToContext,
  enforceExecutionDecision,
  ExecutionGate,
  RealityExecutionBlockedError,
  resolveExecutionGate,
  requiresPlanningHeuristicWorldModelOnly,
} from './reality-execution-gate';
import type { DecisionContextV0 } from './decision-context.types';
import { DECISION_CONTEXT_SCHEMA_V0 } from './decision-context.types';
import { REALITY_SNAPSHOT_SCHEMA_V0 } from './reality-snapshot.types';
import type { RealitySnapshotV0 } from './reality-snapshot.types';

describe('ExecutionGate.resolve', () => {
  const baseSnap: RealitySnapshotV0 = {
    schema: REALITY_SNAPSHOT_SCHEMA_V0,
    snapshot_id: 'rs_x',
    valid_at: '2026-01-01T00:00:00.000Z',
    generated_at: '2026-01-01T00:00:00.000Z',
    domain: { region: 'iceland' },
    layers: {},
    consistency: { max_staleness_sec: 0, degraded: false },
    validity: { status: 'VALID' },
    provenance: { generated_by: 't', source_versions: {} },
  };

  const allowPolicy = (
    overrides: Partial<RealityPolicyEvaluateResult> = {},
  ): RealityPolicyEvaluateResult => ({
    verdict: 'ALLOW',
    codes: ['SNAPSHOT_VALID'],
    reasons: [],
    execution: {
      allowContinuePlanning: true,
      degradePlan: false,
      requireReplan: false,
      blockLiveWorldRead: false,
    },
    ...overrides,
  });

  it('BLOCK when snapshot INVALIDATED (reality layer)', () => {
    const ctx = {
      schema: DECISION_CONTEXT_SCHEMA_V0,
      snapshot_id: 'rs_x',
      reality: {
        ...baseSnap,
        validity: { status: 'INVALIDATED', invalidation_reasons: ['x'] },
      },
      planning_horizon: { start_at: 'a', end_at: 'b' },
      enforcement: 'bound_v0' as const,
    } as DecisionContextV0;
    const d = resolveExecutionGate({
      executionType: 'planning_tick',
      decisionContext: ctx,
      policyResult: allowPolicy(),
    });
    expect(d.type).toBe('BLOCK');
    if (d.type === 'BLOCK') expect(d.codes).toContain('SNAPSHOT_INVALIDATED');
  });

  it('BLOCK when policy verdict BLOCK', () => {
    const d = resolveExecutionGate({
      executionType: 'world_read',
      decisionContext: undefined,
      policyResult: allowPolicy({
        verdict: 'BLOCK',
        codes: ['SNAPSHOT_ONLY_NO_CTX'],
        reasons: ['missing ctx'],
        execution: {
          allowContinuePlanning: false,
          degradePlan: false,
          requireReplan: true,
          blockLiveWorldRead: true,
        },
      }),
    });
    expect(d.type).toBe('BLOCK');
  });

  it('DEGRADE PLANNING_HEURISTIC_ONLY when STALE on planning_tick', () => {
    const ctx = {
      schema: DECISION_CONTEXT_SCHEMA_V0,
      snapshot_id: 'rs_x',
      reality: { ...baseSnap, validity: { status: 'STALE' } },
      planning_horizon: { start_at: 'a', end_at: 'b' },
      enforcement: 'bound_v0' as const,
    } as DecisionContextV0;
    const d = resolveExecutionGate({
      executionType: 'planning_tick',
      decisionContext: ctx,
      policyResult: allowPolicy({
        verdict: 'DEGRADE',
        codes: ['SNAPSHOT_STALE'],
        reasons: [],
        execution: {
          allowContinuePlanning: true,
          degradePlan: true,
          requireReplan: false,
          blockLiveWorldRead: false,
        },
      }),
    });
    expect(d.type).toBe('DEGRADE');
    if (d.type === 'DEGRADE') expect(d.strategy).toBe('PLANNING_HEURISTIC_ONLY');
  });

  it('DEGRADE WORLD_READ_BOUND_AUDIT for world_read', () => {
    const d = resolveExecutionGate({
      executionType: 'world_read',
      decisionContext: undefined,
      policyResult: allowPolicy({
        verdict: 'DEGRADE',
        codes: ['BYPASS_WARN'],
        reasons: [],
        execution: {
          allowContinuePlanning: true,
          degradePlan: false,
          requireReplan: false,
          blockLiveWorldRead: false,
        },
      }),
    });
    expect(d.type).toBe('DEGRADE');
    if (d.type === 'DEGRADE') expect(d.strategy).toBe('WORLD_READ_BOUND_AUDIT');
  });

  it('enforceExecutionDecision throws RealityExecutionBlockedError', () => {
    expect(() =>
      enforceExecutionDecision(
        { type: 'BLOCK', reason: 'x', codes: ['SNAPSHOT_INVALIDATED'] },
        {},
      ),
    ).toThrow(RealityExecutionBlockedError);
  });

  it('bindExecutionDecisionToContext sets strategy', () => {
    const ctx = {
      schema: DECISION_CONTEXT_SCHEMA_V0,
      snapshot_id: 'rs_x',
      reality: baseSnap,
      planning_horizon: { start_at: 'a', end_at: 'b' },
      enforcement: 'bound_v0' as const,
    } as DecisionContextV0;
    bindExecutionDecisionToContext(ctx, {
      type: 'DEGRADE',
      strategy: 'PLANNING_HEURISTIC_ONLY',
    });
    expect(ctx.execution_runtime_mode).toBe('DEGRADED');
    expect(requiresPlanningHeuristicWorldModelOnly(ctx)).toBe(true);
  });

  it('ExecutionGate.resolve matches resolveExecutionGate', () => {
    const d = ExecutionGate.resolve({
      executionType: 'planning_tick',
      decisionContext: undefined,
      policyResult: allowPolicy(),
    });
    expect(d.type).toBe('ALLOW');
  });
});
