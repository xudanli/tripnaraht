/**
 * Temporal Readiness — 分维度 readiness + blockers。
 * 阈值暂不武断冻结：默认 report-only，除非显式提供 provisionalThresholds。
 * DoD：回答「为什么还不能进 Temporal、还缺什么数据」。
 */

import type { TravelDecisionDatasetV1 } from '../evidence-accumulation/travel-decision-dataset.util';
import type { DecisionFunnelProgressV1 } from './decision-data-funnel.util';
import { classifyEvidenceQualitySlice } from './evaluation-slice.util';
import { isRealDecisionPilotKey } from './pilot-decision-keys.util';
import type { ObservationDensityMetricsV1 } from './observation-density.util';
import { computeTemporalCoverage } from './observation-density.util';
import type { FunnelDropHistogramV1 } from './funnel-drop-reason.util';

export const TEMPORAL_READINESS_REPORT_SCHEMA =
  'nara.temporal_readiness_report@v1' as const;

export type ReadinessDimensionId =
  | 'OUTCOME_OBSERVABILITY'
  | 'ATTRIBUTION'
  | 'WORLDSTATE_EVIDENCE_QUALITY'
  | 'TEMPORAL_COVERAGE'
  | 'OBSERVATION_DENSITY'
  | 'HIGH_QUALITY_EPISODES'
  | 'CASE_REVIEW_COVERAGE';

export type ReadinessDimensionV1 = {
  id: ReadinessDimensionId;
  ready: boolean | 'UNKNOWN';
  value: number;
  /** 未冻结时为 null */
  provisionalThreshold: number | null;
  statusZh: string;
  needDataTypeZh: string;
};

export type TemporalReadinessBlockerV1 = {
  dimension: ReadinessDimensionId;
  severity: 'BLOCKER' | 'WATCH';
  messageZh: string;
  needDataTypeZh: string;
};

export type TemporalReadinessReportV1 = {
  schemaId: typeof TEMPORAL_READINESS_REPORT_SCHEMA;
  version: 1;
  /** 总开关：无显式阈值时恒 false（禁止机械变 true） */
  ready: false | boolean;
  thresholdsFrozen: false;
  dimensions: ReadinessDimensionV1[];
  blockers: TemporalReadinessBlockerV1[];
  /** 人话总结：为什么还不能进 Temporal */
  whyNotTemporalZh: string[];
  /** 还需要积累的数据类型 */
  needAccumulateZh: string[];
  funnelDropHistogram?: FunnelDropHistogramV1;
  testsPassedDoNotImplyReady: true;
};

export type ProvisionalThresholds = Partial<
  Record<ReadinessDimensionId, number>
>;

