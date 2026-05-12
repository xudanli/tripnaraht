import type { ObserverState } from '../observer-rewrite/observer-rewrite-kernel.types';
import type { NullificationHistoryEntry } from './nullification-history.types';
import type { SelfNullificationState } from './self-nullification-kernel.types';
import { detectSystemRedundancy } from './system-redundancy';

export function measureSystemStability(history: NullificationHistoryEntry[]): number {
  const rep = detectSystemRedundancy(history);
  const succ = rep.successRate;
  const varFactor = rep.decisionVariance;
  const repairBonus = rep.repairFrequencyDecreasing ? 0.08 : 0;
  return Math.min(1, succ * 0.55 + (1 - varFactor) * 0.35 + repairBonus);
}

export function measureObserverAutonomy(observerState: ObserverState): number {
  const drift = observerState.driftResistance;
  const idMag = Math.sqrt(
    observerState.identityVector.reduce((s, x) => s + x * x, 0),
  );
  const idNorm = Math.min(1, idMag / Math.sqrt(observerState.identityVector.length || 1));
  return Math.min(1, drift * 0.72 + idNorm * 0.28);
}

export function computeNullificationPressure(
  executionHistory: NullificationHistoryEntry[],
  observerState: ObserverState,
): SelfNullificationState {
  const stability = measureSystemStability(executionHistory);
  const autonomy = measureObserverAutonomy(observerState);

  const pressure = stability * 0.6 + autonomy * 0.4;

  return {
    systemActivityLevel: 1 - pressure,
    interventionIntensity: 1 - autonomy,
    autonomySufficiencyScore: autonomy,
    nullificationPressure: pressure,
  };
}
