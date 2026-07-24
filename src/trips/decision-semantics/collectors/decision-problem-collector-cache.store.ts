import type { CollectedDecisionProblems } from './decision-problem.collector';

const TTL_MS = 10_000;

interface CollectorCacheEntry {
  revisionKey: string;
  payload: CollectedDecisionProblems;
  cachedAt: number;
}

/** Short-lived in-memory cache — same revision key strategy as planning-conflicts. */
export class DecisionProblemCollectorCacheStore {
  private readonly byTripId = new Map<string, CollectorCacheEntry>();
  private readonly inflight = new Map<string, Promise<CollectedDecisionProblems>>();

  get(tripId: string, revisionKey: string): CollectedDecisionProblems | undefined {
    const entry = this.byTripId.get(tripId);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.byTripId.delete(tripId);
      return undefined;
    }
    if (entry.revisionKey !== revisionKey) return undefined;
    return entry.payload;
  }

  put(tripId: string, revisionKey: string, payload: CollectedDecisionProblems): void {
    this.byTripId.set(tripId, {
      revisionKey,
      payload,
      cachedAt: Date.now(),
    });
  }

  getInflight(tripId: string): Promise<CollectedDecisionProblems> | undefined {
    return this.inflight.get(tripId);
  }

  setInflight(tripId: string, promise: Promise<CollectedDecisionProblems>): void {
    this.inflight.set(tripId, promise);
    promise.finally(() => {
      if (this.inflight.get(tripId) === promise) {
        this.inflight.delete(tripId);
      }
    });
  }

  clear(tripId: string): void {
    this.byTripId.delete(tripId);
    this.inflight.delete(tripId);
  }
}
