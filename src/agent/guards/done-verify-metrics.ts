/**
 * DONE 路径 VERIFY 守卫指标：进程内 Counter + 单行结构化 JSON 日志（便于 ELK / CloudWatch / 未来 Prometheus 对齐）。
 *
 * 语义（与 `assertDoneResponseCompleteness` 一致，仅统计 kernel VERIFY 维度；SYSTEM1 跳过不计数）：
 * - `done_verify_steps_ok_total`：主口径 `stepsExecuted` 含 VERIFY
 * - `done_verify_log_fallback_total`：无 steps VERIFY，过渡辅口径 `decision_log`/`evidence` 含 VERIFY
 * - `done_verify_missing_total`：两口径均不满足（或 `DECISION_DONE_VERIFY_STEPS_ONLY=1` 时无 steps VERIFY）
 *
 * 关闭：`DECISION_DONE_VERIFY_METRICS_DISABLED=1`
 *
 * HTTP 快照（运维 curl）：`GET /api/admin/diagnostics/done-verify`（见 `DoneVerifyDiagnosticsAdminController`），
 * 需 `ADMIN_DIAGNOSTICS_DONE_VERIFY_ENABLED=1` + `ADMIN_DIAGNOSTICS_TOKEN`。
 */

function skipMetricsEmit(): boolean {
  return process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';
}

function metricsDisabled(): boolean {
  return process.env.DECISION_DONE_VERIFY_METRICS_DISABLED === '1';
}

type DoneVerifyOutcome = 'steps_ok' | 'log_fallback' | 'missing';

const totals: Record<DoneVerifyOutcome, number> = {
  steps_ok: 0,
  log_fallback: 0,
  missing: 0,
};

const metricKeys: Record<DoneVerifyOutcome, string> = {
  steps_ok: 'done_verify_steps_ok_total',
  log_fallback: 'done_verify_log_fallback_total',
  missing: 'done_verify_missing_total',
};

export type DoneVerifyMetricsSnapshot = {
  done_verify_steps_ok_total: number;
  done_verify_log_fallback_total: number;
  done_verify_missing_total: number;
};

export function getDoneVerifyMetricsSnapshot(): DoneVerifyMetricsSnapshot {
  return {
    done_verify_steps_ok_total: totals.steps_ok,
    done_verify_log_fallback_total: totals.log_fallback,
    done_verify_missing_total: totals.missing,
  };
}

/** 与三档计数之和；为 0 时比率为 null（尚无样本） */
export type DoneVerifyRates = {
  sample_total: number;
  steps_ok_rate: number | null;
  log_fallback_rate: number | null;
  missing_rate: number | null;
};

export type DoneVerifyDiagnosticsPayload = DoneVerifyMetricsSnapshot & {
  rates: DoneVerifyRates;
};

/**
 * 诊断/管理接口用：快照 + 比例（Phase B 观察：主口径覆盖率、过渡依赖率、真缺失率）。
 */
export function getDoneVerifyDiagnostics(): DoneVerifyDiagnosticsPayload {
  const snap = getDoneVerifyMetricsSnapshot();
  const sample_total =
    snap.done_verify_steps_ok_total +
    snap.done_verify_log_fallback_total +
    snap.done_verify_missing_total;
  if (sample_total === 0) {
    return {
      ...snap,
      rates: {
        sample_total: 0,
        steps_ok_rate: null,
        log_fallback_rate: null,
        missing_rate: null,
      },
    };
  }
  return {
    ...snap,
    rates: {
      sample_total,
      steps_ok_rate: snap.done_verify_steps_ok_total / sample_total,
      log_fallback_rate: snap.done_verify_log_fallback_total / sample_total,
      missing_rate: snap.done_verify_missing_total / sample_total,
    },
  };
}

/** 仅单测：重置进程内计数 */
export function resetDoneVerifyMetricsForTests(): void {
  if (process.env.JEST_WORKER_ID === undefined) {
    throw new Error('resetDoneVerifyMetricsForTests is only for Jest');
  }
  totals.steps_ok = 0;
  totals.log_fallback = 0;
  totals.missing = 0;
}

/**
 * 在 `assertDoneResponseCompleteness` 判定 kernel VERIFY 维度后调用一次（SYSTEM1 跳过时不调用）。
 */
export function recordDoneVerifyGuardrailOutcome(
  outcome: DoneVerifyOutcome,
  requestId?: string,
): void {
  if (metricsDisabled()) return;

  totals[outcome] += 1;
  const snap = getDoneVerifyMetricsSnapshot();

  if (skipMetricsEmit()) return;

  const payload: Record<string, string | number> = {
    tripnara_metric: 'done_verify_guardrail',
    outcome,
    [metricKeys.steps_ok]: snap.done_verify_steps_ok_total,
    [metricKeys.log_fallback]: snap.done_verify_log_fallback_total,
    [metricKeys.missing]: snap.done_verify_missing_total,
  };
  if (requestId) payload.request_id = requestId;

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}
