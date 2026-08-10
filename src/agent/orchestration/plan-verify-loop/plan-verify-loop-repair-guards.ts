import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { AgentContext, OrchestrationResult } from '../../interfaces/claude-orchestration.interface';
import type { Itinerary, OrchestratorState } from '../../interfaces/trip-plan.interface';
import {
  consumeUtilityDecline,
  type PlanVerifyTransientLoopState,
} from './plan-verify-loop-transient.util';
import type { PlanVerifyLoopRunParams } from './plan-verify-loop.types';
import {
  extractVerifyIssueCodesFromState,
  isFlawedDraftForbidden,
} from '../flawed-draft-allow-matrix.constants';
import { buildRepairHaltClarificationQuestion } from '../../utils/build-repair-halt-clarification.util';

export interface PlanVerifyLoopRepairGuardHost {
  readonly logger: Logger;
  readonly decisionKernel?: DecisionKernelService;
  computeRepairFatigue(planDraft: Itinerary | undefined): number | undefined;
  buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState: DecisionState | undefined,
    context: AgentContext,
  ): OrchestrationResult;
  maybeSnapshot(state: OrchestratorState, kind: string): void;
}

export type RepairGuardParams = PlanVerifyLoopRunParams & {
  decisionState: DecisionState | undefined;
  euBefore?: number;
  loop: PlanVerifyTransientLoopState;
};

function hasAdviceOnlyItineraryAdjustDraft(state: OrchestratorState): boolean {
  const md = (state.metadata ?? {}) as Record<string, unknown>;
  const mode = String(md.itinerary_adjust_execution_mode ?? '').toUpperCase();
  if (mode && mode !== 'ADVICE_ONLY') return false;
  const adjust = md.itinerary_adjust_result as
    | { applied?: boolean; draft_schedule_zh?: unknown[]; target_date_iso?: string }
    | undefined;
  if (adjust?.applied === true) return false;
  const schedule = adjust?.draft_schedule_zh;
  if (Array.isArray(schedule) && schedule.some((l) => String(l ?? '').trim())) return true;
  if (String(adjust?.target_date_iso ?? '').trim()) return true;
  if (md.adaptive_replan_requested === true && md.itinerary_adjust_target_date_iso) return true;
  return false;
}

/**
 * Chat / ADVICE_ONLY 单日改排：已有待确认草案时，REPAIR 预算耗尽勿盖住「确认写入」CTA。
 * 不写库、不标 flawed_draft；仅让链路继续 NARRATE 展示草案。
 */
function tryAllowAdviceOnlyItineraryAdjustDraftContinue(
  host: PlanVerifyLoopRepairGuardHost,
  params: RepairGuardParams,
  reason: 'UTILITY_DECAY_BYPASSED' | 'REPAIR_BUDGET_EXCEEDED',
): boolean {
  const { state, request } = params;
  const execMode = String(request.options?.execution_mode ?? '').toUpperCase();
  const entry = String(request.options?.entry_point ?? '');
  const adviceOnly =
    execMode === 'ADVICE_ONLY' ||
    String((state.metadata as Record<string, unknown>)?.itinerary_adjust_execution_mode ?? '')
      .toUpperCase() === 'ADVICE_ONLY';
  if (!adviceOnly) return false;
  if (!hasAdviceOnlyItineraryAdjustDraft(state)) return false;

  const now = new Date().toISOString();
  const md = {
    ...(state.metadata ?? {}),
    started_at: state.metadata?.started_at ?? now,
    last_updated_at: now,
    repair_halt_soft_continue_advice_only: true,
    repair_halt_soft_continue_reason: reason,
    repair_halt_soft_continue_entry: entry || null,
  };
  state.metadata = md;
  // 清掉即将弹出的停机澄清，避免 assembler 仍读到旧题
  state.clarification_questions = [];
  host.logger.log(
    `[PlanVerifyLoop] REPAIR halt soft-continue for ADVICE_ONLY itinerary_adjust draft reason=${reason} request_id=${state.request_id}`,
  );
  return true;
}

function tryAllowFlawedDraftBypass(
  host: PlanVerifyLoopRepairGuardHost,
  params: RepairGuardParams,
  reason: 'UTILITY_DECAY_BYPASSED' | 'REPAIR_BUDGET_EXCEEDED',
  extraMeta: Record<string, unknown>,
): boolean {
  const { state, request, decisionState } = params;
  // P0-1：仅显式 allow_flawed_draft_narrate=true 才允许瑕疵 NARRATE；绑定 trip 不再默认放行
  const opt = request.options?.allow_flawed_draft_narrate;
  if (opt !== true) {
    return false;
  }
  const verifyCodes = [
    ...extractVerifyIssueCodesFromState(state.metadata as Record<string, unknown>),
    ...(decisionState?.verification?.issues?.map((i) => i.code).filter(Boolean) ?? []),
  ];
  const forbid = isFlawedDraftForbidden({
    gateResult: state.gate_result,
    verifyIssueCodes: verifyCodes,
  });
  if (forbid.forbidden) {
    host.logger.warn(
      `[PlanVerifyLoop] allow_flawed_draft_narrate blocked by allow-matrix hits=${forbid.hits
        .map((h) => h.category)
        .join(',')} reason=${reason}`,
    );
    (state.metadata as Record<string, unknown>).flawed_draft_forbid_hits = forbid.hits;
    return false;
  }
  const now = new Date().toISOString();
  const auditEntry = {
    at: now,
    action: 'flawed_draft_opt_in',
    actor: 'plan_verify_loop',
    type: 'system_decision' as const,
    request_id: state.request_id,
    trip_id: request.trip_id ?? null,
    reason,
    opt_in: 'explicit' as const,
    allow_flawed_draft_narrate: true,
  };
  const prevAudit = Array.isArray((state.metadata as Record<string, unknown>)?.audit_log)
    ? ([...(state.metadata as Record<string, unknown>).audit_log as unknown[]])
    : [];
  prevAudit.push(auditEntry);
  state.metadata = {
    ...(state.metadata ?? {}),
    started_at: state.metadata?.started_at ?? now,
    last_updated_at: now,
    flawed_draft_narrate: true,
    flawed_draft_reason: reason,
    flawed_draft_opt_in: 'explicit',
    audit_log: prevAudit,
    flawed_draft_opt_in_audit: auditEntry,
    ...extraMeta,
  };
  host.logger.log(
    `[PlanVerifyLoop][audit] flawed_draft_opt_in request_id=${state.request_id} reason=${reason} trip_id=${request.trip_id ?? ''}`,
  );
  return true;
}

