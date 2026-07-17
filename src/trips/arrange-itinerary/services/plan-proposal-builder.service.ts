import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import type {
  ArrangeItineraryGapDto,
  ArrangeItineraryItemDto,
  AttractionExploreAiActionDto,
  PlaceAttractionExploreCandidateDto,
} from '../dto/arrange-itinerary.dto';
import type {
  PlanProposal,
  PlanProposalBenefits,
  PlanProposalChange,
  PlanProposalSource,
  PlanningIntent,
} from '../types/plan-proposal.types';
import {
  buildDayDateTime,
  resolveTripDayByIndex,
} from '../../utils/arrange-itinerary-day.util';
import { extractPlaceMeta } from '../../attraction-explore/utils/attraction-explore-place.util';
import { PlanProposalContextService } from './plan-proposal-context.service';
import { PlanProposalValidationService } from './plan-proposal-validation.service';
import { PlanningItemLockService } from './planning-item-lock.service';
import { canPlanningAgentMove } from '../utils/planning-item-lock.util';
import { PlanningDecisionPackService } from './planning-decision-pack.service';
import {
  buildOrtToolsPlanningShadowSkippedAttachment,
  OrToolsPlanningOrchestratorShadowBridge,
} from '../../../decision-runtime/solver/bridge/ortools-planning-orchestrator-shadow.bridge';
import type { DayVrptwItemInput } from '../../../decision-runtime/solver/projection/build-solver-problem-from-day-items.util';
import { formatOrtToolsPlanningLabTradeoff } from '../../../decision-runtime/solver/lab/ortools-planning-lab-compare.util';
import {
  isOrToolsRepairShadowEnabled,
  resolveOrToolsSolverBaseUrl,
} from '../../../decision-runtime/solver/ortools-solver.config';
import {
  pickDensestArrangeDay,
  planProposalAddsToDayItems,
} from '../../../decision-runtime/solver/projection/plan-proposal-adds-to-day-items.util';
import { projectSchemePreview } from '../utils/scheme-preview.projection.util';

@Injectable()
export class PlanProposalBuilderService {
  private readonly logger = new Logger(PlanProposalBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PlanProposalContextService,
    private readonly validation: PlanProposalValidationService,
    private readonly itemLocks: PlanningItemLockService,
    private readonly decisionPack: PlanningDecisionPackService,
    /** ADR-008 S4 — OPTIMIZE_ROUTE shadow only */
    @Optional()
    private readonly ortoolsPlanningShadow?: OrToolsPlanningOrchestratorShadowBridge,
  ) {}

