import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import { DecisionProblemResolutionStoreService } from '../../../decision-runtime/gateway/persistence/decision-problem-resolution.store';
import {
  findAutomationChangeLogEntry,
  markAutomationChangeLogRolledBack,
} from '../../../decision-runtime/monitoring/automation-change-log.store.util';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import { resolveAutomationPolicyFromTripMetadata } from '../../trip-constraint-solver/utils/travel-decision-contract-runtime.util';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import { TripMonitoringMvpService } from '../../../decision-runtime/monitoring/trip-monitoring-mvp.service';
import { ConsumerDecisionQueueService } from './consumer-decision-queue.service';
import { buildExecutabilityHeadline } from '../utils/consumer-decision-item.projection.util';
import { projectAiCompletedWorkItems } from '../utils/ai-completed-work.projection.util';
import {
  aggregateAutomationTierCounts,
  projectAutomationCatalogSummary,
} from '../utils/automation-catalog-summary.projection.util';
import {
  automationUiLevelLabel,
  toAutomationUiLevel,
} from '../utils/automation-ui-level.util';
import type {
  AutomationAuthorizationSummary,
  MonitoringItemView,
  PendingVerificationItem,
  TravelStatusView,
} from '../types/travel-status.types';
import { TRAVEL_STATUS_VIEW_SCHEMA_ID } from '../types/travel-status.types';
import type {
  ApplyDecisionProblemResponse,
  SubmitDecisionProblemResolutionResponse,
} from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';

const AUTOMATION_LEVEL_LABELS: Record<string, string> = {
  INFORM_ONLY: '仅提示，不自动修改行程',
  SUGGEST: '生成建议，需您确认后修改',
  AUTO_REPAIR_LOW_RISK: '低风险问题可自动处理',
  AUTO_EXECUTE_CONDITIONAL: '满足规则时自动执行',
};

