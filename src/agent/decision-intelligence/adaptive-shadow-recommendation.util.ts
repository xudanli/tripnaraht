/**
 * Adaptive Shadow Recommendation — Learning Signal 只能影响 Shadow 推荐。
 * Production 推荐保持不变；Prediction ≠ Decision。
 */

import type { LearningSignalV1 } from '../state-learning/hardening/learning-signal.registry';
import { assertLearningDoesNotMutatePolicy } from '../state-learning/hardening/learning-signal.registry';

export const SHADOW_RECOMMENDATION_SCHEMA = 'nara.shadow_recommendation@v1' as const;

export type RecommendationOptionV1 = {
  optionId: string;
  labelZh: string;
  score: number;
};

export type ProductionRecommendationV1 = {
  channel: 'PRODUCTION';
  options: RecommendationOptionV1[];
  selectedOptionId: string;
};

export type ShadowRecommendationV1 = {
  schemaId: typeof SHADOW_RECOMMENDATION_SCHEMA;
  version: 1;
  channel: 'SHADOW';
  options: RecommendationOptionV1[];
  selectedOptionId: string;
  appliedSignalIds: string[];
  /** Learning 未改 Production */
  productionUnchanged: true;
  /** Learning 未改正式 Policy */
  policyMutationDenied: true;
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * 用 Learning Signal 调整 Shadow 排序；Production 原样返回。
 */
export function buildAdaptiveShadowRecommendation(input: {
  production: ProductionRecommendationV1;
  signals: LearningSignalV1[];
}): {
  production: ProductionRecommendationV1;
  shadow: ShadowRecommendationV1;
} {
  for (const t of ['CONTRACT', 'RULE', 'GATE', 'SOLVER_WEIGHT'] as const) {
    const g = assertLearningDoesNotMutatePolicy(t);
    if (g.ok) {
      throw new Error('learning_guard_misconfigured');
    }
  }

  const productionCopy: ProductionRecommendationV1 = {
    channel: 'PRODUCTION',
    selectedOptionId: input.production.selectedOptionId,
    options: input.production.options.map((o) => ({ ...o })),
  };

  const shadowOptions = input.production.options.map((o) => ({ ...o }));
  const applied: string[] = [];

  for (const sig of input.signals) {
    if (sig.mutatesPolicy !== false) continue;
    applied.push(sig.signalId);
    const bias =
      typeof sig.payload.option_bias === 'object' && sig.payload.option_bias
        ? (sig.payload.option_bias as Record<string, number>)
        : null;
    if (bias) {
      for (const opt of shadowOptions) {
        if (typeof bias[opt.optionId] === 'number') {
          opt.score = clampScore(opt.score + Number(bias[opt.optionId]));
        }
      }
    } else if (typeof sig.payload.prefer_option_id === 'string') {
      const prefer = String(sig.payload.prefer_option_id);
      for (const opt of shadowOptions) {
        if (opt.optionId === prefer) opt.score = clampScore(opt.score + 0.15);
      }
    }
  }

  shadowOptions.sort((a, b) => b.score - a.score);
  const selectedOptionId = shadowOptions[0]?.optionId ?? productionCopy.selectedOptionId;

  return {
    production: productionCopy,
    shadow: {
      schemaId: SHADOW_RECOMMENDATION_SCHEMA,
      version: 1,
      channel: 'SHADOW',
      options: shadowOptions,
      selectedOptionId,
      appliedSignalIds: applied,
      productionUnchanged: true,
      policyMutationDenied: true,
    },
  };
}
