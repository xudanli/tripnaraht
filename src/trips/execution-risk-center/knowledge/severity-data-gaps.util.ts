import type { SeverityRule } from '../../../generated/execution-risk-contracts';
import type { RiskMetricBag } from './risk-metric-extraction.util';

/** Metrics that can satisfy evaluation without numeric sensor readings. */
const OVERRIDE_METRICS = new Set(['OFFICIAL_WARNING_LEVEL', 'ROAD_STATUS']);

/**
 * List primary metrics required before a knowledge code can be evaluated as KNOWN.
 */
export function computeSeverityDataGaps(
  rules: SeverityRule[],
  metrics: RiskMetricBag,
): string[] {
  if (rules.length === 0) return [];

  const primaryMetrics = new Set<string>();
  for (const rule of rules) {
    const metric = String(rule.metric);
    if (OVERRIDE_METRICS.has(metric)) continue;
    primaryMetrics.add(metric);
  }

  const hasOverride = [...OVERRIDE_METRICS].some((m) => metrics[m] !== undefined);
  if (hasOverride) return [];

  const gaps: string[] = [];
  for (const metric of primaryMetrics) {
    if (metrics[metric] === undefined) gaps.push(metric);
  }
  return gaps;
}