export function buildTemporalReadinessReport(input: {
  dataset: TravelDecisionDatasetV1;
  funnelProgresses?: DecisionFunnelProgressV1[];
  observationDensities?: ObservationDensityMetricsV1[];
  caseReviewCoverageRate?: number;
  funnelDropHistogram?: FunnelDropHistogramV1;
  /**
   * 仅用于观测对比；未提供则维度 ready=UNKNOWN，总 ready=false。
   * 禁止用默认武断阈值把 Gate 打成 true。
   */
  provisionalThresholds?: ProvisionalThresholds;
}): TemporalReadinessReportV1 {
  const records = input.dataset.records.filter((r) =>
    isRealDecisionPilotKey(r.decisionKey),
  );
  const progresses = input.funnelProgresses ?? [];
  const coverage = computeTemporalCoverage({
    ...input.dataset,
    records,
  });

  const hq =
    progresses.length > 0
      ? progresses.filter(
          (p) =>
            p.stageReached === 'EVALUATION_VALID' ||
            p.stageReached === 'DISAGREEMENT',
        ).length
      : records.filter((r) => r.outcome.observable && r.evaluation).length;

  const outcomeRate =
    records.length === 0
      ? 0
      : records.filter((r) => r.outcome.observable).length / records.length;
  const attrRate =
    progresses.length === 0
      ? outcomeRate
      : progresses.filter((p) => p.flags.attributionValid).length /
        Math.max(1, progresses.length);
  const verifiedRate =
    records.length === 0
      ? 0
      : records.filter(
          (r) => classifyEvidenceQualitySlice(r.evidence) === 'VERIFIED_RICH',
        ).length / records.length;
  const densityScore =
    input.observationDensities && input.observationDensities.length
      ? input.observationDensities.reduce((s, d) => s + d.entryCount, 0) /
        input.observationDensities.length
      : 0;
  const caseReviewRate = input.caseReviewCoverageRate ?? 0;

  const values: Record<ReadinessDimensionId, number> = {
    OUTCOME_OBSERVABILITY: outcomeRate,
    ATTRIBUTION: attrRate,
    WORLDSTATE_EVIDENCE_QUALITY: verifiedRate,
    TEMPORAL_COVERAGE: coverage.phaseCoverageRate,
    OBSERVATION_DENSITY: densityScore,
    HIGH_QUALITY_EPISODES: hq,
    CASE_REVIEW_COVERAGE: caseReviewRate,
  };

  const needType: Record<ReadinessDimensionId, string> = {
    OUTCOME_OBSERVABILITY: '按 Outcome Contract 的真实观测完成样本',
    ATTRIBUTION: '带有效 Attribution 的 Episode',
    WORLDSTATE_EVIDENCE_QUALITY: 'VERIFIED Evidence + 高质量 WorldState 样本',
    TEMPORAL_COVERAGE: '覆盖更多 Trip Phase / 时序跨度的 Episode',
    OBSERVATION_DENSITY: '更密的 WorldState/Evidence/Event 时序点',
    HIGH_QUALITY_EPISODES: 'Evaluation Valid 的高质量 Decision Episode',
    CASE_REVIEW_COVERAGE: '人工复核过的 Disagreement/Poor/Inconclusive Case',
  };

  const thr = input.provisionalThresholds;
  const dimensions: ReadinessDimensionV1[] = (
    Object.keys(values) as ReadinessDimensionId[]
  ).map((id) => {
    const provisional = thr?.[id] ?? null;
    let ready: boolean | 'UNKNOWN' = 'UNKNOWN';
    if (provisional != null) {
      ready = values[id] >= provisional;
    }
    return {
      id,
      ready,
      value: values[id],
      provisionalThreshold: provisional,
      statusZh:
        ready === 'UNKNOWN'
          ? `分布观测中 value=${fmt(values[id])}（阈值未冻结）`
          : ready
            ? `达到临时阈值 ${provisional}`
            : `未达临时阈值 ${provisional}（value=${fmt(values[id])}）`,
      needDataTypeZh: needType[id],
    };
  });

  const blockers: TemporalReadinessBlockerV1[] = [];
  for (const d of dimensions) {
    if (d.ready === false) {
      blockers.push({
        dimension: d.id,
        severity: 'BLOCKER',
        messageZh: d.statusZh,
        needDataTypeZh: d.needDataTypeZh,
      });
    } else if (d.ready === 'UNKNOWN') {
      blockers.push({
        dimension: d.id,
        severity: 'WATCH',
        messageZh: `${d.id} 阈值未冻结，需先看真实 Pilot 分布`,
        needDataTypeZh: d.needDataTypeZh,
      });
    }
  }

  /** 无冻结阈值时，禁止 ready=true */
  const ready =
    thr && Object.keys(thr).length > 0
      ? dimensions.every((d) => d.ready === true)
      : false;

  const whyNotTemporalZh: string[] = [];
  if (!ready) {
    whyNotTemporalZh.push(
      '当前不能进入 Temporal：阈值尚未用真实 Pilot 分布冻结，或分维度未达标。',
    );
  }
  for (const b of blockers.filter((x) => x.severity === 'BLOCKER')) {
    whyNotTemporalZh.push(`[BLOCKER] ${b.dimension}: ${b.messageZh}`);
  }
  for (const b of blockers.filter((x) => x.severity === 'WATCH').slice(0, 4)) {
    whyNotTemporalZh.push(`[WATCH] ${b.dimension}: ${b.messageZh}`);
  }
  whyNotTemporalZh.push(
    '禁止因单测/Canary Passed 将 Gate 机械置 true；Canary Passed ≠ Policy Proven。',
  );

  const needAccumulateZh = [
    ...new Set(blockers.map((b) => b.needDataTypeZh)),
  ];

  return {
    schemaId: TEMPORAL_READINESS_REPORT_SCHEMA,
    version: 1,
    ready,
    thresholdsFrozen: false,
    dimensions,
    blockers,
    whyNotTemporalZh,
    needAccumulateZh,
    funnelDropHistogram: input.funnelDropHistogram,
    testsPassedDoNotImplyReady: true,
  };
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : String(n);
}