@Injectable()
export class TravelStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ConsumerDecisionQueueService,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    private readonly resolutionStore: DecisionProblemResolutionStoreService,
    private readonly gateway: DecisionEngineGatewayService,
    private readonly contextSnapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly monitoringMvp: TripMonitoringMvpService,
  ) {}

  async getTravelStatus(tripId: string): Promise<TravelStatusView> {
    const generatedAt = new Date().toISOString();
    const [trip, queue, effectivePlanVersionId, snapshotRef, monitoringItems] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          updatedAt: true,
          metadata: true,
          budgetConfig: true,
          TripDay: { select: { id: true } },
        },
      }),
      this.queue.getQueue(tripId),
      this.planVersionStore.getEffectivePlanVersionId(tripId),
      this.contextSnapshotAssembler.resolveSnapshotRef(tripId),
      this.monitoringMvp.listItems(tripId),
    ]);

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const metadata = (trip.metadata ?? {}) as Record<string, unknown>;
    const pacing = (trip.budgetConfig ?? {}) as Record<string, unknown>;
    const automationPolicy = resolveAutomationPolicyFromTripMetadata(metadata, pacing);

    const blockingCount = queue.items.filter((i) => i.severity === 'BLOCK').length;
    const pendingVerification = queue.items.filter((i) => i.severity === 'VERIFY');
    const executability = buildExecutabilityHeadline({
      blockingCount,
      openCount: queue.openCount,
      pendingVerificationCount: pendingVerification.length,
    });

    const resolutions = await this.resolutionStore.listForTrip(tripId);
    const aiCompletedWork = projectAiCompletedWorkItems({
      resolutions,
      tripMetadata: metadata,
    });

    return {
      schemaId: TRAVEL_STATUS_VIEW_SCHEMA_ID,
      tripId,
      generatedAt,
      executability: {
        status: executability.status,
        headline: executability.headline,
        openDecisionCount: queue.openCount,
        blockingCount,
        pendingVerificationCount: pendingVerification.length,
      },
      effectivePlan: {
        versionId: effectivePlanVersionId,
        dayCount: trip.TripDay.length,
        lastUpdatedAt: trip.updatedAt.toISOString(),
        hasEffectivePlan: Boolean(effectivePlanVersionId),
      },
      openDecisions: {
        count: queue.openCount,
        headline: queue.headline,
        items: queue.items,
      },
      monitoring: {
        activeCount: monitoringItems.filter((i) => i.status === 'ALERT').length,
        items: monitoringItems.map(toMonitoringItemView),
      },
      automation: this.buildAutomationSummary(metadata, pacing, automationPolicy),
      aiCompletedWork,
      pendingVerification: {
        count: pendingVerification.length,
        items: pendingVerification.map(toPendingVerification),
      },
      contextSnapshot: {
        snapshotId: snapshotRef.snapshotId,
        revision: snapshotRef.revision,
        constraintsVersion: snapshotRef.constraintsVersion,
        effectivePlanVersionId: snapshotRef.effectivePlanVersionId,
        detailHref: `/trips/${tripId}/context-snapshot`,
      },
    };
  }

  async acceptRecommended(
    tripId: string,
    problemId: string,
    userId: string,
    actionIdOverride?: string,
    acknowledgement?: string[],
  ): Promise<{
    submit: SubmitDecisionProblemResolutionResponse;
    apply?: ApplyDecisionProblemResponse;
  }> {
    const item = await this.queue.getItem(tripId, problemId);
    if (!item) {
      throw new NotFoundException(`Decision item ${problemId} not found`);
    }

    const actionId =
      actionIdOverride?.trim() ||
      item.actions.acceptRecommended.actionId;
    if (!actionId) {
      throw new BadRequestException('No action available for this decision');
    }

    const selectableActionIds = await this.queue.getSelectableActionIds(tripId, problemId);
    const fallbackAllowedActionIds = [
      item.actions.acceptRecommended.actionId,
      item.actions.keepOriginal.actionId,
      item.actions.defer.actionId,
    ].filter((id): id is string => Boolean(id));
    const allowedActionIds =
      selectableActionIds.length > 0 ? selectableActionIds : fallbackAllowedActionIds;
    if (allowedActionIds.length > 0 && !allowedActionIds.includes(actionId)) {
      throw new BadRequestException('Selected action is not available for this decision');
    }

    const submit = await this.gateway.submitResolution(tripId, problemId, userId, {
      selectedActionId: actionId,
      acknowledgement,
    });

    let apply: ApplyDecisionProblemResponse | undefined;
    if (submit.nextStep === 'APPLY') {
      apply = await this.gateway.applyResolution(tripId, problemId, userId);
    }

    return { submit, apply };
  }

  async undoAutomationChange(
    tripId: string,
    logId: string,
    userId: string,
  ): Promise<{
    submit: SubmitDecisionProblemResolutionResponse;
    apply?: ApplyDecisionProblemResponse;
    rolledBackLogId: string;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const entry = findAutomationChangeLogEntry(trip.metadata, logId);
    if (!entry) {
      throw new NotFoundException(`Automation change ${logId} not found`);
    }
    if (entry.status === 'ROLLED_BACK') {
      throw new BadRequestException('This automatic change was already rolled back');
    }
    if (!entry.reversible || !entry.undoActionId) {
      throw new BadRequestException('This automatic change cannot be undone');
    }

    const submit = await this.gateway.submitResolution(tripId, entry.problemId, userId, {
      selectedActionId: entry.undoActionId,
    });

    let apply: ApplyDecisionProblemResponse | undefined;
    if (submit.nextStep === 'APPLY') {
      apply = await this.gateway.applyResolution(tripId, entry.problemId, userId);
    }

    await markAutomationChangeLogRolledBack(this.prisma, tripId, logId, userId);

    const resolution = await this.resolutionStore.getForProblem(tripId, entry.problemId);
    if (resolution?.automationMeta?.changeLogId === logId) {
      await this.resolutionStore.upsert(tripId, {
        ...resolution,
        status: 'ROLLED_BACK',
      });
    }

    return { submit, apply, rolledBackLogId: logId };
  }

  private buildAutomationSummary(
    metadata: Record<string, unknown>,
    pacing: Record<string, unknown>,
    automationPolicy: ReturnType<typeof resolveAutomationPolicyFromTripMetadata>,
  ): AutomationAuthorizationSummary {
    const contractRoot = metadata.travelDecisionContract as Record<string, unknown> | undefined;
    const paused = contractRoot?.automationPaused === true;

    const catalog = projectAutomationCatalogSummary(automationPolicy);

    return {
      defaultLevel: automationPolicy.defaultLevel,
      defaultLevelLabel:
        AUTOMATION_LEVEL_LABELS[automationPolicy.defaultLevel] ?? automationPolicy.defaultLevel,
      uiLevel: toAutomationUiLevel(automationPolicy.defaultLevel),
      uiLevelLabel: automationUiLevelLabel(automationPolicy.defaultLevel),
      tierCounts: aggregateAutomationTierCounts(catalog),
      paused,
      scope: contractRoot?.automationScope === 'USER_TEMPLATE' ? 'USER_TEMPLATE' : 'TRIP',
      catalog,
    };
  }
}

function toMonitoringItemView(
  item: import('../../../decision-runtime/monitoring/trip-monitoring-mvp.types').TripMonitoringItemView,
): MonitoringItemView {
  return {
    kind: item.kind,
    label: item.label,
    status: item.status,
    lastCheckedAt: item.lastCheckedAt,
    nextCheckAt: item.nextCheckAt,
    summary: item.summary,
  };
}

function toPendingVerification(item: {
  problemId: string;
  headline: string;
  affectedDayNumbers?: number[];
}): PendingVerificationItem {
  return {
    problemId: item.problemId,
    headline: item.headline,
    affectedDayNumbers: item.affectedDayNumbers,
  };
}
