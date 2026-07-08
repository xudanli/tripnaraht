import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionProblemResolutionStoreService } from '../../../decision-runtime/gateway/persistence/decision-problem-resolution.store';
import {
  findAutomationChangeLogEntry,
} from '../../../decision-runtime/monitoring/automation-change-log.store.util';
import { DECISION_AUTOMATION_ACTOR_USER_ID } from '../../../decision-runtime/monitoring/decision-automation-chain.service';
import { ConsumerDecisionQueueService } from './consumer-decision-queue.service';
import { projectAiActivityLogView } from '../utils/ai-activity-log.projection.util';
import type {
  AiActivityEvidenceItem,
  AiActivityLogDetailView,
  AiActivityLogView,
} from '../types/ai-activity-log.types';
import { AI_ACTIVITY_LOG_DETAIL_SCHEMA_ID } from '../types/ai-activity-log.types';

@Injectable()
export class AiActivityLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolutionStore: DecisionProblemResolutionStoreService,
    private readonly decisionQueue: ConsumerDecisionQueueService,
  ) {}

  async getLog(tripId: string): Promise<AiActivityLogView> {
    const generatedAt = new Date().toISOString();
    const [trip, resolutions, queue] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      }),
      this.resolutionStore.listForTrip(tripId),
      this.decisionQueue.getQueue(tripId, { hydrateRecommendations: false }),
    ]);

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    return projectAiActivityLogView({
      tripId,
      generatedAt,
      resolutions,
      tripMetadata: trip.metadata,
      openDecisions: queue.items,
    });
  }

  async getDetail(tripId: string, activityId: string): Promise<AiActivityLogDetailView> {
    const logView = await this.getLog(tripId);
    const timelineItem = logView.items.find((item) => item.activityId === activityId);
    if (!timelineItem) {
      throw new NotFoundException(`Activity ${activityId} not found`);
    }

    const [trip, resolutionByProblem, decisionItem, user] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      }),
      timelineItem.problemId
        ? this.resolutionStore.getForProblem(tripId, timelineItem.problemId)
        : Promise.resolve(undefined),
      timelineItem.problemId
        ? this.decisionQueue.getItem(tripId, timelineItem.problemId)
        : Promise.resolve(null),
      this.resolveConfirmedByUser(tripId, timelineItem.problemId),
    ]);

    const changeLogEntry = findAutomationChangeLogEntry(trip?.metadata, activityId);
    const resolution =
      resolutionByProblem ??
      (timelineItem.problemId
        ? Object.values(await this.resolutionStore.listForTrip(tripId)).find(
            (r) => r.resolutionId === activityId || r.automationMeta?.changeLogId === activityId,
          )
        : undefined);

    const undoLogId = changeLogEntry?.logId ?? resolution?.automationMeta?.changeLogId;
    const undoActionId = changeLogEntry?.undoActionId ?? resolution?.automationMeta?.undoActionId;
    const reversible =
      timelineItem.reversible &&
      (changeLogEntry?.status === 'APPLIED' || resolution?.status === 'APPLIED');

    return {
      schemaId: AI_ACTIVITY_LOG_DETAIL_SCHEMA_ID,
      tripId,
      activityId,
      eventId: timelineItem.eventId,
      occurredAt: timelineItem.occurredAt,
      statusTag: timelineItem.statusTag,
      statusLabel: timelineItem.statusLabel,
      title: timelineItem.title,
      executionReason: buildExecutionReason({
        timelineReason: timelineItem.reason,
        decisionExplanation: decisionItem?.explanation,
        changeSummary: changeLogEntry?.changeSummary ?? resolution?.automationMeta?.changeSummary,
      }),
      evidence: buildEvidenceList(decisionItem),
      impactMetrics: buildImpactMetrics(),
      confirmedBy: user,
      reversible,
      undo: {
        enabled: reversible && Boolean(undoLogId && undoActionId),
        logId: undoLogId,
        undoActionId,
      },
    };
  }

  private async resolveConfirmedByUser(
    tripId: string,
    problemId?: string,
  ): Promise<{ userId: string; displayName?: string } | undefined> {
    if (!problemId) return undefined;
    const resolution = await this.resolutionStore.getForProblem(tripId, problemId);
    if (!resolution || resolution.decidedByUserId === DECISION_AUTOMATION_ACTOR_USER_ID) {
      return undefined;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: resolution.decidedByUserId },
      select: { id: true, displayName: true },
    });

    return user
      ? { userId: user.id, displayName: user.displayName ?? undefined }
      : { userId: resolution.decidedByUserId };
  }
}

function buildExecutionReason(input: {
  timelineReason: string;
  decisionExplanation?: string;
  changeSummary?: string;
}): string {
  if (input.decisionExplanation?.trim()) return input.decisionExplanation.trim();
  if (input.changeSummary?.trim()) return input.changeSummary.trim();
  return input.timelineReason;
}

function buildEvidenceList(
  decisionItem: Awaited<ReturnType<ConsumerDecisionQueueService['getItem']>>,
): AiActivityEvidenceItem[] {
  if (!decisionItem) return [];

  const items: AiActivityEvidenceItem[] = [];
  if (decisionItem.evidenceSummary?.sourceLabel) {
    items.push({
      label: decisionItem.evidenceSummary.sourceLabel,
      detail: `置信度 ${decisionItem.evidenceSummary.confidence ?? 'UNKNOWN'} · 新鲜度 ${decisionItem.evidenceSummary.freshness ?? 'UNKNOWN'}`,
      updatedAt: decisionItem.evidenceSummary.verifiedAt,
    });
  }

  if (decisionItem.affectedDayNumbers?.length) {
    items.push({
      label: '行程规则',
      detail: `影响第 ${decisionItem.affectedDayNumbers.join('、')} 天`,
    });
  }

  return items;
}

function buildImpactMetrics(): AiActivityLogDetailView['impactMetrics'] {
  return undefined;
}
