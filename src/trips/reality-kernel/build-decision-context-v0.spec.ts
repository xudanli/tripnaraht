import {
  buildDecisionContextV0,
  computePlanningHorizonFromTripContext,
} from './build-decision-context-v0';
import { DECISION_CONTEXT_SCHEMA_V0 } from './decision-context.types';
import { REALITY_SNAPSHOT_SCHEMA_V0, type RealitySnapshotV0 } from './reality-snapshot.types';

describe('build-decision-context-v0', () => {
  it('computePlanningHorizonFromTripContext spans durationDays', () => {
    const h = computePlanningHorizonFromTripContext({
      destination: 'IS',
      startDate: '2026-06-01',
      durationDays: 3,
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
    });
    expect(h.start_at.startsWith('2026-06-01')).toBe(true);
    expect(h.end_at.startsWith('2026-06-03')).toBe(true);
  });

  it('buildDecisionContextV0 wraps snapshot', () => {
    const snap: RealitySnapshotV0 = {
      schema: REALITY_SNAPSHOT_SCHEMA_V0,
      snapshot_id: 'rs_test',
      valid_at: '2026-01-01T00:00:00.000Z',
      generated_at: '2026-01-01T00:00:01.000Z',
      domain: { region: 'iceland' },
      layers: {},
      consistency: { max_staleness_sec: 0, degraded: false },
      validity: { status: 'VALID' },
      provenance: { generated_by: 'test', source_versions: {} },
    };
    const ctx = buildDecisionContextV0(snap, {
      start_at: '2026-06-01T00:00:00.000Z',
      end_at: '2026-06-05T23:59:59.999Z',
    });
    expect(ctx.schema).toBe(DECISION_CONTEXT_SCHEMA_V0);
    expect(ctx.snapshot_id).toBe('rs_test');
    expect(ctx.enforcement).toBe('bound_v0');
  });
});
