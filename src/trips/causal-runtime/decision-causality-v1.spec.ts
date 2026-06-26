import type { TripWorldState } from '../decision/world-model';
import {
  buildBlockedAtGateCausalityRecordV1,
  buildCausalDecisionTupleFromTick,
  finalizeDecisionCausalityRecordV1,
} from './decision-causality-v1';
import { DECISION_CAUSALITY_SCHEMA_V1 } from './decision-causality-v1.types';
import type { ExecutionDecision } from '../reality-kernel/execution-gate.types';

describe('decision-causality-v1', () => {
  const baseState = (): TripWorldState =>
    ({
      context: {
        tripId: 'trip-1',
        destination: 'IS',
        startDate: '2026-06-01',
        durationDays: 3,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      },
      candidatesByDate: {},
      signals: {
        lastUpdatedAt: new Date().toISOString(),
        repairEvaluation: {
          repairs: [
            {
              id: 'repair_shift_1',
              action: 'MOVE_SLOT_EARLIER',
              targetSlotIds: ['slot_a'],
              narrative: '提前出发以应对南岸阵风',
              priority: 1,
              confidence: 0.72,
            },
          ],
          suggestReevaluateExecutionQuality: true,
        },
      },
    }) as TripWorldState;

  it('buildCausalDecisionTupleFromTick captures alternatives and hypothesis', () => {
    const draft = {
      causality_id: 'dc_v1_1',
      started_at: '2026-01-01T00:00:00.000Z',
      tick_kind: 'generate_plan' as const,
      trace_request_id: 'tr_1',
      reality: { snapshot_id: 'snap_1', region: 'IS' },
      policy_engine: {
        verdict: 'DEGRADE' as const,
        codes: ['SNAPSHOT_STALE'],
        reasons: ['weather snapshot stale'],
      },
      execution_gate: { type: 'DEGRADE', strategy: 'CONSERVATIVE' } as ExecutionDecision,
    };

    const tuple = buildCausalDecisionTupleFromTick({ state: baseState(), draft });
    expect(tuple.context.trip_id).toBe('trip-1');
    expect(tuple.hypothesis?.causalChain).toContain('policy:SNAPSHOT_STALE');
    expect(tuple.alternatives.length).toBeGreaterThan(0);
    expect(tuple.alternatives[0].type).toBe('SHIFT_TIME');
  });

  it('finalizeDecisionCausalityRecordV1 upgrades schema and embeds tuple', () => {
    const draft = {
      causality_id: 'dc_v1_2',
      started_at: '2026-01-01T00:00:00.000Z',
      tick_kind: 'generate_plan' as const,
      reality: { snapshot_id: 'snap_1' },
      policy_engine: { verdict: 'ALLOW' as const, codes: [], reasons: [] },
      execution_gate: { type: 'ALLOW' } as ExecutionDecision,
    };

    const record = finalizeDecisionCausalityRecordV1(
      draft,
      {
        phase: 'completed',
        log: {
          runId: 'run_1',
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
          days: [{ day: 1, date: '2026-06-01', timeSlots: [{ id: 'a' }] as any }],
        } as any,
      },
      baseState(),
    );

    expect(record.schema).toBe(DECISION_CAUSALITY_SCHEMA_V1);
    expect(record.causal_decision?.context.causality_id).toBe('dc_v1_2');
    expect(record.plan_execution.plan_slots_estimate).toBe(1);
  });

  it('buildBlockedAtGateCausalityRecordV1 preserves v0 fields', () => {
    const gate: ExecutionDecision = {
      type: 'BLOCK',
      reason: 'test',
      codes: ['SNAPSHOT_INVALIDATED'],
    };
    const record = buildBlockedAtGateCausalityRecordV1(
      {
        causality_id: 'dc_block',
        started_at: '2026-01-01T00:00:00.000Z',
        tick_kind: 'generate_plan',
        reality: {},
        policy_engine: { verdict: 'BLOCK', codes: ['SNAPSHOT_INVALIDATED'], reasons: ['x'] },
        execution_gate: gate,
      },
      baseState(),
    );
    expect(record.schema).toBe(DECISION_CAUSALITY_SCHEMA_V1);
    expect(record.plan_execution.phase).toBe('blocked_at_gate');
    expect(record.causal_decision?.hypothesis?.failureMode).toBe('x');
  });
});
