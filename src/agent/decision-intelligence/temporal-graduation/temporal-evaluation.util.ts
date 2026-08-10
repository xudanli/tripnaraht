/**
 * TemporalEvaluation — Horizon/Onset/Deadline/Direction/False Alert/Missed Deterioration 对账。
 * Temporal Quality Gate：Shadow 下真实预测质量可接受后，才允许 User-visible；Proactive 仍关。
 */

import type { TemporalImpactV1, TemporalImpactDirection } from './temporal-impact.util';

export const TEMPORAL_EVALUATION_SCHEMA = 'nara.temporal_evaluation@v1' as const;

export type ObservedTemporalOutcomeV1 = {
  /** 真实是否恶化 */
  deteriorated: boolean;
  /** 真实 onset（小时，相对投影时刻）；未知则 null */
  onsetHours?: number | null;
  /** 真实需处理截止（小时） */
  deadlineHours?: number | null;
  observedDirection?: TemporalImpactDirection;
};

export type TemporalEvaluationV1 = {
  schemaId: typeof TEMPORAL_EVALUATION_SCHEMA;
  version: 1;
  evaluationId: string;
  impactId: string;
  scenarioId: string;
  directionHit: boolean;
  onsetErrorHours: number | null;
  deadlineErrorHours: number | null;
  falseAlert: boolean;
  missedDeterioration: boolean;
  horizonOk: boolean;
  score: number;
  notesZh: string[];
};

export function evaluateTemporalProjection(input: {
  impact: TemporalImpactV1;
  observed: ObservedTemporalOutcomeV1;
  onsetToleranceHours?: number;
  deadlineToleranceHours?: number;
}): TemporalEvaluationV1 {
  const onsetTol = input.onsetToleranceHours ?? 12;
  const deadlineTol = input.deadlineToleranceHours ?? 12;
  const predWorsening = input.impact.direction === 'WORSENING';
  const observedWorsening = input.observed.deteriorated;

  const directionHit =
    (predWorsening && observedWorsening) ||
    (!predWorsening && !observedWorsening) ||
    (input.observed.observedDirection != null &&
      input.observed.observedDirection === input.impact.direction);

  const falseAlert = predWorsening && !observedWorsening;
  const missedDeterioration = !predWorsening && observedWorsening;

  let onsetErrorHours: number | null = null;
  if (
    input.impact.onsetHours != null &&
    input.observed.onsetHours != null
  ) {
    onsetErrorHours = Math.abs(
      input.impact.onsetHours - input.observed.onsetHours,
    );
  }
  let deadlineErrorHours: number | null = null;
  if (
    input.impact.deadlineHours != null &&
    input.observed.deadlineHours != null
  ) {
    deadlineErrorHours = Math.abs(
      input.impact.deadlineHours - input.observed.deadlineHours,
    );
  }

  const horizonOk = input.impact.horizonHours > 0;
  const onsetOk =
    onsetErrorHours == null ? true : onsetErrorHours <= onsetTol;
  const deadlineOk =
    deadlineErrorHours == null ? true : deadlineErrorHours <= deadlineTol;

  let score = 0.5;
  if (directionHit) score += 0.25;
  if (!falseAlert) score += 0.1;
  if (!missedDeterioration) score += 0.1;
  if (onsetOk) score += 0.025;
  if (deadlineOk) score += 0.025;
  if (!horizonOk) score -= 0.2;
  score = Math.max(0, Math.min(1, score));

  const notesZh: string[] = [
    `directionHit=${directionHit}`,
    `falseAlert=${falseAlert}`,
    `missedDeterioration=${missedDeterioration}`,
    `onsetErrorHours=${onsetErrorHours}`,
    `deadlineErrorHours=${deadlineErrorHours}`,
  ];

  return {
    schemaId: TEMPORAL_EVALUATION_SCHEMA,
    version: 1,
    evaluationId: `teval_${input.impact.impactId}`,
    impactId: input.impact.impactId,
    scenarioId: input.impact.scenarioId,
    directionHit,
    onsetErrorHours,
    deadlineErrorHours,
    falseAlert,
    missedDeterioration,
    horizonOk,
    score,
    notesZh,
  };
}

export type TemporalQualityGateResult = {
  passed: boolean;
  reasonsZh: string[];
  /** 通过后才允许 User-visible Temporal */
  allowUserVisibleTemporal: boolean;
  proactiveStillClosed: true;
};

/**
 * Shadow 环境下真实预测质量门禁。
 */
export function checkTemporalQualityGate(input: {
  evaluations: TemporalEvaluationV1[];
  minSamples?: number;
  maxFalseAlertRate?: number;
  maxMissedDeteriorationRate?: number;
  minAvgScore?: number;
  minDirectionHitRate?: number;
}): TemporalQualityGateResult {
  const minSamples = input.minSamples ?? 5;
  const maxFa = input.maxFalseAlertRate ?? 0.35;
  const maxMiss = input.maxMissedDeteriorationRate ?? 0.35;
  const minScore = input.minAvgScore ?? 0.65;
  const minDir = input.minDirectionHitRate ?? 0.6;
  const reasonsZh: string[] = [];
  const n = input.evaluations.length;

  if (n < minSamples) {
    reasonsZh.push(`样本不足 ${n} < ${minSamples}`);
  }
  const faRate =
    n === 0 ? 1 : input.evaluations.filter((e) => e.falseAlert).length / n;
  const missRate =
    n === 0
      ? 1
      : input.evaluations.filter((e) => e.missedDeterioration).length / n;
  const dirRate =
    n === 0 ? 0 : input.evaluations.filter((e) => e.directionHit).length / n;
  const avgScore =
    n === 0
      ? 0
      : input.evaluations.reduce((s, e) => s + e.score, 0) / n;

  if (faRate > maxFa) reasonsZh.push(`False Alert 率 ${faRate.toFixed(2)} > ${maxFa}`);
  if (missRate > maxMiss) {
    reasonsZh.push(`Missed Deterioration 率 ${missRate.toFixed(2)} > ${maxMiss}`);
  }
  if (dirRate < minDir) {
    reasonsZh.push(`Direction Hit 率 ${dirRate.toFixed(2)} < ${minDir}`);
  }
  if (avgScore < minScore) {
    reasonsZh.push(`平均分 ${avgScore.toFixed(2)} < ${minScore}`);
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push(
      'Shadow Temporal Quality 可接受；可申请 User-visible Temporal；Proactive 仍关闭',
    );
  }

  return {
    passed,
    reasonsZh,
    allowUserVisibleTemporal: passed,
    proactiveStillClosed: true,
  };
}
