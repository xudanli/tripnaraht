import type { ObserverDriftMetrics, ObserverMutationHistoryEntry } from './observer-rewrite-kernel.types';

export function computeObserverDrift(
  executionHistory: ObserverMutationHistoryEntry[],
): ObserverDriftMetrics {
  if (!executionHistory.length) {
    return { temporalMismatch: 0, eventOverload: false };
  }

  const skews = executionHistory.map(h => h.temporalSkew ?? 0);
  const temporalMismatch =
    skews.reduce((a, b) => a + b, 0) / Math.max(1, skews.length);

  const loads = executionHistory.map(h => h.eventCount ?? 0);
  const meanLoad = loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length);
  const eventOverload = meanLoad > 14;

  return { temporalMismatch, eventOverload };
}
