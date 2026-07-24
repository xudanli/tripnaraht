/**
 * PR-A — World State assertion persistence + snapshot binding (trip.metadata).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { WorldStateSnapshot } from '../contracts/world-state.types';
import type { RoadStatusChangedEvent } from './road-status-changed.event';
import type { TravelDecisionEvent } from './travel-decision-event.types';

const METADATA_KEY = 'rfc001WorldState';
const MAX_ASSERTIONS = 200;
const MAX_EVENTS = 100;
const MAX_SNAPSHOTS = 50;

export interface StoredRfc001WorldState {
  assertions: WorldStateAssertion[];
  snapshots: WorldStateSnapshot[];
  events: TravelDecisionEvent[];
  lastUpdatedAt?: string;
}

export interface AppendAssertionResult {
  assertion: WorldStateAssertion;
  snapshot: WorldStateSnapshot;
  supersededAssertionIds: string[];
}

@Injectable()
export class WorldStateStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async readStore(tripId: string): Promise<StoredRfc001WorldState> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as StoredRfc001WorldState | undefined;
    return {
      assertions: block?.assertions ?? [],
      snapshots: block?.snapshots ?? [],
      events: block?.events ?? [],
      lastUpdatedAt: block?.lastUpdatedAt,
    };
  }

  async appendRoadStatusEvent(
    tripId: string,
    event: RoadStatusChangedEvent,
  ): Promise<void> {
    return this.appendTravelDecisionEvent(tripId, event);
  }

  async appendTravelDecisionEvent(
    tripId: string,
    event: TravelDecisionEvent,
  ): Promise<void> {
    const store = await this.readStore(tripId);
    const events = [...store.events, event].slice(-MAX_EVENTS);
    await this.writeStore(tripId, { ...store, events });
  }

  /**
   * Append assertion; supersede prior ACTIVE assertions for same subject+predicate.
   */
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
        return { ...a, status: 'SUPERSEDED' as const, supersedesAssertionId: undefined };
      }
      return a;
    });

    const nextAssertion: WorldStateAssertion = {
      ...assertion,
      supersedesAssertionId: supersededAssertionIds[0],
    };

    const allAssertions = [...assertions, nextAssertion].slice(-MAX_ASSERTIONS);
    const activeIds = allAssertions
      .filter((a) => a.status === 'ACTIVE')
      .map((a) => a.assertionId);

    const snapshot: WorldStateSnapshot = {
      snapshotId: `wss_${tripId.slice(0, 8)}_${Date.now()}`,
      revision: String(allAssertions.length),
      capturedAt: new Date().toISOString(),
      assertionIds: activeIds,
    };

    const snapshots = [...store.snapshots, snapshot].slice(-MAX_SNAPSHOTS);
    await this.writeStore(tripId, {
      ...store,
      assertions: allAssertions,
      snapshots,
    });

    return { assertion: nextAssertion, snapshot, supersededAssertionIds };
  }

  async getSnapshot(
    tripId: string,
    snapshotId: string,
  ): Promise<WorldStateSnapshot | undefined> {
    const store = await this.readStore(tripId);
    return store.snapshots.find((s) => s.snapshotId === snapshotId);
  }

  /** Bind an empty snapshot for guide / greenfield accept paths (no prior road events). */
  async ensureSnapshot(tripId: string, snapshotId: string): Promise<WorldStateSnapshot> {
    const existing = await this.getSnapshot(tripId, snapshotId);
    if (existing) return existing;

    const store = await this.readStore(tripId);
    const snapshot: WorldStateSnapshot = {
      snapshotId,
      revision: String(store.snapshots.length + 1),
      capturedAt: new Date().toISOString(),
      assertionIds: [],
    };
    await this.writeStore(tripId, {
      ...store,
      snapshots: [...store.snapshots, snapshot].slice(-MAX_SNAPSHOTS),
    });
    return snapshot;
  }

  async getActiveAssertionForRoad(
    tripId: string,
    roadId: string,
  ): Promise<WorldStateAssertion | undefined> {
    const store = await this.readStore(tripId);
    const needle = roadId.toUpperCase();
    return [...store.assertions]
      .reverse()
      .find(
        (a) =>
          a.status === 'ACTIVE' &&
          a.predicate === 'road.status' &&
          (a.payload as { roadId?: string })?.roadId?.toUpperCase() === needle,
      );
  }

  async getActiveWeatherAssertionForDay(
    tripId: string,
    dayIndex: number,
    regionId?: string,
  ): Promise<WorldStateAssertion | undefined> {
    const store = await this.readStore(tripId);
    return [...store.assertions]
      .reverse()
      .find((a) => {
        if (a.status !== 'ACTIVE' || a.predicate !== 'weather.hazard') {
          return false;
        }
        const payload = a.payload as { dayIndex?: number; regionId?: string };
        if (payload.dayIndex !== dayIndex) return false;
        if (regionId && payload.regionId !== regionId) return false;
        return true;
      });
  }

  private async writeStore(
    tripId: string,
    store: StoredRfc001WorldState,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const nextMeta = {
      ...meta,
      [METADATA_KEY]: {
        ...store,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(nextMeta) },
    });
  }
}