  async build(input: {
    tripId: string;
    userId: string;
    intent: PlanningIntent;
    source: PlanProposalSource;
    changes: PlanProposalChange[];
    benefits?: PlanProposalBenefits;
    tradeoffs?: string[];
    answer?: string;
  }): Promise<PlanProposal> {
    const snapshot = await this.context.snapshot(input.tripId);
    const validation = await this.validation.validateChanges({
      tripId: input.tripId,
      changes: input.changes,
    });
    const diff = this.validation.buildDiff(input.changes);
    const affectedDays = [...new Set(input.changes.map((c) => c.dayIndex))].sort(
      (a, b) => a - b,
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

    const draft: PlanProposal = {
      proposalId: `proposal_${randomUUID()}`,
      tripId: input.tripId,
      userId: input.userId,
      intent: input.intent,
      basePlanVersion: snapshot.basePlanVersion,
      contextVersion: snapshot.contextVersion,
      affectedDays,
      changes: input.changes,
      benefits: input.benefits,
      tradeoffs: input.tradeoffs ?? [],
      validation,
      diff,
      requiresConfirmation: validation.status !== 'PASS' || input.changes.length > 0,
      status: validation.status === 'BLOCK' ? 'PREVIEW' : 'AWAITING_CONFIRMATION',
      answer: input.answer,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source: input.source,
    };

    const withPack: PlanProposal = {
      ...draft,
      decisionPack: await this.decisionPack.buildForProposal(draft),
    };
    return {
      ...withPack,
      schemePreview: projectSchemePreview(withPack),
    };
  }

  async buildPlaceCandidateProposal(input: {
    tripId: string;
    userId: string;
    candidateId: string;
    body: PlaceAttractionExploreCandidateDto;
  }): Promise<PlanProposal> {
    const candidate = await this.prisma.tripAttractionExploreCandidate.findFirst({
      where: { id: input.candidateId, tripId: input.tripId },
      include: { Place: true },
    });
    if (!candidate) {
      throw new NotFoundException('候选不存在或不属于该行程');
    }

    const tripDays = await this.loadTripDays(input.tripId);
    const tripDay = resolveTripDayByIndex(tripDays, input.body.dayIndex);
    const dwell = extractPlaceMeta(candidate.Place).suggestedDwellMinutes ?? 90;
    const window = await this.resolveTimeWindow({
      tripDayId: tripDay.id,
      dayDate: tripDay.date,
      startTime: input.body.startTime,
      endTime: input.body.endTime,
      defaultDurationMinutes: dwell,
      insertMode: input.body.insertMode ?? 'append',
      anchorItemId: input.body.anchorItemId,
    });

    const startLabel = this.formatTime(window.startTime);
    const endLabel = this.formatTime(window.endTime);

    const changes: PlanProposalChange[] = [
      {
        operation: 'ADD',
        candidateId: candidate.id,
        placeId: candidate.placeId,
        dayIndex: input.body.dayIndex,
        startTime: startLabel,
        endTime: endLabel,
        label: candidate.Place.nameCN,
        itemType: ItemType.ACTIVITY,
        note: `[景点探索] ${candidate.Place.nameCN}`,
        insertMode: input.body.insertMode ?? 'append',
        anchorItemId: input.body.anchorItemId,
        removeFromCandidates: input.body.removeFromCandidates !== false,
      },
    ];

    if (input.body.removeFromCandidates !== false) {
      changes.push({
        operation: 'REMOVE_CANDIDATE',
        candidateId: candidate.id,
        dayIndex: input.body.dayIndex,
        label: candidate.Place.nameCN,
      });
    }

    return this.build({
      tripId: input.tripId,
      userId: input.userId,
      intent: 'PLACE_CANDIDATE',
      source: { type: 'place_candidate', payload: { candidateId: input.candidateId, ...input.body } },
      changes,
      tradeoffs: [`预计占用 ${startLabel}-${endLabel}`],
    });
  }

  async buildCreateItemProposal(input: {
    tripId: string;
    userId: string;
    body: ArrangeItineraryItemDto;
  }): Promise<PlanProposal> {
    const tripDays = await this.loadTripDays(input.tripId);
    resolveTripDayByIndex(tripDays, input.body.dayIndex);

    const changes: PlanProposalChange[] = [
      {
        operation: 'ADD',
        placeId: input.body.placeId,
        dayIndex: input.body.dayIndex,
        startTime: input.body.startTime,
        endTime: input.body.endTime,
        label: input.body.placeName ?? input.body.note ?? '活动',
        itemType: input.body.type,
        note: input.body.note,
        insertMode: input.body.insertMode ?? 'append',
        anchorItemId: input.body.anchorItemId,
      },
    ];

    return this.build({
      tripId: input.tripId,
      userId: input.userId,
      intent: 'ADD_ITEM',
      source: { type: 'create_item', payload: { ...input.body } },
      changes,
    });
  }

  async buildCreateGapProposal(input: {
    tripId: string;
    userId: string;
    body: ArrangeItineraryGapDto;
  }): Promise<PlanProposal> {
    const changes: PlanProposalChange[] = [
      {
        operation: 'ADD',
        dayIndex: input.body.dayIndex,
        startTime: input.body.startTime,
        endTime: input.body.endTime,
        label: input.body.label?.trim() || '空档 / 休息',
        itemType: ItemType.REST,
        note: input.body.label?.trim() || '空档 / 休息',
      },
    ];

    return this.build({
      tripId: input.tripId,
      userId: input.userId,
      intent: 'INSERT_REST_GAP',
      source: { type: 'create_gap', payload: { ...input.body } },
      changes,
    });
  }

  async buildAutoArrangeProposal(input: {
    tripId: string;
    userId: string;
    candidateIds?: string[];
    dayIndex?: number;
    options?: {
      respectNoNightDrive?: boolean;
      maxDailyDriveMinutes?: number;
      preferWeekendBuffer?: boolean;
    };
  }): Promise<PlanProposal> {
    const rows = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: {
        tripId: input.tripId,
        ...(input.candidateIds?.length ? { id: { in: input.candidateIds } } : {}),
      },
      include: { Place: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const priorityRank: Record<string, number> = {
      must_go: 0,
      very_interested: 1,
      alternative: 2,
    };
    rows.sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        a.sortOrder - b.sortOrder,
    );

    const tripDays = await this.loadTripDays(input.tripId);
    if (rows.length === 0) {
      throw new BadRequestException({
        code: 'NO_CANDIDATES',
        errorCode: 'NO_CANDIDATES',
        message: '当前没有可自动编排的候选景点，请先添加候选',
      });
    }
    if (tripDays.length === 0) {
      throw new BadRequestException({
        code: 'NO_TRIP_DAYS',
        errorCode: 'NO_TRIP_DAYS',
        message: '行程尚无日程天，无法自动编排',
      });
    }

    const preferDayOffset =
      input.dayIndex != null && input.dayIndex >= 1
        ? Math.min(input.dayIndex - 1, tripDays.length - 1)
        : 0;
    const eveningCap = input.options?.respectNoNightDrive === false ? 20 : 17;
    const morningStart = (dayDate: Date) => {
      if (!input.options?.preferWeekendBuffer) return 9;
      const weekday = DateTime.fromJSDate(dayDate, { zone: 'utc' }).weekday; // 1=Mon … 7=Sun
      return weekday >= 6 ? 10 : 9;
    };

    let dayIndex = preferDayOffset;
    let slotHour = morningStart(tripDays[dayIndex % tripDays.length]!.date);
    const changes: PlanProposalChange[] = [];

    for (const row of rows) {
      const tripDay = tripDays[dayIndex % tripDays.length]!;
      const dayNumber = (dayIndex % tripDays.length) + 1;
      const dwell = extractPlaceMeta(row.Place).suggestedDwellMinutes ?? 90;
      const startTime = `${String(slotHour).padStart(2, '0')}:00`;
      const endHour = slotHour + Math.max(1, Math.ceil(dwell / 60));
      const endTime = `${String(Math.min(endHour, 23)).padStart(2, '0')}:00`;

      changes.push({
        operation: 'ADD',
        candidateId: row.id,
        placeId: row.placeId,
        dayIndex: dayNumber,
        startTime,
        endTime,
        label: row.Place.nameCN,
        itemType: ItemType.ACTIVITY,
        note: `[景点探索] ${row.Place.nameCN}`,
        removeFromCandidates: true,
      });
      changes.push({
        operation: 'REMOVE_CANDIDATE',
        candidateId: row.id,
        dayIndex: dayNumber,
        label: row.Place.nameCN,
      });

      slotHour = endHour;
      if (slotHour >= eveningCap) {
        dayIndex += 1;
        slotHour = morningStart(tripDays[dayIndex % tripDays.length]!.date);
      }
    }

    const sourcePayload: Record<string, unknown> = {
      candidateIds: input.candidateIds ?? [],
      dayIndex: input.dayIndex,
      options: input.options,
    };

    const proposal = await this.build({
      tripId: input.tripId,
      userId: input.userId,
      intent: 'AUTO_ARRANGE',
      source: { type: 'auto_arrange', payload: sourcePayload },
      changes,
      benefits: { itemsAdded: rows.length },
      tradeoffs: [
        input.dayIndex != null
          ? `优先落入第 ${input.dayIndex} 天起分配，确认后可再微调`
          : '自动编排按优先级均匀分配到各天，确认后可再微调',
      ],
      answer: `已为 ${rows.length} 个候选生成自动编排草案，请预览后确认写入。`,
    });

    return this.attachAutoArrangeOrtToolsShadow(proposal, changes);
  }

  /**
   * ADR-008 S4 — densest-day VRPTW shadow; never mutates changes.
   * Always attaches ortoolsShadow when Shadow env is on (diagnostic stub if VRPTW cannot run).
   */
  private async attachAutoArrangeOrtToolsShadow(
    proposal: PlanProposal,
    changes: PlanProposalChange[],
  ): Promise<PlanProposal> {
    if (!isOrToolsRepairShadowEnabled() || !resolveOrToolsSolverBaseUrl()) {
      return proposal;
    }

    const addCount = changes.filter((c) => c.operation === 'ADD').length;
    const dayIndex = pickDensestArrangeDay(changes, 1);
    const legacyAdds = dayIndex != null
      ? changes.filter((c) => c.operation === 'ADD' && c.dayIndex === dayIndex)
      : [];

    const withShadow = (
      ortoolsShadow: NonNullable<PlanProposal['ortoolsShadow']>,
    ): PlanProposal => {
      const labNote = formatOrtToolsPlanningLabTradeoff(ortoolsShadow.labCompare);
      return {
        ...proposal,
        ortoolsShadow,
        tradeoffs: labNote
          ? [...proposal.tradeoffs, labNote]
          : proposal.tradeoffs,
      };
    };

    if (dayIndex == null || addCount === 0) {
      this.logger.warn(
        `ortools AUTO_ARRANGE shadow stub: no_add_changes trip=${proposal.tripId}`,
      );
      return withShadow(
        buildOrtToolsPlanningShadowSkippedAttachment({
          tripId: proposal.tripId,
          planningIntent: 'AUTO_ARRANGE',
          authorityProviderId: 'legacy-auto-arrange',
          dayIndex: 0,
          contextVersion: proposal.contextVersion,
          legacyChangeCount: changes.length,
          reason: 'no_add_changes',
        }),
      );
    }

    if (!this.ortoolsPlanningShadow) {
      this.logger.warn(
        `ortools AUTO_ARRANGE shadow stub: bridge_not_injected trip=${proposal.tripId}`,
      );
      return withShadow(
        buildOrtToolsPlanningShadowSkippedAttachment({
          tripId: proposal.tripId,
          planningIntent: 'AUTO_ARRANGE',
          authorityProviderId: 'legacy-auto-arrange',
          dayIndex,
          contextVersion: proposal.contextVersion,
          legacyChangeCount: legacyAdds.length,
          reason: 'bridge_not_injected',
        }),
      );
    }

    const items = planProposalAddsToDayItems({ changes, dayIndex });
    try {
      const ortoolsShadow = await this.ortoolsPlanningShadow.runForAutoArrange({
        tripId: proposal.tripId,
        dayIndex,
        contextVersion: proposal.contextVersion,
        planVersionId: String(proposal.basePlanVersion),
        legacyChanges: legacyAdds,
        items,
      });
      if (ortoolsShadow) return withShadow(ortoolsShadow);

      return withShadow(
        buildOrtToolsPlanningShadowSkippedAttachment({
          tripId: proposal.tripId,
          planningIntent: 'AUTO_ARRANGE',
          authorityProviderId: 'legacy-auto-arrange',
          dayIndex,
          contextVersion: proposal.contextVersion,
          legacyChangeCount: legacyAdds.length,
          reason:
            items.length < 2
              ? 'insufficient_day_nodes_for_routing'
              : 'solver_shadow_null',
        }),
      );
    } catch (err) {
      this.logger.warn(
        `ortools AUTO_ARRANGE shadow skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return withShadow(
        buildOrtToolsPlanningShadowSkippedAttachment({
          tripId: proposal.tripId,
          planningIntent: 'AUTO_ARRANGE',
          authorityProviderId: 'legacy-auto-arrange',
          dayIndex,
          contextVersion: proposal.contextVersion,
          legacyChangeCount: legacyAdds.length,
          reason: 'solver_shadow_error',
        }),
      );
    }
  }

  async buildAiActionProposal(input: {
    tripId: string;
    userId: string;
    body: AttractionExploreAiActionDto;
    answer: string;
  }): Promise<PlanProposal> {
    const intentMap: Record<
      AttractionExploreAiActionDto['action'],
      PlanningIntent
    > = {
      fill_gaps: 'FILL_GAP',
      optimize_route: 'OPTIMIZE_ROUTE',
      arrange_lunch: 'ARRANGE_LUNCH',
      reduce_intensity: 'REDUCE_INTENSITY',
      reduce_driving: 'OPTIMIZE_ROUTE',
      resolve_conflicts: 'OPTIMIZE_ROUTE',
    };

    const intent = intentMap[input.body.action];
    const builderAction =
      input.body.action === 'reduce_driving' ||
      input.body.action === 'resolve_conflicts'
        ? 'optimize_route'
        : input.body.action;

    let changes: PlanProposalChange[] = [];
    let tradeoffs: string[] = [];
    let benefits: PlanProposalBenefits | undefined;
    let optimizeDayIndex: number | undefined;
    let optimizeItems: DayVrptwItemInput[] | undefined;

    if (builderAction === 'fill_gaps') {
      const result = await this.buildFillGapChanges(input.tripId, input.body.dayIndex);
      changes = result.changes;
      tradeoffs = result.tradeoffs;
      benefits = result.benefits;
    } else if (builderAction === 'optimize_route') {
      const result = await this.buildOptimizeRouteChanges(input.tripId, input.body.dayIndex);
      changes = result.changes;
      tradeoffs = result.tradeoffs;
      benefits = result.benefits;
      optimizeDayIndex = result.dayIndex;
      optimizeItems = result.movableItems;
    } else if (builderAction === 'arrange_lunch') {
      const result = await this.buildLunchChanges(input.tripId, input.body.dayIndex);
      changes = result.changes;
      tradeoffs = result.tradeoffs;
    } else if (builderAction === 'reduce_intensity') {
      const result = await this.buildReduceIntensityChanges(input.tripId, input.body.dayIndex);
      changes = result.changes;
      tradeoffs = result.tradeoffs;
      benefits = result.benefits;
    }

    const proposal = await this.build({
      tripId: input.tripId,
      userId: input.userId,
      intent,
      source: { type: 'ai_action', payload: { ...input.body } },
      changes,
      benefits,
      tradeoffs,
      answer: input.answer,
    });

    if (intent === 'OPTIMIZE_ROUTE') {
      return this.attachOptimizeRouteOrtToolsShadow(proposal, {
        dayIndex: optimizeDayIndex,
        items: optimizeItems ?? [],
        legacyChanges: changes,
      });
    }

    return proposal;
  }

  /** ADR-008 S4 — OPTIMIZE_ROUTE shadow; always attach when Shadow env is on. */
  private async attachOptimizeRouteOrtToolsShadow(
    proposal: PlanProposal,
    input: {
      dayIndex?: number;
      items: DayVrptwItemInput[];
      legacyChanges: PlanProposalChange[];
    },
  ): Promise<PlanProposal> {
    if (!isOrToolsRepairShadowEnabled() || !resolveOrToolsSolverBaseUrl()) {
      return proposal;
    }

    const dayIndex = input.dayIndex ?? 0;
    const withShadow = (
      ortoolsShadow: NonNullable<PlanProposal['ortoolsShadow']>,
    ): PlanProposal => {
      const labNote = formatOrtToolsPlanningLabTradeoff(ortoolsShadow.labCompare);
      return {
        ...proposal,
        ortoolsShadow,
        tradeoffs: labNote
          ? [...proposal.tradeoffs, labNote]
          : proposal.tradeoffs,
      };
    };

    if (!this.ortoolsPlanningShadow) {
      return withShadow(
        buildOrtToolsPlanningShadowSkippedAttachment({
          tripId: proposal.tripId,
          planningIntent: 'OPTIMIZE_ROUTE',
          authorityProviderId: 'legacy-optimize-route',
          dayIndex,
          contextVersion: proposal.contextVersion,
          legacyChangeCount: input.legacyChanges.length,
          reason: 'bridge_not_injected',
        }),
      );
    }

    if (input.dayIndex == null || input.items.length === 0) {
      return withShadow(
        buildOrtToolsPlanningShadowSkippedAttachment({
          tripId: proposal.tripId,
          planningIntent: 'OPTIMIZE_ROUTE',
          authorityProviderId: 'legacy-optimize-route',
          dayIndex,
          contextVersion: proposal.contextVersion,
          legacyChangeCount: input.legacyChanges.length,
          reason: 'no_movable_day_items',
        }),
      );
    }

    try {
      const ortoolsShadow = await this.ortoolsPlanningShadow.runForOptimizeRoute({
        tripId: proposal.tripId,
        dayIndex: input.dayIndex,
        contextVersion: proposal.contextVersion,
        planVersionId: String(proposal.basePlanVersion),
        legacyChanges: input.legacyChanges,
        items: input.items,
      });
      if (ortoolsShadow) return withShadow(ortoolsShadow);
      return withShadow(
        buildOrtToolsPlanningShadowSkippedAttachment({
          tripId: proposal.tripId,
          planningIntent: 'OPTIMIZE_ROUTE',
          authorityProviderId: 'legacy-optimize-route',
          dayIndex: input.dayIndex,
          contextVersion: proposal.contextVersion,
          legacyChangeCount: input.legacyChanges.length,
          reason:
            input.items.length < 2
              ? 'insufficient_day_nodes_for_routing'
              : 'solver_shadow_null',
        }),
      );
    } catch (err) {
      this.logger.warn(
        `ortools planning shadow skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return withShadow(
        buildOrtToolsPlanningShadowSkippedAttachment({
          tripId: proposal.tripId,
          planningIntent: 'OPTIMIZE_ROUTE',
          authorityProviderId: 'legacy-optimize-route',
          dayIndex: input.dayIndex,
          contextVersion: proposal.contextVersion,
          legacyChangeCount: input.legacyChanges.length,
          reason: 'solver_shadow_error',
        }),
      );
    }
  }

  private async buildFillGapChanges(
    tripId: string,
    dayIndex?: number,
  ): Promise<{
    changes: PlanProposalChange[];
    tradeoffs: string[];
    benefits?: PlanProposalBenefits;
  }> {
    const tripDays = await this.loadTripDays(tripId);
    const candidates = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: { tripId },
      include: { Place: true },
      orderBy: [{ sortOrder: 'asc' }],
      take: 5,
    });

    const changes: PlanProposalChange[] = [];
    const targetDays = dayIndex
      ? [resolveTripDayByIndex(tripDays, dayIndex)]
      : tripDays.slice(0, 3);

    for (const tripDay of targetDays) {
      const dayNum =
        tripDays.findIndex((d) => d.id === tripDay.id) + 1;
      const gap = await this.findLargestGap(tripDay.id, tripDay.date);
      if (!gap || gap.durationMinutes < 90) continue;

      const candidate = candidates[changes.length];
      if (!candidate) break;

      const dwell = extractPlaceMeta(candidate.Place).suggestedDwellMinutes ?? 90;
      const end = DateTime.fromJSDate(gap.start, { zone: 'utc' })
        .plus({ minutes: Math.min(dwell, gap.durationMinutes - 30) })
        .toJSDate();

      changes.push({
        operation: 'ADD',
        candidateId: candidate.id,
        placeId: candidate.placeId,
        dayIndex: dayNum,
        startTime: this.formatTime(gap.start),
        endTime: this.formatTime(end),
        label: candidate.Place.nameCN,
        itemType: ItemType.ACTIVITY,
        note: `[补全空档] ${candidate.Place.nameCN}`,
        removeFromCandidates: true,
      });
      changes.push({
        operation: 'REMOVE_CANDIDATE',
        candidateId: candidate.id,
        dayIndex: dayNum,
        label: candidate.Place.nameCN,
      });
    }

    return {
      changes,
      tradeoffs:
        changes.length > 0
          ? ['优先利用 90 分钟以上空档，并保留约 30 分钟缓冲']
          : ['未发现足够大的可利用空档'],
      benefits: changes.length > 0 ? { gapsFilled: changes.length / 2 } : undefined,
    };
  }

