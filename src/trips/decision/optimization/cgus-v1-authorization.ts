/**
 * CGUS V1 授权边界（运营验证期）。
 *
 * 策略全文：./CGUS_V1_OPERATIONAL_POLICY.md
 *
 * WeightLearner exists ≠ WeightLearner should be activated.
 * 未书面翻转本常量前，禁止将学得权重注入 cgus-search 主排序。
 */

import { DEFAULT_UNIFIED_WEIGHTS } from './unified-decision-formula.service';

/**
 * L5 → EU 动态权重是否允许进入 CGUS 主排名。
 * V1 默认 false：EXPERIMENTAL / NOT_AUTHORIZED。
 * 仅在有充分 Trip→Decision→Outcome→Regret 证据且经授权后改为 true。
 */
export const CGUS_WEIGHT_LEARNING_INTO_RANKING_AUTHORIZED = false as const;

/**
 * 解析 CGUS 统一公式排名权重。
 * 未授权时一律返回静态默认权重，忽略 learned（防误接）。
 */
export function resolveCgusUnifiedRankingWeights(
  learned?: Record<string, number>,
): Record<string, number> {
  if (!CGUS_WEIGHT_LEARNING_INTO_RANKING_AUTHORIZED) {
    return { ...DEFAULT_UNIFIED_WEIGHTS };
  }
  return { ...DEFAULT_UNIFIED_WEIGHTS, ...(learned ?? {}) };
}

/** 图 13 模块在 V1 的冻结标签（文档/诊断用，非运行时开关） */
export type CgusV1ModuleStatus =
  | 'RELEASED'
  | 'FROZEN_EVIDENCE_REQUIRED'
  | 'KNOWN_GAP'
  | 'EXISTING_MECHANISM_OBSERVE'
  | 'EXPERIMENTAL_NOT_AUTHORIZED';

export const CGUS_V1_MODULE_STATUS = {
  'EU-IN': 'RELEASED',
  'EU-100': 'RELEASED',
  'EU-200': 'FROZEN_EVIDENCE_REQUIRED',
  'EU-300': 'FROZEN_EVIDENCE_REQUIRED',
  'EU-400': 'RELEASED',
  'EU-500-budget': 'KNOWN_GAP',
  'EU-500-time': 'EXISTING_MECHANISM_OBSERVE',
  'EU-600': 'RELEASED',
  'L5-weight-learning': 'EXPERIMENTAL_NOT_AUTHORIZED',
} as const satisfies Record<string, CgusV1ModuleStatus>;
