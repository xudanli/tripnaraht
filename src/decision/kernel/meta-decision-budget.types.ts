import type { UncertaintyProfile } from './decision-state.types';

/**
 * RESEARCH 阶段预算推导的中间态（不直接写入 DSO，避免与粒子熵口径冲突）
 */
export interface UncertaintyBudgetDraft {
  hasUncertainty: boolean;
  sources?: NonNullable<UncertaintyProfile['sources']>;
  /** 环境/风险 proxy 的不确定性信号（0-1） */
  proxyEntropy01: number;
}
