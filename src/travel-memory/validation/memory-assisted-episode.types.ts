/**
 * 验收单位：Memory-assisted Decision Episode（不是 Memory Record）。
 *
 * 唯一生产问题：这条 Memory 是否改变了正确的决策行为？
 */

import type { MemoryContributionItemV1 } from '../runtime/memory-decision-trace.types';

/**
 * Decision Pair — 每次 Memory 参与决策的可比较样本。
 * 回答：如果没有这条 Memory，会不会做出不同选择？
 */
export type DecisionPairV1 = {
  schemaId: 'tripnara.decision_pair@v1';
  version: 1;
  decisionId: string;
  tripId: string;
  baseline: {
    context: 'without_memory';
    recommendation: string;
  };
  memoryAssisted: {
    context: 'with_memory';
    recommendation: string;
    memoryContribution: string[];
  };
  /** recommendation 是否因 Memory 改变 */
  diverged: boolean;
};

/**
 * Decision Outcome — 旅行决策不是 CTR；Acceptance ≠ 成功。
 */
export type DecisionOutcomeBundleV1 = {
  schemaId: 'tripnara.decision_outcome_bundle@v1';
  version: 1;
  decisionId: string;
  acceptance: boolean | null;
  executionSuccess: boolean | null;
  satisfaction: number | null;
  regret: number | null;
  constraintViolation: boolean | null;
  /** 分钟或归一化成本；延误/取消连锁等 */
  recoveryCost: number | null;
};

/**
 * Memory 成功判定：Acceptance 为真但延误+疲劳+次日取消 → 不算成功。
 */
export function isMemoryAssistedSuccess(
  outcome: DecisionOutcomeBundleV1,
): boolean {
  if (outcome.acceptance !== true) return false;
  if (outcome.executionSuccess === false) return false;
  if (outcome.constraintViolation === true) return false;
  if (outcome.regret != null && outcome.regret >= 0.55) return false;
  if (outcome.recoveryCost != null && outcome.recoveryCost >= 90) return false;
  if (outcome.satisfaction != null && outcome.satisfaction < 0.4) return false;
  return true;
}

/** Harm 细分（旅行 Agent 特有） */
export type MemoryHarmKind =
  | 'DIRECT_HARM'
  | 'MISSED_BENEFIT'
  | 'OVER_RESTRICTION';

export type MemoryHarmBreakdownV1 = {
  directHarmRate: number;
  missedBenefitRate: number;
  overRestrictionRate: number;
  /** 合计；Promotion 仍用总 harmRate 红线 */
  totalHarmRate: number;
};

/**
 * Context Authority Distribution — Reality First, Memory Second。
 * 若长期 Memory > World → 系统退化。
 */
export type ContextAuthorityDistributionV1 = {
  worldEvidencePct: number;
  bookingEvidencePct: number;
  teamEvidencePct: number;
  memoryEvidencePct: number;
};

export function isMemoryOverWorld(
  dist: ContextAuthorityDistributionV1,
): boolean {
  return dist.memoryEvidencePct > dist.worldEvidencePct;
}

/** 可证明的 Memory Contribution（防假提升） */
export type ProvenMemoryContributionV1 = {
  used: boolean;
  influence: Array<
    MemoryContributionItemV1 & {
      memoryId: string;
      role: MemoryContributionItemV1['influence'];
      weight: number;
    }
  >;
};

/** 系统边界（冻结） */
export const TRAVEL_MEMORY_SYSTEM_BOUNDARY = {
  RESPONSIBLE_FOR: [
    'SAVE_DECISION_EVIDENCE',
    'PROVIDE_HISTORICAL_EXPERIENCE',
    'PROVIDE_EXPLANATION',
    'SUPPORT_FUTURE_DECISION_IMPROVEMENT',
  ],
  NOT_RESPONSIBLE_FOR: [
    'ROUTE_PLANNING',
    'JUDGE_WORLD_STATE',
    'REPLACE_CGUS',
    'REPLACE_WORLD_MODEL',
    'AUTO_LEARN_SKILLS',
    'AUTO_MUTATE_USER_PROFILE',
  ],
} as const;

/**
 * 下一阶段唯一正确的问题：
 * 在第 N 个真实 Trip 中，Memory 是否让 Nara 少犯了一次过去犯过的错误？
 */
export const MEMORY_VALIDATION_NORTH_STAR_QUESTION =
  '在第 N 个真实 Trip 中，Memory 是否让 Nara 少犯了一次过去犯过的错误？';
