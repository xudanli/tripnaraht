/**
 * Travel Memory Validation Loop（V1）
 *
 * 目标不是证明「存储成功」，而是证明：
 * Memory 参与后 Decision Outcome 是否改善。
 *
 * Δ Quality = Acceptance↑ Override↓ Regret↓ Repeated Mistake↓
 */

export const MEMORY_VALIDATION_LOOP_SCHEMA =
  'tripnara.memory_validation_loop@v1' as const;

/** 工程约束：Memory MUST / MUST NOT（验证期冻结） */
export const MEMORY_ENGINEERING_CONTRACT = {
  MUST: [
    'PROVIDE_EVIDENCE',
    'PROVIDE_CONFIDENCE',
    'PROVIDE_VALID_TIME',
    'PROVIDE_SCOPE',
    'SUPPORT_EXPLANATION',
  ],
  MUST_NOT: [
    'OVERRIDE_WORLD_STATE',
    'AUTO_MUTATE_PREFERENCE',
    'BYPASS_DECISION_KERNEL',
    'LEARN_FROM_SINGLE_EPISODE',
    'BE_SOLE_DECISION_BASIS',
  ],
} as const;

export type MemoryEngineeringMust =
  (typeof MEMORY_ENGINEERING_CONTRACT.MUST)[number];
export type MemoryEngineeringMustNot =
  (typeof MEMORY_ENGINEERING_CONTRACT.MUST_NOT)[number];

/**
 * 核心对比：Baseline vs Memory-assisted。
 */
export type DecisionQualitySnapshotV1 = {
  acceptanceRate: number;
  overrideRate: number;
  /** 平均 regret 0–1；越低越好 */
  meanRegret: number;
  repeatedMistakeRate: number;
  sampleSize: number;
};

export type MemoryDeltaQualityV1 = {
  schemaId: typeof MEMORY_VALIDATION_LOOP_SCHEMA;
  baseline: DecisionQualitySnapshotV1;
  memoryAssisted: DecisionQualitySnapshotV1;
  delta: {
    acceptance: number;
    override: number;
    regret: number;
    repeatedMistake: number;
  };
  /** 综合：regret 下降且 override 未恶化才算改善倾向 */
  improved: boolean;
};

/**
 * Memory Benefit Rate = Memory 参与决策中 Regret 下降的比例。
 * Harm Rate = Memory 导致错误决策 / Memory 参与决策（P0 红线）。
 */
export type MemoryQualityMetricsV1 = {
  memoryAssistedCount: number;
  improvedCount: number;
  worsenedCount: number;
  unchangedCount: number;
  /** improvedCount / memoryAssistedCount */
  benefitRate: number;
  /** worsenedCount / memoryAssistedCount — P0 红线 */
  harmRate: number;
  /** memoryAssisted / totalDecisions */
  dependencyRate: number;
  totalDecisions: number;
  /**
   * Attribution Accuracy：预测偏好 vs 真实约束/情境 的校准（真 Trip 填）。
   * 例：预测「不喜欢长驾」vs 现实「仅冬季冰岛不喜欢」→ 低准确。
   */
  attributionAccuracy?: number | null;
};

/** Harm Rate 超过阈值 → 禁止 Promotion */
export const MEMORY_HARM_RATE_PROMOTION_BLOCK = 0.08 as const;

export type ShadowMemoryCompareCaseV1 = {
  decisionId: string;
  tripId: string;
  withoutMemoryRecommendation?: string | null;
  withMemoryRecommendation?: string | null;
  diverged: boolean;
  userChosen?: string | null;
  regret?: number | null;
  accepted?: boolean | null;
  /** Memory 是否改变了推荐 */
  memoryChangedRecommendation: boolean;
  /** 相对无 Memory：改善 / 恶化 / 无变化 / 未知 */
  qualityDelta: 'IMPROVED' | 'WORSENED' | 'UNCHANGED' | 'UNKNOWN';
};

export type ShadowMemoryEvaluationBundleV1 = {
  schemaId: 'tripnara.shadow_memory_evaluation@v1';
  version: 1;
  evaluatedAt: string;
  cases: ShadowMemoryCompareCaseV1[];
  metrics: MemoryQualityMetricsV1;
  promotionBlocked: boolean;
  promotionBlockReason?: string | null;
};
