/**
 * Memory Validation Loop — 质量指标计算（纯函数）。
 */

import {
  MEMORY_HARM_RATE_PROMOTION_BLOCK,
  type MemoryDeltaQualityV1,
  type DecisionQualitySnapshotV1,
  type MemoryQualityMetricsV1,
  type ShadowMemoryCompareCaseV1,
  type ShadowMemoryEvaluationBundleV1,
} from './memory-validation-loop.types';

export function computeDeltaQuality(
  baseline: DecisionQualitySnapshotV1,
  memoryAssisted: DecisionQualitySnapshotV1,
): MemoryDeltaQualityV1 {
  const delta = {
    acceptance: memoryAssisted.acceptanceRate - baseline.acceptanceRate,
    override: memoryAssisted.overrideRate - baseline.overrideRate,
    regret: memoryAssisted.meanRegret - baseline.meanRegret,
    repeatedMistake:
      memoryAssisted.repeatedMistakeRate - baseline.repeatedMistakeRate,
  };
  const improved =
    delta.regret < 0 &&
    delta.override <= 0.02 &&
    delta.repeatedMistake <= 0.02;

  return {
    schemaId: 'tripnara.memory_validation_loop@v1',
    baseline,
    memoryAssisted,
    delta,
    improved,
  };
}

export function computeMemoryQualityMetrics(input: {
  cases: ShadowMemoryCompareCaseV1[];
  totalDecisions: number;
  attributionAccuracy?: number | null;
}): MemoryQualityMetricsV1 {
  const memoryCases = input.cases;
  let improvedCount = 0;
  let worsenedCount = 0;
  let unchangedCount = 0;

  for (const c of memoryCases) {
    if (c.qualityDelta === 'IMPROVED') improvedCount++;
    else if (c.qualityDelta === 'WORSENED') worsenedCount++;
    else if (c.qualityDelta === 'UNCHANGED') unchangedCount++;
  }

  const n = memoryCases.length || 0;
  const benefitRate = n ? improvedCount / n : 0;
  const harmRate = n ? worsenedCount / n : 0;
  const dependencyRate = input.totalDecisions
    ? n / input.totalDecisions
    : 0;

  return {
    memoryAssistedCount: n,
    improvedCount,
    worsenedCount,
    unchangedCount,
    benefitRate,
    harmRate,
    dependencyRate,
    totalDecisions: input.totalDecisions,
    attributionAccuracy: input.attributionAccuracy ?? null,
  };
}

export function buildShadowEvaluationBundle(input: {
  cases: ShadowMemoryCompareCaseV1[];
  totalDecisions: number;
  attributionAccuracy?: number | null;
  evaluatedAt?: string;
}): ShadowMemoryEvaluationBundleV1 {
  const metrics = computeMemoryQualityMetrics(input);
  const promotionBlocked = metrics.harmRate > MEMORY_HARM_RATE_PROMOTION_BLOCK;

  return {
    schemaId: 'tripnara.shadow_memory_evaluation@v1',
    version: 1,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    cases: input.cases,
    metrics,
    promotionBlocked,
    promotionBlockReason: promotionBlocked
      ? `harm_rate=${metrics.harmRate}>${MEMORY_HARM_RATE_PROMOTION_BLOCK}`
      : null,
  };
}

/**
 * 从双推荐 + 用户选择/regret 判定质量方向（启发式；真 Trip 可覆盖）。
 */
export function classifyShadowQualityDelta(input: {
  diverged: boolean;
  withMemoryRecommendation?: string | null;
  userChosen?: string | null;
  regret?: number | null;
  accepted?: boolean | null;
}): ShadowMemoryCompareCaseV1['qualityDelta'] {
  if (!input.diverged) return 'UNCHANGED';
  if (input.regret == null && input.accepted == null && !input.userChosen) {
    return 'UNKNOWN';
  }
  if (input.regret != null) {
    if (input.regret <= 0.25) return 'IMPROVED';
    if (input.regret >= 0.55) return 'WORSENED';
  }
  if (
    input.userChosen &&
    input.withMemoryRecommendation &&
    input.userChosen === input.withMemoryRecommendation
  ) {
    return input.accepted === false ? 'WORSENED' : 'IMPROVED';
  }
  if (input.accepted === true && (input.regret == null || input.regret < 0.4)) {
    return 'IMPROVED';
  }
  if (input.accepted === false) return 'WORSENED';
  return 'UNKNOWN';
}