  private async buildOptimizeRouteChanges(
    tripId: string,
    dayIndex?: number,
  ): Promise<{
    changes: PlanProposalChange[];
    tradeoffs: string[];
    benefits?: PlanProposalBenefits;
    dayIndex?: number;
    movableItems?: DayVrptwItemInput[];
  }> {
    const tripDays = await this.loadTripDays(tripId);
    const targetDay = dayIndex
      ? resolveTripDayByIndex(tripDays, dayIndex)
      : tripDays[0];
    if (!targetDay) {
      return { changes: [], tradeoffs: ['行程尚未创建日程天'] };
    }

    const dayNum = tripDays.findIndex((d) => d.id === targetDay.id) + 1;
    const lockSnapshot = await this.itemLocks.getTripItemLocks(tripId);
    const lockedIds = new Set([
      ...lockSnapshot.lockedItems,
      ...lockSnapshot.semiLockedItems,
    ].map((l) => l.itemId));

    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: targetDay.id, type: ItemType.ACTIVITY },
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true,
        startTime: true,
        endTime: true,
        order: true,
        note: true,
        placeId: true,
        travelFromPreviousDuration: true,
        Place: { select: { nameCN: true } },
      },
    });

    const timedItems = items.filter(
      (item): item is typeof item & { startTime: Date; endTime: Date } =>
        item.startTime != null &&
        item.endTime != null &&
        !lockedIds.has(item.id) &&
        canPlanningAgentMove(
          [...lockSnapshot.lockedItems, ...lockSnapshot.semiLockedItems, ...lockSnapshot.mustVisitItems, ...lockSnapshot.movableItems]
            .find((l) => l.itemId === item.id)?.lockLevel ?? 'movable',
        ),
    );

    if (timedItems.length < 2) {
      return { changes: [], tradeoffs: ['当天活动不足 2 个，暂无可优化顺序'] };
    }

    const movableItems: DayVrptwItemInput[] = timedItems.map((item) => ({
      itemId: item.id,
      label: item.Place?.nameCN ?? item.note ?? '活动',
      startTime: item.startTime,
      endTime: item.endTime,
      placeId: item.placeId ?? undefined,
      travelFromPreviousDurationMin:
        item.travelFromPreviousDuration ?? undefined,
      isBooked: false,
      isMandatory: false,
    }));

    const sorted = [...timedItems].reverse();

    const changes: PlanProposalChange[] = [];
    let cursor = DateTime.fromJSDate(timedItems[0]!.startTime, { zone: 'utc' });

    for (const item of sorted) {
      const duration = DateTime.fromJSDate(item.endTime, { zone: 'utc' }).diff(
        DateTime.fromJSDate(item.startTime, { zone: 'utc' }),
        'minutes',
      ).minutes;
      const start = cursor.toJSDate();
      const end = cursor.plus({ minutes: duration }).toJSDate();

      if (item.id !== sorted[0]?.id || start.getTime() !== item.startTime.getTime()) {
        changes.push({
          operation: 'MOVE',
          itemId: item.id,
          dayIndex: dayNum,
          from: `第 ${dayNum} 天 ${this.formatTime(item.startTime)}`,
          to: `第 ${dayNum} 天 ${this.formatTime(start)}`,
          startTime: this.formatTime(start),
          endTime: this.formatTime(end),
          label: item.Place?.nameCN ?? item.note ?? '活动',
        });
      }

      cursor = cursor.plus({ minutes: duration + 15 });
    }

    return {
      changes,
      tradeoffs: ['按纬度顺序重排以减少折返（草案，确认后可继续微调）'],
      benefits:
        changes.length > 0
          ? { drivingTimeReducedMinutes: Math.min(42, changes.length * 10) }
          : undefined,
      dayIndex: dayNum,
      movableItems,
    };
  }

  private async buildLunchChanges(
    tripId: string,
    dayIndex?: number,
  ): Promise<{ changes: PlanProposalChange[]; tradeoffs: string[] }> {
    const tripDays = await this.loadTripDays(tripId);
    const targetDay = dayIndex
      ? resolveTripDayByIndex(tripDays, dayIndex)
      : tripDays[0];
    if (!targetDay) {
      return { changes: [], tradeoffs: ['行程尚未创建日程天'] };
    }

    const dayNum = tripDays.findIndex((d) => d.id === targetDay.id) + 1;

    return {
      changes: [
        {
          operation: 'ADD',
          dayIndex: dayNum,
          startTime: '12:00',
          endTime: '13:00',
          label: '午餐',
          itemType: ItemType.REST,
          note: '[建议] 午餐时间窗口',
        },
      ],
      tradeoffs: ['餐饮建议为软约束，可按实际路线替换'],
    };
  }

  private async buildReduceIntensityChanges(
    tripId: string,
    dayIndex?: number,
  ): Promise<{
    changes: PlanProposalChange[];
    tradeoffs: string[];
    benefits?: PlanProposalBenefits;
  }> {
    const tripDays = await this.loadTripDays(tripId);
    const targetDay = dayIndex
      ? resolveTripDayByIndex(tripDays, dayIndex)
      : tripDays[Math.min(1, tripDays.length - 1)];
    if (!targetDay) {
      return { changes: [], tradeoffs: ['行程尚未创建日程天'] };
    }

    const dayNum = tripDays.findIndex((d) => d.id === targetDay.id) + 1;
    const lockSnapshot = await this.itemLocks.getTripItemLocks(tripId);
    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: targetDay.id, type: ItemType.ACTIVITY },
      orderBy: [{ startTime: 'desc' }],
      include: { Place: true },
    });

    const movableItems = items.filter((item) => {
      const lock = [
        ...lockSnapshot.lockedItems,
        ...lockSnapshot.semiLockedItems,
        ...lockSnapshot.mustVisitItems,
        ...lockSnapshot.movableItems,
      ].find((l) => l.itemId === item.id);
      return canPlanningAgentMove(lock?.lockLevel ?? 'movable');
    });

    const changes: PlanProposalChange[] = [
      {
        operation: 'ADD',
        dayIndex: dayNum,
        startTime: '15:30',
        endTime: '16:30',
        label: '休息 / 降强度',
        itemType: ItemType.REST,
        note: '[降强度] 增加恢复性空档',
      },
    ];

    const lastItem = movableItems[0];
    if (lastItem?.startTime && lastItem.endTime && dayNum < tripDays.length) {
      const itemStart = lastItem.startTime;
      const itemEnd = lastItem.endTime;
      changes.push({
        operation: 'MOVE',
        itemId: lastItem.id,
        dayIndex: dayNum + 1,
        from: `第 ${dayNum} 天 ${this.formatTime(itemStart)}`,
        to: `第 ${dayNum + 1} 天 10:00`,
        startTime: '10:00',
        endTime: this.formatTime(itemEnd),
        label: lastItem.Place?.nameCN ?? lastItem.note ?? '活动',
      });
    }

    return {
      changes,
      tradeoffs: ['增加休息空档，并将最低优先级活动移至相邻日期（如有）'],
      benefits: { fatigueScoreChange: -12 },
    };
  }

  private async findLargestGap(
    tripDayId: string,
    dayDate: Date,
  ): Promise<{ start: Date; durationMinutes: number } | null> {
    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId },
      orderBy: [{ startTime: 'asc' }],
      select: { startTime: true, endTime: true },
    });

    const dayStart = buildDayDateTime(dayDate, '09:00');
    const dayEnd = buildDayDateTime(dayDate, '18:00');
    const points =
      items.length > 0
        ? items.flatMap((item) => [
            { time: item.startTime, kind: 'start' as const },
            { time: item.endTime, kind: 'end' as const },
          ])
        : [{ time: dayStart, kind: 'end' as const }];

    let best: { start: Date; durationMinutes: number } | null = null;
    let cursor = dayStart;

    for (const item of items) {
      if (!item.startTime || !item.endTime) continue;
      const gapMinutes = DateTime.fromJSDate(item.startTime, { zone: 'utc' }).diff(
        DateTime.fromJSDate(cursor, { zone: 'utc' }),
        'minutes',
      ).minutes;
      if (gapMinutes >= 90 && (!best || gapMinutes > best.durationMinutes)) {
        best = { start: cursor, durationMinutes: gapMinutes };
      }
      cursor = item.endTime > cursor ? item.endTime : cursor;
    }

    const tailGap = DateTime.fromJSDate(dayEnd, { zone: 'utc' }).diff(
      DateTime.fromJSDate(cursor, { zone: 'utc' }),
      'minutes',
    ).minutes;
    if (tailGap >= 90 && (!best || tailGap > best.durationMinutes)) {
      best = { start: cursor, durationMinutes: tailGap };
    }

    void points;
    return best;
  }

  private async loadTripDays(tripId: string) {
    return this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });
  }

  private async resolveTimeWindow(input: {
    tripDayId: string;
    dayDate: Date;
    startTime?: string;
    endTime?: string;
    defaultDurationMinutes: number;
    insertMode: 'append' | 'before' | 'after';
    anchorItemId?: string;
  }): Promise<{ startTime: Date; endTime: Date }> {
    if (input.startTime && input.endTime) {
      return {
        startTime: buildDayDateTime(input.dayDate, input.startTime),
        endTime: buildDayDateTime(input.dayDate, input.endTime),
      };
    }

    if (input.startTime) {
      const start = buildDayDateTime(input.dayDate, input.startTime);
      return {
        startTime: start,
        endTime: DateTime.fromJSDate(start, { zone: 'utc' })
          .plus({ minutes: input.defaultDurationMinutes })
          .toJSDate(),
      };
    }

    const dayItems = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: input.tripDayId },
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
      select: { id: true, endTime: true, startTime: true },
    });

    if (input.insertMode !== 'append' && input.anchorItemId) {
      const anchor = dayItems.find((item) => item.id === input.anchorItemId);
      if (!anchor) throw new NotFoundException('锚点行程项不存在');
      const anchorStart = anchor.startTime
        ? DateTime.fromJSDate(anchor.startTime, { zone: 'utc' })
        : DateTime.fromJSDate(buildDayDateTime(input.dayDate, '09:00'), { zone: 'utc' });
      const anchorEnd = anchor.endTime
        ? DateTime.fromJSDate(anchor.endTime, { zone: 'utc' })
        : anchorStart.plus({ minutes: input.defaultDurationMinutes });
      const start =
        input.insertMode === 'before'
          ? anchorStart.minus({ minutes: input.defaultDurationMinutes }).toJSDate()
          : anchorEnd.toJSDate();
      return {
        startTime: start,
        endTime: DateTime.fromJSDate(start, { zone: 'utc' })
          .plus({ minutes: input.defaultDurationMinutes })
          .toJSDate(),
      };
    }

    const last = dayItems[dayItems.length - 1];
    const start = last?.endTime
      ? DateTime.fromJSDate(last.endTime, { zone: 'utc' }).plus({ minutes: 15 }).toJSDate()
      : buildDayDateTime(input.dayDate, '09:00');

    return {
      startTime: start,
      endTime: DateTime.fromJSDate(start, { zone: 'utc' })
        .plus({ minutes: input.defaultDurationMinutes })
        .toJSDate(),
    };
  }

  private formatTime(value: Date): string {
    return DateTime.fromJSDate(value, { zone: 'utc' }).toFormat('HH:mm');
  }
}