/**
 * REPAIR 后效用递减守卫：连续 E[U] 下降达预算 → 澄清终端。
 */
export async function applyUtilityDecayAfterRepairIfNeeded(
  host: PlanVerifyLoopRepairGuardHost,
  params: RepairGuardParams,
): Promise<{ terminal: OrchestrationResult | null; loop: PlanVerifyTransientLoopState; decisionState: DecisionState | undefined }> {
  const { state, context, startTime, euBefore } = params;
  let decisionState = params.decisionState;
  let loop = params.loop;

  if (!host.decisionKernel || !decisionState) {
    return { terminal: null, loop, decisionState };
  }

  try {
    const planDraft = decisionState.tripState?.planDraft as Itinerary | undefined;
    const fatigue = host.computeRepairFatigue(planDraft);
    const { newState: afterOpt, optimizationHints } = await host.decisionKernel.executeOptimize(
      decisionState,
      { fatigue },
    );
    decisionState = afterOpt;
    const euAfter = optimizationHints?.expectedUtility;
    const prevEu = euBefore ?? decisionState.systemState?.lastExpectedUtility;
    const prevDeclines = decisionState.systemState?.consecutiveUtilityDeclines ?? 0;
    const decline = typeof prevEu === 'number' && typeof euAfter === 'number' && euAfter < prevEu;
    const nextDeclines = decline ? prevDeclines + 1 : 0;
    decisionState = host.decisionKernel.updateState(decisionState, {
      systemState: {
        requestId: state.request_id,
        lastExpectedUtility: typeof euAfter === 'number' ? euAfter : prevEu,
        consecutiveUtilityDeclines: nextDeclines,
      },
    });

    loop = consumeUtilityDecline(loop, decline);
    const { maxUtilityDeclines } = loop.config;
    if (maxUtilityDeclines > 0 && nextDeclines >= maxUtilityDeclines) {
      if (
        tryAllowFlawedDraftBypass(host, { ...params, decisionState }, 'UTILITY_DECAY_BYPASSED', {
          consecutive_utility_declines: nextDeclines,
        }) ||
        tryAllowAdviceOnlyItineraryAdjustDraftContinue(
          host,
          { ...params, decisionState },
          'UTILITY_DECAY_BYPASSED',
        )
      ) {
        host.logger.log(
          `[PlanVerifyLoop] Utility decay budget exceeded (${nextDeclines}/${maxUtilityDeclines}) → continue (flawed_draft or advice_only adjust)`,
        );
        return { terminal: null, loop, decisionState };
      }
      state.clarification_questions = [
        buildRepairHaltClarificationQuestion({
          kind: 'utility_decay',
          utilityDeclineCount: nextDeclines,
          euBefore: prevEu,
          euAfter,
          decisionState,
        }),
      ];
      host.maybeSnapshot(state, 'CHECKPOINT');
      return {
        terminal: host.buildClarificationResult(state, startTime, decisionState, context),
        loop,
        decisionState,
      };
    }
  } catch (e: any) {
    host.logger.debug(`[Claude Orchestrator] Utility decay check skipped: ${e?.message}`);
  }
  return { terminal: null, loop, decisionState };
}

/**
 * REPAIR 次数达预算 → 澄清终端（与 DSO.systemState.repairCount 对齐）。
 */
export function checkRepairCountExceededIfNeeded(
  host: PlanVerifyLoopRepairGuardHost,
  params: RepairGuardParams,
): OrchestrationResult | null {
  const { state, context, startTime, decisionState, loop } = params;
  const repairCount = decisionState?.systemState?.repairCount ?? 0;
  const { maxRepairs } = loop.config;
  if (maxRepairs > 0 && repairCount >= maxRepairs) {
    if (
      tryAllowFlawedDraftBypass(host, params, 'REPAIR_BUDGET_EXCEEDED', {
        repair_count: repairCount,
      }) ||
      tryAllowAdviceOnlyItineraryAdjustDraftContinue(host, params, 'REPAIR_BUDGET_EXCEEDED')
    ) {
      host.logger.log(
        `[PlanVerifyLoop] REPAIR budget exceeded (${repairCount}/${maxRepairs}) → continue (flawed_draft or advice_only adjust)`,
      );
      return null;
    }
    state.clarification_questions = [
      buildRepairHaltClarificationQuestion({
        kind: 'budget_exceeded',
        repairCount,
        decisionState,
      }),
    ];
    host.maybeSnapshot(state, 'CHECKPOINT');
    return host.buildClarificationResult(state, startTime, decisionState, context);
  }
  return null;
}
