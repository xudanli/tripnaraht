import type { NullificationHistoryEntry } from './nullification-history.types';

export interface SystemRedundancyReport {
  successRate: number;
  decisionVariance: number;
  repairFrequencyDecreasing: boolean;
  redundant: boolean;
}

function uniqueRatio(fingerprints: string[]): number {
  if (!fingerprints.length) {
    return 1;
  }
  const u = new Set(fingerprints).size;
  return u / fingerprints.length;
}

export function detectSystemRedundancy(history: NullificationHistoryEntry[]): SystemRedundancyReport {
  if (!history.length) {
    return {
      successRate: 0,
      decisionVariance: 1,
      repairFrequencyDecreasing: false,
      redundant: false,
    };
  }

  const successes = history.filter(h => h.success === true).length;
  const successRate = successes / history.length;

  const fps = history.map(h => h.decisionFingerprint ?? 'unknown');
  const decisionVariance = uniqueRatio(fps);

  const mid = Math.floor(history.length / 2);
  const first = history.slice(0, mid);
  const second = history.slice(mid);
  const repairRate = (xs: NullificationHistoryEntry[]) =>
    xs.filter(h => h.repairEvent).length / Math.max(1, xs.length);
  const repairFrequencyDecreasing =
    first.length > 0 && second.length > 0 && repairRate(second) < repairRate(first);

  const redundant =
    successRate > 0.95 && decisionVariance < 0.1 && repairFrequencyDecreasing;

  return {
    successRate,
    decisionVariance,
    repairFrequencyDecreasing,
    redundant,
  };
}
