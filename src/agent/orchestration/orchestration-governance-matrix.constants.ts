/**
 * GATE / VERIFY / REPAIR 治理矩阵 — 常量 SSOT（与 ORCHESTRATION_GOVERNANCE_MATRIX.md 一一对应）。
 *
 * 环境变量覆盖仅适用于预算类旋钮；门控语义（BLOCK/ADJUST_REQUIRED）由代码分支实现，不在此文件改写。
 */

/** plan-verify 子图 REPAIR 次数上限（对齐 DSO.systemState.repairCount） */
export const DECISION_MAX_REPAIR_COUNT_DEFAULT = 3;
export const DECISION_MAX_REPAIR_COUNT_ENV = 'DECISION_MAX_REPAIR_COUNT';

/** plan-verify 子图调度步数上限（防图死锁） */
export const DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS_DEFAULT = 8;
export const DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS_ENV = 'DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS';

/** REPAIR 后期望效用连续下降次数上限 → 澄清终端 */
export const DECISION_REPAIR_UTILITY_DECAY_MAX_DEFAULT = 2;
export const DECISION_REPAIR_UTILITY_DECAY_MAX_ENV = 'DECISION_REPAIR_UTILITY_DECAY_MAX';

/** VERIFY RETURN_TO_RESEARCH 重试上限（pre_plan → plan_gen → verify 环） */
export const DECISION_MAX_VERIFY_RESEARCH_RETRIES_DEFAULT = 1;
export const DECISION_MAX_VERIFY_RESEARCH_RETRIES_ENV = 'DECISION_MAX_VERIFY_RESEARCH_RETRIES';

/** 是否启用 VERIFY Harness → RETURN_TO_RESEARCH */
export const DECISION_VERIFY_RETURN_TO_RESEARCH_ENV = 'DECISION_VERIFY_RETURN_TO_RESEARCH';

/** 同一 POI/路段 oscillation 移动次数阈值（>2 即第 3 次触发 TACTIC_OSCILLATION） */
export const REPAIR_OSCILLATION_MOVE_THRESHOLD = 3;

/** CGUS 优化器内 REPAIR 迭代（TripDraft 路径，非 plan-verify 子图） */
export const CGUS_REPAIR_MAX_ITERS_DEFAULT = 2;
export const CGUS_REPAIR_MAX_ITERS_ENV = 'CGUS_REPAIR_MAX_ITERS';

export type GateResultStatus = 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';

export interface OrchestrationGovernanceLimitsV1 {
  schemaId: 'tripnara.orchestration_governance_limits@v1';
  version: 1;
  limits: {
    maxRepairCount: number;
    maxPlanVerifyGraphSteps: number;
    maxRepairUtilityDeclines: number;
    maxVerifyResearchRetries: number;
    verifyReturnToResearchEnabled: boolean;
    repairOscillationMoveThreshold: number;
    cgusRepairMaxIters: number;
  };
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number): number {
  const n = parseInt(raw ?? String(fallback), 10);
  if (!Number.isFinite(n) || n < min) {
    return fallback;
  }
  return n;
}

export function parseMaxRepairCount(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(
    env[DECISION_MAX_REPAIR_COUNT_ENV],
    DECISION_MAX_REPAIR_COUNT_DEFAULT,
    0,
  );
}

export function parseMaxPlanVerifyGraphSteps(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseBoundedInt(
    env[DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS_ENV],
    DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS_DEFAULT,
    1,
  );
  return n > 0 ? n : DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS_DEFAULT;
}

export function parseMaxRepairUtilityDeclines(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(
    env[DECISION_REPAIR_UTILITY_DECAY_MAX_ENV],
    DECISION_REPAIR_UTILITY_DECAY_MAX_DEFAULT,
    0,
  );
}

export function parseMaxVerifyResearchRetries(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(
    env[DECISION_MAX_VERIFY_RESEARCH_RETRIES_ENV],
    DECISION_MAX_VERIFY_RESEARCH_RETRIES_DEFAULT,
    0,
  );
}

export function isVerifyReturnToResearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[DECISION_VERIFY_RETURN_TO_RESEARCH_ENV] ?? 'true';
  return v === 'true' || v === '1';
}

export function parseCgusRepairMaxIters(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(env[CGUS_REPAIR_MAX_ITERS_ENV], CGUS_REPAIR_MAX_ITERS_DEFAULT, 0);
}

/** 运行时治理预算快照 — 写入 observability.trace（只读 echo，非裁决输入） */
export function buildOrchestrationGovernanceLimitsEcho(
  env: NodeJS.ProcessEnv = process.env,
): OrchestrationGovernanceLimitsV1 {
  return {
    schemaId: 'tripnara.orchestration_governance_limits@v1',
    version: 1,
    limits: {
      maxRepairCount: parseMaxRepairCount(env),
      maxPlanVerifyGraphSteps: parseMaxPlanVerifyGraphSteps(env),
      maxRepairUtilityDeclines: parseMaxRepairUtilityDeclines(env),
      maxVerifyResearchRetries: parseMaxVerifyResearchRetries(env),
      verifyReturnToResearchEnabled: isVerifyReturnToResearchEnabled(env),
      repairOscillationMoveThreshold: REPAIR_OSCILLATION_MOVE_THRESHOLD,
      cgusRepairMaxIters: parseCgusRepairMaxIters(env),
    },
  };
}
