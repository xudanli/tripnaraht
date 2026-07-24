import type { DecisionOption } from '../types/decision-semantics.types';

const TTL_MS = 10_000;

interface OptionsCacheEntry {
  revisionKey: string;
  options: DecisionOption[];
  cachedAt: number;
}

/** Cached decision-space projection (baseline tradeoffs, no preview enrichment). */
export class DecisionSpaceOptionsCacheStore {
  private readonly byKey = new Map<string, OptionsCacheEntry>();

  private cacheKey(tripId: string, problemId: string): string {
    return `${tripId}:${problemId}`;
  }

  get(tripId: string, problemId: string, revisionKey: string): DecisionOption[] | undefined {
    const entry = this.byKey.get(this.cacheKey(tripId, problemId));
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.byKey.delete(this.cacheKey(tripId, problemId));
      return undefined;
    }
    if (entry.revisionKey !== revisionKey) return undefined;
    return entry.options;
  }

  put(
    tripId: string,
    problemId: string,
    revisionKey: string,
    options: DecisionOption[],
  ): void {
    this.byKey.set(this.cacheKey(tripId, problemId), {
      revisionKey,
      options,
      cachedAt: Date.now(),
    });
  }

  clearTrip(tripId: string): void {
    const prefix = `${tripId}:`;
    for (const key of this.byKey.keys()) {
      if (key.startsWith(prefix)) this.byKey.delete(key);
    }
  }
}
