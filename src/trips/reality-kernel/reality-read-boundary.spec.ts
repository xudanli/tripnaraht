import { evaluateWorldReadGate } from './reality-read-boundary';
import { DECISION_CONTEXT_SCHEMA_V0 } from './decision-context.types';
import { REALITY_SNAPSHOT_SCHEMA_V0 } from './reality-snapshot.types';
import type { RealitySnapshotV0 } from './reality-snapshot.types';

describe('evaluateWorldReadGate', () => {
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

  it('SNAPSHOT_ONLY blocks without decision context', () => {
    expect(evaluateWorldReadGate({ policy: 'SNAPSHOT_ONLY', decisionContext: undefined, component: 'x' }).allowed).toBe(
      false,
    );
  });

  it('SNAPSHOT_PREFERRED allows without context', () => {
    expect(evaluateWorldReadGate({ policy: 'SNAPSHOT_PREFERRED', decisionContext: undefined, component: 'x' }).allowed).toBe(
      true,
    );
  });

  it('SNAPSHOT_ONLY blocks invalidated snapshot', () => {
    const ctx = {
      schema: DECISION_CONTEXT_SCHEMA_V0,
      snapshot_id: 'rs_x',
      reality: {
        ...baseSnap,
        validity: { status: 'INVALIDATED', invalidation_reasons: ['max_staleness_sec_threshold'] },
      },
      planning_horizon: { start_at: '2026-06-01T00:00:00Z', end_at: '2026-06-05T00:00:00Z' },
      enforcement: 'bound_v0' as const,
    };
    expect(evaluateWorldReadGate({ policy: 'SNAPSHOT_ONLY', decisionContext: ctx, component: 'x' }).allowed).toBe(false);
  });
});
