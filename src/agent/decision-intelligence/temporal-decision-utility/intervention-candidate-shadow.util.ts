/**
 * InterventionCandidate Shadow — 仅在 Temporal Utility + LeadTime 通过后建立。
 * 不通知用户；只记录 SHOULD / SHOULD_NOT INTERRUPT。
 * Accurate Prediction ≠ Useful Intervention。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { TemporalDecisionUtilityV1 } from './temporal-decision-utility.util';
import type { ActionableLeadTimeReportV1 } from './actionable-lead-time.util';

export const INTERVENTION_CANDIDATE_SCHEMA =
  'nara.intervention_candidate_shadow@v1' as const;

export type InterruptRecommendation = 'SHOULD_INTERRUPT' | 'SHOULD_NOT_INTERRUPT';

export type InterventionCandidateShadowV1 = {
  schemaId: typeof INTERVENTION_CANDIDATE_SCHEMA;
  version: 1;
  candidateId: string;
  scenarioId: TemporalScenarioId;
  severity: number;
  confidence: number;
  urgency: number;
  actionability: number;
  disruptionCost: number;
  interruptRecommendation: InterruptRecommendation;
  /** Shadow：不通知 */
  notifyUser: false;
  autoActionForbidden: true;
  accuratePredictionIsNotUsefulIntervention: true;
  rationaleZh: string;
};

export type CreateInterventionShadowResult =
  | { ok: true; candidate: InterventionCandidateShadowV1 }
  | {
      ok: false;
      code: 'TEMPORAL_UTILITY_NOT_PASSED';
      reasonZh: string;
    };

/**
 * Utility 未过不得建立 Intervention Shadow。
 */
export function createInterventionCandidateShadow(input: {
  scenarioId: TemporalScenarioId;
  utility: TemporalDecisionUtilityV1;
  leadTime: ActionableLeadTimeReportV1;
  severity: number;
  confidence: number;
  urgency: number;
  actionability: number;
  disruptionCost: number;
  candidateId?: string;
}): CreateInterventionShadowResult {
  if (!input.utility.passed || input.utility.scenarioId !== input.scenarioId) {
    return {
      ok: false,
      code: 'TEMPORAL_UTILITY_NOT_PASSED',
      reasonZh:
        'Temporal Utility 未通过 → 禁止建立 InterventionCandidate Shadow（准≠有用）',
    };
  }
  if (!input.leadTime.passed || input.leadTime.scenarioId !== input.scenarioId) {
    return {
      ok: false,
      code: 'TEMPORAL_UTILITY_NOT_PASSED',
      reasonZh:
        'ActionableLeadTime 未通过 → 禁止建立 InterventionCandidate Shadow',
    };
  }

  const severity = clamp01(input.severity);
  const confidence = clamp01(input.confidence);
  const urgency = clamp01(input.urgency);
  const actionability = clamp01(input.actionability);
  const disruptionCost = clamp01(input.disruptionCost);

  /** 打断价值：严重×紧急×可行动×置信 − 打扰成本 */
  const interruptScore =
    severity * 0.25 +
    urgency * 0.25 +
    actionability * 0.25 +
    confidence * 0.15 -
    disruptionCost * 0.4;

  const interruptRecommendation: InterruptRecommendation =
    interruptScore >= 0.35 && actionability >= 0.4 && disruptionCost <= 0.7
      ? 'SHOULD_INTERRUPT'
      : 'SHOULD_NOT_INTERRUPT';

  return {
    ok: true,
    candidate: {
      schemaId: INTERVENTION_CANDIDATE_SCHEMA,
      version: 1,
      candidateId:
        input.candidateId ??
        `ics_${input.scenarioId}_${Date.now()}`,
      scenarioId: input.scenarioId,
      severity,
      confidence,
      urgency,
      actionability,
      disruptionCost,
      interruptRecommendation,
      notifyUser: false,
      autoActionForbidden: true,
      accuratePredictionIsNotUsefulIntervention: true,
      rationaleZh:
        interruptRecommendation === 'SHOULD_INTERRUPT'
          ? `Shadow 记录 SHOULD_INTERRUPT（score=${interruptScore.toFixed(2)}）；不通知用户`
          : `Shadow 记录 SHOULD_NOT_INTERRUPT（score=${interruptScore.toFixed(2)}）；打扰成本或可行动性不足`,
    },
  };
}

export type InterventionQualityReportV1 = {
  scenarioId: TemporalScenarioId;
  n: number;
  shouldInterruptRate: number;
  avgActionability: number;
  avgDisruptionCost: number;
  /** SHOULD 样本中可行动且低打扰占比 */
  justifiedShouldRate: number;
  passed: boolean;
  reasonsZh: string[];
  notifyUserStillForbidden: true;
  autoActionStillForbidden: true;
};

export function evaluateInterventionQuality(input: {
  scenarioId: TemporalScenarioId;
  candidates: InterventionCandidateShadowV1[];
  minSamples?: number;
  minJustifiedShouldRate?: number;
  maxShouldInterruptRate?: number;
}): InterventionQualityReportV1 {
  const minN = input.minSamples ?? 5;
  const minJustified = input.minJustifiedShouldRate ?? 0.6;
  const maxShould = input.maxShouldInterruptRate ?? 0.5;
  const rows = input.candidates.filter((c) => c.scenarioId === input.scenarioId);
  const n = rows.length;
  const should = rows.filter((c) => c.interruptRecommendation === 'SHOULD_INTERRUPT');
  const shouldInterruptRate = n === 0 ? 0 : should.length / n;
  const avgActionability =
    n === 0 ? 0 : rows.reduce((s, c) => s + c.actionability, 0) / n;
  const avgDisruptionCost =
    n === 0 ? 0 : rows.reduce((s, c) => s + c.disruptionCost, 0) / n;

  const justifiedShouldRate =
    should.length === 0
      ? 1
      : should.filter(
          (c) => c.actionability >= 0.5 && c.disruptionCost <= 0.6 && c.confidence >= 0.5,
        ).length / should.length;

  const reasonsZh: string[] = [];
  if (n < minN) reasonsZh.push(`Intervention Shadow 样本不足 ${n} < ${minN}`);
  if (shouldInterruptRate > maxShould) {
    reasonsZh.push(
      `SHOULD_INTERRUPT 过高 ${shouldInterruptRate.toFixed(2)} > ${maxShould}（过度打扰风险）`,
    );
  }
  if (should.length > 0 && justifiedShouldRate < minJustified) {
    reasonsZh.push(
      `SHOULD 正当率 ${justifiedShouldRate.toFixed(2)} < ${minJustified}`,
    );
  }
  if (avgDisruptionCost > 0.65) {
    reasonsZh.push(`平均打扰成本过高 ${avgDisruptionCost.toFixed(2)}`);
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push(
      'Intervention Quality 可接受；可提交 Proactive Readiness Review（仍不通知、不 Auto Action）',
    );
  }

  return {
    scenarioId: input.scenarioId,
    n,
    shouldInterruptRate,
    avgActionability,
    avgDisruptionCost,
    justifiedShouldRate,
    passed,
    reasonsZh,
    notifyUserStillForbidden: true,
    autoActionStillForbidden: true,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
