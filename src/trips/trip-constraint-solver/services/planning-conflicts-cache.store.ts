import type { PlanningConflictsArtifacts } from './planning-conflicts.service';

const TTL_MS = 10 * 60 * 1000;

interface PlanningConflictsCacheEntry {
  revisionKey: string;
  artifacts: PlanningConflictsArtifacts;
  cachedAt: number;
}

export class PlanningConflictsCacheStore {
  private readonly byTripId = new Map<string, PlanningConflictsCacheEntry>();

  get(tripId: string, revisionKey: string): PlanningConflictsArtifacts | undefined {
    const entry = this.byTripId.get(tripId);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.byTripId.delete(tripId);
      return undefined;
    }
    if (entry.revisionKey !== revisionKey) return undefined;
    return entry.artifacts;
  }

  /** 过期 revision 也返回，供 deferred 首包 stale 兜底 */
  getStale(tripId: string): PlanningConflictsArtifacts | undefined {
    const entry = this.byTripId.get(tripId);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.byTripId.delete(tripId);
      return undefined;
    }
    return entry.artifacts;
  }

  put(tripId: string, revisionKey: string, artifacts: PlanningConflictsArtifacts): void {
    this.byTripId.set(tripId, {
      revisionKey,
      artifacts,
      cachedAt: Date.now(),
    });
  }
}
