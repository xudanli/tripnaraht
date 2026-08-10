import {
  buildClarificationResult,
  buildSuccessResult,
  buildTerminalNoSolutionResult,
} from './orchestration-result-builders.runner';
import type { OrchestrationResultBuildersHost } from './orchestration-result-builders.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('orchestration-result-builders.runner', () => {
  function makeHost(
    overrides: Partial<OrchestrationResultBuildersHost> = {},
  ): OrchestrationResultBuildersHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      stampRecoveryOntoOrchestratorDecisionLogs: jest.fn(),
      finalizeHarnessTraceFromOrchestration: jest.fn(),
      persistDecisionTrajectoryAtOrchestrationExit: jest.fn().mockResolvedValue(undefined),
      resolveClarificationIntroAnswerText: jest.fn(() => '请补充信息'),
      buildUserFacingAnswerText: jest.fn(() => '行程已就绪'),
      formatClarificationMessage: jest.fn(() => '澄清消息'),
      normalizeDecisionOsAuditReport: jest.fn((x) => ({
        session_consistency_score: 1,
        dominant_cid: 'X',
        delta_reason: 'aligned',
        intent_revision_flag: false,
        delta_utility: 0,
        audit_report: x,
      })),
      ...overrides,
    };
  }

  function baseState(overrides: Record<string, unknown> = {}): OrchestratorState {
    return {
      request_id: 'r1',
      decision_log: [],
      metadata: {},
      current_step: 'NARRATION',
      ...overrides,
    } as unknown as OrchestratorState;
  }

  it('buildSuccessResult marks DONE without clarification', () => {
    const host = makeHost();
    const result = buildSuccessResult(host, baseState(), Date.now() - 10);
    expect(host.finalizeHarnessTraceFromOrchestration).toHaveBeenCalledWith(
      undefined,
      'DONE',
    );
    expect(result.answerText).toBe('行程已就绪');
  });

  it('buildClarificationResult finalizes NEED_USER_CONFIRM', () => {
    const host = makeHost();
    const state = baseState({
      clarification_questions: [{ id: 'q1', question: '？', type: 'text', required: true }],
    });
    const result = buildClarificationResult(host, state, Date.now());
    expect(host.finalizeHarnessTraceFromOrchestration).toHaveBeenCalledWith(
      undefined,
      'NEED_USER_CONFIRM',
    );
    expect(result.result?.needsUserConfirmation).toBe(true);
  });

  it('buildTerminalNoSolutionResult finalizes BLOCKED', () => {
    const host = makeHost();
    const result = buildTerminalNoSolutionResult(host, baseState(), Date.now());
    expect(host.finalizeHarnessTraceFromOrchestration).toHaveBeenCalledWith(
      undefined,
      'BLOCKED',
    );
    expect(result.result?.terminal?.type).toBe('TERMINAL_NO_SOLUTION');
  });
});
