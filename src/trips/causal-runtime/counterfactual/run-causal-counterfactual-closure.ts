/**
 * P5 — Compare predicted causal metrics vs observed outcome; derive calibration + drift.
 */

import type { CausalGraph } from '../../causal-physics/causal-graph.types';
import { detectCausalDrift } from '../../causal-reflection/drift-detector';
import { graphToCausalModel } from '../../causal-reflection/causal-model-rewriter';
import { reviseModel } from '../../causal-reflection/causal-model-rewriter';
import type { CausalModel } from '../../causal-reflection/causal-model.types';
import type { DecisionCausalityRecord } from '../decision-causality-v1.types';
import { isDecisionCausalityRecordV1 } from '../decision-causality-v1.types';
import type {
  CausalCounterfactualReport,
  CausalMetricDelta,
  CausalOutcomeObservation,
} from './causal-counterfactual.types';
import { CAUSAL_COUNTERFACTUAL_REPORT_SCHEMA } from './causal-counterfactual.types';
import {
  emptyIcelandCalibration,
  type IcelandCausalCalibration,
} from '../domains/iceland-causal-calibration.types';

const LEARNING_RATE = 0.12;
const MAX_WIND_ADJUST = 0.08;
const MAX_MISS_ADJUST = 25;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function extractPredictedMetrics(record: DecisionCausalityRecord): Record<string, number> {
  if (isDecisionCausalityRecordV1(record) && record.causal_decision?.expectedOutcome?.metrics) {
    return { ...record.causal_decision.expectedOutcome.metrics };
  }
  return {};
}

function buildMetricDeltas(
  predicted: Record<string, number>,
  observed: Record<string, number>,
): CausalMetricDelta[] {
  const keys = new Set([...Object.keys(predicted), ...Object.keys(observed)]);
  const deltas: CausalMetricDelta[] = [];
  for (const key of keys) {
    const p = predicted[key];
    const o = observed[key];
    if (o == null || !Number.isFinite(o)) continue;
    if (p == null || !Number.isFinite(p)) {
      deltas.push({
        key,
        predicted: undefined,
        observed: o,
        absoluteError: Math.abs(o),
        direction: 'ALIGNED',
      });
      continue;
    }
    const err = Math.abs(o - p);
    let direction: CausalMetricDelta['direction'] = 'ALIGNED';
    if (err > 0.03) {
      direction = p > o ? 'OVER_PREDICTED' : 'UNDER_PREDICTED';
    }
    deltas.push({ key, predicted: p, observed: o, absoluteError: err, direction });
  }
  return deltas;
}

function utilityFromMissPrediction(
  predictedMiss?: number,
  observedMiss?: number,
  missedAppointment?: boolean,
): { predictedUtility: number; observedUtility: number } {
  const predicted = predictedMiss != null ? clamp01(1 - predictedMiss) : 0.7;
  let observed = observedUtilityFromObservation(observedMiss, missedAppointment);
  return { predictedUtility: predicted, observedUtility: observed };
}

function observedUtilityFromObservation(
  observedMiss?: number,
  missedAppointment?: boolean,
): number {
  if (missedAppointment === true) return 0.15;
  if (missedAppointment === false) return 0.92;
  if (observedMiss != null) return clamp01(1 - observedMiss);
  return 0.6;
}

