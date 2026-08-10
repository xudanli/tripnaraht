/**
 * 编排终态结果构建：SUCCESS / BLOCKED / CLARIFICATION / ERROR / NO_FEASIBLE_PATH（从 ClaudeOrchestrator 迁出）。
 */

import type { OrchestrationResultBuildersHost } from './orchestration-result-builders.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type {
  OrchestratorState,
  OrchestrationStep,
} from '../interfaces/trip-plan.interface';
import type { EarlyWarning } from '../services/shadow-conflict-scanner.service';
import type { OrchestratorRobustnessMetadata } from '../utils/orchestrator-failure-taxonomy.util';
import { finalizeOrchestrationOutcome } from '../utils/orchestration-outcome.util';
import { mapOrchestratorDecisionLogToStepsExecuted } from '../utils/itinerary-item-crud-decision-log.util';
import { injectGateRelaxationClarificationIfEligible } from '../utils/gate-relaxation-clarification.util';
import {
  classifyOrchestratorFailure,
  coerceOrchestratorFailureForWallClockTimeout,
} from '../utils/orchestrator-failure-taxonomy.util';
import { formatPredictiveFailureReport } from '../utils/repair-causal-explainer.util';
import { attachTravelPreferenceSnapshotToOrchestratorState } from '../memory/utils/travel-preference-snapshot.util';
import { attachAgentMemorySnapshotToOrchestratorState } from '../memory/utils/agent-memory-snapshot.util';
import { AuditReportGenerator } from '../utils/terminal-audit-report.generator';
import { normalizeDecisionOsAuditContract } from '../contracts/decision-os-audit.contract';
import { buildAxiomMatchContext } from '../axioms/build-axiom-match-context.util';
import { matchAxioms, pickDominantAxiom } from '../axioms/axiom-matchers';
import {
  axiomMatchSourceForMetrics,
  normalizeAxiomCidForMetrics,
} from '../axioms/axiom-prometheus.util';
import { auditReportToCaseRecord } from '../cbr/case-extractor.util';

export function buildSuccessResult(
  host: OrchestrationResultBuildersHost,
  state: OrchestratorState,
  startTime: number,
  decisionState?: DecisionState,
  context?: AgentContext,
): OrchestrationResult {
  host.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
  attachTravelPreferenceSnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  attachAgentMemorySnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;
  host.finalizeHarnessTraceFromOrchestration(
    decisionState,
    hasClarificationQuestions ? 'NEED_USER_CONFIRM' : 'DONE',
  );

  // 如果有澄清问题，说明需要用户提供更多信息
  const answerText = hasClarificationQuestions
    ? host.resolveClarificationIntroAnswerText(state)
    : host.buildUserFacingAnswerText(state);

  void host.persistDecisionTrajectoryAtOrchestrationExit(state, decisionState, answerText).catch(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      host.logger.warn(`[Claude Orchestrator] DecisionTrajectory finalize failed: ${msg}`);
    },
  );

  host.logger.log(`[Claude Orchestrator] 构建成功结果: decision_log.length=${state.decision_log.length}, current_step=${state.current_step}`);

  const outcome = finalizeOrchestrationOutcome({
    status: hasClarificationQuestions ? 'NEED_USER_INPUT' : 'DONE',
    technicalSuccess: true,
    userTaskCompleted: !hasClarificationQuestions,
  });

  return {
    ...outcome,
    result: {
      state,
      itinerary: state.itinerary,
      gate_result: state.gate_result,
      decision_log: state.decision_log,
      // Phase 2.5: DSO 供 RLHF/模型评估/异常检测
      ...(decisionState && { decisionState }),
      // 如果有澄清问题，填充到结果中
      ...(hasClarificationQuestions && state.clarification_questions ? {
        needsUserConfirmation: true,
        clarificationQuestions: state.clarification_questions,
        // 向后兼容：生成简单字符串格式的澄清消息
        clarificationMessage: host.formatClarificationMessage(
          state.clarification_questions,
          (state.metadata as any)?.clarification_locale,
        ),
      } : {}),
      ...((state.metadata as any)?.decision_profiling
        ? { decision_profiling: (state.metadata as any).decision_profiling }
        : {}),
      ...((state.metadata as any)?.process_fairness
        ? { process_fairness: (state.metadata as any).process_fairness }
        : {}),
    },
    answerText,
    stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log),
    totalDuration: Date.now() - startTime,
    decisionLog: state.decision_log,
  };
}

/**
 * 构建被阻止的结果
 */
