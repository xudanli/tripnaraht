import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isTravelEventStoreEnabled } from '../../trips/event-store/travel-event-store.config';
import {
  isDecisionRuntimeReadFromProjectionEnabled,
  isGate1LinkedTripAutoCreateEnabled,
  isGate1TripStatusSyncEnabled,
  isRuntimeEventOutboxEnabled,
} from '../decision-runtime.config';
import { Gate1LinkedTripAnchorService } from './gate1-linked-trip-anchor.service';
import { DecisionWorkspaceReconciliationService } from './decision-workspace-reconciliation.service';
import { RuntimeEventOutboxService, type RuntimeOutboxStats } from './runtime-event-outbox.service';

export interface Gate1RuntimeMetricsV0 {
  generatedAt: string;
  flags: {
    travelEventStoreEnabled: boolean;
    readFromProjection: boolean;
    linkedTripAutoCreate: boolean;
    tripStatusSync: boolean;
    runtimeEventOutbox: boolean;
  };
  outbox?: RuntimeOutboxStats;
  linkedTripCoverage: Awaited<ReturnType<Gate1LinkedTripAnchorService['getCoverageReport']>>;
  linkedProjects: {
    total: number;
    withDecision: number;
    withOutcome: number;
    withTravelEvents: number;
    decisionRatePct: number;
    outcomeRatePct: number;
    eventDualWriteRatePct: number;
  };
  readiness: {
    projectsWithBlockerEvents: number;
    totalBlockerEvents: number;
  };
  reconcile?: {
    total: number;
    matched: number;
    mismatched: number;
    skipped: number;
    matchRatePct: number;
  };
}

@Injectable()
export class Gate1RuntimeMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: Gate1LinkedTripAnchorService,
    private readonly reconciliation: DecisionWorkspaceReconciliationService,
    private readonly outbox: RuntimeEventOutboxService,
  ) {}

  async getMetricsV0(includeReconcile = false): Promise<Gate1RuntimeMetricsV0> {
    const linkedTripCoverage = await this.anchor.getCoverageReport();

    const linkedProjects = await this.prisma.gate1Project.findMany({
      where: { linkedTripId: { not: null } },
      select: {
        id: true,
        linkedTripId: true,
        decisions: { select: { id: true }, take: 1 },
        outcome: { select: { id: true } },
      },
    });

    const tripIds = linkedProjects
      .map((p) => p.linkedTripId)
      .filter((id): id is string => id != null);

    const tripsWithEvents =
      tripIds.length === 0
        ? 0
        : (
            await this.prisma.travelEvent.groupBy({
              by: ['tripId'],
              where: { tripId: { in: tripIds } },
            })
          ).length;

    const blockerEvents =
      tripIds.length === 0
        ? 0
        : await this.prisma.travelEvent.count({
            where: {
              eventType: 'gate1.readiness.blocker_raised',
              tripId: { in: tripIds },
            },
          });

    const projectsWithBlockerEvents =
      tripIds.length === 0
        ? 0
        : (
            await this.prisma.travelEvent.groupBy({
              by: ['tripId'],
              where: {
                eventType: 'gate1.readiness.blocker_raised',
                tripId: { in: tripIds },
              },
            })
          ).length;

    const total = linkedProjects.length;
    const withDecision = linkedProjects.filter((p) => p.decisions.length > 0).length;
    const withOutcome = linkedProjects.filter((p) => p.outcome != null).length;

    const pct = (n: number, d: number) =>
      d === 0 ? 100 : Math.round((n / d) * 10000) / 100;

    let reconcile: Gate1RuntimeMetricsV0['reconcile'];
    if (includeReconcile) {
      const results = await this.reconciliation.reconcileAllLinkedProjects();
      const matched = results.filter((r) => r.allMatched).length;
      const skipped = results.filter((r) => r.skippedReason).length;
      const mismatched = results.filter((r) => !r.allMatched && !r.skippedReason).length;
      const eligible = results.length - skipped;
      reconcile = {
        total: results.length,
        matched,
        mismatched,
        skipped,
        matchRatePct: pct(matched, eligible),
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      flags: {
        travelEventStoreEnabled: isTravelEventStoreEnabled(),
        readFromProjection: isDecisionRuntimeReadFromProjectionEnabled(),
        linkedTripAutoCreate: isGate1LinkedTripAutoCreateEnabled(),
        tripStatusSync: isGate1TripStatusSyncEnabled(),
        runtimeEventOutbox: isRuntimeEventOutboxEnabled(),
      },
      outbox: isRuntimeEventOutboxEnabled()
        ? await this.outbox.getStats()
        : undefined,
      linkedTripCoverage,
      linkedProjects: {
        total,
        withDecision,
        withOutcome,
        withTravelEvents: tripsWithEvents,
        decisionRatePct: pct(withDecision, total),
        outcomeRatePct: pct(withOutcome, total),
        eventDualWriteRatePct: pct(tripsWithEvents, total),
      },
      readiness: {
        projectsWithBlockerEvents,
        totalBlockerEvents: blockerEvents,
      },
      reconcile,
    };
  }
}
