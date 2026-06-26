/**
 * P5 — Observe → compare → revise (counterfactual closure on Travel Event Store spine).
 */

import type { CausalActualOutcome } from '../causal-decision-tuple.types';
import type { CausalDriftReport } from '../../causal-reflection/drift-detector';
import type { IcelandCausalCalibration } from '../domains/iceland-causal-calibration.types';

export const CAUSAL_COUNTERFACTUAL_REPORT_SCHEMA = 'tripnara/causal-counterfactual/v1' as const;

export interface CausalOutcomeObservation {
  /** Metric keys align with CausalExpectedOutcome.metrics, e.g. iceland_miss_prob */
  metrics: Record<string, number>;
  narrative?: string;
  /** Hard label: did the appointment / core experience fail? */
  missedAppointment?: boolean;
  mechanismEvidence?: string[];
}

export interface CausalMetricDelta {
  key: string;
  predicted?: number;
  observed: number;
  absoluteError: number;
  direction: 'OVER_PREDICTED' | 'UNDER_PREDICTED' | 'ALIGNED';
}

export interface CausalCounterfactualReport {
  schema: typeof CAUSAL_COUNTERFACTUAL_REPORT_SCHEMA;
  causality_id: string;
  trip_id?: string;
  recorded_at: string;
  predictedMetrics: Record<string, number>;
  observedMetrics: Record<string, number>;
  metricDeltas: CausalMetricDelta[];
  actualOutcome: CausalActualOutcome;
  drift: CausalDriftReport;
  /** 0–1 utility from miss alignment (1 = perfect) */
  observedUtility: number;
  predictedUtility: number;
  confidenceBefore?: number;
  confidenceAfter: number;
  icelandCalibration?: IcelandCausalCalibration;
  userFacingAssessment: string;
  revisionApplied: boolean;
}

export const CAUSAL_COUNTERFACTUAL_SNAPSHOT_SCHEMA =
  'tripnara/causal-counterfactual-snapshot/v1' as const;

export interface CausalCounterfactualSnapshot {
  schema: typeof CAUSAL_COUNTERFACTUAL_SNAPSHOT_SCHEMA;
  lastCausalityId: string;
  report: CausalCounterfactualReport;
  icelandCalibration?: IcelandCausalCalibration;
}
