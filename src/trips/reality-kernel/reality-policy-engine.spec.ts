import { assertRealityWorldReadAllowed, evaluatePlanningTick, evaluateRealityPolicy, evaluateWorldRead } from './reality-policy-engine';
import { RealityExecutionBlockedError } from './reality-execution-gate';
import { DECISION_CONTEXT_SCHEMA_V0 } from './decision-context.types';
import { REALITY_SNAPSHOT_SCHEMA_V0 } from './reality-snapshot.types';
import type { RealitySnapshotV0 } from './reality-snapshot.types';

describe('RealityPolicyEngine', () => {
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

  const prevBoundary = process.env.REALITY_READ_BOUNDARY;
  const prevEsc = process.env.REALITY_BYPASS_ESCALATION;
  const prevAudit = process.env.REALITY_READ_AUDIT;

  afterEach(() => {
    process.env.REALITY_READ_BOUNDARY = prevBoundary;
    process.env.REALITY_BYPASS_ESCALATION = prevEsc;
    process.env.REALITY_READ_AUDIT = prevAudit;
  });

  it('evaluatePlanningTick BLOCK on INVALIDATED', () => {
    const ctx = {
      schema: DECISION_CONTEXT_SCHEMA_V0,
      snapshot_id: 'rs_x',
      reality: {
        ...baseSnap,
        validity: { status: 'INVALIDATED' as const, invalidation_reasons: ['stale'] },
      },
      planning_horizon: { start_at: '2026-06-01T00:00:00Z', end_at: '2026-06-05T00:00:00Z' },
      enforcement: 'bound_v0' as const,
    };
    const r = evaluatePlanningTick(ctx);
    expect(r.verdict).toBe('BLOCK');
    expect(r.codes).toContain('SNAPSHOT_INVALIDATED');
    expect(r.execution.allowContinuePlanning).toBe(false);
  });

  it('evaluatePlanningTick DEGRADE on STALE', () => {
    const ctx = {
      schema: DECISION_CONTEXT_SCHEMA_V0,
      snapshot_id: 'rs_x',
      reality: { ...baseSnap, validity: { status: 'STALE' as const } },
      planning_horizon: { start_at: '2026-06-01T00:00:00Z', end_at: '2026-06-05T00:00:00Z' },
      enforcement: 'bound_v0' as const,
    };
    const r = evaluatePlanningTick(ctx);
    expect(r.verdict).toBe('DEGRADE');
    expect(r.codes).toContain('SNAPSHOT_STALE');
    expect(r.execution.degradePlan).toBe(true);
    expect(r.execution.allowContinuePlanning).toBe(true);
  });

  it('evaluateWorldRead BLOCK when SNAPSHOT_ONLY and missing context', () => {
    const r = evaluateWorldRead({
      policy: 'SNAPSHOT_ONLY',
      decisionContext: undefined,
      boundaryEnabled: true,
    });
    expect(r.verdict).toBe('BLOCK');
    expect(r.codes).toContain('SNAPSHOT_ONLY_NO_CTX');
  });

  it('evaluateRealityPolicy dispatches by scenario', () => {
    const r = evaluateRealityPolicy({ scenario: 'world_read', policy: 'SNAPSHOT_ONLY', decisionContext: undefined, boundaryEnabled: true });
    expect(r.verdict).toBe('BLOCK');
  });

  it('assertRealityWorldReadAllowed throws when bypass escalation is block', () => {
    process.env.REALITY_READ_BOUNDARY = '1';
    process.env.REALITY_READ_AUDIT = '1';
    process.env.REALITY_BYPASS_ESCALATION = 'block';
    const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    expect(() => assertRealityWorldReadAllowed(logger as any, 'Comp', 'detail')).toThrow(
      RealityExecutionBlockedError,
    );
  });
});
