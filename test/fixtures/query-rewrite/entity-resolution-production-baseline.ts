/**
 * Entity Resolution 生产基线快照 — 真实 BGE-M3 + Qdrant REST。
 *
 * 更新方式（devbox，向量服务器已 seed 后）：
 *   export ER_BENCHMARK_QDRANT=1
 *   export QDRANT_URL=http://<向量服务器>:6333
 *   export VECTOR_ER_SCORE_THRESHOLD=0.72
 *   npx jest test/benchmark/entity-resolution.benchmark.spec.ts -t "生产基线"
 */

export const ENTITY_RESOLUTION_PRODUCTION_BASELINE = {
  recordedAt: '2026-06-09',
  pipelineMode: 'qdrant-rest' as const,
  qdrantUrl: 'http://101.37.240.9:6333',
  embeddingService: 'BGE-M3 via PYTHON_AI_SERVICE_URL',
  vectorErScoreThreshold: 0.72,
  collection: 'tripnara_er_entities',
  seededPoints: 79,
  goldenSetTotal: 28,
  /** 2026-06-09 标定结果（threshold=0.72, qdrant-rest） */
  observed: {
    overallAccuracy: 1,
    coreAccuracy: 1,
    stretchAccuracy: 1,
    adversarialAccuracy: 1,
    failures: [] as string[],
  },
  /** 标定后目标（Golden Set 红线） */
  targets: {
    overallMinAccuracy: 0.82,
    coreMinAccuracy: 0.9,
    adversarialMinAccuracy: 0.4,
    stretchMinAccuracy: 0.75,
  },
  /**
   * 阈值标定说明：
   * - 0.72：挡住 LA 噪声类对抗 query 的误召回，同时保留冰岛/西峡湾/斯瓦尔巴 core case
   * - stretch Longyearbyen：KG 补全英文地名后应命中；未命中时优先补词表而非降阈值
   */
  thresholdRationale:
    'VECTOR_ER_SCORE_THRESHOLD=0.72 balances adversarial noise rejection vs cold-region fuzzy recall.',
} as const;
