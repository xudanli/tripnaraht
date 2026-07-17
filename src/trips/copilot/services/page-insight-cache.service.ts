/**
 * In-memory Insight cache keyed by tripId + contextHash.
 */

import { Injectable } from '@nestjs/common';
import type { NaraPageInsight } from '../contracts/page-insight.types';

interface CacheEntry {
  insight: NaraPageInsight;
  storedAt: number;
}

@Injectable()
export class PageInsightCacheService {
  private readonly byHash = new Map<string, CacheEntry>();
  private readonly byInsightId = new Map<string, NaraPageInsight>();

  private key(tripId: string, contextHash: string): string {
    return `${tripId}::${contextHash}`;
  }

  get(tripId: string, contextHash: string): NaraPageInsight | undefined {
    const entry = this.byHash.get(this.key(tripId, contextHash));
    if (!entry) return undefined;
    if (entry.insight.expiresAt && Date.parse(entry.insight.expiresAt) <= Date.now()) {
      this.byHash.delete(this.key(tripId, contextHash));
      return undefined;
    }
    return entry.insight;
  }

  put(insight: NaraPageInsight, opts?: { proactiveCache?: boolean }): void {
    const proactive = opts?.proactiveCache !== false;
    if (proactive) {
      const hash = insight.context.contextHash;
      this.byHash.set(this.key(insight.tripId, hash), {
        insight,
        storedAt: Date.now(),
      });
    }
    this.byInsightId.set(insight.id, insight);
  }

  getById(insightId: string): NaraPageInsight | undefined {
    return this.byInsightId.get(insightId);
  }

  /** Invalidate all hashes for a trip (e..g. workspace version bump). */
  invalidateTrip(tripId: string): void {
    for (const k of [...this.byHash.keys()]) {
      if (k.startsWith(`${tripId}::`)) this.byHash.delete(k);
    }
  }
}
