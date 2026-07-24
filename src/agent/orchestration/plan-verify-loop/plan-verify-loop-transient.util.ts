import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import {
  parseMaxPlanVerifyGraphSteps,
  parseMaxRepairCount,
  parseMaxRepairUtilityDeclines,
} from '../orchestration-governance-matrix.constants';

/** 子图调度瞬态预算（每次 runPlanVerifyOptimizeRepairLoop 独立实例，禁止写回类成员） */
export type PlanVerifyLoopBudgetConfig = {
  maxGraphSteps: number;
  maxRepairs: number;
  maxUtilityDeclines: number;
};

export type PlanVerifyTransientLoopState = {
  readonly config: PlanVerifyLoopBudgetConfig;
  /** 调度器步数余量（防死锁） */
  stepsRemaining: number;
  /** REPAIR 余量 = maxRepairs - DSO.repairCount（每次 REPAIR 后由 DSO 重算） */
  repairsRemaining: number;
  /** 效用递减余量 = maxUtilityDeclines - consecutiveUtilityDeclines */
  utilityDeclinesRemaining: number;
};

export function parsePlanVerifyLoopBudgetConfig(): PlanVerifyLoopBudgetConfig {
  const maxRepairs = parseMaxRepairCount();
  const maxGraphSteps = parseMaxPlanVerifyGraphSteps();
  const maxUtilityDeclines = parseMaxRepairUtilityDeclines();
  return {
    maxRepairs,
    maxGraphSteps,
    maxUtilityDeclines,
  };
}

export function createPlanVerifyTransientState(
  decisionState: DecisionState | undefined,
  config: PlanVerifyLoopBudgetConfig = parsePlanVerifyLoopBudgetConfig(),
): PlanVerifyTransientLoopState {
  const repairCount = decisionState?.systemState?.repairCount ?? 0;
  const declines = decisionState?.systemState?.consecutiveUtilityDeclines ?? 0;
  return {
    config,
    stepsRemaining: config.maxGraphSteps,
    repairsRemaining: Math.max(0, config.maxRepairs - repairCount),
    utilityDeclinesRemaining: Math.max(0, config.maxUtilityDeclines - declines),
  };
}

/** 每调度一步递减；返回更新后的瞬态与是否已耗尽 */
export function consumeGraphStep(
  loop: PlanVerifyTransientLoopState,
): { loop: PlanVerifyTransientLoopState; exhausted: boolean } {
  if (loop.stepsRemaining <= 0) {
    return { loop, exhausted: true };
  }
  return {
    loop: { ...loop, stepsRemaining: loop.stepsRemaining - 1 },
    exhausted: false,
  };
}

/** REPAIR 完成后按 DSO.repairCount 重算余量（Kernel 已递增） */
export function syncRepairsRemainingFromDso(
  loop: PlanVerifyTransientLoopState,
  decisionState: DecisionState | undefined,
): PlanVerifyTransientLoopState {
  const repairCount = decisionState?.systemState?.repairCount ?? 0;
  return {
    ...loop,
    repairsRemaining: Math.max(0, loop.config.maxRepairs - repairCount),
  };
}

export function isRepairBudgetExceeded(
  loop: PlanVerifyTransientLoopState,
  decisionState: DecisionState | undefined,
): boolean {
  const { maxRepairs } = loop.config;
  if (maxRepairs <= 0) return false;
  const repairCount = decisionState?.systemState?.repairCount ?? 0;
  return repairCount >= maxRepairs || loop.repairsRemaining <= 0;
}

export function isUtilityDeclineBudgetExceeded(loop: PlanVerifyTransientLoopState): boolean {
  const { maxUtilityDeclines } = loop.config;
  if (maxUtilityDeclines <= 0) return false;
  return loop.utilityDeclinesRemaining <= 0;
}

/** 效用递减计数 +1 后重算余量 */
export function consumeUtilityDecline(
  loop: PlanVerifyTransientLoopState,
  declined: boolean,
): PlanVerifyTransientLoopState {
  if (!declined) {
    return { ...loop, utilityDeclinesRemaining: loop.config.maxUtilityDeclines };
  }
  const next = Math.max(0, loop.utilityDeclinesRemaining - 1);
  return { ...loop, utilityDeclinesRemaining: next };
}
