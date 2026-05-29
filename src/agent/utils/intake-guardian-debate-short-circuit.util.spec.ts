import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { enrichStateForIntakeGuardianDebateShortCircuit } from './intake-guardian-debate-short-circuit.util';

describe('intake-guardian-debate-short-circuit.util', () => {
  it('marathon INTAKE short-circuit attaches guardian_results and debate clarification', () => {
    const state = {
      request_id: 'r1',
      trip_plan_request: {
        request_id: 'r1',
        origin: 'a',
        destination: '冰岛',
        days: 7,
        date_range: { start_date: '2026-06-05', end_date: '2026-06-11' },
      },
      metadata: {
        marathon_intake_clarification_short_circuit: true,
        intake_user_message: '6月5日想利用极昼，24小时不间断自驾环岛',
      },
      clarification_questions: [],
    } as unknown as OrchestratorState;

    const ok = enrichStateForIntakeGuardianDebateShortCircuit(state, {
      request_id: 'r1',
      message: '6月5日想利用极昼，24小时不间断自驾环岛',
    } as any);

    expect(ok).toBe(true);
    expect(state.gate_result?.gate_result).toBe('NEED_USER_CONFIRM');
    expect(state.gate_result?.guardian_results?.drdre?.verdict).toBe('ADJUST');
    expect(state.gate_result?.guardian_results?.neptune?.verdict).toBe('REPLACE');
    expect(state.gate_result?.guardian_results?.drdre?.evidence?.join(' ')).toMatch(/19|小时/);
    expect(state.clarification_questions?.[0]?.id).toBe('guardian_debate_abu_reject_v1');
    expect((state.metadata as Record<string, unknown>)?.debate_merged_before_plan_gen).toBe(true);
  });
});
