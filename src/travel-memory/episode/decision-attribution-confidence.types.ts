/**
 * Decision Attribution Confidence — Episode ≠ Preference。
 *
 * 单次拒绝冰川 ≠ 「用户不喜欢冰川」；原因可能是天气/价格/时间/同行/疲劳。
 * Candidate 必须经证据积累 + 无矛盾后，才能进入 Profile View / Decision Context。
 */

import type { CausalAttributionV1 } from './causal-attribution.types';
import type { MemoryLifecycleState } from '../types/memory-lifecycle.types';

export type AttributionCandidateStatus =
  | 'CANDIDATE'
  | 'EVIDENCE_ACCUMULATING'
  | 'BLOCKED_CONTRADICTION'
  | 'BLOCKED_SITUATIONAL'
  | 'QUALIFIED'
  | 'PROMOTED_TO_PROFILE'
  | 'REJECTED';

export type AttributionEvidenceItem = {
  episodeId: string;
  weight: number;
  decisionId?: string | null;
  note?: string;
};

/**
 * 归因置信度对象（进入 Profile View 前的唯一合法形态）。
 * Episode 本身永不直接写成 Preference。
 */
export type DecisionAttributionConfidenceV1 = {
  schemaId: 'tripnara.decision_attribution_confidence@v1';
  version: 1;
  candidateMemory: {
    type: string;
    predicate: string;
    value: unknown;
  };
  confidence: number;
  evidence: AttributionEvidenceItem[];
  status: AttributionCandidateStatus;
  /** 与 MEMORY_LIFECYCLE 对齐 */
  lifecycle: MemoryLifecycleState;
  /** 原因 vs 结果：环境主导时 preference signal 必须低 */
  causalAttribution?: CausalAttributionV1 | null;
  contradictionEpisodeIds?: string[];
  /** 未达晋升门槛时的原因 */
  blockedReason?: string | null;
  updatedAt: string;
};

/** 晋升到 QUALIFIED / ACTIVE 的硬门（真实 Trip 校准前冻结为保守值） */
export const ATTRIBUTION_PROMOTION_GATE = {
  /** 最低置信度 */
  minConfidence: 0.72,
  /** 至少独立 Episode 数 */
  minEpisodes: 3,
  /** 单 Episode 权重上限（防止一次决策支配） */
  maxSingleEpisodeWeight: 0.35,
  /** 存在矛盾时禁止晋升 */
  blockOnContradiction: true,
  /** 用户偏好残余信号下限（环境主导则挡） */
  minUserPreferenceSignal: 0.35,
} as const;

export type PromotionGateResult =
  | {
      promote: true;
      confidence: number;
      evidenceCount: number;
      nextLifecycle: 'QUALIFIED';
    }
  | {
      promote: false;
      reason: string;
      confidence: number;
      evidenceCount: number;
    };
