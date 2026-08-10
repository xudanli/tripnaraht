/**
 * Harness Hardening — Adjustment PLAN_GEN / Solver / Repair 纳入 Capability + Scope。
 * 不重写 Planner；在进入 SM 相位前 assert。
 */

import type { AgentCapability, AgentTaskContractV1, AssertCapabilityResult } from '../agent-task-contract.types';
import { assertCapability } from '../assert-task-capability.util';
import { REQUEST_TASK_CONTRACT_MARK } from '../compile-agent-task-contract.util';

export type AdjustmentSmPhase = 'PLAN_GEN' | 'OPTIMIZE' | 'SOLVER' | 'REPAIR' | 'VERIFY' | 'APPLY';

const PHASE_TO_CAPABILITY: Record<AdjustmentSmPhase, AgentCapability> = {
  PLAN_GEN: 'PLAN',
  OPTIMIZE: 'OPTIMIZE',
  SOLVER: 'SOLVER',
  REPAIR: 'REPAIR',
  VERIFY: 'VERIFY',
  APPLY: 'APPLY',
};

export type AdjustmentPhaseScope = {
  /** 受影响日；空表示未声明（REPLAN 可整段） */
  days: number[];
  /** Repair 预算上限 */
  maxRepairs: number;
  /** 是否允许跨日 */
  allowCrossDay: boolean;
  /** 是否允许整段 REPLAN 语义 */
  allowFullReplan: boolean;
};

export function resolveAdjustmentPhaseScope(
  contract: AgentTaskContractV1,
): AdjustmentPhaseScope {
  const days = contract.scope.days ?? [];
  const allowFullReplan =
    contract.allowFullPlanning === true &&
    (days.length === 0 || /replan|重新规划/i.test(contract.semanticMessage ?? ''));
  return {
    days,
    maxRepairs: days.length === 1 ? 2 : 3,
    allowCrossDay: days.length !== 1,
    allowFullReplan,
  };
}

export function assertAdjustmentSmPhase(
  contract: AgentTaskContractV1,
  phase: AdjustmentSmPhase,
): AssertCapabilityResult {
  if (contract.taskType !== 'ITINERARY_ADJUST') {
    return {
      ok: false,
      capability: PHASE_TO_CAPABILITY[phase],
      taskType: contract.taskType,
      reason: `adjustment_phase_denied:not_itinerary_adjust:${phase}`,
    };
  }
  const cap = PHASE_TO_CAPABILITY[phase];
  const gate = assertCapability(contract, cap);
  if (!gate.ok) return gate;

  if (phase === 'APPLY') {
    return {
      ok: false,
      capability: 'APPLY',
      taskType: contract.taskType,
      reason: 'adjustment_apply_requires_confirm_elevate',
    };
  }

  const scope = resolveAdjustmentPhaseScope(contract);
  if (phase === 'PLAN_GEN' && scope.days.length === 1 && scope.allowFullReplan) {
    return {
      ok: false,
      capability: 'PLAN',
      taskType: contract.taskType,
      reason: 'adjustment_scope_conflict:single_day_vs_full_replan',
    };
  }

  return { ok: true };
}

/** SM 相位调用前的统一入口（供 runner 薄挂） */
export function guardAdjustmentSmPhaseOrThrow(
  contract: AgentTaskContractV1,
  phase: AdjustmentSmPhase,
): void {
  const r = assertAdjustmentSmPhase(contract, phase);
  if (r.ok === false) {
    throw new Error(`[AdjustmentCapabilityScope] ${r.reason}`);
  }
}

/**
 * 从 request 上已编译的 TaskContract 薄挂：
 * - 无 contract：跳过（兼容旧 SM）
 * - ITINERARY_ADJUST：Capability + Scope 门禁
 * - 其它且 !allowFullPlanning：禁止 PLAN_GEN/SOLVER/OPTIMIZE/REPAIR/APPLY
 */
export function maybeGuardAdjustmentSmPhaseFromRequest(
  request: { [key: string]: unknown } | null | undefined,
  phase: AdjustmentSmPhase,
): void {
  const mark = request?.[REQUEST_TASK_CONTRACT_MARK] as AgentTaskContractV1 | undefined;
  if (!mark) return;
  if (mark.taskType === 'ITINERARY_ADJUST') {
    guardAdjustmentSmPhaseOrThrow(mark, phase);
    return;
  }
  const smWritePhases: AdjustmentSmPhase[] = [
    'PLAN_GEN',
    'SOLVER',
    'OPTIMIZE',
    'REPAIR',
    'APPLY',
  ];
  if (!mark.allowFullPlanning && smWritePhases.includes(phase)) {
    throw new Error(
      `[AdjustmentCapabilityScope] adjustment_phase_denied:not_itinerary_adjust:${phase}`,
    );
  }
}

export function projectAdjustmentCapabilityScopeForTrace(
  contract: AgentTaskContractV1,
): Record<string, unknown> {
  const scope = resolveAdjustmentPhaseScope(contract);
  return {
    task_type: contract.taskType,
    days: scope.days,
    max_repairs: scope.maxRepairs,
    allow_cross_day: scope.allowCrossDay,
    allow_full_replan: scope.allowFullReplan,
    allow: {
      PLAN_GEN: assertAdjustmentSmPhase(contract, 'PLAN_GEN').ok,
      SOLVER: assertAdjustmentSmPhase(contract, 'SOLVER').ok,
      OPTIMIZE: assertAdjustmentSmPhase(contract, 'OPTIMIZE').ok,
      REPAIR: assertAdjustmentSmPhase(contract, 'REPAIR').ok,
      APPLY: assertAdjustmentSmPhase(contract, 'APPLY').ok,
    },
  };
}
