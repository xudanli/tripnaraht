import {
  runRouteAndRunBackoffLoop,
  sleepMs,
  type RecoveryTraceRow,
} from './route-and-run-recovery.util';
import type { OrchestratorRobustnessMetadata } from './orchestrator-failure-taxonomy.util';
import type { ExecutionBackoffParams } from '../../chain-of-work/execution/execution-recovery-policy.util';
import type { RecoveryInvocationContext } from '../interfaces/claude-orchestration.interface';

function meta(over: Partial<OrchestratorRobustnessMetadata> = {}): OrchestratorRobustnessMetadata {
  return {
    failure_domain: 'ORCHESTRATION',
    failure_code: 'TEST',
    orchestrator_step_at_failure: 'TEST',
    ...over,
  } as OrchestratorRobustnessMetadata;
}

describe('runRouteAndRunBackoffLoop', () => {
  const backoff: ExecutionBackoffParams = {
    maxAttempts: 4,
    baseDelayMs: 10,
    maxDelayMs: 100,
    jitterRatio: 0,
  };

  it('returns success on first retry when executeAttempt succeeds', async () => {
    let calls = 0;
    const outcome = await runRouteAndRunBackoffLoop<string>({
      initialError: new Error('first'),
      backoff,
      remainingMs: () => 60_000,
      requestStartMs: Date.now(),
      initialRobustness: meta(),
      classifyError: () => meta(),
      resolveRecoveryPlan: () => ({
        kind: 'RETRY_WITH_EXPONENTIAL_BACKOFF',
        reason: 'test',
        backoff,
        logging: { level: 'warn', tags: [] },
      }),
      sleepMs: async () => undefined,
      executeAttempt: async (_inv: RecoveryInvocationContext, attempt: number, _trace: RecoveryTraceRow[]) => {
        calls++;
        expect(attempt).toBe(1);
        return 'ok';
      },
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toBe('ok');
      expect(outcome.winningAttempt).toBe(1);
      expect(outcome.trace).toHaveLength(1);
    }
    expect(calls).toBe(1);
  });

  it('exhausts with lastError from initial when deadline blocks before any retry', async () => {
    const first = new Error('only');
    const outcome = await runRouteAndRunBackoffLoop<string>({
      initialError: first,
      backoff,
      remainingMs: () => 0,
      requestStartMs: Date.now(),
      initialRobustness: meta(),
      classifyError: () => meta(),
      resolveRecoveryPlan: () => ({
        kind: 'RETRY_WITH_EXPONENTIAL_BACKOFF',
        reason: 'test',
        backoff,
        logging: { level: 'warn', tags: [] },
      }),
      sleepMs,
      executeAttempt: async () => {
        throw new Error('should not run');
      },
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.lastError).toBe(first);
      expect(outcome.trace).toHaveLength(0);
    }
  });
});
