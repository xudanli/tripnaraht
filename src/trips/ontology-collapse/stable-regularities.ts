import type { RawObservation, RegularityPattern } from './ontology-dissolution.types';

function bucket(signal: number): string {
  return String(Math.round(signal * 1000) / 1000);
}

/**
 * Observable regularities only — no schema, only stable recurrence in the stream.
 */
export function detectStableRegularities(stream: RawObservation[]): RegularityPattern[] {
  if (stream.length === 0) {
    return [];
  }

  const sorted = [...stream].sort((a, b) => a.tick - b.tick);
  const patterns: RegularityPattern[] = [];

  let runStart = 0;
  let runBucket = bucket(sorted[0].signal);

  for (let i = 1; i <= sorted.length; i++) {
    const atEnd = i === sorted.length;
    const sameBucket =
      !atEnd && bucket(sorted[i].signal) === runBucket;

    if (!sameBucket) {
      const startTick = sorted[runStart].tick;
      const endTick = sorted[i - 1].tick;
      patterns.push({
        fingerprint: `~=${runBucket}`,
        tickStart: startTick,
        tickEnd: endTick,
      });
      if (!atEnd) {
        runStart = i;
        runBucket = bucket(sorted[i].signal);
      }
    }
  }

  return patterns;
}
