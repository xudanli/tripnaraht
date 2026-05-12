import type { StabilityDriftSignal, StabilityScore } from './stability.types';

function clamp01(x: number): number {
  if (x < 0) {
    return 0;
  }
  if (x > 1) {
    return 1;
  }
  return x;
}

function penaltyFor(
  signals: StabilityDriftSignal[],
  types: StabilityDriftSignal['type'][],
): number {
  return signals.filter(s => types.includes(s.type)).reduce((a, s) => a + s.deltaScore, 0);
}

export function computeDagScore(signals: StabilityDriftSignal[]): number {
  const p = penaltyFor(signals, ['DAG_STRUCTURE_DRIFT', 'CONSTRAINT_DRIFT']);
  return clamp01(1 - Math.min(1, p));
}

export function computeIRScore(signals: StabilityDriftSignal[]): number {
  const p = penaltyFor(signals, ['IR_DETERMINISM_DRIFT']);
  return clamp01(1 - Math.min(1, p));
}

export function computePolicyScore(signals: StabilityDriftSignal[]): number {
  const p = penaltyFor(signals, ['POLICY_BEHAVIOR_DRIFT']);
  return clamp01(1 - Math.min(1, p));
}

export function computeExecutionScore(signals: StabilityDriftSignal[]): number {
  const p = penaltyFor(signals, ['NEPTUNE_DECISION_DRIFT', 'CONSTRAINT_DRIFT']);
  return clamp01(1 - Math.min(1, p * 0.85));
}

export function evaluateStability(signals: StabilityDriftSignal[]): StabilityScore {
  const totalPenalty = signals.reduce((acc, s) => acc + s.deltaScore, 0);
  const penalty = Math.min(1, totalPenalty);

  return {
    global: clamp01(1 - penalty),
    dag: computeDagScore(signals),
    ir: computeIRScore(signals),
    policy: computePolicyScore(signals),
    execution: computeExecutionScore(signals),
  };
}
