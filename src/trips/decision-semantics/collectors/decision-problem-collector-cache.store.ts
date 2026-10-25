import type { CollectedDecisionProblems } from './decision-problem.collector';

const TTL_MS = 10_000;

export type DecisionProblemCollectMode = 'full' | 'fast';

interface CollectorCacheEntry {
  revisionKey: string;
  payload: CollectedDecisionProblems;
  cachedAt: number;
}

function cacheKey(tripId: string, mode: DecisionProblemCollectMode): string {
  return `${tripId}:${mode}`;
}

/** Short-lived in-memory cache — same revision key strategy as planning-conflicts. */
export class DecisionProblemCollectorCacheStore {
  private readonly byKey = new Map<string, CollectorCacheEntry>();
  private readonly inflight = new Map<string, Promise<CollectedDecisionProblems>>();

  get(
    tripId: string,
    revisionKey: string,
    mode: DecisionProblemCollectMode = 'full',
  ): CollectedDecisionProblems | undefined {
    const key = cacheKey(tripId, mode);
    const entry = this.byKey.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.byKey.delete(key);
      return undefined;
    }
    if (entry.revisionKey !== revisionKey) return undefined;
    return entry.payload;
  }

  put(
    tripId: string,
    revisionKey: string,
    payload: CollectedDecisionProblems,
    mode: DecisionProblemCollectMode = 'full',
  ): void {
    this.byKey.set(cacheKey(tripId, mode), {
      revisionKey,
      payload,
      cachedAt: Date.now(),
    });
  }

  getInflight(
    tripId: string,
    mode: DecisionProblemCollectMode = 'full',
  ): Promise<CollectedDecisionProblems> | undefined {
    return this.inflight.get(cacheKey(tripId, mode));
  }

  setInflight(
    tripId: string,
    promise: Promise<CollectedDecisionProblems>,
    mode: DecisionProblemCollectMode = 'full',
  ): void {
    const key = cacheKey(tripId, mode);
    this.inflight.set(key, promise);
    promise.finally(() => {
      if (this.inflight.get(key) === promise) {
        this.inflight.delete(key);
      }
    });
  }

  clear(tripId: string): void {
    for (const mode of ['full', 'fast'] as const) {
      const key = cacheKey(tripId, mode);
      this.byKey.delete(key);
      this.inflight.delete(key);
    }
  }
}
