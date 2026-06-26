import { AgentOpsOutcomeBridgeService } from './agent-ops-outcome-bridge.service';
import { CausalRuntimeSessionService } from '../../trips/causal-runtime/causal-runtime-session.service';
import type { TripWorldState } from '../../trips/decision/world-model';
import { appendDecisionCausality } from '../../trips/reality-kernel/decision-causality';

function buildState(): TripWorldState {
  const state: TripWorldState = {
    context: { tripId: 'trip_agent', startDate: '2026-07-01', endDate: '2026-07-03' },
    candidatesByDate: {},
    signals: { lastDecisionCausalityId: 'dc_agent' },
    policies: {},
  } as TripWorldState;

  appendDecisionCausality(state, {
    schema: 'tripnara/decision-causality/v0',
    causality_id: 'dc_agent',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    tick_kind: 'generate_plan',
    reality: { validity: { status: 'VALID' } },
    policy_engine: { verdict: 'ALLOW', codes: [] },
    execution_gate: { verdict: 'ALLOW' },
    plan_execution: { phase: 'completed' },
    outcome: { ops_reality_snapshot_id: 'snap_agent', linked_at: new Date().toISOString() },
  } as any);

  return state;
}

describe('AgentOpsOutcomeBridgeService', () => {
  it('buildEnrichedOutcomeBody auto-fills state from session', () => {
    const session = new CausalRuntimeSessionService();
    session.capture({ state: buildState(), requestId: 'req_1' });

    const bridge = new AgentOpsOutcomeBridgeService(session);
    const body = bridge.buildEnrichedOutcomeBody({
      tripId: 'trip_agent',
      outcome: { schema: 'p-ops-2-outcome/v1', summary: 'ok' },
    });

    expect(body.causality_id).toBe('dc_agent');
    expect(body.snapshotId).toBe('snap_agent');
    expect(body.state?.context.tripId).toBe('trip_agent');
    expect(body.stateAutoFilled).toBe(true);
  });

  it('recordRealityOutcome delegates to OpsRealityAudit with enriched payload', async () => {
    const session = new CausalRuntimeSessionService();
    session.capture({ state: buildState() });

    const ops = {
      recordOutcome: jest.fn().mockResolvedValue(true),
    };

    const bridge = new AgentOpsOutcomeBridgeService(session, ops as any);
    const result = await bridge.recordRealityOutcome({
      tripId: 'trip_agent',
      outcome: {
        schema: 'p-ops-2-outcome/v1',
        summary: 'missed glacier meetup',
        extensions: {
          causal_observation: {
            schema: 'tripnara/causal-observation/v1',
            metrics: { iceland_miss_prob: 1 },
            missed_appointment: true,
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.snapshotId).toBe('snap_agent');
    expect(result.stateAutoFilled).toBe(true);
    expect(ops.recordOutcome).toHaveBeenCalledWith(
      'snap_agent',
      expect.objectContaining({
        extensions: expect.objectContaining({
          decision_causality_id: 'dc_agent',
        }),
      }),
      undefined,
    );
  });
});
