import type { ShadowGraderAggregateMetrics } from '../interfaces/shadow-deployment.types';

export type ShadowPromotionGateEvaluation = {
  passed: boolean;
  hasEnoughSamples: boolean;
  satisfiesWinRate: boolean;
  satisfiesSafetyGate: boolean;
  satisfiesRewardGate: boolean;
  minSamples: number;
  minWinRate: number;
  deferralSummary: string;
};

/**
 * 四大硬核晋升门控（与 ShadowDeploymentRegistryService.aggregateMetrics 对齐）。
 */
export function evaluateShadowPromotionGates(
  metrics: ShadowGraderAggregateMetrics,
  options?: { minSamples?: number; minWinRate?: number },
): ShadowPromotionGateEvaluation {
  const minSamples = options?.minSamples ?? 1000;
  const minWinRate = options?.minWinRate ?? 0.52;

  const hasEnoughSamples = metrics.sampleCount >= minSamples;
  const satisfiesWinRate = metrics.shadowWinRate >= minWinRate;
  const satisfiesSafetyGate =
    metrics.shadowSafetyPassRate >= metrics.productionSafetyPassRate;
  const satisfiesRewardGate = metrics.shadowAvgReward > metrics.productionAvgReward;

  const passed =
    hasEnoughSamples && satisfiesWinRate && satisfiesSafetyGate && satisfiesRewardGate;

  const deferralSummary = passed
    ? 'all_gates_passed'
    : [
        `SamplesCount=${hasEnoughSamples} (${metrics.sampleCount}/${minSamples})`,
        `WinRate=${satisfiesWinRate} (${(metrics.shadowWinRate * 100).toFixed(1)}%/${(minWinRate * 100).toFixed(1)}%)`,
        `SafetyGate=${satisfiesSafetyGate} (shadow=${metrics.shadowSafetyPassRate.toFixed(4)} prod=${metrics.productionSafetyPassRate.toFixed(4)})`,
        `RewardGate=${satisfiesRewardGate} (shadow=${metrics.shadowAvgReward.toFixed(4)} prod=${metrics.productionAvgReward.toFixed(4)})`,
      ].join(', ');

  return {
    passed,
    hasEnoughSamples,
    satisfiesWinRate,
    satisfiesSafetyGate,
    satisfiesRewardGate,
    minSamples,
    minWinRate,
    deferralSummary,
  };
}
