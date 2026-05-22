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
      state.clarification_questions = [
        {
          id: 'utility_decay_halt_confirmation',
          question: `自动修复后期望效用已连续 ${nextDeclines} 次下降（E[U] ${String(prevEu)} → ${String(euAfter)}）。是否缩小范围/放宽约束，或由您确认继续？`,
          type: 'NEED_CONFIRMATION',
          required: true,
          options: [
            { id: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
            { id: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
            { id: 'continue_auto_repair', label: '继续自动修复' },
          ],
        } as any,
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
    state.clarification_questions = [
      {
        id: 'repair_halt_confirmation',
        question: `系统已自动修复尝试 ${repairCount} 次，仍未收敛。是否需要缩小范围/放宽约束/或由您确认继续自动修复？`,
        type: 'NEED_CONFIRMATION',
        required: true,
        options: [
          { id: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
          { id: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
          { id: 'continue_auto_repair', label: '继续自动修复' },
        ],
        hint: '为避免“拆东墙补西墙”的循环，系统需要您的指令。',
      } as any,
    ];
    host.maybeSnapshot(state, 'CHECKPOINT');
    return host.buildClarificationResult(state, startTime, decisionState, context);
  }
  return null;
}
