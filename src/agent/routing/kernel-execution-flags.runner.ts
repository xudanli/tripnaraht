/**
 * Kernel 启用灰度 / 原生执行灰度 / Harness resume / createInitial opts（从 ClaudeOrchestrator 迁出）。
 */

import type { KernelExecutionFlagsHost } from './kernel-execution-flags.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { HarnessTraceFinalStatus } from '../../harness/tracing/harness-trace.types';
import { HarnessStepName } from '../../harness/contracts/harness-step.types';
import { otelHarnessRuntimeFieldsFromRequest } from '../../harness/tracing/harness-otel-correlation.util';
import { normalizeDecisionOsAuditContract } from '../contracts/decision-os-audit.contract';
import { isInGrayBucket } from '../utils/gray-release.util';

export function isKernelEnabled(host: KernelExecutionFlagsHost): boolean {
  const v =
    host.configService?.get<string>('DECISION_KERNEL_ENABLED') ??
    process.env.DECISION_KERNEL_ENABLED ??
    'true';
  return v !== 'false' && v !== '0';
}

export function isKernelEnabledForRequest(
  host: KernelExecutionFlagsHost,
  request: { request_id: string; user_id?: string },
): boolean {
  if (!isKernelEnabled(host)) return false;
  const percent = parseInt(
    host.configService?.get<string>('DECISION_KERNEL_AB_PERCENT') ??
      process.env.DECISION_KERNEL_AB_PERCENT ??
      '0',
    10,
  );
  if (percent <= 0) return true;
  if (percent >= 100) return true;
  const seed = `${request.user_id ?? ''}|${request.request_id}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const bucket = h % 100;
  return bucket < percent;
}

export function kernelCreateInitialOpts(
  request: RouteAndRunRequestDto,
  state: OrchestratorState,
): {
  evaluationRunId?: string;
  otelTraceId?: string;
  otelSpanId?: string;
  replanLineage?: { previous_plan_version?: number; previous_world_snapshot_hash?: string };
  orchestratorPlanVersion?: number;
  userId?: string;
} {
  const rc = state.metadata?.replan_context as
    | { previous_plan_version?: number; previous_world_snapshot_hash?: string }
    | undefined;
  const otel = otelHarnessRuntimeFieldsFromRequest(request);
  return {
    evaluationRunId: request.meta?.run_id,
    ...(otel ?? {}),
    ...(rc ? { replanLineage: rc } : {}),
    orchestratorPlanVersion: state.plan_version,
    ...(request.user_id ? { userId: request.user_id } : {}),
  };
}

export function finalizeHarnessTraceFromOrchestration(
  host: KernelExecutionFlagsHost,
  decisionState: DecisionState | undefined,
  finalStatus: HarnessTraceFinalStatus,
): void {
  if (!host.decisionKernel || !decisionState) return;
  host.decisionKernel.finalizeHarnessTraceIfRecorded(decisionState, finalStatus);
}

export function computeResumeHarnessEntryFromLast(last?: string): HarnessStepName {
  if (!last) return HarnessStepName.INTAKE;
  if (last === HarnessStepName.INTAKE || last === 'INTAKE') {
    return HarnessStepName.RESEARCH;
  }
  const order: HarnessStepName[] = [
    HarnessStepName.INTAKE,
    HarnessStepName.RESEARCH,
    HarnessStepName.GATE_EVAL,
    HarnessStepName.PLAN_GEN,
    HarnessStepName.VERIFY,
    HarnessStepName.REPAIR,
    HarnessStepName.NARRATE,
  ];
  const idx = order.indexOf(last as HarnessStepName);
  if (idx < 0) return HarnessStepName.INTAKE;
  return order[Math.min(idx + 1, order.length - 1)]!;
}

export function isKernelNativeExecution(
  host: KernelExecutionFlagsHost,
  state?: { request_id: string; user_id?: string },
): boolean {
  const v =
    host.configService?.get<string>('KERNEL_NATIVE_EXECUTION') ??
    process.env.KERNEL_NATIVE_EXECUTION ??
    'true';
  const baseEnabled = v === 'true' || v === '1';
  if (!baseEnabled) return false;

  const grayPercent = parseInt(
    host.configService?.get<string>('KERNEL_NATIVE_EXECUTION_GRAY_PERCENT') ??
      process.env.KERNEL_NATIVE_EXECUTION_GRAY_PERCENT ??
      '100',
    10,
  );
  if (grayPercent >= 100 || !state) return true;
  if (grayPercent <= 0) return false;

  return isInGrayBucket(`${state.user_id ?? ''}|${state.request_id}`, grayPercent);
}

export function normalizeDecisionOsAuditReport(auditReport: any): {
  audit_report: any;
  dominant_cid: string;
  session_consistency_score: number;
  delta_reason: string;
  delta_utility: number;
  intent_revision_flag: boolean;
} {
  const normalized = normalizeDecisionOsAuditContract(auditReport);
  return {
    audit_report: normalized.audit_report,
    dominant_cid: normalized.dominant_cid,
    session_consistency_score: normalized.session_consistency_score,
    delta_reason: normalized.delta_reason,
    delta_utility: normalized.delta_utility,
    intent_revision_flag: normalized.intent_revision_flag,
  };
}

export function violationTypeToCn(type: string): string {
  const t = String(type || '').toUpperCase();
  if (t === 'REACHABILITY') return '准入类';
  if (t === 'SCOPE') return '空间类';
  if (t === 'SAFETY') return '安全类';
  if (t === 'FAILURE_RISK') return '风险类';
  return type;
}

export function isExistingTripRouteOrderOptimizationRequest(state: OrchestratorState): boolean {
  const tripId = state.trip_plan_request?.trip_id ?? state.metadata?.tripId;
  if (!tripId) return false;
  const message = [state.trip_plan_request?.message, state.metadata?.intake_user_message]
    .map((x) => (typeof x === 'string' ? x : ''))
    .join('\n');
  return /(?:优化|调整|重排|重新排序|reorder|optimi[sz]e).{0,24}(?:路线顺序|路线|交通时间|通勤|route\s*order|travel\s*time)|(?:路线顺序|交通时间|通勤|route\s*order|travel\s*time).{0,24}(?:优化|调整|重排|重新排序|reorder|optimi[sz]e)/i.test(
    message,
  );
}
