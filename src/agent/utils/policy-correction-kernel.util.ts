import type {
  ECPSRuntimeBias,
  PolicyCorrectionSignal,
  PolicyCorrectionSeverity,
  TraceAnalysisResult,
} from '../contracts/policy-correction.types';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';

function severityFor(count: number): PolicyCorrectionSeverity {
  if (count >= 2) return 'CRITICAL';
  if (count >= 1) return 'WARNING';
  return 'INFO';
}

/**
 * Map analyzer deviations → coarse correction signals (soft ECPS tuning hints).
 */
export function derivePolicyCorrectionSignals(analysis: TraceAnalysisResult): PolicyCorrectionSignal[] {
  const out: PolicyCorrectionSignal[] = [];
  const kinds = analysis.deviationSignals.map((d) => d.kind);

  if (kinds.includes('ROUTING_DEVIATION')) {
    out.push({
      type: 'OVER_REACTIVITY',
      severity: severityFor(analysis.deviationSignals.filter((d) => d.kind === 'ROUTING_DEVIATION').length),
      suggestedAdjustment: 'TIGHTEN_SYSTEM1_BAND',
      notes: 'Engine diverged from ECPS routing intent',
    });
  }

  if (kinds.includes('CONFIDENCE_MISMATCH')) {
    out.push({
      type: 'UNDER_CONFIDENCE',
      severity: 'WARNING',
      suggestedAdjustment: 'ADJUST_ANOMALY_WEIGHT',
      notes: 'Confidence gate vs artifact band mismatch',
    });
  }

  if (kinds.includes('TOOL_DEPTH_MISMATCH')) {
    out.push({
      type: 'TOOL_OVERUSE',
      severity: 'WARNING',
      suggestedAdjustment: 'ADJUST_ANOMALY_WEIGHT',
      notes: 'Tool depth exceeded ECPS plan — strengthen anomaly-weighted branches',
    });
  }

  if (kinds.includes('REPLAY_VIOLATION')) {
    out.push({
      type: 'OVER_REUSE',
      severity: 'CRITICAL',
      suggestedAdjustment: 'INCREASE_REPLAY_CONFIDENCE_THRESHOLD',
      notes: 'REUSE path executed side effects — tighten reuse admission',
    });
  }

  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Fold correction signals into bias deltas (deterministic, bounded).
 * Multiple signals of same type accumulate conservatively.
 */
export function foldSignalsIntoBiasDelta(signals: PolicyCorrectionSignal[]): Partial<ECPSRuntimeBias> {
  let system1BiasAdjustment = 0;
  let replayThresholdShift = 0;
  let anomalyPenaltyWeight = 0;

  for (const s of signals) {
    switch (s.suggestedAdjustment) {
      case 'TIGHTEN_SYSTEM1_BAND':
        system1BiasAdjustment -= s.severity === 'CRITICAL' ? 0.12 : s.severity === 'WARNING' ? 0.06 : 0.03;
        break;
      case 'RELAX_MEDIUM_POLICY':
        system1BiasAdjustment += s.severity === 'CRITICAL' ? 0.1 : 0.05;
        replayThresholdShift -= 0.04;
        break;
      case 'INCREASE_REPLAY_CONFIDENCE_THRESHOLD':
        replayThresholdShift -= s.severity === 'CRITICAL' ? 0.15 : 0.08;
        break;
      case 'DECREASE_REPLAY_CONFIDENCE_THRESHOLD':
        replayThresholdShift += s.severity === 'CRITICAL' ? 0.12 : 0.06;
        break;
      case 'ADJUST_ANOMALY_WEIGHT':
        anomalyPenaltyWeight += s.severity === 'WARNING' ? 0.08 : 0.04;
        break;
      default:
        break;
    }
  }

  return {
    system1BiasAdjustment,
    replayThresholdShift,
    anomalyPenaltyWeight,
  };
}

/** Merge delta into existing bias with clamps (stable runtime feedback). */
export function mergeEcpsRuntimeBias(base: ECPSRuntimeBias, delta: Partial<ECPSRuntimeBias>): ECPSRuntimeBias {
  const next: ECPSRuntimeBias = {
    system1BiasAdjustment: clamp(
      base.system1BiasAdjustment + (delta.system1BiasAdjustment ?? 0),
      -1,
      1,
    ),
    replayThresholdShift: clamp(base.replayThresholdShift + (delta.replayThresholdShift ?? 0), -1, 1),
    anomalyPenaltyWeight: clamp(
      base.anomalyPenaltyWeight + (delta.anomalyPenaltyWeight ?? 0),
      0.25,
      3,
    ),
  };
  return next;
}

export function applyPolicyCorrectionSignals(
  current: ECPSRuntimeBias,
  signals: PolicyCorrectionSignal[],
): ECPSRuntimeBias {
  if (signals.length === 0) return current;
  const delta = foldSignalsIntoBiasDelta(signals);
  return mergeEcpsRuntimeBias(current, delta);
}

/** Test helper — explicit reset target. */
export function resetEcpsRuntimeBias(): ECPSRuntimeBias {
  return { ...DEFAULT_ECPS_RUNTIME_BIAS };
}
