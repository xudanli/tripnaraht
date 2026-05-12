import {
  appendDecisionCausality,
  attachOutcomeToCausalityRecord,
  buildBlockedAtGateCausalityRecord,
  finalizeDecisionCausalityRecord,
} from './decision-causality';
import type { TripWorldState } from '../decision/world-model';
import { DECISION_CAUSALITY_SCHEMA_V0 } from './decision-causality.types';
import type { ExecutionDecision } from './execution-gate.types';

describe('decision causality chain', () => {
  const baseState = (): TripWorldState =>
    ({
      context: {
        destination: 'IS',
        startDate: '2026-06-01',
        durationDays: 3,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: new Date().toISOString() },
    }) as TripWorldState;

  it('appendDecisionCausality builds chain', () => {
    const state = baseState();
    const gate: ExecutionDecision = {
      type: 'BLOCK',
      reason: 'test',
      codes: ['SNAPSHOT_INVALIDATED'],
    };
    const rec = buildBlockedAtGateCausalityRecord({
      causality_id: 'dc_1',
      started_at: '2026-01-01T00:00:00.000Z',
      tick_kind: 'generate_plan',
      trace_request_id: 'tr_1',
      reality: {},
      policy_engine: { verdict: 'BLOCK', codes: ['SNAPSHOT_INVALIDATED'], reasons: ['x'] },
      execution_gate: gate,
    });
    appendDecisionCausality(state, rec);
    expect(state.signals.decisionCausalityChain?.length).toBe(1);
    expect(state.signals.decisionCausalityChain?.[0].schema).toBe(DECISION_CAUSALITY_SCHEMA_V0);
    expect(state.signals.decisionCausalityChain?.[0].plan_execution.phase).toBe('blocked_at_gate');
  });

  it('finalizeDecisionCausalityRecord merges plan section', () => {
    const draft = {
      causality_id: 'dc_2',
      started_at: '2026-01-01T00:00:00.000Z',
      tick_kind: 'generate_plan' as const,
      trace_request_id: 'tr_2',
      reality: { snapshot_id: 's1', validity_status: 'VALID' as const },
      policy_engine: { verdict: 'ALLOW' as const, codes: ['SNAPSHOT_VALID'], reasons: [] },
      execution_gate: { type: 'ALLOW' } as ExecutionDecision,
    };
    const record = finalizeDecisionCausalityRecord(draft, {
      phase: 'completed',
      log: {
        runId: 'run_x',
        at: new Date().toISOString(),
        trigger: 'initial_generate',
        plannerVersion: '1',
        strategyMix: ['abu', 'drdre', 'neptune'],
        inputDigest: {
          destination: 'IS',
          startDate: '2026-06-01',
          durationDays: 3,
          signalUpdatedAt: new Date().toISOString(),
        },
        chosenActions: [],
      } as any,
      plan: {
        version: 'pv1',
        days: [{ day: 1, date: '2026-06-01', timeSlots: [{ id: 'a' }, { id: 'b' }] as any }],
      } as any,
    });
    expect(record.plan_execution.phase).toBe('completed');
    expect(record.plan_execution.plan_slots_estimate).toBe(2);
    expect(record.plan_execution.plan_version).toBe('pv1');
  });

  it('attachOutcomeToCausalityRecord merges outcome link', () => {
    const state = baseState();
    const gate: ExecutionDecision = {
      type: 'BLOCK',
      reason: 'test',
      codes: ['SNAPSHOT_INVALIDATED'],
    };
    const rec = buildBlockedAtGateCausalityRecord({
      causality_id: 'dc_o1',
      started_at: '2026-01-01T00:00:00.000Z',
      tick_kind: 'generate_plan',
      reality: {},
      policy_engine: { verdict: 'BLOCK', codes: ['SNAPSHOT_INVALIDATED'], reasons: ['x'] },
      execution_gate: gate,
    });
    appendDecisionCausality(state, rec);
    expect(
      attachOutcomeToCausalityRecord(state, 'dc_o1', {
        ops_reality_snapshot_id: 'snap_ops_1',
        summary_ref: 'replay_ok',
      }),
    ).toBe(true);
    expect(state.signals.decisionCausalityChain?.[0].outcome?.ops_reality_snapshot_id).toBe('snap_ops_1');
  });
});
