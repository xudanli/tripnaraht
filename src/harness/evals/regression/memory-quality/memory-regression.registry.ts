/**
 * Memory quality regression gate (P2) — quantitative metrics skeleton.
 * Blockers already cover delete-no-recall and scope isolation; this suite tracks utility lift ablation.
 */

export type MemoryRegressionMetric =
  | 'WritePrecision'
  | 'WriteRecall'
  | 'RecallAtK'
  | 'AbstentionRate'
  | 'MemoryUtilityLift'
  | 'WrongPersonalizationRate';

export type MemoryRegressionMetricSpec = {
  metric: MemoryRegressionMetric;
  phase: 'P2';
  description: string;
  implemented: boolean;
};

export const MEMORY_REGRESSION_METRICS: MemoryRegressionMetricSpec[] = [
  {
    metric: 'WritePrecision',
    phase: 'P2',
    description: 'Fraction of memory writes that remain valid at next assemble',
    implemented: false,
  },
  {
    metric: 'MemoryUtilityLift',
    phase: 'P2',
    description: 'TaskSuccess + clarification reduction − wrong personalization − stale use',
    implemented: false,
  },
  {
    metric: 'AbstentionRate',
    phase: 'P2',
    description: 'Agent abstains when memory unavailable instead of fabricating',
    implemented: false,
  },
  {
    metric: 'WrongPersonalizationRate',
    phase: 'P2',
    description: 'Cross-trip or cross-member preference leakage rate',
    implemented: false,
  },
];

export function getPendingMemoryMetrics(): MemoryRegressionMetricSpec[] {
  return MEMORY_REGRESSION_METRICS.filter((m) => !m.implemented);
}
