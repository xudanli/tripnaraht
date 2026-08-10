/**
 * Minimal WorldState store fake for Look assertion unit tests.
 */

import type {
  WorldStateAssertion,
  WorldStateSnapshot,
} from '../../guardian-decision-core/contracts/world-state.types';
import type {
  AppendAssertionResult,
  StoredRfc001WorldState,
} from '../../guardian-decision-core/evidence/world-state-store.service';

export class InMemoryWorldStateStoreForLook {
  private readonly byTrip = new Map<string, StoredRfc001WorldState>();

  async readStore(tripId: string): Promise<StoredRfc001WorldState> {
    return (
      this.byTrip.get(tripId) ?? {
        assertions: [],
        snapshots: [],
        events: [],
      }
    );
  }

  async appendAssertion(
    tripId: string,
    assertion: WorldStateAssertion,
  ): Promise<AppendAssertionResult> {
    const store = await this.readStore(tripId);
    const supersededAssertionIds: string[] = [];
    const assertions = store.assertions.map((a) => {
      const sameSubject =
        a.subjectRef.kind === assertion.subjectRef.kind &&
        a.subjectRef.id === assertion.subjectRef.id &&
        a.predicate === assertion.predicate;
      if (sameSubject && a.status === 'ACTIVE') {
        supersededAssertionIds.push(a.assertionId);
        return { ...a, status: 'SUPERSEDED' as const };
      }
      return a;
    });

    const nextAssertion: WorldStateAssertion = {
      ...assertion,
      supersedesAssertionId: supersededAssertionIds[0],
    };
    const allAssertions = [...assertions, nextAssertion];
    const snapshot: WorldStateSnapshot = {
      snapshotId: `wss_looktest_${Date.now()}_${allAssertions.length}`,
      revision: String(allAssertions.length),
      capturedAt: new Date().toISOString(),
      assertionIds: allAssertions
        .filter((a) => a.status === 'ACTIVE')
        .map((a) => a.assertionId),
    };
    const next: StoredRfc001WorldState = {
      assertions: allAssertions,
      snapshots: [...store.snapshots, snapshot],
      events: store.events,
      lastUpdatedAt: snapshot.capturedAt,
    };
    this.byTrip.set(tripId, next);
    return {
      assertion: nextAssertion,
      snapshot,
      supersededAssertionIds,
    };
  }

  clear(): void {
    this.byTrip.clear();
  }
}
