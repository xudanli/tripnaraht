import type { GateResult, OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { NarratePhaseHost, NarratePhaseResult, RunNarratePhaseParams } from './narrate-phase.host';
import { applyResearchManifestToNarration } from './narrate-manifest-merge.util';
import {
  buildItineraryAdjustAuditMetadata,
  formatNarrateOutputsAdjustZh,
  resolveItineraryAdjustRunContext,
  scopeOrchestratorNarrationToAdjustTarget,
} from '../../utils/itinerary-adjust-decision-log.util';

/**
 * NARRATE 执行体：Kernel.executeNarrate + NarratorAgent 降级 + Manifest 合并 + decision_log 审计。
 */
export async function runNarratePhase(
  host: NarratePhaseHost,
  params: RunNarratePhaseParams,
): Promise<NarratePhaseResult> {
  const { request, state, decisionState } = params;
  const stepStartTime = Date.now();
  state.current_step = 'NARRATE';
  host.logger.debug(`[Claude Orchestrator] 执行 NARRATE 步骤...`);

  let kernelPathUsed = false;
  let fallbackUsed = false;
  let manifestAudit: NarratePhaseResult['manifestAudit'];
  let narrateEbpReport: ReturnType<NarratePhaseHost['parseResearchConflictReport']>;
  let narrateRealtimeRerollCount = 0;

  try {
    const rd0 = state.research_data as Record<string, unknown> | undefined;
    narrateEbpReport = host.parseResearchConflictReport(rd0?.__research_conflict_negotiation);
    narrateRealtimeRerollCount = host.readRealtimeRerollCount(rd0);

    const dosCtxForNarrate = host.resolveDosExecutionContext(request);
    if (dosCtxForNarrate) {
      state.metadata = {
        ...state.metadata,
        dos_plan_delta: [...dosCtxForNarrate.planDelta],
        dos_trip_id: dosCtxForNarrate.tripId,
      };
    }

    if (host.decisionKernel && state.itinerary && state.gate_result) {
      const narrateCtx: import('../../../decision/kernel/interfaces/phase-executor.interface').NarrateExecutorContext =
        {
          requestId: state.request_id,
          userId: request.user_id,
          orchestratorState: state,
          ...(narrateEbpReport ? { researchConflict: narrateEbpReport } : {}),
        };
      const dso =
        decisionState ??
        host.decisionKernel.createInitialState(
          state.request_id,
          host.kernelCreateInitialOpts(request, state),
        );
      const result = await host.decisionKernel.executeNarrate(dso, narrateCtx);
      state.narration = result.narration as OrchestratorState['narration'];
      kernelPathUsed = true;
    } else {
      state.narration = {
        user_friendly_summary: '',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
      };
    }

    const narrativeDays = state.narration?.day_by_day_narrative?.length ?? 0;
    const itineraryDayCount = Array.isArray(state.itinerary?.days) ? state.itinerary!.days.length : 0;
    if (host.narratorAgent && itineraryDayCount > 0 && narrativeDays === 0) {
      fallbackUsed = await runNarratorAgentFallback(host, state, narrateEbpReport);
    }

    const audit = applyResearchManifestToNarration(state);
    if (audit) manifestAudit = audit;

    const adjustCtx = resolveItineraryAdjustRunContext(state);
    if (adjustCtx.active) {
      scopeOrchestratorNarrationToAdjustTarget(state);
    }

    recordNarrateDecisionLog(host, state, stepStartTime, {
      adjustCtx,
      narrateEbpReport,
      narrateRealtimeRerollCount,
      manifestAudit,
    });

    state.metadata.last_updated_at = new Date().toISOString();

    return {
      kernelPathUsed,
      fallbackUsed,
      narrativeDayCount: state.narration?.day_by_day_narrative?.length ?? 0,
      manifestAudit,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    host.logger.error(`[Claude Orchestrator] NARRATE 步骤失败: ${message}`);
    state.errors.push({
      step: 'NARRATE',
      error_code: 'NARRATION_ERROR',
      message: message || '叙述生成失败',
      timestamp: new Date().toISOString(),
    });
    return {
      kernelPathUsed,
      fallbackUsed,
      narrativeDayCount: state.narration?.day_by_day_narrative?.length ?? 0,
      manifestAudit,
      nonFatalError: message,
    };
  }
}

async function runNarratorAgentFallback(
  host: NarratePhaseHost,
  state: OrchestratorState,
  narrateEbpReport: ReturnType<NarratePhaseHost['parseResearchConflictReport']>,
): Promise<boolean> {
  const gate: GateResult =
    state.gate_result ??
    ({
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.9,
    } as GateResult);
  try {
    const fbState = {
      ...state,
      ...(narrateEbpReport ? { narration_research_conflict: narrateEbpReport } : {}),
    };
    const fb = await host.narratorAgent!.narrate(
      state.itinerary!,
      gate,
      state.decision_log ?? [],
      fbState,
    );
    state.narration = fb as OrchestratorState['narration'];
    host.logger.debug(
      `[Claude Orchestrator] NARRATE fallback: NarratorAgent 生成 ${state.narration?.day_by_day_narrative?.length ?? 0} 天叙述`,
    );
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    host.logger.warn(`[Claude Orchestrator] NARRATE fallback narrator failed: ${msg}`);
    return false;
  }
}

function recordNarrateDecisionLog(
  host: NarratePhaseHost,
  state: OrchestratorState,
  stepStartTime: number,
  meta: {
    adjustCtx: ReturnType<typeof resolveItineraryAdjustRunContext>;
    narrateEbpReport: ReturnType<NarratePhaseHost['parseResearchConflictReport']>;
    narrateRealtimeRerollCount: number;
    manifestAudit?: NarratePhaseResult['manifestAudit'];
  },
): void {
  const { adjustCtx, narrateEbpReport, narrateRealtimeRerollCount, manifestAudit } = meta;
  const outputsSummary =
    adjustCtx.active && adjustCtx.targetDateIso
      ? formatNarrateOutputsAdjustZh({
          targetDateIso: adjustCtx.targetDateIso,
          targetDayNumber: adjustCtx.targetDayNumber,
        })
      : state.narration
        ? `已写出 ${state.narration?.day_by_day_narrative?.length || 0} 天的讲解文案与要点提示`
        : '未生成叙述（可能缺少 Kernel 或日程为空）';

  state.decision_log.push({
    request_id: state.request_id,
    step: 'NARRATE',
    actor: 'Narrator',
    inputs_summary: '把结构化日程转成自然语言说明（不改具体时间安排）',
    outputs_summary: outputsSummary,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      duration_ms: Date.now() - stepStartTime,
      ...(adjustCtx.active
        ? buildItineraryAdjustAuditMetadata(adjustCtx.metadata)
        : {}),
      ...(narrateEbpReport
        ? {
            ebp_stance: narrateEbpReport.primary_narrative_stance,
            conflict_count: narrateEbpReport.items.length,
            ...(narrateEbpReport.stitch_tactic ? { stitch_tactic: narrateEbpReport.stitch_tactic } : {}),
            ...(narrateEbpReport.memory_replay
              ? { decision_source: host.memoryReplayDecisionSource }
              : {}),
          }
        : {}),
      ...(manifestAudit && manifestAudit.collapsed_suture_count > 0
        ? { collapsed_suture_count: manifestAudit.collapsed_suture_count }
        : {}),
      ...(narrateRealtimeRerollCount > 0 ? { realtime_reroll_count: narrateRealtimeRerollCount } : {}),
      effective_voice_tone:
        state.narration && typeof state.narration === 'object'
          ? ((state.narration as { voice_tone_modifier?: string }).voice_tone_modifier ?? null)
          : null,
    },
  });
}
