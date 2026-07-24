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
  state.metadata = {
    ...(state.metadata ?? {}),
    started_at: state.metadata?.started_at ?? now,
    last_updated_at: now,
    flawed_draft_narrate: true,
    flawed_draft_reason: reason,
    flawed_draft_opt_in: 'explicit',
    ...extraMeta,
  };
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
        })
      ) {
        host.logger.log(
          `[PlanVerifyLoop] Utility decay budget exceeded (${nextDeclines}/${maxUtilityDeclines}) → allow_flawed_draft_narrate`,
        );
        return { terminal: null, loop, decisionState };
      }
      state.clarification_questions = [
        {
          id: 'utility_decay_halt_confirmation',
          question: `自动修复后期望效用已连续 ${nextDeclines} 次下降（E[U] ${String(prevEu)} → ${String(euAfter)}）。是否缩小范围/放宽约束，或由您确认继续？`,
          type: 'single_choice',
          required: true,
          options: [
            { value: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
            { value: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
            { value: 'continue_auto_repair', label: '继续自动修复' },
          ],
          hint: '为避免“拆东墙补西墙”的循环，系统需要您的指令。',
          metadata: { presentation: 'structured_intake_v1', repair_halt: 'utility_decay' },
        },
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
      })
    ) {
      host.logger.log(
        `[PlanVerifyLoop] REPAIR budget exceeded (${repairCount}/${maxRepairs}) → allow_flawed_draft_narrate, continue to NARRATE`,
      );
      return null;
    }
    state.clarification_questions = [
      {
        id: 'repair_halt_confirmation',
        question: `系统已自动修复尝试 ${repairCount} 次，仍未收敛。是否需要缩小范围/放宽约束/或由您确认继续自动修复？`,
        type: 'single_choice',
        required: true,
        options: [
          { value: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
          { value: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
          { value: 'continue_auto_repair', label: '继续自动修复' },
        ],
        hint: '为避免“拆东墙补西墙”的循环，系统需要您的指令。',
        metadata: { presentation: 'structured_intake_v1', repair_halt: 'budget_exceeded' },
      },
    ];
    host.maybeSnapshot(state, 'CHECKPOINT');
    return host.buildClarificationResult(state, startTime, decisionState, context);
  }
  return null;
}
