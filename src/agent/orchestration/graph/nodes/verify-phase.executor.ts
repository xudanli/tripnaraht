import { ensureHarnessResearchEvidenceSnapshot } from '../../../utils/harness-research-evidence-snapshot.util';
import { mergeVerificationIssuesIntoGateResult } from '../../../utils/merge-verify-issues-into-gate.util';
import {
  formatVerifyInputsKernelZh,
  formatVerifyOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { GuardianType } from '../../../interfaces/trip-plan.interface';
import type { VerifyPhaseHost, RunVerifyPhaseParams } from './verify-phase.host';
import { appendVerifyTemporalOpeningAuditProof } from './verify-temporal-opening-audit.util';
import {
  buildItineraryAdjustAuditMetadata,
  filterVerifyIssuesToAdjustTarget,
  formatVerifyOutputsAdjustZh,
  resolveItineraryAdjustRunContext,
} from '../../../utils/itinerary-adjust-decision-log.util';

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
    const effectiveDecisionState =
      ensureHarnessResearchEvidenceSnapshot(
        decisionState,
        state.request_id,
        state.research_data as Record<string, unknown> | undefined,
      ) ?? decisionState;
    const ctx = {
      requestId: state.request_id,
      tripPlanRequest: state.trip_plan_request,
      itinerary: state.itinerary as any,
      researchData: state.research_data,
    };
    const { newState, issues } = await host.decisionKernel.executeVerify(effectiveDecisionState, ctx);
    host.syncOrchestratorFromDecisionState(newState, state);

    const adjustCtx = resolveItineraryAdjustRunContext(state);
    const targetDay =
      adjustCtx.active && adjustCtx.targetDateIso
        ? state.itinerary?.days?.find(
            (d) => String(d.date ?? '').slice(0, 10) === adjustCtx.targetDateIso!.slice(0, 10),
          )
        : undefined;
    const issuesForLog = adjustCtx.active
      ? filterVerifyIssuesToAdjustTarget(
          issues as Array<{ class?: string; day?: string; entityRef?: { id?: string } }>,
          adjustCtx.targetDateIso,
          targetDay?.items,
        )
      : (issues as Array<{ class?: string; day?: string }>);

    const fatalIssues = issuesForLog.filter((i) => i?.class === 'FATAL');
    const conflictIssues = issuesForLog.filter((i) => i?.class === 'CONFLICT');
    const advisoryIssues = issuesForLog.filter((i) => i?.class === 'ADVISORY');

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
      outputs_summary:
        adjustCtx.active && adjustCtx.targetDateIso
          ? formatVerifyOutputsAdjustZh({
              targetDateIso: adjustCtx.targetDateIso,
              scopedIssueCount: issuesForLog.length,
              totalIssueCount: issues.length,
              fatal: fatalIssues.length,
              conflict: conflictIssues.length,
              advisory: advisoryIssues.length,
            })
          : formatVerifyOutputsZh({
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
        ...(adjustCtx.active
          ? {
              issues_scoped_to_target_day: issuesForLog,
              ...buildItineraryAdjustAuditMetadata(adjustCtx.metadata),
            }
          : {}),
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
