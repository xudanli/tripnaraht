import { CausalRuntimeSessionService } from './causal-runtime-session.service';
import type { TripWorldState } from '../decision/world-model';
import { appendDecisionCausality } from '../reality-kernel/decision-causality';

function minimalState(tripId: string, causalityId: string, snapshotId?: string): TripWorldState {
  const state: TripWorldState = {
    context: { tripId, startDate: '2026-07-01', endDate: '2026-07-05' },
    candidatesByDate: {},
    signals: { lastDecisionCausalityId: causalityId },
    policies: {},
  } as TripWorldState;

  appendDecisionCausality(state, {
    schema: 'tripnara/decision-causality/v0',
    causality_id: causalityId,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    tick_kind: 'generate_plan',
    reality: { validity: { status: 'VALID' } },
    policy_engine: { verdict: 'ALLOW', codes: [] },
    execution_gate: { verdict: 'ALLOW' },
    plan_execution: { phase: 'completed' },
    outcome: snapshotId ? { ops_reality_snapshot_id: snapshotId, linked_at: new Date().toISOString() } : undefined,
  } as any);

  return state;
}

describe('CausalRuntimeSessionService', () => {
  let service: CausalRuntimeSessionService;

  beforeEach(() => {
    service = new CausalRuntimeSessionService();
    service.clear();
  });

  it('captures trip world state with causality + ops snapshot', () => {
    const state = minimalState('trip_1', 'dc_test', 'snap_ops_1');
    const snap = service.capture({ state, requestId: 'req_1' });

    expect(snap?.tripId).toBe('trip_1');
    expect(snap?.lastDecisionCausalityId).toBe('dc_test');
    expect(snap?.opsRealitySnapshotId).toBe('snap_ops_1');
    expect(snap?.state.signals.decisionCausalityChain).toHaveLength(1);
  });

  it('resolves session by requestId', () => {
    const state = minimalState('trip_2', 'dc_req');
    service.capture({ state, requestId: 'trace_abc' });

    expect(service.getForRequestId('trace_abc')?.tripId).toBe('trip_2');
  });

  it('skips capture when tripId missing', () => {
    const state = minimalState('', 'dc_x');
    (state.context as any).tripId = '';
    expect(service.capture({ state })).toBeNull();
  });
});
