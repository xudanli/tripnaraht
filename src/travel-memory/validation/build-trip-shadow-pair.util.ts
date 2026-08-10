/**
 * 真 Trip Shadow — Without TMR vs With TMR Decision Pair。
 *
 * 不跑第二套完整 CGUS；用已证明的双轨推荐 + Outcome 填 Shadow case。
 */

import type { MemoryDecisionTraceV1 } from '../runtime/memory-decision-trace.types';
import type { DecisionPairV1 } from './memory-assisted-episode.types';
import {
  buildShadowEvaluationBundle,
  classifyShadowQualityDelta,
} from './memory-quality-metrics.util';
import type {
  ShadowMemoryCompareCaseV1,
  ShadowMemoryEvaluationBundleV1,
} from './memory-validation-loop.types';

export type TripShadowPairInputV1 = {
  decisionId: string;
  tripId: string;
  withoutMemoryRecommendation?: string | null;
  withMemoryRecommendation?: string | null;
  /** 线上实际推荐（active soft 时常等于 with） */
  liveRecommendation?: string | null;
  memoryDecisionTrace?: MemoryDecisionTraceV1 | null;
  userChosen?: string | null;
  regret?: number | null;
  accepted?: boolean | null;
};

export type TripShadowPairV1 = {
  schemaId: 'tripnara.trip_shadow_pair@v1';
  version: 1;
  decisionPair: DecisionPairV1;
  compareCase: ShadowMemoryCompareCaseV1;
  northStarReady: boolean;
  notes: string[];
};

export function resolveTripShadowEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = String(env.TRAVEL_MEMORY_TRIP_SHADOW ?? '')
    .trim()
    .toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  // 默认开：有双轨推荐即可产 Pair；设 off 可关
  if (raw === '' || raw === '1' || raw === 'true' || raw === 'on') return true;
  return raw === 'shadow' || raw === 'active';
}

export function buildDecisionPairV1(input: {
  decisionId: string;
  tripId: string;
  withoutMemoryRecommendation: string;
  withMemoryRecommendation: string;
  memoryContributionIds?: string[];
}): DecisionPairV1 {
  const diverged =
    input.withoutMemoryRecommendation !== input.withMemoryRecommendation;
  return {
    schemaId: 'tripnara.decision_pair@v1',
    version: 1,
    decisionId: input.decisionId,
    tripId: input.tripId,
    baseline: {
      context: 'without_memory',
      recommendation: input.withoutMemoryRecommendation,
    },
    memoryAssisted: {
      context: 'with_memory',
      recommendation: input.withMemoryRecommendation,
      memoryContribution: input.memoryContributionIds ?? [],
    },
    diverged,
  };
}

export function buildTripShadowCompareCase(
  input: TripShadowPairInputV1,
): ShadowMemoryCompareCaseV1 | null {
  const without = input.withoutMemoryRecommendation?.trim() || null;
  const withMem =
    input.withMemoryRecommendation?.trim() ||
    input.liveRecommendation?.trim() ||
    null;
  if (!without || !withMem) return null;

  const diverged = without !== withMem;
  const qualityDelta = classifyShadowQualityDelta({
    diverged,
    withMemoryRecommendation: withMem,
    userChosen: input.userChosen,
    regret: input.regret,
    accepted: input.accepted,
  });

  return {
    decisionId: input.decisionId,
    tripId: input.tripId,
    withoutMemoryRecommendation: without,
    withMemoryRecommendation: withMem,
    diverged,
    userChosen: input.userChosen ?? null,
    regret: input.regret ?? null,
    accepted: input.accepted ?? null,
    memoryChangedRecommendation: diverged,
    qualityDelta,
  };
}

/**
 * 构建单次 OPTIMIZE 的 Trip Shadow Pair（可挂 optimizationHints / 观测）。
 */
export function buildTripShadowPair(
  input: TripShadowPairInputV1,
): TripShadowPairV1 | null {
  const compareCase = buildTripShadowCompareCase(input);
  if (!compareCase) return null;

  const contributionIds =
    input.memoryDecisionTrace?.memoryContribution.influence.map(
      (i) => i.memoryId,
    ) ?? [];

  const decisionPair = buildDecisionPairV1({
    decisionId: input.decisionId,
    tripId: input.tripId,
    withoutMemoryRecommendation: compareCase.withoutMemoryRecommendation!,
    withMemoryRecommendation: compareCase.withMemoryRecommendation!,
    memoryContributionIds: contributionIds,
  });

  const notes: string[] = [];
  if (!decisionPair.diverged) {
    notes.push('recommendations_identical');
  }
  if (compareCase.qualityDelta === 'UNKNOWN') {
    notes.push('awaiting_user_outcome');
  }
  if (input.memoryDecisionTrace?.memoryContribution.used !== true) {
    notes.push('contribution_not_proven_used');
  }

  return {
    schemaId: 'tripnara.trip_shadow_pair@v1',
    version: 1,
    decisionPair,
    compareCase,
    /** 有 Outcome（chosen / regret / accepted）才可回答北向问题 */
    northStarReady:
      compareCase.qualityDelta !== 'UNKNOWN' && decisionPair.diverged,
    notes,
  };
}

export function tripShadowPairToObservability(
  pair: TripShadowPairV1,
): Record<string, unknown> {
  return {
    schemaId: pair.schemaId,
    decisionId: pair.decisionPair.decisionId,
    tripId: pair.decisionPair.tripId,
    diverged: pair.decisionPair.diverged,
    without: pair.decisionPair.baseline.recommendation,
    withMemory: pair.decisionPair.memoryAssisted.recommendation,
    qualityDelta: pair.compareCase.qualityDelta,
    northStarReady: pair.northStarReady,
    contributionUsed: !pair.notes.includes('contribution_not_proven_used'),
    notes: pair.notes,
  };
}

/**
 * 进程内 / 测试用：多 case 聚合成 Trip Shadow Evaluation Bundle。
 */
export function evaluateTripShadowCases(input: {
  cases: ShadowMemoryCompareCaseV1[];
  totalDecisions: number;
  attributionAccuracy?: number | null;
  evaluatedAt?: string;
}): ShadowMemoryEvaluationBundleV1 {
  return buildShadowEvaluationBundle(input);
}

/** 北向问题回答草稿（需 northStarReady cases） */
export function summarizeTripShadowNorthStar(
  bundle: ShadowMemoryEvaluationBundleV1,
): {
  question: string;
  answerable: boolean;
  preventedMistakeCount: number;
  harmCount: number;
  promotionBlocked: boolean;
  summaryZh: string;
} {
  const prevented = bundle.metrics.improvedCount;
  const harm = bundle.metrics.worsenedCount;
  const answerable = bundle.cases.some(
    (c) => c.qualityDelta !== 'UNKNOWN' && c.diverged,
  );
  return {
    question:
      '在第 N 个真实 Trip 中，Memory 是否让 Nara 少犯了一次过去犯过的错误？',
    answerable,
    preventedMistakeCount: prevented,
    harmCount: harm,
    promotionBlocked: bundle.promotionBlocked,
    summaryZh: answerable
      ? `可回答样本中：改善 ${prevented} / 恶化 ${harm}（harmRate=${bundle.metrics.harmRate.toFixed(3)}）${
          bundle.promotionBlocked ? '；已触发 Promotion 红线' : ''
        }`
      : '尚无带 Outcome 的分歧样本，无法回答北向问题',
  };
}
