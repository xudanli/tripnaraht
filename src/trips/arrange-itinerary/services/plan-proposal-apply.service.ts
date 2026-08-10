import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { ItineraryItemsService } from '../../../itinerary-items/itinerary-items.service';
import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import { assertDirectEffectivePlanWriteBlocked } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { ScheduleTimelineService } from '../../services/schedule-timeline.service';
import { AttractionExploreCandidateService } from '../../attraction-explore/services/attraction-explore-candidate.service';
import type {
  PlanProposal,
  PlanProposalApplyResult,
  PlanProposalChange,
} from '../types/plan-proposal.types';
import {
  buildDayDateTime,
  resolveTripDayByIndex,
  scheduleTimelineUserId,
  toZeroBasedDayIndex,
} from '../../utils/arrange-itinerary-day.util';
import { resolveTripTimezone } from '../../../common/utils/destination-timezone.util';
import { buildExecutionSteps } from '../utils/plan-proposal-decision-projection.util';
import { selectAuthoritativePlanProposalChanges } from '../../../decision-runtime/solver/lab/ortools-planning-shadow-apply.guard';
import { filterChangesByEnabledItemIds } from '../utils/scheme-preview.projection.util';

@Injectable()
export class PlanProposalApplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itineraryItems: ItineraryItemsService,
    private readonly scheduleTimeline: ScheduleTimelineService,
    private readonly candidates: AttractionExploreCandidateService,
  ) {}

  async apply(input: {
    proposal: PlanProposal;
    userId: string;
    force?: boolean;
    enabledItemIds?: string[];
    comment?: string;
  }): Promise<PlanProposalApplyResult> {
    if (input.proposal.validation.status === 'BLOCK' && !input.force) {
      throw new BadRequestException('当前草案存在阻塞性冲突，无法写入');
    }

    // Agent Harness P0-1 W2：禁止自授 ALS 权威绕过写链；页面 Apply 须走 UWC Preview / DecisionCore
    assertDirectEffectivePlanWriteBlocked('plan-proposal.apply');
    return this.executeProposal(input);
  }

  private async executeProposal(input: {
    proposal: PlanProposal;
    userId: string;
    enabledItemIds?: string[];
    comment?: string;
  }): Promise<PlanProposalApplyResult> {
    const { proposal, userId } = input;
    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId: proposal.tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });
    const trip = await this.prisma.trip.findUnique({
      where: { id: proposal.tripId },
      select: { destination: true, metadata: true },
    });
    const timezone = resolveTripTimezone({
      destination: trip?.destination,
      metadata: trip?.metadata,
    });

    const createdItems: Array<Record<string, unknown>> = [];
    const removedCandidateIds = new Set<string>();

    // ADR-008 S4: never apply ortoolsShadow.shadowChanges — only proposal.changes
    const authoritativeChanges = filterChangesByEnabledItemIds(
      selectAuthoritativePlanProposalChanges(proposal),
      input.enabledItemIds,
    );

    if (authoritativeChanges.length === 0) {
      throw new BadRequestException('未选择任何可执行项，无法写入');
    }

    await this.prisma.$transaction(async () => {
      for (const change of authoritativeChanges) {
        if (change.operation === 'ADD') {
          const item = await this.applyAdd(change, tripDays, timezone);
          if (item) createdItems.push(item);
          if (change.removeFromCandidates && change.candidateId) {
            removedCandidateIds.add(change.candidateId);
          }
        } else if (change.operation === 'MOVE' && change.itemId) {
          await this.applyMove(change, tripDays, timezone);
        } else if (change.operation === 'REMOVE_CANDIDATE' && change.candidateId) {
          removedCandidateIds.add(change.candidateId);
        }
      }

      for (const candidateId of removedCandidateIds) {
        await this.prisma.tripAttractionExploreCandidate.deleteMany({
          where: { id: candidateId, tripId: proposal.tripId },
        });
      }
    });

    const affectedDay = proposal.affectedDays[0] ?? 1;
    const scheduleTimeline = await this.loadDayTimeline(
      proposal.tripId,
      userId,
      affectedDay,
      tripDays.length,
    );

    let candidatesView;
    if (removedCandidateIds.size > 0) {
      candidatesView = await this.candidates.listCandidates(proposal.tripId);
    }

    return {
      proposalId: proposal.proposalId,
      tripId: proposal.tripId,
      status: 'APPLIED',
      orchestrationState: {
        tripId: proposal.tripId,
        phase: 'COMPLETED',
        contextVersion: proposal.contextVersion,
        message: '草案已写入正式行程',
        updatedAt: new Date().toISOString(),
      },
      appliedChangeCount: authoritativeChanges.filter(
        (c) => c.operation === 'ADD' || c.operation === 'MOVE',
      ).length,
      scheduleTimeline,
      ...(candidatesView ? { candidates: candidatesView } : {}),
      itineraryItems: createdItems,
      executionSteps: buildExecutionSteps(proposal),
      validUntil: proposal.decisionPack?.monitor.validUntil ?? proposal.expiresAt,
      monitorWebhookUrl: proposal.decisionPack?.monitor.monitorWebhookUrl,
    };
  }

  private async applyAdd(
    change: PlanProposalChange,
    tripDays: Array<{ id: string; date: Date }>,
    timezone: string,
  ): Promise<Record<string, unknown> | null> {
    const tripDay = resolveTripDayByIndex(tripDays, change.dayIndex);
    if (!change.startTime || !change.endTime) {
      throw new BadRequestException('ADD 变更缺少时间窗口');
    }

    const startTime = buildDayDateTime(tripDay.date, change.startTime, timezone);
    const endTime = buildDayDateTime(tripDay.date, change.endTime, timezone);

    const created = await this.itineraryItems.create({
      tripDayId: tripDay.id,
      placeId: change.placeId,
      type: (change.itemType as ItemType) ?? ItemType.ACTIVITY,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      note: change.note,
      forceCreate: true,
    });

    return created as Record<string, unknown>;
  }

  private async applyMove(
    change: PlanProposalChange,
    tripDays: Array<{ id: string; date: Date }>,
    timezone: string,
  ): Promise<void> {
    if (!change.itemId) return;

    const existing = await this.prisma.itineraryItem.findUnique({
      where: { id: change.itemId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`行程项 ${change.itemId} 不存在`);
    }

    const tripDay = resolveTripDayByIndex(tripDays, change.dayIndex);
    if (!change.startTime || !change.endTime) {
      throw new BadRequestException('MOVE 变更缺少目标时间');
    }

    const startTime = buildDayDateTime(tripDay.date, change.startTime, timezone);
    const endTime = buildDayDateTime(tripDay.date, change.endTime, timezone);

    await this.itineraryItems.update(
      change.itemId,
      {
        tripDayId: tripDay.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        cascadeMode: 'none',
      },
      { forceUpdate: true },
    );
  }

  private async loadDayTimeline(
    tripId: string,
    userId: string,
    dayIndex: number,
    dayCount: number,
  ) {
    const zeroBased = toZeroBasedDayIndex(dayIndex, dayCount);
    const result = await this.scheduleTimeline.getScheduleTimeline(
      tripId,
      scheduleTimelineUserId(userId),
      {
        include: 'items,metrics,travelInfo',
        travelInfoMode: 'cached',
        from: zeroBased,
        limit: 1,
      },
    );
    if (result.status !== 'ok') {
      throw new BadRequestException('无法加载日程时间轴');
    }
    return {
      tripId: result.data.tripId,
      days: result.data.days,
    };
  }
}
