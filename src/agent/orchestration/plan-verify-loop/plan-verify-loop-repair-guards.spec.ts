import { checkRepairCountExceededIfNeeded } from './plan-verify-loop-repair-guards';
import type { PlanVerifyLoopRepairGuardHost } from './plan-verify-loop-repair-guards';
import {
  createPlanVerifyTransientState,
  type PlanVerifyTransientLoopState,
} from './plan-verify-loop-transient.util';
import type { PlanVerifyLoopRunParams } from './plan-verify-loop.types';

function mockHost(): PlanVerifyLoopRepairGuardHost {
  return {
    logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    computeRepairFatigue: jest.fn(),
    buildClarificationResult: jest.fn(() => ({ status: 'NEED_USER_CONFIRMATION' }) as any),
    maybeSnapshot: jest.fn(),
  };
}

describe('plan-verify-loop-repair-guards — flawed draft narrate', () => {
  it('continues without clarification when allow_flawed_draft_narrate', () => {
    const host = mockHost();
    const decisionState = { systemState: { repairCount: 3 } } as PlanVerifyLoopRunParams['decisionState'];
    const loop: PlanVerifyTransientLoopState = createPlanVerifyTransientState(decisionState);
    const params = {
      request: {
        request_id: 'fd-1',
        user_id: 'u',
        message: 'plan',
        options: { allow_flawed_draft_narrate: true },
      },
      context: {},
      state: { request_id: 'fd-1', metadata: {}, decision_log: [], errors: [] },
      decisionState,
      llmProvider: 'deepseek',
      startTime: Date.now(),
      loop,
    } as PlanVerifyLoopRunParams & { loop: PlanVerifyTransientLoopState };

    const terminal = checkRepairCountExceededIfNeeded(host, params);
    expect(terminal).toBeNull();
    expect((params.state.metadata as Record<string, unknown>).flawed_draft_narrate).toBe(true);
    expect((params.state.metadata as Record<string, unknown>).flawed_draft_opt_in).toBe('explicit');
    expect((params.state.metadata as Record<string, unknown>).flawed_draft_opt_in_audit).toMatchObject({
      action: 'flawed_draft_opt_in',
      opt_in: 'explicit',
      allow_flawed_draft_narrate: true,
    });
    const auditLog = (params.state.metadata as Record<string, unknown>).audit_log as unknown[];
    expect(Array.isArray(auditLog)).toBe(true);
    expect(auditLog.some((e: any) => e?.action === 'flawed_draft_opt_in')).toBe(true);
    expect(host.logger.log).toHaveBeenCalled();
    expect(host.buildClarificationResult).not.toHaveBeenCalled();
  });

  it('bound trip without explicit opt-in clarifies (P0-1)', () => {
    const host = mockHost();
    const decisionState = { systemState: { repairCount: 3 } } as PlanVerifyLoopRunParams['decisionState'];
    const loop: PlanVerifyTransientLoopState = createPlanVerifyTransientState(decisionState);
    const params = {
      request: {
        request_id: 'fd-bound',
        user_id: 'u',
        trip_id: 'trip_15c50a69931845ca',
        message: '优化一下行程',
      },
      context: {},
      state: { request_id: 'fd-bound', metadata: {}, decision_log: [], errors: [] },
      decisionState,
      llmProvider: 'deepseek',
      startTime: Date.now(),
      loop,
    } as PlanVerifyLoopRunParams & { loop: PlanVerifyTransientLoopState };

    const terminal = checkRepairCountExceededIfNeeded(host, params);
    expect(terminal).not.toBeNull();
    expect((params.state.metadata as Record<string, unknown>).flawed_draft_narrate).toBeUndefined();
    expect(host.buildClarificationResult).toHaveBeenCalled();
  });

  it('explicit allow_flawed_draft_narrate=false still clarifies', () => {
    const host = mockHost();
    const decisionState = { systemState: { repairCount: 3 } } as PlanVerifyLoopRunParams['decisionState'];
    const loop: PlanVerifyTransientLoopState = createPlanVerifyTransientState(decisionState);
    const params = {
      request: {
        request_id: 'fd-off',
        user_id: 'u',
        trip_id: 'trip_15c50a69931845ca',
        message: '优化一下行程',
        options: { allow_flawed_draft_narrate: false },
      },
      context: {},
      state: { request_id: 'fd-off', metadata: {}, decision_log: [], errors: [] },
      decisionState,
      llmProvider: 'deepseek',
      startTime: Date.now(),
      loop,
    } as PlanVerifyLoopRunParams & { loop: PlanVerifyTransientLoopState };

    const terminal = checkRepairCountExceededIfNeeded(host, params);
    expect(terminal).not.toBeNull();
    expect(host.buildClarificationResult).toHaveBeenCalled();
  });

  it('refuses flawed bypass when HARD SAFETY gate violation present', () => {
    const host = mockHost();
    const decisionState = { systemState: { repairCount: 3 } } as PlanVerifyLoopRunParams['decisionState'];
    const loop: PlanVerifyTransientLoopState = createPlanVerifyTransientState(decisionState);
    const params = {
      request: {
        request_id: 'fd-safe',
        user_id: 'u',
        message: 'plan',
        options: { allow_flawed_draft_narrate: true },
      },
      context: {},
      state: {
        request_id: 'fd-safe',
        metadata: {},
        decision_log: [],
        errors: [],
        gate_result: {
          gate_result: 'ADJUST_REQUIRED',
          violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'storm' }],
          required_adjustments: [],
          confidence: 0.2,
          evidence_refs: [],
        },
      },
      decisionState,
      llmProvider: 'deepseek',
      startTime: Date.now(),
      loop,
    } as PlanVerifyLoopRunParams & { loop: PlanVerifyTransientLoopState };

    const terminal = checkRepairCountExceededIfNeeded(host, params);
    expect(terminal).not.toBeNull();
    expect((params.state.metadata as Record<string, unknown>).flawed_draft_narrate).toBeUndefined();
    expect(host.buildClarificationResult).toHaveBeenCalled();
    const q = (params.state as { clarification_questions?: Array<Record<string, unknown>> })
      .clarification_questions?.[0];
    expect(q?.type).toBe('single_choice');
    expect(q?.metadata).toMatchObject({ presentation: 'structured_intake_v1' });
    expect(q?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'reduce_scope', label: expect.stringContaining('缩小范围') }),
        expect.objectContaining({ value: 'continue_auto_repair' }),
      ]),
    );
  });
});
