import {
  extractDpoPreferencesFromDecisionTrajectories,
  extractPlannerObediencePair,
  extractDebateNarratorPair,
  resolvePlannerRejected,
} from './dpo-preference-extractor.util';
import { DECISION_TRAJECTORY_SCHEMA_ID } from '../interfaces/decision-trajectory.types';
import type { DecisionTrajectoryETLRow } from '../interfaces/decision-trajectory-etl.types';

function baseRow(overrides: Partial<DecisionTrajectoryETLRow>): DecisionTrajectoryETLRow {
  return {
    id: 'uuid-1',
    requestId: 'req-1',
    tripId: null,
    status: 'FINALIZED',
    totalReward: 0.5,
    orchestrationOutcome: 'CONDITIONAL_REPAIR',
    rewardSignals: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    payload: {
      schema_id: DECISION_TRAJECTORY_SCHEMA_ID,
      request_id: 'req-1',
      input_context: {
        hard_constraints: [{ type: 'no_froad' }],
        operational_negative_constraints: { key: 'tripnara.operational_negative_constraints.v1' },
      },
      axiom_gate: {
        gate_result: 'ADJUST_REQUIRED',
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'ice road closed' }],
        triggered_axiom_ids: ['AX_ICE_01'],
      },
      orchestration_steps: [
        { step: 'PLAN_GEN', status: 'COMPLETED', timestamp_ms: 1 },
        { step: 'VERIFY', status: 'FAILED', timestamp_ms: 2 },
        { step: 'REPAIR', status: 'COMPLETED', timestamp_ms: 3 },
      ],
      final_output: {
        itinerary: { days: [{ day_index: 1, items: [{ name: 'Safe route' }] }] } as any,
      },
      debate_history: {
        source: 'llm_debate',
        tie_break_used: true,
        guardian_votes_redacted: {
          abu: { vote: 'BLOCK', reason: '[Abu] REJECT — ice risk', verdict_raw: 'REJECT' },
          dr_dre: { vote: 'WARN', reason: '[Dr.Dre] ADJUST — pace', verdict_raw: 'ADJUST' },
          neptune: { vote: 'WARN', reason: '[Neptune] REPLACE — scenic', verdict_raw: 'REPLACE' },
        },
        prompts_redacted: { system_prompt: 'sys', user_prompt: 'user' },
        raw_completion_redacted: '{"consensus":"allow_with_adjustments"}',
      },
    },
    ...overrides,
  };
}

describe('dpo-preference-extractor', () => {
  it('prefers true_topology when plan_gen_draft_itinerary present', () => {
    const row = baseRow({
      payload: {
        ...baseRow({}).payload,
        plan_gen_draft_itinerary: {
          days: [{ day_index: 1, items: [{ name: 'Risky串联路线' }] }],
        } as any,
        final_output: {
          itinerary: { days: [{ day_index: 1, items: [{ name: 'Safe route' }] }] } as any,
        },
      },
    });
    const pack = resolvePlannerRejected(row.payload);
    expect(pack?.rejected_source).toBe('true_topology');
    expect(pack?.rejected).toContain('Risky');
    const pair = extractPlannerObediencePair(row);
    expect(pair?.rejected_source).toBe('true_topology');
  });

  it('extracts planner obedience pair with violation surrogate when no draft', () => {
    const pair = extractPlannerObediencePair(baseRow({}));
    expect(pair?.pair_type).toBe('planner_obedience');
    expect(pair?.chosen).toContain('Safe route');
    expect(pair?.rejected_source).toBe('violation_surrogate');
    expect(pair?.rejected).toContain('planner_defect_v1');
    expect(pair?.rejected).toContain('AX_ICE_01');
  });

  it('extracts debate narrator pair with abu BLOCK / tie-break', () => {
    const pair = extractDebateNarratorPair(baseRow({}));
    expect(pair?.pair_type).toBe('debate_narrator');
    expect(pair?.chosen).toContain('consensus');
    expect(pair?.rejected).toContain('debate_overruled_v1');
    expect(pair?.rejected).toContain('ice risk');
  });

  it('skips CRITICAL_FAIL rows in batch extract', () => {
    const rows = [
      baseRow({ orchestrationOutcome: 'CRITICAL_FAIL' }),
      baseRow({ id: 'uuid-2', requestId: 'req-2' }),
    ];
    const all = extractDpoPreferencesFromDecisionTrajectories(rows);
    expect(all.every((r) => r.request_id !== 'req-1' || r.pair_type)).toBe(true);
    expect(all.some((r) => r.request_id === 'req-2')).toBe(true);
  });
});
