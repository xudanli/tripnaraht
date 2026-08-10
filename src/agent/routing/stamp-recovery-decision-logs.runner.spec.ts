import { stampRecoveryOntoOrchestratorDecisionLogs } from './stamp-recovery-decision-logs.runner';

describe('stamp-recovery-decision-logs.runner', () => {
  it('no-ops when not a recovery retry', () => {
    const state = { decision_log: [{ metadata: {} }], metadata: {} } as any;
    stampRecoveryOntoOrchestratorDecisionLogs(undefined, state);
    expect(state.decision_log[0].metadata.recovery_context).toBeUndefined();
  });

  it('stamps recovery_context onto decision_log entries', () => {
    const state = {
      decision_log: [{ metadata: { foo: 1 } }],
      metadata: {},
    } as any;
    stampRecoveryOntoOrchestratorDecisionLogs(
      {
        recoveryInvocation: {
          is_retry: true,
          retry_attempt: 2,
          previous_failure_domain: 'GATE',
          elapsed_from_start_ms: 100,
        },
      } as any,
      state,
    );
    expect(state.decision_log[0].metadata.recovery_context).toMatchObject({
      is_retry: true,
      retry_attempt: 2,
    });
    expect(state.decision_log[0].metadata.foo).toBe(1);
  });
});