export function buildBlockedResult(
  host: OrchestrationResultBuildersHost,
  state: OrchestratorState,
  startTime: number,
  decisionState?: DecisionState,
  context?: AgentContext,
): OrchestrationResult {
  injectGateRelaxationClarificationIfEligible(state);
  host.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
  attachTravelPreferenceSnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  attachAgentMemorySnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  host.finalizeHarnessTraceFromOrchestration(decisionState, 'BLOCKED');
  const violations = state.gate_result?.violations || [];
  const answerText = `行程规划被阻止。原因：${violations.map(v => v.detail).join('；')}`;
  void host.persistDecisionTrajectoryAtOrchestrationExit(state, decisionState, answerText).catch(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      host.logger.warn(`[Claude Orchestrator] DecisionTrajectory finalize failed: ${msg}`);
    },
  );

  // 如果有澄清问题，也包含在结果中（虽然被阻止，但可能需要用户提供替代方案）
  const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;
  const outcome = finalizeOrchestrationOutcome({
    status: hasClarificationQuestions ? 'NEED_USER_CONFIRM' : 'BLOCKED',
    technicalSuccess: true,
    userTaskCompleted: false,
  });

  return {
    ...outcome,
    result: {
      state,
      gate_result: state.gate_result,
      decision_log: state.decision_log,
      ...(decisionState && { decisionState }),
      // 如果有澄清问题，填充到结果中
      ...(hasClarificationQuestions && state.clarification_questions ? {
        needsUserConfirmation: true,
        clarificationQuestions: state.clarification_questions,
        clarificationMessage: host.formatClarificationMessage(
          state.clarification_questions,
          (state.metadata as any)?.clarification_locale,
        ),
      } : {}),
    },
    answerText,
    stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log),
    totalDuration: Date.now() - startTime,
    decisionLog: state.decision_log,
  };
}

/**
 * 构建澄清结果（需要用户提供更多信息）
 */
export function buildClarificationResult(
  host: OrchestrationResultBuildersHost,
  state: OrchestratorState,
  startTime: number,
  decisionState?: DecisionState,
  context?: AgentContext,
): OrchestrationResult {
  host.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
  attachTravelPreferenceSnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  attachAgentMemorySnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  host.finalizeHarnessTraceFromOrchestration(decisionState, 'NEED_USER_CONFIRM');
  const answerText = host.resolveClarificationIntroAnswerText(state);
  void host.persistDecisionTrajectoryAtOrchestrationExit(state, decisionState, answerText).catch(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      host.logger.warn(`[Claude Orchestrator] DecisionTrajectory finalize failed: ${msg}`);
    },
  );

  return {
    success: false, // 需要用户输入，所以 success 为 false
    result: {
      state,
      ...(state.gate_result ? { gate_result: state.gate_result } : {}),
      needsUserConfirmation: true,
      clarificationQuestions: state.clarification_questions || [],
      clarificationMessage: host.formatClarificationMessage(
        state.clarification_questions || [],
        (state.metadata as any)?.clarification_locale,
      ),
      gaps: state.gaps,
    },
    answerText,
    stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log),
    totalDuration: Date.now() - startTime,
    decisionLog: state.decision_log,
  };
}

/**
 * 构建错误结果
 */
export function buildErrorResult(
  host: OrchestrationResultBuildersHost,
  state: OrchestratorState,
  error: any,
  startTime: number,
  decisionState?: DecisionState,
  orchestratorStepAtFailure?: OrchestrationStep,
  precomputedRobustness?: OrchestratorRobustnessMetadata,
  context?: AgentContext,
): OrchestrationResult {
  host.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
  attachTravelPreferenceSnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  attachAgentMemorySnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  host.finalizeHarnessTraceFromOrchestration(decisionState, 'FAILED');
  void host.decisionTrajectoryInterlocutor
    ?.markFailed(state.request_id)
    .catch(() => {});
  // 🆕 检查是否是超时错误
  const isTimeout =
    error?.message?.startsWith('TIMEOUT:') ||
    error?.code === 'ECONNABORTED' ||
    state.current_step === 'TIMEOUT';

  const answerText = isTimeout
    ? `请求超时，已执行到步骤: ${state.current_step}。请缩小范围或稍后重试。`
    : `处理过程中出现错误：${error?.message || '未知错误'}`;

  host.logger.log(
    `[Claude Orchestrator] 构建错误结果: current_step=${state.current_step}, decision_log.length=${state.decision_log.length}, isTimeout=${isTimeout}`,
  );

  const stepForClassify =
    orchestratorStepAtFailure ??
    (state.current_step !== 'FAILED' && state.current_step !== 'TIMEOUT' ? state.current_step : undefined);

  let orchestrator_robustness: OrchestratorRobustnessMetadata;
  if (precomputedRobustness) {
    orchestrator_robustness = precomputedRobustness;
  } else {
    orchestrator_robustness = classifyOrchestratorFailure(error, { orchestrator_step: stepForClassify });
    if (isTimeout) orchestrator_robustness = coerceOrchestratorFailureForWallClockTimeout(orchestrator_robustness);
  }

  const outcome = finalizeOrchestrationOutcome({
    status: 'FAILED',
    technicalSuccess: false,
    userTaskCompleted: false,
  });
  return {
    ...outcome,
    result: {
      state,
      errors: state.errors,
      errorType: isTimeout ? ('TIMEOUT_ERROR' as any) : undefined,
      orchestrator_robustness,
      ...(decisionState && { decisionState }),
    },
    answerText,
    stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log, {
      isSuccess: (step) => step !== 'FAILED' && step !== 'TIMEOUT',
    }),
    totalDuration: Date.now() - startTime,
    decisionLog: state.decision_log, // 🆕 确保决策日志被包含
  };
}

