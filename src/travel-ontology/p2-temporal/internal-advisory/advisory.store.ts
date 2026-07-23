/**
 * ONT-P2-02B — advisory lifecycle store (withdraw on prediction supersede)
 */

import type { InternalTemporalAdvisory } from './advisory.types';

function scopeKey(tripId: string, routeSegmentId?: string): string {
  return `${tripId}::${(routeSegmentId ?? '_').toUpperCase()}`;
}

export class InternalAdvisoryStore {
  private readonly byId = new Map<string, InternalTemporalAdvisory>();
  private readonly byScope = new Map<string, string[]>();

  get(advisoryId: string): InternalTemporalAdvisory | undefined {
    return this.byId.get(advisoryId);
  }

  listActive(tripId: string, routeSegmentId?: string): InternalTemporalAdvisory[] {
    const ids = this.byScope.get(scopeKey(tripId, routeSegmentId)) ?? [];
    return ids
      .map((id) => this.byId.get(id))
      .filter((a): a is InternalTemporalAdvisory => a?.status === 'ACTIVE');
  }

  all(): InternalTemporalAdvisory[] {
    return [...this.byId.values()];
  }

  /**
   * Publish new advisory; withdraw any ACTIVE for same scope (prediction replacement).
   */
  publish(advisory: InternalTemporalAdvisory): {
    current: InternalTemporalAdvisory;
    withdrawn: InternalTemporalAdvisory[];
  } {
    const k = scopeKey(advisory.tripId, advisory.routeSegmentId);
    const ids = this.byScope.get(k) ?? [];
    const withdrawn: InternalTemporalAdvisory[] = [];

    for (const id of ids) {
      const prev = this.byId.get(id);
      if (prev && prev.status === 'ACTIVE') {
        const next: InternalTemporalAdvisory = {
          ...prev,
          status: 'WITHDRAWN',
          withdrawnReason: 'PREDICTION_SUPERSEDED',
          supersededByAdvisoryId: advisory.advisoryId,
        };
        this.byId.set(id, next);
        withdrawn.push(next);
      }
    }

    this.byId.set(advisory.advisoryId, advisory);
    this.byScope.set(k, [...ids, advisory.advisoryId]);
    return { current: advisory, withdrawn };
  }

  markExpired(advisoryId: string): void {
    const a = this.byId.get(advisoryId);
    if (!a || a.status !== 'ACTIVE') return;
    this.byId.set(advisoryId, { ...a, status: 'EXPIRED' });
  }

  markReconciled(advisoryId: string): void {
    const a = this.byId.get(advisoryId);
    if (!a) return;
    this.byId.set(advisoryId, { ...a, status: 'RECONCILED' });
  }

  clear(): void {
    this.byId.clear();
    this.byScope.clear();
  }
}
