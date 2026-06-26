import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isDecisionRuntimeReadFromProjectionEnabled,
  isGate1LinkedTripAutoCreateEnabled,
  isGate1TripStatusSyncEnabled,
  isRuntimeEventOutboxEnabled,
  isRuntimeReplayValidationEnabled,
} from '../decision-runtime.config';
import { isTravelEventStoreEnabled } from '../../trips/event-store/travel-event-store.config';
import { Gate1LinkedTripAnchorService } from './gate1-linked-trip-anchor.service';
import { DecisionWorkspaceReconciliationService } from './decision-workspace-reconciliation.service';
import { RuntimeEventOutboxService } from './runtime-event-outbox.service';

export interface RuntimeAcceptanceThresholds {
  minLinkedTripCoveragePct: number;
  minReconcileMatchRatePct: number;
  maxOutboxFailed: number;
  maxOutboxPending: number;
}

export interface RuntimeAcceptanceReport {
  generatedAt: string;
  passed: boolean;
  failures: string[];
  thresholds: RuntimeAcceptanceThresholds;
  flags: {
    travelEventStoreEnabled: boolean;
    runtimeEventOutboxEnabled: boolean;
    readFromProjection: boolean;
    replayValidation: boolean;
    linkedTripAutoCreate: boolean;
    tripStatusSync: boolean;
  };
  linkedTripCoverage: Awaited<ReturnType<Gate1LinkedTripAnchorService['getCoverageReport']>>;
  outbox: Awaited<ReturnType<RuntimeEventOutboxService['getStats']>> | null;
  reconcile: {
    total: number;
    matched: number;
    mismatched: number;
    skipped: number;
    matchRatePct: number;
    mismatchedProjects: Array<{ projectId: string; title: string; entities: string[] }>;
  };
  travelEvents: {
    gate1EventCount: number;
    linkedProjectsWithEvents: number;
  };
}

const DEFAULT_THRESHOLDS: RuntimeAcceptanceThresholds = {
  minLinkedTripCoveragePct: 95,
  minReconcileMatchRatePct: 99,
  maxOutboxFailed: 0,
  maxOutboxPending: 50,
};

@Injectable()
export class Gate1RuntimeAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: Gate1LinkedTripAnchorService,
    private readonly reconciliation: DecisionWorkspaceReconciliationService,
    private readonly outbox: RuntimeEventOutboxService,
  ) {}

  async runAcceptance(
    thresholds: Partial<RuntimeAcceptanceThresholds> = {},
  ): Promise<RuntimeAcceptanceReport> {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const failures: string[] = [];

    const linkedTripCoverage = await this.anchor.getCoverageReport();
    const outboxStats = isRuntimeEventOutboxEnabled()
      ? await this.outbox.getStats()
      : null;

    const results = await this.reconciliation.reconcileAllLinkedProjects();
    const eligible = results.filter((r) => !r.skippedReason);
    const matched = eligible.filter((r) => r.allMatched).length;
    const mismatched = eligible.filter((r) => !r.allMatched).length;
    const skipped = results.filter((r) => r.skippedReason).length;
    const matchRatePct =
      eligible.length === 0
        ? 100
        : Math.round((matched / eligible.length) * 10000) / 100;

    const mismatchedProjects = eligible
      .filter((r) => !r.allMatched)
      .map((r) => ({
        projectId: r.projectId,
        title: r.projectTitle,
        entities: r.entities.filter((e) => !e.matched).map((e) => e.entity),
      }));

    const gate1EventCount = await this.prisma.travelEvent.count({
      where: {
        OR: [{ source: 'gate1.runtime' }, { eventType: { startsWith: 'gate1.' } }],
      },
    });

    const linkedProjectsWithEvents = (
      await this.prisma.travelEvent.groupBy({
        by: ['tripId'],
        where: {
          OR: [{ source: 'gate1.runtime' }, { eventType: { startsWith: 'gate1.' } }],
        },
      })
    ).length;

    if (linkedTripCoverage.coveragePct < t.minLinkedTripCoveragePct) {
      failures.push(
        `linkedTripId coverage ${linkedTripCoverage.coveragePct}% < ${t.minLinkedTripCoveragePct}%`,
      );
    }

    if (eligible.length > 0 && matchRatePct < t.minReconcileMatchRatePct) {
      failures.push(
        `reconcile match rate ${matchRatePct}% < ${t.minReconcileMatchRatePct}%`,
      );
    }

    if (outboxStats && outboxStats.failed > t.maxOutboxFailed) {
      failures.push(`outbox failed ${outboxStats.failed} > ${t.maxOutboxFailed}`);
    }

    if (outboxStats && outboxStats.pending > t.maxOutboxPending) {
      failures.push(`outbox pending ${outboxStats.pending} > ${t.maxOutboxPending}`);
    }

    if (isTravelEventStoreEnabled() && gate1EventCount === 0 && eligible.length > 0) {
      failures.push('TRAVEL_EVENT_STORE enabled but no gate1 travel_events found');
    }

    return {
      generatedAt: new Date().toISOString(),
      passed: failures.length === 0,
      failures,
      thresholds: t,
      flags: {
        travelEventStoreEnabled: isTravelEventStoreEnabled(),
        runtimeEventOutboxEnabled: isRuntimeEventOutboxEnabled(),
        readFromProjection: isDecisionRuntimeReadFromProjectionEnabled(),
        replayValidation: isRuntimeReplayValidationEnabled(),
        linkedTripAutoCreate: isGate1LinkedTripAutoCreateEnabled(),
        tripStatusSync: isGate1TripStatusSyncEnabled(),
      },
      linkedTripCoverage,
      outbox: outboxStats,
      reconcile: {
        total: results.length,
        matched,
        mismatched,
        skipped,
        matchRatePct,
        mismatchedProjects,
      },
      travelEvents: {
        gate1EventCount,
        linkedProjectsWithEvents,
      },
    };
  }
}
