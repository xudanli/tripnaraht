/**
 * Temporal Quality Report — 按 Scenario 输出；禁止仅以全局 aggregate 判定。
 * Quality Gate 通过后仅允许 USER_VISIBLE_TEMPORAL；Proactive / Auto Action 仍关。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import {
  authorizeTemporalScenario,
  selectFirstQualifiedTemporalScenario,
  type TemporalAuthorizationV1,
} from '../temporal-graduation/select-qualified-scenario.util';
import { checkTemporalQualityGate } from '../temporal-graduation/temporal-evaluation.util';
import type { TemporalShadowRecordV1 } from './temporal-shadow-record.util';
import {
  calibrateTemporalConfidence,
  type ConfidenceCalibrationV1,
} from './confidence-calibration.util';
import type { TemporalFailureCategory } from './temporal-failure-attribution.util';

export const TEMPORAL_QUALITY_REPORT_SCHEMA =
  'nara.temporal_quality_report@v1' as const;

export type TemporalQualityReportV1 = {
  schemaId: typeof TEMPORAL_QUALITY_REPORT_SCHEMA;
  version: 1;
  scenarioId: TemporalScenarioId;
  sampleN: number;
  comparableN: number;
  whenAccurateZh: string[];
  whenInaccurateZh: string[];
  whyInaccurateByCategory: Partial<Record<TemporalFailureCategory, number>>;
  confidenceCalibration: ConfidenceCalibrationV1;
  /** 参考用全局均分，不可单独作裁决 */
  referenceGlobalAvgScore: number;
  globalAggregateForbiddenAsSoleVerdict: true;
  qualityGatePassed: boolean;
  qualityGateReasonsZh: string[];
  allowUserVisibleTemporal: boolean;
  proactiveStillClosed: true;
  autoActionStillClosed: true;
  impactStillDecisionRuntimeEvidenceOnly: true;
  verdictZh: string;
};

export function buildTemporalQualityReport(input: {
  scenarioId: TemporalScenarioId;
  records: TemporalShadowRecordV1[];
  minSamples?: number;
  maxFalseAlertRate?: number;
  maxMissedDeteriorationRate?: number;
  minAvgScore?: number;
  minDirectionHitRate?: number;
  maxEce?: number;
}): TemporalQualityReportV1 {
  const scoped = input.records.filter((r) => r.scenarioId === input.scenarioId);
  const withEval = scoped.filter((r) => r.evaluation != null);
  const comparable = withEval.filter(
    (r) => !r.outcomeInterpretation?.inconclusive,
  );

  const whenAccurateZh: string[] = [];
  const whenInaccurateZh: string[] = [];
  const whyInaccurateByCategory: Partial<
    Record<TemporalFailureCategory, number>
  > = {};

  for (const r of withEval) {
    const ev = r.evaluation!;
    const attr = r.failureAttribution;
    if (attr && !attr.isFailure && attr.primary === 'NONE_SUCCESS') {
      whenAccurateZh.push(
        `${r.recordId}: directionHit rule=${r.impact.ruleId} conf=${r.statedConfidence.toFixed(2)}`,
      );
    } else if (attr?.isFailure) {
      const cat = attr.primary as TemporalFailureCategory;
      whyInaccurateByCategory[cat] = (whyInaccurateByCategory[cat] ?? 0) + 1;
      whenInaccurateZh.push(
        `${r.recordId}: ${attr.primary} — ${attr.rationaleZh}`,
      );
    } else if (r.outcomeInterpretation?.inconclusive) {
      whenInaccurateZh.push(
        `${r.recordId}: inconclusive — ${r.outcomeInterpretation.reasonZh}（不计 FA）`,
      );
    } else if (!ev.directionHit || ev.falseAlert || ev.missedDeterioration) {
      whenInaccurateZh.push(
        `${r.recordId}: FA=${ev.falseAlert} miss=${ev.missedDeterioration}`,
      );
    } else {
      whenAccurateZh.push(`${r.recordId}: directionHit`);
    }
  }

  const calibration = calibrateTemporalConfidence({
    scenarioId: input.scenarioId,
    records: scoped,
    maxEce: input.maxEce,
  });

  const evaluations = comparable.map((r) => r.evaluation!);
  const gate = checkTemporalQualityGate({
    evaluations,
    minSamples: input.minSamples,
    maxFalseAlertRate: input.maxFalseAlertRate,
    maxMissedDeteriorationRate: input.maxMissedDeteriorationRate,
    minAvgScore: input.minAvgScore,
    minDirectionHitRate: input.minDirectionHitRate,
  });

  const reasonsZh = [...gate.reasonsZh];
  if (!calibration.calibrated) {
    reasonsZh.push('Confidence Calibration 未通过：置信度不可信');
  }

  const qualityGatePassed = gate.passed && calibration.calibrated;
  const avgScore =
    evaluations.length === 0
      ? 0
      : evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length;

  let verdictZh: string;
  if (comparable.length === 0) {
    verdictZh =
      '尚无可比对账样本，不能仅凭 Shadow「跑通」判定用户可见；继续积累真实 Outcome。';
  } else if (qualityGatePassed) {
    verdictZh =
      `场景 ${input.scenarioId}：何时准/不准/为何不准可解释，且置信度可信 → 允许申请 USER_VISIBLE_TEMPORAL；Proactive/Auto Action 仍关；Impact 仍仅 Decision Runtime Evidence。`;
  } else {
    verdictZh =
      `场景 ${input.scenarioId}：Quality Gate 或置信度校准未过，禁止用户可见。参考均分=${avgScore.toFixed(2)}（禁止单独裁决）。`;
  }

  return {
    schemaId: TEMPORAL_QUALITY_REPORT_SCHEMA,
    version: 1,
    scenarioId: input.scenarioId,
    sampleN: withEval.length,
    comparableN: comparable.length,
    whenAccurateZh,
    whenInaccurateZh,
    whyInaccurateByCategory,
    confidenceCalibration: calibration,
    referenceGlobalAvgScore: avgScore,
    globalAggregateForbiddenAsSoleVerdict: true,
    qualityGatePassed,
    qualityGateReasonsZh: reasonsZh,
    allowUserVisibleTemporal: qualityGatePassed,
    proactiveStillClosed: true,
    autoActionStillClosed: true,
    impactStillDecisionRuntimeEvidenceOnly: true,
    verdictZh,
  };
}

/**
 * Gate 通过后仅抬升到 USER_VISIBLE_TEMPORAL；Proactive 关。
 */
export function authorizeUserVisibleFromQualityReport(input: {
  judgements: Parameters<typeof selectFirstQualifiedTemporalScenario>[0];
  report: TemporalQualityReportV1;
}): TemporalAuthorizationV1 {
  const selection = selectFirstQualifiedTemporalScenario(input.judgements);
  if (!selection.ok || selection.scenarioId !== input.report.scenarioId) {
    return authorizeTemporalScenario({ selection });
  }
  return authorizeTemporalScenario({
    selection,
    grantShadowAuthorization: true,
    temporalQualityGatePassed: input.report.allowUserVisibleTemporal,
  });
}
