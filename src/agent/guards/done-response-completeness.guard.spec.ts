import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { assertDoneResponseCompleteness } from './done-response-completeness.guard';
import { getDoneVerifyMetricsSnapshot, resetDoneVerifyMetricsForTests } from './done-verify-metrics';

function minimalOkResponse(overrides: Partial<RouteAndRunResponseDto> = {}): RouteAndRunResponseDto {
  const base = {
    request_id: 'req-test',
    route: { route: 'SYSTEM2_REASONING' } as RouteAndRunResponseDto['route'],
    result: {
      status: 'OK' as const,
      answer_text: 'ok',
      payload: {
        orchestrationResult: {
          itinerary: { days: [] },
          decision_log: [{ step: 'PLAN_GEN', metadata: {} } as any],
        },
      },
    },
    explain: {
      decision_log: [{ step: 'PLAN_GEN', metadata: {} } as any],
    },
    observability: {
      system_mode: 'SYSTEM2' as const,
      dso_version: 1,
    },
  };
  return { ...base, ...overrides, result: { ...base.result, ...overrides.result } } as unknown as RouteAndRunResponseDto;
}

describe('assertDoneResponseCompleteness + VERIFY metrics', () => {
  const prevStepsOnly = process.env.DECISION_DONE_VERIFY_STEPS_ONLY;
  const prevStrict = process.env.DECISION_DONE_COMPLETENESS_STRICT;

  beforeEach(() => {
    resetDoneVerifyMetricsForTests();
    delete process.env.DECISION_DONE_VERIFY_STEPS_ONLY;
    delete process.env.DECISION_DONE_COMPLETENESS_STRICT;
  });

  afterAll(() => {
    if (prevStepsOnly === undefined) delete process.env.DECISION_DONE_VERIFY_STEPS_ONLY;
    else process.env.DECISION_DONE_VERIFY_STEPS_ONLY = prevStepsOnly;
    if (prevStrict === undefined) delete process.env.DECISION_DONE_COMPLETENESS_STRICT;
    else process.env.DECISION_DONE_COMPLETENESS_STRICT = prevStrict;
  });

  it('counts steps_ok when stepsExecuted contains VERIFY', () => {
    assertDoneResponseCompleteness(minimalOkResponse(), {
      stepsExecuted: [{ stepId: 'VERIFY' }],
    });
    expect(getDoneVerifyMetricsSnapshot().done_verify_steps_ok_total).toBe(1);
    expect(getDoneVerifyMetricsSnapshot().done_verify_log_fallback_total).toBe(0);
    expect(getDoneVerifyMetricsSnapshot().done_verify_missing_total).toBe(0);
  });

  it('counts log_fallback when only decision_log has VERIFY', () => {
    const r = minimalOkResponse({
      result: {
        status: 'OK',
        answer_text: 'ok',
        payload: {
          orchestrationResult: {
            itinerary: { days: [] },
            decision_log: [{ step: 'VERIFY', metadata: {} } as any],
          },
        },
      } as any,
    });
    assertDoneResponseCompleteness(r, { stepsExecuted: [{ stepId: 'PLAN_GEN' }] });
    expect(getDoneVerifyMetricsSnapshot().done_verify_log_fallback_total).toBe(1);
    expect(getDoneVerifyMetricsSnapshot().done_verify_steps_ok_total).toBe(0);
  });

  it('counts missing when neither path has VERIFY', () => {
    assertDoneResponseCompleteness(minimalOkResponse(), { stepsExecuted: [] });
    expect(getDoneVerifyMetricsSnapshot().done_verify_missing_total).toBe(1);
  });

  it('prefers steps_ok when both steps and log have VERIFY', () => {
    const r = minimalOkResponse({
      result: {
        status: 'OK',
        answer_text: 'ok',
        payload: {
          orchestrationResult: {
            itinerary: { days: [] },
            decision_log: [{ step: 'VERIFY', metadata: {} } as any],
          },
        },
      } as any,
    });
    assertDoneResponseCompleteness(r, { stepsExecuted: [{ stepId: 'VERIFY' }] });
    expect(getDoneVerifyMetricsSnapshot().done_verify_steps_ok_total).toBe(1);
    expect(getDoneVerifyMetricsSnapshot().done_verify_log_fallback_total).toBe(0);
  });

  it('does not increment VERIFY metrics for SYSTEM1', () => {
    const r = minimalOkResponse({
      observability: { system_mode: 'SYSTEM1', dso_version: 1 } as any,
    });
    assertDoneResponseCompleteness(r, { stepsExecuted: [] });
    expect(getDoneVerifyMetricsSnapshot()).toEqual({
      done_verify_steps_ok_total: 0,
      done_verify_log_fallback_total: 0,
      done_verify_missing_total: 0,
    });
  });

  it('with DECISION_DONE_VERIFY_STEPS_ONLY=1, log-only VERIFY counts as missing', () => {
    process.env.DECISION_DONE_VERIFY_STEPS_ONLY = '1';
    const r = minimalOkResponse({
      result: {
        status: 'OK',
        answer_text: 'ok',
        payload: {
          orchestrationResult: {
            itinerary: { days: [] },
            decision_log: [{ step: 'VERIFY', metadata: {} } as any],
          },
        },
      } as any,
    });
    assertDoneResponseCompleteness(r, { stepsExecuted: [] });
    expect(getDoneVerifyMetricsSnapshot().done_verify_missing_total).toBe(1);
  });
});
