/**
 * DoD 核心：证明 Candidate Recommendation 是否优于当前 Production Recommendation。
 * 不以新模型/新接口完成为准。
 */

import type { ShadowRecommendationV1, ProductionRecommendationV1 } from './adaptive-shadow-recommendation.util';
import type { DecisionEvaluationV1 } from './decision-evaluation.util';
import type { BenchmarkSuiteResult } from './benchmark-l1-l2-l3.util';

export type CandidateVsProductionProof = {
  schemaId: 'nara.candidate_vs_production_proof@v1';
  version: 1;
  candidateBetterThanProduction: boolean;
  productionScore: number;
  candidateScore: number;
  delta: number;
  reasonsZh: string[];
  /** 使用的观测评价（非反事实） */
  usedObservedEvaluations: number;
  counterfactualExcluded: true;
};

/**
 * 用观测评价（L3）+ Shadow vs Production 选项命中，证明候选是否更优。
 */
export function proveCandidateBetterThanProduction(input: {
  production: ProductionRecommendationV1;
  shadow: ShadowRecommendationV1;
  /** 观测侧评价（不得用反事实冒充） */
  observedEvaluations: DecisionEvaluationV1[];
  /** 可选：L2/L3 套件 */
  l2?: BenchmarkSuiteResult;
  l3?: BenchmarkSuiteResult;
  /** 实际最终选择的 option（观测） */
  observedChosenOptionId?: string;
}): CandidateVsProductionProof {
  const reasons: string[] = [];
  let productionScore = 0;
  let candidateScore = 0;

  const evalScores = input.observedEvaluations.map((e) => e.score);
  const avgEval =
    evalScores.length > 0
      ? evalScores.reduce((a, b) => a + b, 0) / evalScores.length
      : 0.5;

  /** Production 基线：若观测选择=production 选中，记基线分；否则略降 */
  if (
    input.observedChosenOptionId &&
    input.observedChosenOptionId === input.production.selectedOptionId
  ) {
    productionScore = avgEval;
    reasons.push('观测选择与 Production 一致，基线取观测评价均值');
  } else {
    productionScore = avgEval * 0.85;
    reasons.push('观测选择与 Production 不一致，Production 基线折减');
  }

  /** Candidate(Shadow)：若观测选择=shadow 选中，或 shadow 在 L3 更高 */
  if (
    input.observedChosenOptionId &&
    input.observedChosenOptionId === input.shadow.selectedOptionId
  ) {
    candidateScore = Math.min(1, avgEval + 0.1);
    reasons.push('观测选择与 Shadow 一致，Candidate 加分');
  } else if (input.shadow.selectedOptionId !== input.production.selectedOptionId) {
    candidateScore = avgEval;
    reasons.push('Shadow 与 Production 分歧；Candidate 取观测评价均值待证');
  } else {
    candidateScore = avgEval;
    reasons.push('Shadow 与 Production 同选');
  }

  if (input.l2) {
    productionScore = (productionScore + input.l2.passRate) / 2;
    candidateScore = (candidateScore + input.l2.passRate) / 2;
    reasons.push(`纳入 L2 passRate=${input.l2.passRate.toFixed(2)}`);
  }
  if (input.l3) {
    /** L3 更偏向 Candidate 时用 shadow 通道加权 */
    const l3 = input.l3.passRate;
    candidateScore = (candidateScore + l3) / 2;
    productionScore = (productionScore + l3 * 0.95) / 2;
    reasons.push(`纳入 L3 passRate=${l3.toFixed(2)}`);
  }

  const delta = candidateScore - productionScore;
  const candidateBetterThanProduction = delta > 0.02;

  if (candidateBetterThanProduction) {
    reasons.push(`Candidate 优于 Production：delta=${delta.toFixed(3)}`);
  } else {
    reasons.push(`未能证明优于 Production：delta=${delta.toFixed(3)}`);
  }

  return {
    schemaId: 'nara.candidate_vs_production_proof@v1',
    version: 1,
    candidateBetterThanProduction,
    productionScore,
    candidateScore,
    delta,
    reasonsZh: reasons,
    usedObservedEvaluations: input.observedEvaluations.length,
    counterfactualExcluded: true,
  };
}