export function updateIcelandCalibration(
  current: IcelandCausalCalibration | undefined,
  predicted: Record<string, number>,
  observation: CausalOutcomeObservation,
): IcelandCausalCalibration | undefined {
  const hasIceland =
    predicted.iceland_miss_prob != null ||
    observation.metrics.iceland_miss_prob != null ||
    observation.metrics.iceland_p90_minutes != null ||
    observation.missedAppointment != null;

  if (!hasIceland) return current;

  const base = current ?? emptyIcelandCalibration();
  let windFactorAdjust = base.windFactorAdjust;
  let missLogisticAdjust = base.missLogisticAdjust;

  const predictedMiss = predicted.iceland_miss_prob;
  const observedMiss =
    observation.missedAppointment != null
      ? observation.missedAppointment
        ? 1
        : 0
      : observation.metrics.iceland_miss_prob;

  if (predictedMiss != null && observedMiss != null) {
    const error = observedMiss - predictedMiss;
    missLogisticAdjust += LEARNING_RATE * error * 12;
  }

  const predictedP90 = predicted.iceland_p90_minutes;
  const observedP90 = observation.metrics.iceland_p90_minutes;
  if (predictedP90 != null && observedP90 != null) {
    const p90Error = observedP90 - predictedP90;
    windFactorAdjust += LEARNING_RATE * (p90Error / 60) * 0.06;
  }

  return {
    schema: base.schema,
    windFactorAdjust: clamp(windFactorAdjust, -MAX_WIND_ADJUST, MAX_WIND_ADJUST),
    missLogisticAdjust: clamp(missLogisticAdjust, -MAX_MISS_ADJUST, MAX_MISS_ADJUST),
    sampleCount: base.sampleCount + 1,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function buildUserFacingAssessment(deltas: CausalMetricDelta[], driftSeverity: string): string {
  const miss = deltas.find((d) => d.key === 'iceland_miss_prob');
  if (miss && miss.predicted != null) {
    const predPct = Math.round(miss.predicted * 100);
    const obsPct = Math.round(miss.observed * 100);
    if (miss.direction === 'OVER_PREDICTED') {
      return `实况反馈：错过概率实际约 ${obsPct}%，此前预测 ${predPct}%（偏保守）。模型已下调风致延时估计。`;
    }
    if (miss.direction === 'UNDER_PREDICTED') {
      return `实况反馈：错过概率实际约 ${obsPct}%，此前预测 ${predPct}%（偏乐观）。模型已上调风险估计。`;
    }
    return `实况与预测一致（错过概率约 ${obsPct}%）。`;
  }
  return `因果反事实闭环已记录（漂移等级 ${driftSeverity}）。`;
}

export function runCausalCounterfactualClosure(input: {
  record: DecisionCausalityRecord;
  observation: CausalOutcomeObservation;
  priorCalibration?: IcelandCausalCalibration;
  reflectiveModelBefore?: CausalModel;
}): CausalCounterfactualReport | null {
  const predictedMetrics = extractPredictedMetrics(input.record);
  if (!Object.keys(predictedMetrics).length && !Object.keys(input.observation.metrics).length) {
    return null;
  }

  const observedMetrics = { ...input.observation.metrics };
  if (input.observation.missedAppointment != null && observedMetrics.iceland_miss_prob == null) {
    observedMetrics.iceland_miss_prob = input.observation.missedAppointment ? 1 : 0;
  }

  const metricDeltas = buildMetricDeltas(predictedMetrics, observedMetrics);
  const { predictedUtility, observedUtility } = utilityFromMissPrediction(
    predictedMetrics.iceland_miss_prob,
    observedMetrics.iceland_miss_prob,
    input.observation.missedAppointment,
  );

  const drift = detectCausalDrift({
    predictedUtility,
    observedUtility,
    predictedGraph: { nodes: [], edges: [] },
  });

  const confidenceBefore =
    isDecisionCausalityRecordV1(input.record)
      ? input.record.causal_decision?.confidenceBefore ??
        input.record.causal_decision?.hypothesis?.confidence
      : undefined;

  const gap = drift.utilityGap;
  const confidenceAfter = clamp01((confidenceBefore ?? 0.7) - gap * 0.35 + (gap < 0.08 ? 0.02 : 0));

  const icelandCalibration = updateIcelandCalibration(
    input.priorCalibration,
    predictedMetrics,
    input.observation,
  );

  const actualOutcome = {
    metrics: observedMetrics,
    narrative: input.observation.narrative,
    mechanismEvidence: input.observation.mechanismEvidence,
  };

  return {
    schema: CAUSAL_COUNTERFACTUAL_REPORT_SCHEMA,
    causality_id: input.record.causality_id,
    trip_id: isDecisionCausalityRecordV1(input.record)
      ? input.record.causal_decision?.context.trip_id
      : undefined,
    recorded_at: new Date().toISOString(),
    predictedMetrics,
    observedMetrics,
    metricDeltas,
    actualOutcome,
    drift,
    predictedUtility,
    observedUtility,
    confidenceBefore,
    confidenceAfter,
    icelandCalibration,
    userFacingAssessment: buildUserFacingAssessment(metricDeltas, drift.severity),
    revisionApplied: Boolean(icelandCalibration),
  };
}

/** Optional reflective model nudge from utility gap. */
export function reviseReflectiveModelFromCounterfactual(
  modelBefore: CausalModel | undefined,
  report: CausalCounterfactualReport,
): CausalModel | undefined {
  if (!modelBefore?.edges?.length) return modelBefore;
  return reviseModel(modelBefore, {
    predictedUtility: report.predictedUtility,
    observedUtility: report.observedUtility,
  });
}

export function buildMinimalReflectiveModelFromHypothesis(
  record: DecisionCausalityRecord,
): CausalModel | undefined {
  if (!isDecisionCausalityRecordV1(record) || !record.causal_decision?.hypothesis?.causalChain?.length) {
    return undefined;
  }
  const chain = record.causal_decision.hypothesis.causalChain;
  const nodes: CausalGraph['nodes'] = chain.map((id) => ({
    id,
    type: 'TEMPORAL',
    state: { value: 0.5 },
  }));
  const edges: CausalGraph['edges'] = chain.slice(0, -1).map((from, i) => ({
    from,
    to: chain[i + 1]!,
    relation: 'CAUSES',
    weight: 0.6,
  }));
  return graphToCausalModel(
    { nodes, edges },
    {
      confidence: record.causal_decision.confidenceBefore ?? 0.75,
      origin: 'OBSERVED',
      revisionEpoch: 0,
    },
    `cf:${record.causality_id}`,
  );
}
