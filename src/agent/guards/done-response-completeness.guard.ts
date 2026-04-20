import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import { recordDoneVerifyGuardrailOutcome } from './done-verify-metrics';

export type DoneCompletenessContext = {
  /** 编排执行痕迹（VERIFY 主口径：runtime truth） */
  stepsExecuted?: Array<{ stepId?: string }>;
};

/**
 * DONE 路径（result.status === OK）响应完整性 — 对齐 `.tripnara-guardrails/response-contracts.json`
 * - 默认：缺失时 `console.warn`，便于收集误报
 * - `DECISION_DONE_COMPLETENESS_STRICT=1`：抛错，拒绝返回不完整响应
 *
 * VERIFY 权威口径（见 `docs/TRIPNARA_ENGINEERING_GUARDRAILS.md` §14.2）：
 * - 主：`stepsExecuted` 含 `stepId === 'VERIFY'`
 * - 辅（过渡）：`decision_log` 含 `step === 'VERIFY'`，仅当未设 `DECISION_DONE_VERIFY_STEPS_ONLY=1`；命中辅口径会 warn
 * - `DECISION_DONE_VERIFY_STEPS_ONLY=1`：DONE 判定只认 `stepsExecuted`（准备收紧主干 / 弃用 log 回退）
 * - `observability.system_mode === 'SYSTEM1'`：不要求 kernel VERIFY（快路径）
 */
export function assertDoneResponseCompleteness(
  response: RouteAndRunResponseDto,
  ctx?: DoneCompletenessContext,
): void {
  const strict = process.env.DECISION_DONE_COMPLETENESS_STRICT === '1';
  if (response.result?.status !== 'OK') return;

  const missing: string[] = [];
  const payload = response.result.payload as Record<string, unknown> | undefined;
  const orch = payload?.orchestrationResult as
    | { itinerary?: unknown; state?: { current_step?: string }; decision_log?: DecisionLogEntry[] }
    | undefined;

  const hasResult =
    (orch?.itinerary != null && typeof orch.itinerary === 'object') ||
    (Array.isArray(payload?.timeline) && (payload.timeline as unknown[]).length > 0);
  if (!hasResult) missing.push('result.payload.orchestrationResult.itinerary|timeline');

  const logs: DecisionLogEntry[] =
    (orch?.decision_log as DecisionLogEntry[] | undefined) ||
    (Array.isArray(payload?.evidence) ? (payload.evidence as DecisionLogEntry[]) : []) ||
    [];
  const hasVerifyInSteps = (ctx?.stepsExecuted ?? []).some((s) => s.stepId === 'VERIFY');
  const hasVerifyInLog = logs.some((e) => e.step === 'VERIFY');
  const stepsOnlyVerify = process.env.DECISION_DONE_VERIFY_STEPS_ONLY === '1';
  const systemMode = (response.observability as { system_mode?: string } | undefined)?.system_mode;
  const skipKernelVerify = systemMode === 'SYSTEM1';

  if (!skipKernelVerify) {
    if (hasVerifyInSteps) {
      recordDoneVerifyGuardrailOutcome('steps_ok', response.request_id);
    } else if (!stepsOnlyVerify && hasVerifyInLog) {
      recordDoneVerifyGuardrailOutcome('log_fallback', response.request_id);
      // eslint-disable-next-line no-console
      console.warn(
        '[guardrails] VERIFY satisfied via decision_log only; authoritative signal is stepsExecuted.stepId=VERIFY. ' +
          'This compat path will be removed. Set DECISION_DONE_VERIFY_STEPS_ONLY=1 to enforce steps-only.',
      );
    } else {
      recordDoneVerifyGuardrailOutcome('missing', response.request_id);
      missing.push(
        stepsOnlyVerify
          ? 'verification(stepsExecuted step VERIFY only; DECISION_DONE_VERIFY_STEPS_ONLY=1)'
          : 'verification(stepsExecuted step VERIFY preferred, or decision_log step VERIFY)',
      );
    }
  }

  const hasExplain =
    response.explain != null &&
    (response.explain.simplified_explanation != null || (response.explain.decision_log?.length ?? 0) > 0);
  if (!hasExplain) missing.push('explain');

  const obs = response.observability as { dso_version?: number } | undefined;
  if (typeof obs?.dso_version !== 'number') {
    missing.push('dsoVersion(observability.dso_version)');
  }

  if (missing.length === 0) return;

  const msg = `[DONE completeness] missing: ${missing.join(', ')}`;
  if (strict) {
    throw new Error(msg);
  }
  // eslint-disable-next-line no-console
  console.warn(`[guardrails] ${msg} (set DECISION_DONE_COMPLETENESS_STRICT=1 to fail)`);
}
