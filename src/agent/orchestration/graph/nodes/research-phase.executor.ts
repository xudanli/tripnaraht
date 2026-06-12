import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import {
  extractDecisionLogTripContext,
  extractDestinationDisplayZh,
  formatResearchInputsKernelZh,
  formatResearchOutputsZh,
  formatResearchTeamAuditInputsZh,
  formatResearchTeamAuditOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { ResearchTeamAuditEntry } from '../../../teams/research/research-team.types';
import { cloneResearchRecord } from '../../../utils/research-asset-scope.util';
import { ensureHarnessResearchEvidenceSnapshot } from '../../../utils/harness-research-evidence-snapshot.util';
import { TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY } from '../../../execution/shared/transport-evidence-messages';
import type { ResearchPhaseHost, RunResearchPhaseParams } from './research-phase.host';

/**
 * RESEARCH 内核/降级执行体（自 claude-orchestrator 迁出）。
 * 经 DecisionKernel.executeResearch → Context Lint + Harness 硬门。
 */
export async function runResearchPhase(
  host: ResearchPhaseHost,
  params: RunResearchPhaseParams,
): Promise<DecisionState | undefined> {
  const { decisionState, state, request, context, llmProvider } = params;
  if (
    host.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
    host.decisionKernel &&
    decisionState &&
    state.trip_plan_request
  ) {
    const stepStartTime = Date.now();
    const transportFollowup = (state.metadata as Record<string, unknown>)?.transport_research_followup === true;
    let priorResearch: Record<string, unknown> | undefined =
      transportFollowup &&
      state.research_data &&
      typeof state.research_data === 'object' &&
      Object.keys(state.research_data as object).length > 0
        ? (state.research_data as Record<string, unknown>)
        : undefined;
    if (transportFollowup && !priorResearch && host.researchPriorSnapshot) {
      const loaded = await host.researchPriorSnapshot.load(request);
      if (loaded && Object.keys(loaded).length > 0) {
        priorResearch = loaded;
        state.research_data = loaded as OrchestratorState['research_data'];
        state.decision_log.push({
          request_id: state.request_id,
          step: 'RESEARCH',
          actor: 'Orchestrator',
          inputs_summary: 'transport_research_followup → prior research snapshot restore',
          outputs_summary: `PRIOR_RESEARCH_SNAPSHOT_RESTORED keys=${Object.keys(loaded).length}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'PRIOR_RESEARCH_SNAPSHOT_RESTORED',
            snapshot_keys: Object.keys(loaded).slice(0, 24),
          },
        });
      }
    }
    const didRunTransportOnly = !!(transportFollowup && priorResearch);
    const scopesToRecompute = (state.metadata as Record<string, unknown>)?.research_scopes_to_recompute;
    const pendingPrior = (state.metadata as Record<string, unknown>)?.pending_research_prior_for_kernel as
      | Record<string, unknown>
      | undefined;
    const priorForScoped =
      pendingPrior && typeof pendingPrior === 'object' && Object.keys(pendingPrior).length > 0
        ? pendingPrior
        : state.research_data &&
            typeof state.research_data === 'object' &&
            Object.keys(state.research_data as object).length > 0
          ? (state.research_data as Record<string, unknown>)
          : undefined;
    const scopedPartial =
      !didRunTransportOnly &&
      Array.isArray(scopesToRecompute) &&
      scopesToRecompute.length > 0 &&
      !!priorForScoped &&
      Object.keys(priorForScoped).length > 0;
    const rollbackSnap = (state.metadata as Record<string, unknown>)?.research_atomic_rollback_snapshot as
      | Record<string, unknown>
      | undefined;
    const ctx = {
      requestId: state.request_id,
      routeDirectionId: request.route_direction_id ?? undefined,
      userId: request.user_id,
      tripPlanRequest: state.trip_plan_request,
      recent_messages: request.conversation_context?.recent_messages,
      ...(didRunTransportOnly
        ? {
            researchMode: 'transport_only' as const,
            priorResearchData: priorResearch,
          }
        : scopedPartial
          ? {
              researchMode: 'scoped_partial' as const,
              priorResearchData: priorForScoped,
              researchScopesToRecompute: scopesToRecompute,
              ...(rollbackSnap && Object.keys(rollbackSnap).length > 0
                ? { researchAtomicRollbackSnapshot: rollbackSnap }
                : {}),
            }
          : {}),
    };
    const researchExecutionKind = didRunTransportOnly
      ? 'TRANSPORT_ONLY'
      : scopedPartial
        ? 'SCOPED_PARTIAL'
        : 'FULL';
    const researchCloneBeforeKernel = cloneResearchRecord(state.research_data as Record<string, unknown>);
    let newState!: DecisionState;
    let researchData!: Record<string, unknown>;
    let teamAuditLog: ResearchTeamAuditEntry[] | undefined;
    try {
      const out = await host.decisionKernel.executeResearch(decisionState, ctx);
      newState = out.newState;
      researchData = out.researchData;
      teamAuditLog = out.teamAuditLog;
    } catch (kernelErr: unknown) {
      const msg = kernelErr instanceof Error ? kernelErr.message : String(kernelErr);
      if (researchCloneBeforeKernel && Object.keys(researchCloneBeforeKernel).length > 0) {
        state.research_data = cloneResearchRecord(researchCloneBeforeKernel) as OrchestratorState['research_data'];
      } else {
        delete state.research_data;
      }
      host.clearResearchAtomicPendingMetadata(state);
      state.decision_log.push({
        request_id: state.request_id,
        step: 'RESEARCH',
        actor: 'Orchestrator',
        inputs_summary: 'Kernel RESEARCH 失败，已恢复 research_data 至 Kernel 调用前快照',
        outputs_summary: `RESEARCH_FAILURE_RESTORED: ${msg.slice(0, 240)}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'RESEARCH_FAILURE_RESTORED',
          error_message: msg.slice(0, 500),
        },
      });
      throw kernelErr;
    }
    newState =
      ensureHarnessResearchEvidenceSnapshot(newState, state.request_id, researchData) ?? newState;
    host.syncOrchestratorFromDecisionState(newState, state);
    state.research_data = researchData;
    state.current_step = 'RESEARCH';
    if (transportFollowup) {
      state.metadata = { ...(state.metadata ?? {}), transport_research_followup: false } as OrchestratorState['metadata'];
      if (didRunTransportOnly) {
        const te = researchData.transport_evidence as Record<string, unknown> | undefined;
        const stillBad =
          te &&
          (te.degraded === true || te.missing === true) &&
          te.suggested_action === TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY;
        if (stillBad) {
          (state.metadata as Record<string, unknown>).transport_clarify_force_reinject = true;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'RESEARCH',
            actor: 'Orchestrator',
            inputs_summary: 'transport_only follow-up still degraded transport_evidence',
            outputs_summary: 'TRANSPORT_FOLLOWUP_STILL_DEGRADED → allow clarify reinject',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: { system_action: 'TRANSPORT_FOLLOWUP_STILL_DEGRADED' },
          });
        } else {
          (state.metadata as Record<string, unknown>).is_followup_transport_repair = true;
        }
      }
    }
    const destinationLabel = extractDestinationDisplayZh({
      userIntentDestination: newState.userIntent?.destination,
      tripPlanRequest: state.trip_plan_request,
    });
    const tripCtx = extractDecisionLogTripContext({
      tripPlanRequest: state.trip_plan_request,
      userIntentDestination: newState.userIntent?.destination,
      metadata: state.metadata as Record<string, unknown>,
    });
    if (teamAuditLog?.length) {
      state.metadata = {
        ...(state.metadata ?? {}),
        last_team_execution: {
          at: new Date().toISOString(),
          request_id: state.request_id,
          research_execution_kind: researchExecutionKind,
          team_audit_log: teamAuditLog,
        },
      } as OrchestratorState['metadata'];
      state.decision_log.push({
        request_id: state.request_id,
        step: 'RESEARCH',
        actor: 'Orchestrator',
        inputs_summary: formatResearchTeamAuditInputsZh(tripCtx),
        outputs_summary: formatResearchTeamAuditOutputsZh(teamAuditLog),
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'RESEARCH_TEAM_AUDIT',
          request_id: state.request_id,
          research_execution_kind: researchExecutionKind,
          team_audit_log: teamAuditLog,
        },
      });
    }
    state.decision_log.push({
      request_id: state.request_id,
      step: 'RESEARCH',
      actor: 'Orchestrator',
      inputs_summary: formatResearchInputsKernelZh({ destination: destinationLabel, ctx: tripCtx }),
      outputs_summary: formatResearchOutputsZh(Object.keys(researchData), tripCtx),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        data_types: Object.keys(researchData),
        ...(didRunTransportOnly
          ? { system_action: 'TRANSPORT_RESEARCH_FOLLOWUP', research_mode: 'transport_only' }
          : {}),
        ...(scopedPartial
          ? {
              research_mode: 'scoped_partial',
              research_scopes_to_recompute: scopesToRecompute,
            }
          : {}),
        ...(teamAuditLog?.length
          ? {
              research_execution_kind: researchExecutionKind,
              team_audit_entry_count: teamAuditLog.length,
            }
          : {}),
        ...(() => {
          const extra: Record<string, unknown> = {};
          const rd = researchData as Record<string, unknown>;
          const oh = rd?.observationHarness;
          if (oh && typeof oh === 'object') {
            const o = oh as Record<string, unknown>;
            extra.observationHarness = {
              parallel: o.parallel,
              observationTimeoutMs: o.observationTimeoutMs,
              auditEntryCount: Array.isArray(o.audit) ? (o.audit as unknown[]).length : 0,
              excludedPoiIds: o.excludedPoiIds,
              passabilityEvidence: o.passabilityEvidence,
              suggestDilemmaElicitation: o.suggestDilemmaElicitation,
            };
          }
          const dh = newState.optimizationHints?.dilemmaElicitationHint;
          if (dh) {
            extra.dilemmaElicitationHint = dh;
          }
          return extra;
        })(),
      },
    });
    state.metadata = {
      ...(state.metadata ?? {}),
      last_updated_at: new Date().toISOString(),
    } as OrchestratorState['metadata'];
    host.clearResearchAtomicPendingMetadata(state);
    await host.generateDecisionStepForStep(state, 'RESEARCH', 'LocalInsight');
    await host.researchPriorSnapshot?.save(request, researchData as Record<string, unknown>);
    return newState;
  }
  if ((state.metadata as Record<string, unknown>)?.pending_research_prior_for_kernel) {
    host.logger.warn(
      `[Claude Orchestrator] RESEARCH 降级路径：KERNEL_NATIVE_EXECUTION 关闭，丢弃 pending COW 元数据 request_id=${state.request_id}`,
    );
    host.clearResearchAtomicPendingMetadata(state);
  }
  return host.executePhaseViaKernel(decisionState, state, 'RESEARCH', async () => {
    await host.executeResearchStep(request, context, state, llmProvider, decisionState);
  });
}
