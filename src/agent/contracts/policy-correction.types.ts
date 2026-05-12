/**
 * Policy Correction Kernel (PCK) — trace-driven feedback into ECPS (TD-PCL).
 *
 * ETK proves what ran; PCK compares expectation vs observation and emits correction signals
 * that adjust `ECPSRuntimeBias`, closing: trace → evaluation → policy bias → next decision.
 */

import type { ExecutionDecision } from './execution-control-policy.types';
import type { ExecutionTrace } from './execution-trace.types';

/** Semantic deviation between ECPS intent and observe execution (from trace). */
export type PolicyDeviationKind =
  | 'ROUTING_DEVIATION'
  | 'CONFIDENCE_MISMATCH'
  | 'TOOL_DEPTH_MISMATCH'
  | 'REPLAY_VIOLATION';

export interface PolicyDeviation {
  kind: PolicyDeviationKind;
  /** Human-readable reason for audit / replay tooling. */
  detail: string;
  expected?: unknown;
  actual?: unknown;
}

/** Output of Trace Analyzer — paired expectation vs sealed `ExecutionTrace`. */
export interface TraceAnalysisResult {
  artifactId: string;
  /** ECPS decision that should have governed this run (typically pre-run `ExecutionDecision`). */
  expectedDecision: ExecutionDecision;
  /** Closed trace (ETK) describing what actually occurred. */
  actualExecution: ExecutionTrace;
  deviationSignals: PolicyDeviation[];
}

export type PolicyCorrectionType =
  | 'OVER_REUSE'
  | 'UNDER_REUSE'
  | 'OVER_REACTIVITY'
  | 'UNDER_CONFIDENCE'
  | 'TOOL_OVERUSE';

export type PolicyCorrectionSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type PolicySuggestedAdjustment =
  | 'INCREASE_REPLAY_CONFIDENCE_THRESHOLD'
  | 'DECREASE_REPLAY_CONFIDENCE_THRESHOLD'
  | 'TIGHTEN_SYSTEM1_BAND'
  | 'RELAX_MEDIUM_POLICY'
  | 'ADJUST_ANOMALY_WEIGHT';

/** Aggregated feedback row suitable for metrics / offline calibration. */
export interface PolicyCorrectionSignal {
  type: PolicyCorrectionType;
  severity: PolicyCorrectionSeverity;
  suggestedAdjustment: PolicySuggestedAdjustment;
  /** Optional structured payload for exporters. */
  notes?: string;
}

/**
 * Mutable soft knobs applied by ECPS at decision time (bounded in service / `decideExecution`).
 *
 * All deltas are dimensionless; interpretation is centralized in `decideExecution`.
 */
export interface ECPSRuntimeBias {
  /** Positive ⇒ widen SYSTEM1 / reuse-friendly MEDIUM handling. Range typically [-1, 1]. */
  system1BiasAdjustment: number;
  /** Positive ⇒ easier artifact reuse from HIGH band score gate; negative ⇒ stricter. */
  replayThresholdShift: number;
  /** Multiplier on anomaly-driven branches (e.g. ERROR severity routing). Typical ~1. */
  anomalyPenaltyWeight: number;
}

export const DEFAULT_ECPS_RUNTIME_BIAS: ECPSRuntimeBias = {
  system1BiasAdjustment: 0,
  replayThresholdShift: 0,
  anomalyPenaltyWeight: 1,
};
