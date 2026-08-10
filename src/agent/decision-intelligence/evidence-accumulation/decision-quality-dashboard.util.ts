/**
 * Decision Quality Dashboard — 按 DecisionKey 观察多维指标（聚合视图，非新 DI 抽象）。
 */

import type { CanaryCandidateEvaluationV1 } from '../canary/canary-candidate-evaluation.util';
import type { SampleEligibilityResult } from '../canary/sample-eligibility.util';

export const DECISION_QUALITY_DASHBOARD_SCHEMA =
  'nara.decision_quality_dashboard@v1' as const;

export type DecisionQualityRowV1 = {
  decisionKey: string;
  eligibleSamples: number;
  ineligibleSamples: number;
  avgSafety: number;
  avgFeasibility: number;
  avgOutcome: number;
  avgAcceptance: number;
  avgCorrection: number;
  avgRegret: number;
  avgLatency: number;
  avgCost: number;
  safetyRegressionCount: number;
  feasibilityRegressionCount: number;
};

export type DecisionQualityDashboardV1 = {
  schemaId: typeof DECISION_QUALITY_DASHBOARD_SCHEMA;
  version: 1;
  builtAt: string;
  rows: DecisionQualityRowV1[];
};

export type DashboardSampleInput = {
  decisionKey: string;
  eligibility: SampleEligibilityResult;
  evaluation: CanaryCandidateEvaluationV1;
};

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function buildDecisionQualityDashboard(
  samples: DashboardSampleInput[],
): DecisionQualityDashboardV1 {
  const byKey = new Map<string, DashboardSampleInput[]>();
  for (const s of samples) {
    const list = byKey.get(s.decisionKey) ?? [];
    list.push(s);
    byKey.set(s.decisionKey, list);
  }

  const rows: DecisionQualityRowV1[] = [];
  for (const [decisionKey, list] of byKey) {
    const eligible = list.filter((x) => x.eligibility.eligible);
    const ineligible = list.length - eligible.length;
    const evals = eligible.map((x) => x.evaluation);
    rows.push({
      decisionKey,
      eligibleSamples: eligible.length,
      ineligibleSamples: ineligible,
      avgSafety: avg(evals.map((e) => e.metrics.safety)),
      avgFeasibility: avg(evals.map((e) => e.metrics.feasibility)),
      avgOutcome: avg(evals.map((e) => e.metrics.outcome)),
      avgAcceptance: avg(evals.map((e) => e.metrics.acceptance)),
      avgCorrection: avg(evals.map((e) => e.metrics.correction)),
      avgRegret: avg(evals.map((e) => e.metrics.regret)),
      avgLatency: avg(evals.map((e) => e.metrics.latency)),
      avgCost: avg(evals.map((e) => e.metrics.cost)),
      safetyRegressionCount: evals.filter((e) => e.safetyRegressed).length,
      feasibilityRegressionCount: evals.filter((e) => e.feasibilityRegressed)
        .length,
    });
  }

  rows.sort((a, b) => a.decisionKey.localeCompare(b.decisionKey));
  return {
    schemaId: DECISION_QUALITY_DASHBOARD_SCHEMA,
    version: 1,
    builtAt: new Date().toISOString(),
    rows,
  };
}

export function projectDecisionQualityDashboardForObservability(
  d: DecisionQualityDashboardV1,
): Record<string, unknown> {
  return {
    schema_id: d.schemaId,
    built_at: d.builtAt,
    decision_keys: d.rows.map((r) => r.decisionKey),
    rows: d.rows,
  };
}
