import {
  isPlanObjectDecisionProblem,
  isTripInExecutionPhase,
  shouldExcludePlanObjectFromExecutionQueue,
} from './plan-object-execution-admission.util';

describe('plan-object-execution-admission.util', () => {
  it('detects plan object problems by semanticKey or problemId', () => {
    expect(
      isPlanObjectDecisionProblem({
        semanticKey: 'plan_object_meal_late_arrival_po_x_meal_windo',
      }),
    ).toBe(true);
    expect(
      isPlanObjectDecisionProblem({
        problemId: 'dp_id:plan_object_meal_late_arrival_po_x_meal_windo',
      }),
    ).toBe(true);
    expect(
      isPlanObjectDecisionProblem({
        problemId: 'stg_attn_infeasible',
        semanticKey: 'EXECUTION_SCHEDULE_INFEASIBLE',
      }),
    ).toBe(false);
  });

  it('treats TRAVELING and IN_PROGRESS as execution phase', () => {
    expect(isTripInExecutionPhase('TRAVELING')).toBe(true);
    expect(isTripInExecutionPhase('IN_PROGRESS')).toBe(true);
    expect(isTripInExecutionPhase('PLANNING')).toBe(false);
  });

  it('excludes plan object from execution queue only when traveling', () => {
    expect(
      shouldExcludePlanObjectFromExecutionQueue({
        tripStatus: 'TRAVELING',
        problemId: 'dp_id:plan_object_buffer_day_1_a_b',
      }),
    ).toBe(true);
    expect(
      shouldExcludePlanObjectFromExecutionQueue({
        tripStatus: 'TRAVELING',
        semanticKey: 'same_day_travel:day1',
      }),
    ).toBe(true);
    expect(
      shouldExcludePlanObjectFromExecutionQueue({
        tripStatus: 'PLANNING',
        problemId: 'dp_id:plan_object_buffer_day_1_a_b',
      }),
    ).toBe(false);
  });
});