export function buildTerminalNoSolutionResult(
  host: OrchestrationResultBuildersHost,
  state: OrchestratorState,
  startTime: number,
  decisionState?: DecisionState,
  context?: AgentContext,
): OrchestrationResult {
  host.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
  attachTravelPreferenceSnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  attachAgentMemorySnapshotToOrchestratorState(host.agentMemoryContextStore, state);
  // NO_FEASIBLE_PATH 是约束求解正确终态，勿计入技术 FAILED
  host.finalizeHarnessTraceFromOrchestration(decisionState, 'BLOCKED');

  const tf = decisionState?.systemState?.planGenTerminalFailure;
  const violations = (decisionState as any)?.constraints?.violations ?? state.gate_result?.violations ?? [];
  const vStr = Array.isArray(violations)
    ? violations
        .slice(0, 3)
        .map((v: any) => `${v?.type ?? 'CONSTRAINT'}: ${v?.detail ?? ''}`.trim())
        .filter(Boolean)
        .join('；')
    : '';

  const answerText =
    `基于您的确认，系统已停止规划（CONSENSUS_REACHED: NO_FEASIBLE_PATH）。` +
    `在不放宽约束（加天数/换车/删必去点）的前提下，当前物理/业务冲突不可逾越。` +
    (tf?.message ? ` 终止原因：${tf.message}.` : '') +
    (vStr ? ` 冲突摘要：${vStr}` : '');

  // If user terminates early (accept_no_solution), we may not have reached the RESEARCH-stage
  // PREDICTIVE_FAILURE_REPORT emission. Synthesize it from INTAKE simulation so the terminal
  // audit can still carry drift_vector / session_consistency_score for LogicOps.
  try {
    const existingEw = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
    const hasPfr = Boolean((existingEw as any)?.predictive_failure_report);
    const intakeSim = (state.metadata as any)?.intake_simulation as
      | { simulatedRepairTraces?: import('../services/route-feasibility.types').SimulatedRepairTrace[] }
      | undefined;
    const simTraces = intakeSim?.simulatedRepairTraces ?? [];
    if (!hasPfr && Array.isArray(simTraces) && simTraces.length > 0) {
      const predictive_failure_report = {
        card_type: 'PREDICTIVE_FAILURE_REPORT' as const,
        correlationId: undefined as unknown as string | undefined,
        audit_text: formatPredictiveFailureReport(simTraces),
        simulated_repair_traces: simTraces,
      };
      const mergedEw: EarlyWarning = existingEw
        ? { ...existingEw, predictive_failure_report }
        : {
            early_warning_id: `pred-${state.request_id}`,
            risk_level: 'MEDIUM',
            conflict_type: 'MIXED',
            evidence_summary: 'INTAKE_PREDICTIVE_SIMULATION',
            suggested_actions: [],
            predictive_failure_report,
          };
      (state.metadata as any) = { ...(state.metadata ?? {}), early_warning: mergedEw };
    }
  } catch {
    // best-effort only
  }

  const audit_report = AuditReportGenerator.generate(decisionState, state);
  const normalizedContract = normalizeDecisionOsAuditContract(audit_report);
  const normalizedAudit = host.normalizeDecisionOsAuditReport(normalizedContract.audit_report);
  if (normalizedContract.violations.length > 0) {
    for (const v of normalizedContract.violations) {
      host.promMetrics?.recordDecisionOsAuditContractViolation({
        stage: 'TERMINAL',
        field: v.field,
        reason: v.reason,
      });
    }
  }

  // Observability: record session consistency score for dashboards / alerts
  try {
    const score = normalizedAudit.session_consistency_score;
    const domAxiom = pickDominantAxiom(
      matchAxioms(
        buildAxiomMatchContext({
          message: (state as any)?.trip_plan_request?.message,
          constraints: (state as any)?.trip_plan_request?.constraints,
          trip: (state as any)?.trip_plan_request,
          tripId: (state as any)?.trip_plan_request?.trip_id,
          itinerary: (state as any)?.itinerary,
          routeAndRunIntent: (state.metadata as Record<string, unknown>)?.route_and_run_intent as any,
          clarificationAnswers: (state.metadata as Record<string, unknown>)?.clarification_answers as any,
        }),
      ),
    );
    const expectedCid = domAxiom?.axiom?.cid;
    const actualCid = normalizedAudit.dominant_cid;
    const axiomMatchSource = axiomMatchSourceForMetrics(domAxiom);
    host.promMetrics?.recordSessionConsistencyScore({
      score,
      axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
      cid: actualCid ?? expectedCid ?? 'UNKNOWN',
      terminal: true,
    });

    // Runtime proof counters (do not affect control flow)
    try {
      const deltaReason = normalizedAudit.delta_reason;
      const delta_reason_kind =
        deltaReason === 'aligned' ? ('aligned' as const) : deltaReason ? ('mismatch' as const) : ('unknown' as const);

      if (domAxiom?.axiom_id && expectedCid && actualCid && expectedCid !== actualCid) {
        host.promMetrics?.recordAxiomDominantCidMismatch({
          axiom_id: domAxiom.axiom_id,
          expected_cid: normalizeAxiomCidForMetrics(expectedCid),
          actual_cid: normalizeAxiomCidForMetrics(actualCid),
          stage: 'TERMINAL',
          match_source: axiomMatchSource,
        });
      }
      if (delta_reason_kind === 'mismatch') {
        host.promMetrics?.recordAxiomSimRealMismatch({
          axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
          expected_cid: normalizeAxiomCidForMetrics(expectedCid),
          actual_cid: normalizeAxiomCidForMetrics(actualCid),
          stage: 'TERMINAL',
          match_source: axiomMatchSource,
          severity: domAxiom?.axiom?.severity ?? 'UNKNOWN',
        });
      }
    } catch {
      // best-effort only
    }
  } catch {
    // best-effort only
  }

  // Observability (Logs): emit a single atomic audit event for Loki drill-down.
  // Important: only emit on terminal reports to avoid I/O explosion.
  try {
    const deltaReason = normalizedAudit.delta_reason;
    const deltaUtility = normalizedAudit.delta_utility;
    const delta_reason_kind =
      deltaReason === 'aligned' ? ('aligned' as const) : deltaReason ? ('mismatch' as const) : ('unknown' as const);
    const is_intent_revised = normalizedAudit.intent_revision_flag;
    const utility_drift_severity = (() => {
      if (!Number.isFinite(deltaUtility)) return 'unknown' as const;
      const a = Math.abs(deltaUtility);
      if (a <= 5) return 'low' as const;
      if (a <= 20) return 'medium' as const;
      return 'high' as const;
    })();

    const payload = {
      event: 'decision_os_audit_report',
      request_id: state.request_id,
      dominant_cid: normalizedAudit.dominant_cid,
      session_consistency_score: normalizedAudit.session_consistency_score,
      delta_reason_kind,
      is_intent_revised,
      utility_drift_severity,
      audit_report: normalizedAudit.audit_report,
    };
    host.logger.log(JSON.stringify(payload));
  } catch {
    // best-effort only
  }

  // In-Memory Precedents (CBR): 异步抽取并聚合 gold_sample 到本地判例库（不阻塞返回）
  if (host.localCaseStore) {
    Promise.resolve()
      .then(() => {
        const rec = auditReportToCaseRecord({ audit_report: audit_report as any, request_id: state.request_id });
        if (rec) host.localCaseStore!.saveCase(rec);
      })
      .catch(() => undefined);
  }

  if (host.cbrAggregator) {
    void host.cbrAggregator
      .ingestAuditReport(audit_report as any, state.request_id)
      .catch((err) =>
        host.logger.warn(
          `CBR background ingest failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  const outcome = finalizeOrchestrationOutcome({
    status: 'NO_FEASIBLE_PATH',
    technicalSuccess: true,
    userTaskCompleted: true,
  });
  return {
    ...outcome,
    result: {
      state,
      needsUserConfirmation: false,
      terminal: {
        type: 'TERMINAL_NO_SOLUTION',
        planGenTerminalFailure: tf,
        violations,
        audit_report,
      } as any,
      ...(decisionState && { decisionState }),
    } as any,
    answerText,
    stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log),
    totalDuration: Date.now() - startTime,
    decisionLog: state.decision_log,
  };
}
