/**
 * Readiness 指标真实分布（P50/P75/P90）— 不提前拍 Threshold。
 */

export type PercentileDistributionV1 = {
  metricId: string;
  n: number;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  min: number | null;
  max: number | null;
  /** 本阶段只报告分布 */
  thresholdNotSet: true;
};

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function computeMetricDistribution(
  metricId: string,
  values: number[],
): PercentileDistributionV1 {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return {
    metricId,
    n: sorted.length,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    min: sorted.length ? sorted[0] : null,
    max: sorted.length ? sorted[sorted.length - 1] : null,
    thresholdNotSet: true,
  };
}

export type TemporalThresholdProposalV1 = {
  schemaId: 'nara.temporal_threshold_proposal@v1';
  version: 1;
  proposalId: string;
  scenarioId: string;
  /** 建议阈值（未生效） */
  proposed: Record<string, number>;
  basedOnDistributions: PercentileDistributionV1[];
  rationaleZh: string;
  humanReviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** 仅 APPROVED 后才允许 thresholdsFrozen=true（按场景） */
  canFreezeThresholds: boolean;
};

export function createTemporalThresholdProposal(input: {
  proposalId?: string;
  scenarioId: string;
  distributions: PercentileDistributionV1[];
  /** 例如用各指标 P75 作为提案 */
  usePercentile?: 50 | 75 | 90;
  rationaleZh: string;
}): TemporalThresholdProposalV1 {
  const pct = input.usePercentile ?? 75;
  const proposed: Record<string, number> = {};
  for (const d of input.distributions) {
    const v =
      pct === 50 ? d.p50 : pct === 90 ? d.p90 : d.p75;
    if (v != null) proposed[d.metricId] = v;
  }
  return {
    schemaId: 'nara.temporal_threshold_proposal@v1',
    version: 1,
    proposalId: input.proposalId ?? `thr_${input.scenarioId}_${Date.now()}`,
    scenarioId: input.scenarioId,
    proposed,
    basedOnDistributions: input.distributions,
    rationaleZh: input.rationaleZh,
    humanReviewStatus: 'PENDING',
    canFreezeThresholds: false,
  };
}

export function reviewTemporalThresholdProposal(
  proposal: TemporalThresholdProposalV1,
  decision: 'APPROVED' | 'REJECTED',
): TemporalThresholdProposalV1 {
  return {
    ...proposal,
    humanReviewStatus: decision,
    canFreezeThresholds: decision === 'APPROVED',
  };
}
