/** route_and_run 恢复循环共享工具（AgentService 与 ExecutionIntegrationService 共用） */

import type { OrchestratorRobustnessMetadata } from './orchestrator-failure-taxonomy.util';
import type { RecoveryInvocationContext } from '../interfaces/claude-orchestration.interface';
import {
  computeBackoffDelayMs,
  type ExecutionBackoffParams,
  type ExecutionRecoveryPlan,
} from '../../chain-of-work/execution/execution-recovery-policy.util';

export type RecoveryTraceRow = {
  attempt: number;
  backoff_ms: number;
  failure_code?: string;
  elapsed_ms: number;
  recorded_at: string;
};

export type RouteAndRunBackoffSuccess<T> = {
  ok: true;
  result: T;
  trace: RecoveryTraceRow[];
  winningAttempt: number;
};

export type RouteAndRunBackoffExhausted = {
  ok: false;
  lastError: unknown;
  trace: RecoveryTraceRow[];
  lastRobustness: OrchestratorRobustnessMetadata;
};

export type RouteAndRunBackoffOutcome<T> = RouteAndRunBackoffSuccess<T> | RouteAndRunBackoffExhausted;

/** {@link runRouteAndRunBackoffLoop} 入参（Execution 层与 Agent 共用） */
export type RouteAndRunBackoffLoopArgs<T> = {
  /** 主编排首次抛出的错误（退避用尽或提前 break 时回传给 Agent） */
  initialError: unknown;
  backoff: ExecutionBackoffParams;
  remainingMs: () => number;
  requestStartMs: number;
  /** 首次失败对应的分类（进入循环前的 robustness） */
  initialRobustness: OrchestratorRobustnessMetadata;
  classifyError: (e: unknown) => OrchestratorRobustnessMetadata;
  resolveRecoveryPlan: (m: OrchestratorRobustnessMetadata) => ExecutionRecoveryPlan | null;
  sleepMs: (ms: number) => Promise<void>;
  executeAttempt: (invocation: RecoveryInvocationContext, attempt: number, trace: RecoveryTraceRow[]) => Promise<T>;
  onBeforeRetry?: (ev: {
    attempt: number;
    delayMs: number;
    robustness: OrchestratorRobustnessMetadata;
    traceRow: RecoveryTraceRow;
  }) => Promise<void>;
  onRetryFailure?: (ev: {
    error: unknown;
    robustness: OrchestratorRobustnessMetadata;
    recoveryPlan: ExecutionRecoveryPlan | null;
  }) => Promise<void>;
};

/**
 * AgentService.routeAndRun 外层 Recovery：指数退避 + 每次重试注入 RecoveryInvocationContext。
 * 不含首次 exec（首次失败由调用方捕获后再调用本函数）。
 */
export async function runRouteAndRunBackoffLoop<T>(
  args: RouteAndRunBackoffLoopArgs<T>,
): Promise<RouteAndRunBackoffOutcome<T>> {
  const {
    initialError,
    backoff: b,
    remainingMs,
    requestStartMs,
    initialRobustness,
    classifyError,
    resolveRecoveryPlan,
    sleepMs,
    executeAttempt,
    onBeforeRetry,
    onRetryFailure,
  } = args;

  const recoveryTrace: RecoveryTraceRow[] = [];
  let workingErr: unknown = initialError;
  let robustness = initialRobustness;
  let recoveryPlan = resolveRecoveryPlan(robustness);

  for (let attempt = 1; attempt < b.maxAttempts; attempt++) {
    const delayMs = computeBackoffDelayMs(attempt - 1, b);
    if (remainingMs() <= delayMs + 800) {
      break;
    }
    await sleepMs(delayMs);

    const traceRow: RecoveryTraceRow = {
      attempt,
      backoff_ms: delayMs,
      failure_code: robustness.failure_code,
      elapsed_ms: Date.now() - requestStartMs,
      recorded_at: new Date().toISOString(),
    };
    recoveryTrace.push(traceRow);
    await onBeforeRetry?.({ attempt, delayMs, robustness, traceRow });

    const traceSummary = recoveryTrace.map((t) => ({
      attempt: t.attempt,
      backoff_ms: t.backoff_ms,
      failure_code: t.failure_code,
    }));
    const recoveryInvocation: RecoveryInvocationContext = {
      is_retry: true,
      retry_attempt: attempt,
      previous_failure_domain: robustness.failure_domain,
      elapsed_from_start_ms: Date.now() - requestStartMs,
      trace_summary: traceSummary,
    };

    try {
      const result = await executeAttempt(recoveryInvocation, attempt, recoveryTrace);
      return { ok: true, result, trace: recoveryTrace, winningAttempt: attempt };
    } catch (eRetry: unknown) {
      workingErr = eRetry;
      robustness = classifyError(eRetry);
      recoveryPlan = resolveRecoveryPlan(robustness);
      await onRetryFailure?.({ error: eRetry, robustness, recoveryPlan });
      if (recoveryPlan?.kind !== 'RETRY_WITH_EXPONENTIAL_BACKOFF') {
        break;
      }
    }
  }

  const lastRobustness = classifyError(workingErr);
  return {
    ok: false,
    lastError: workingErr,
    trace: recoveryTrace,
    lastRobustness,
  };
}

export async function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
