/**
 * Pilot Qualification Report — 持续输出 Funnel / Observability / Validity / Density / Coverage。
 * 不开发 Temporal/Proactive/Causal 能力。
 */

import type { FunnelCountsV1 } from './decision-data-funnel.util';
import type { RankedDataGapV1 } from './rank-data-gaps.util';
import type { ObservationGapBacklogV1 } from './observation-gap-backlog.util';
import type { PercentileDistributionV1 } from './readiness-distribution.util';
import type {
  ScenarioReadinessJudgementV1,
} from './scenario-temporal-readiness.util';
import { explainWhichTemporalScenariosQualify } from './scenario-temporal-readiness.util';
import type { TemporalCoverageMetricsV1 } from './observation-density.util';
import type { ObservationDensityMetricsV1 } from './observation-density.util';

export const PILOT_QUALIFICATION_REPORT_SCHEMA =
  'nara.pilot_qualification_report@v1' as const;

export type PilotQualificationReportV1 = {
  schemaId: typeof PILOT_QUALIFICATION_REPORT_SCHEMA;
  version: 1;
  builtAt: string;
  funnelCounts: FunnelCountsV1;
  rates: {
    outcomeObservability: number;
    attributionValidity: number;
    evaluationValidity: number;
    datasetQualification: number;
  };
  observationDensitySummary: {
    avgEntryCount: number;
    timelines: number;
  };
  temporalCoverage: TemporalCoverageMetricsV1;
  rankedDataGaps: RankedDataGapV1[];
  gapBacklog: ObservationGapBacklogV1;
  metricDistributions: PercentileDistributionV1[];
  scenarioJudgements: ScenarioReadinessJudgementV1[];
  /** DoD 核心输出 */
  whichScenariosQualifyZh: string[];
  thresholdsFrozenGlobally: false;
  temporalProactiveCausalDevForbidden: true;
};

export function buildPilotQualificationReport(input: {
  funnelCounts: FunnelCountsV1;
  rawCount: number;
  outcomeObservableCount: number;
  attributionValidCount: number;
  evaluationValidCount: number;
  datasetQualifiedCount: number;
  densities: ObservationDensityMetricsV1[];
  temporalCoverage: TemporalCoverageMetricsV1;
  rankedDataGaps: RankedDataGapV1[];
  gapBacklog: ObservationGapBacklogV1;
  metricDistributions: PercentileDistributionV1[];
  scenarioJudgements: ScenarioReadinessJudgementV1[];
}): PilotQualificationReportV1 {
  const raw = Math.max(1, input.rawCount);
  const avgEntry =
    input.densities.length === 0
      ? 0
      : input.densities.reduce((s, d) => s + d.entryCount, 0) /
        input.densities.length;

  const which = explainWhichTemporalScenariosQualify({
    judgements: input.scenarioJudgements,
  });

  return {
    schemaId: PILOT_QUALIFICATION_REPORT_SCHEMA,
    version: 1,
    builtAt: new Date().toISOString(),
    funnelCounts: input.funnelCounts,
    rates: {
      outcomeObservability: input.outcomeObservableCount / raw,
      attributionValidity: input.attributionValidCount / raw,
      evaluationValidity: input.evaluationValidCount / raw,
      datasetQualification: input.datasetQualifiedCount / raw,
    },
    observationDensitySummary: {
      avgEntryCount: avgEntry,
      timelines: input.densities.length,
    },
    temporalCoverage: input.temporalCoverage,
    rankedDataGaps: input.rankedDataGaps,
    gapBacklog: input.gapBacklog,
    metricDistributions: input.metricDistributions,
    scenarioJudgements: input.scenarioJudgements,
    whichScenariosQualifyZh: which.summaryZh,
    thresholdsFrozenGlobally: false,
    temporalProactiveCausalDevForbidden: true,
  };
}
