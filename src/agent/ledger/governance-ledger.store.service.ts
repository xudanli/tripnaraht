import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { diffGovernanceStates } from './governance-ledger-diff.util';
import { buildGovernanceLedgerEventFromItineraryOutput } from './governance-ledger-event.builder.util';
import type { GovernedItineraryGenerateLedgerSnapshot } from './governance-ledger-event.builder.util';
import { GovernanceLedgerPrismaPersistenceService } from './governance-ledger-prisma.persistence.service';
import type {
  GovernanceHistoryQuery,
  GovernanceLedgerEvent,
  GovernanceStateDiff,
} from './governance-ledger.types';
import {
  findPolicyOverrides,
  findRecentExecutionBlocks,
  findRepeatedRouteFailures,
  queryGovernanceHistory,
  type RepeatedRouteFailureHit,
} from './query-governance-history.util';

const DEFAULT_MAX_EVENTS = 10_000;

/**
 * Append-only governance ledger: hot in-memory view + durable Prisma append (event sourcing).
 */
@Injectable()
export class GovernanceLedgerStoreService {
  private readonly logger = new Logger(GovernanceLedgerStoreService.name);
  private readonly events: GovernanceLedgerEvent[] = [];
  private readonly maxEvents = DEFAULT_MAX_EVENTS;

  constructor(
    @Optional() private readonly prismaPersistence?: GovernanceLedgerPrismaPersistenceService,
  ) {}

  /** Append a pre-built event (tests / future ingestors). */
  appendEvent(event: GovernanceLedgerEvent): void {
    this.events.push(event);
    this.trimIfNeeded();
    void this.prismaPersistence?.append(event);
  }

  /**
   * Append from governed itinerary.generate snapshot (matches runtime API; no API shape change).
   */
  appendFromItineraryGenerate(request: TripPlanRequest, output: GovernedItineraryGenerateLedgerSnapshot): void {
    const now = Date.now();
    const built = buildGovernanceLedgerEventFromItineraryOutput(request, output, randomUUID(), now);
    if (!built) return;
    this.appendEvent(built);
    this.logger.debug(
      `[GovernanceLedger] appended eventType=${built.eventType} tripId=${built.tripId ?? 'n/a'} id=${built.id}`,
    );
  }

  snapshot(): GovernanceLedgerEvent[] {
    return [...this.events];
  }

  queryGovernanceHistory(q: GovernanceHistoryQuery): GovernanceLedgerEvent[] {
    return queryGovernanceHistory(this.events, q);
  }

  findRecentExecutionBlocks(tripId: string, limit?: number): GovernanceLedgerEvent[] {
    return findRecentExecutionBlocks(this.events, tripId, limit);
  }

  findPolicyOverrides(tripId: string, limit?: number): GovernanceLedgerEvent[] {
    return findPolicyOverrides(this.events, tripId, limit);
  }

  findRepeatedRouteFailures(
    routeRegion: string,
    opts?: { minCount?: number; sinceTimestamp?: number },
  ): RepeatedRouteFailureHit | null {
    return findRepeatedRouteFailures(this.events, routeRegion, opts);
  }

  /**
   * Replay governance timeline for a trip (DB first when available, else process memory).
   */
  async replayGovernanceTimeline(tripId: string): Promise<GovernanceLedgerEvent[]> {
    const fromDb = await this.prismaPersistence?.findTimelineAscByTripId(tripId);
    if (fromDb && fromDb.length > 0) return fromDb;
    return this.events
      .filter((e) => e.tripId === tripId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async compareGovernanceStates(
    tripId: string,
    opts: { baselineEndMs: number; comparisonEndMs: number },
  ): Promise<GovernanceStateDiff> {
    const asc = await this.replayGovernanceTimeline(tripId);
    return diffGovernanceStates(asc, tripId, opts);
  }

  private trimIfNeeded(): void {
    if (this.events.length <= this.maxEvents) return;
    const drop = this.events.length - this.maxEvents;
    this.events.splice(0, drop);
    this.logger.warn(`[GovernanceLedger] trimmed ${drop} oldest events (cap=${this.maxEvents})`);
  }
}
