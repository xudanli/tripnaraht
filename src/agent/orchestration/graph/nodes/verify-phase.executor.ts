import { mergeVerificationIssuesIntoGateResult } from '../../../utils/merge-verify-issues-into-gate.util';
import {
  formatVerifyInputsKernelZh,
  formatVerifyOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { GuardianType } from '../../../interfaces/trip-plan.interface';
import type { VerifyPhaseHost, RunVerifyPhaseParams } from './verify-phase.host';
import { appendVerifyTemporalOpeningAuditProof } from './verify-temporal-opening-audit.util';

/**
 * VERIFY 执行体：确定性校验 + 证据链对齐；FATAL / L2 路由由 Host 根据 Verdict 处理。
 */
export async function runVerifyPhase(
  host: VerifyPhaseHost,
  params: RunVerifyPhaseParams,
): Promise<import('../../../../decision/kernel/decision-state.types').DecisionState | undefined> {
  const { decisionState, state, request, context, llmProvider } = params;

  if (
    host.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
    host.decisionKernel &&
    decisionState &&
    state.itinerary
  ) {
    const stepStartTime = Date.now();
    const ctx = {
      requestId: state.request_id,
      tripPlanRequest: state.trip_plan_request,
      itinerary: state.itinerary as any,
      researchData: state.research_data,
    };
    const { newState, issues } = await host.decisionKernel.executeVerify(decisionState, ctx);
    host.syncOrchestratorFromDecisionState(newState, state);

    const fatalIssues = (issues as Array<{ class?: string; message?: string }>).filter(
      (i) => i?.class === 'FATAL',
    );
    const conflictIssues = (issues as Array<{ class?: string }>).filter(
      (i) => i?.class === 'CONFLICT',
    );
    const advisoryIssues = (issues as Array<{ class?: string }>).filter(
      (i) => i?.class === 'ADVISORY',
    );

    if (issues.length > 0) {
      state.errors.push({
        step: 'VERIFY',
        error_code: 'VERIFICATION_ISSUES',
        message: `发现 ${issues.length} 个验证问题`,
        timestamp: new Date().toISOString(),
      });
    }
    state.current_step = 'VERIFY';
    state.decision_log.push({
      request_id: state.request_id,
      step: 'VERIFY',
      actor: 'Orchestrator',
      inputs_summary: formatVerifyInputsKernelZh(),
      outputs_summary: formatVerifyOutputsZh({
        issueCount: issues.length,
        fatal: fatalIssues.length,
        conflict: conflictIssues.length,
        advisory: advisoryIssues.length,
      }),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        issues,
        guardian: 'DR_DRE' as GuardianType,
      },
    });

    if (state.gate_result && Array.isArray(issues)) {
      const mergedGate = host.mergeVerificationIssuesIntoGateResult(state.gate_result, issues);
      if (mergedGate) state.gate_result = mergedGate;
    }

    appendVerifyTemporalOpeningAuditProof(state, issues);

    state.metadata.last_updated_at = new Date().toISOString();
    await host.generateDecisionStepForStep(state, 'VERIFY', 'CoreDecision');
    return newState;
  }
  return host.executePhaseViaKernel(decisionState, state, 'VERIFY', () =>
    host.executeVerifyStep(request, context, state, llmProvider),
  );
}
