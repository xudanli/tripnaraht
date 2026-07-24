/**
 * ONT-P2-03A — user advisory lifecycle store
 */

import type { UserTemporalAdvisory } from './user-advisory.types';

function scopeKey(userId: string, tripId: string, routeSegmentId?: string): string {
  return `${userId}::${tripId}::${(routeSegmentId ?? '_').toUpperCase()}`;
}

export class UserAdvisoryStore {
  private readonly byId = new Map<string, UserTemporalAdvisory>();
  private readonly byScope = new Map<string, string[]>();

  get(advisoryId: string): UserTemporalAdvisory | undefined {
    return this.byId.get(advisoryId);
  }

  listActive(userId: string, tripId: string, routeSegmentId?: string): UserTemporalAdvisory[] {
    const ids = this.byScope.get(scopeKey(userId, tripId, routeSegmentId)) ?? [];
    return ids
      .map((id) => this.byId.get(id))
      .filter((a): a is UserTemporalAdvisory => a?.status === 'ACTIVE');
  }

  all(): UserTemporalAdvisory[] {
    return [...this.byId.values()];
  }

  /**
   * Publish new advisory; SUPERSEDE + WITHDRAW prior ACTIVE for same user/trip/segment.
   * Withdrawal notice required — prediction reversal must not silently vanish.
   */
  publish(advisory: UserTemporalAdvisory): {
    current: UserTemporalAdvisory;
    withdrawn: UserTemporalAdvisory[];
  } {
    const k = scopeKey(advisory.userId, advisory.tripId, advisory.routeSegmentId);
    const ids = this.byScope.get(k) ?? [];
    const withdrawn: UserTemporalAdvisory[] = [];

    for (const id of ids) {
      const prev = this.byId.get(id);
      if (prev && prev.status === 'ACTIVE') {
        const notice = buildWithdrawalNotice(prev, advisory);
        const next: UserTemporalAdvisory = {
          ...prev,
          status: 'WITHDRAWN',
          supersededByAdvisoryId: advisory.advisoryId,
          withdrawalNotice: notice,
        };
        this.byId.set(id, next);
        withdrawn.push(next);
      }
    }

    this.byId.set(advisory.advisoryId, advisory);
    this.byScope.set(k, [...ids, advisory.advisoryId]);
    return { current: advisory, withdrawn };
  }

  /** Explicit withdraw without replacement (e.g. risk cleared) */
  withdrawExplicit(
    advisoryId: string,
    notice: string,
  ): UserTemporalAdvisory | undefined {
    const a = this.byId.get(advisoryId);
    if (!a || a.status !== 'ACTIVE') return undefined;
    const next: UserTemporalAdvisory = {
      ...a,
      status: 'WITHDRAWN',
      withdrawalNotice: notice,
    };
    this.byId.set(advisoryId, next);
    return next;
  }

  markSuperseded(advisoryId: string, supersededByAdvisoryId: string): void {
    const a = this.byId.get(advisoryId);
    if (!a || a.status !== 'ACTIVE') return;
    this.byId.set(advisoryId, {
      ...a,
      status: 'SUPERSEDED',
      supersededByAdvisoryId,
    });
  }

  markExpired(advisoryId: string): void {
    const a = this.byId.get(advisoryId);
    if (!a || a.status !== 'ACTIVE') return;
    this.byId.set(advisoryId, { ...a, status: 'EXPIRED' });
  }

  markResolved(advisoryId: string): void {
    const a = this.byId.get(advisoryId);
    if (!a) return;
    this.byId.set(advisoryId, { ...a, status: 'RESOLVED' });
  }

  clear(): void {
    this.byId.clear();
    this.byScope.clear();
  }
}

function buildWithdrawalNotice(
  prev: UserTemporalAdvisory,
  next: UserTemporalAdvisory,
): string {
  const oldDeadline = prev.interventionDeadline
    ? `此前「${formatDeadlineHint(prev.interventionDeadline)}」的建议已撤回。`
    : '此前建议已撤回。';
  return `预测已更新。${oldDeadline}最新预测显示：${next.display.whatPredicted}`;
}

function formatDeadlineHint(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm} 前出发`;
  } catch {
    return iso;
  }
}
