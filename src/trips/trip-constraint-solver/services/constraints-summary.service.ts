import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripBudgetProfileService } from '../../budget-os/services/trip-budget-profile.service';
import { parseBudgetConfig, resolveBudgetIntent } from '../../budget-os/utils/budget-config.util';
import { ItineraryItemsService } from '../../../itinerary-items/itinerary-items.service';
import { TeamFitAssessmentService } from './team-fit-assessment.service';
import type {
  ConfirmConstraintsBodyDto,
  ConfirmConstraintsResponse,
  ConstraintsSummaryResponse,
} from '../types/constraints-summary.types';
import {
  applyConstraintsConfirm,
  getConstraintsVersion,
  isConstraintsVersionConfirmed,
  readConstraintsMetadata,
} from '../utils/constraints-metadata.util';
import {
  buildPendingItems,
  computeAllReady,
  resolveBudgetStatus,
  resolveEffectiveTravelMode,
  resolveTransportStatus,
  resolveTravelerCount,
  resolveTravelersStatus,
} from '../utils/constraints-summary.util';

@Injectable()
export class ConstraintsSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetProfile: TripBudgetProfileService,
    private readonly teamFitAssessment: TeamFitAssessmentService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async getSummary(tripId: string): Promise<ConstraintsSummaryResponse> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: { orderBy: { date: 'asc' }, select: { id: true } },
        TripCollaborator: { select: { userId: true } },
      },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const constraintsMeta = readConstraintsMetadata(trip.metadata);
    const { intent, gateStatus } = await this.resolveBudget(tripId, trip.budgetConfig);
    const pacing = (trip.pacingConfig as Record<string, unknown> | null) ?? {};
    const travelMode = resolveEffectiveTravelMode(trip.pacingConfig);
    const transportHint =
      typeof pacing.transport === 'string' ? pacing.transport : null;

    const travelerCount = resolveTravelerCount({
      pacingConfig: trip.pacingConfig,
      metadata: trip.metadata,
      budgetConfig: trip.budgetConfig,
    });
    const memberCount = trip.TripCollaborator.length;
    const teamFit = await this.teamFitAssessment.assessForTrip(tripId, []);

    const sampleSegment = await this.loadFirstTravelSample(tripId, trip.TripDay[0]?.id);

    const timeRange = {
      startDate: trip.startDate?.toISOString() ?? null,
      endDate: trip.endDate?.toISOString() ?? null,
      dayCount: trip.TripDay.length,
      status: trip.startDate && trip.endDate ? ('confirmed' as const) : ('missing' as const),
    };

    const budget = {
      total: intent?.total ?? null,
      currency: intent?.currency ?? 'CNY',
      ...(gateStatus != null ? { gateStatus } : {}),
      status: resolveBudgetStatus({ total: intent?.total ?? null, gateStatus }),
    };

    const travelers = {
      count: travelerCount,
      memberCount,
      profilingCompletedCount: teamFit.profilingCompletedCount,
      status: resolveTravelersStatus(travelerCount, memberCount),
    };

    const transport = {
      travelMode,
      transportHint,
      sampleSegment,
      status: resolveTransportStatus({
        travelMode,
        sampleTravelMode: sampleSegment?.travelMode,
        sampleDistanceMeters: sampleSegment?.distance,
      }),
    };

    const pendingItems = buildPendingItems({ timeRange, budget, travelers, transport });
    const allReady = computeAllReady({ timeRange, budget, travelers, transport });
    const confirmedAt = constraintsMeta.constraintsConfirmedAt ?? null;

    return {
      tripId,
      constraintsVersion: getConstraintsVersion(trip.metadata),
      confirmedAt,
      confirmedBy: constraintsMeta.constraintsConfirmedBy ?? null,
      isUserConfirmed: confirmedAt != null && allReady,
      isVersionConfirmed: isConstraintsVersionConfirmed(trip.metadata),
      allReady,
      pendingCount: pendingItems.length,
      timeRange,
      budget,
      travelers,
      transport,
      pendingItems,
    };
  }

  async confirmConstraints(
    tripId: string,
    userId: string,
    body: ConfirmConstraintsBodyDto,
  ): Promise<ConfirmConstraintsResponse> {
    const summary = await this.getSummary(tripId);
    if (!summary.allReady) {
      throw new BadRequestException({
        code: 'CONSTRAINTS_NOT_READY',
        message: '仍有待确认或待对齐的约束项，无法确认',
        pendingItems: summary.pendingItems,
      });
    }

    const currentVersion = summary.constraintsVersion;
    if (
      body.constraintsVersion != null &&
      body.constraintsVersion !== currentVersion
    ) {
      throw new ConflictException({
        code: 'CONSTRAINTS_STALE',
        message: `约束已变更（当前 version=${currentVersion}）`,
        currentVersion,
      });
    }

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const metadata = applyConstraintsConfirm(trip.metadata, userId);
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: metadata as object },
    });

    return {
      constraintsConfirmedAt: metadata.constraintsConfirmedAt as string,
      constraintsConfirmedBy: userId,
      constraintsVersion: currentVersion,
      isUserConfirmed: true,
    };
  }

  private async loadFirstTravelSample(
    tripId: string,
    dayId?: string,
  ): Promise<ConstraintsSummaryResponse['transport']['sampleSegment'] | undefined> {
    if (!dayId) return undefined;

    try {
      const items = this.moduleRef.get(ItineraryItemsService, { strict: false });
      if (!items) return undefined;

      const info = await items.getDayTravelInfo(tripId, dayId);
      const seg =
        info.segments.find((s) => (s.duration ?? 0) > 0) ?? info.segments[0];
      if (!seg) return undefined;

      return {
        duration: seg.duration,
        distance: seg.distance,
        travelMode: seg.travelMode,
        fromPlace: seg.fromPlace,
        toPlace: seg.toPlace,
      };
    } catch {
      return undefined;
    }
  }

  /** 与 GET /budget/profile 同源；失败时回退 budgetConfig 解析，避免整条 BFF 500 */
  private async resolveBudget(
    tripId: string,
    budgetConfigRaw: unknown,
  ): Promise<{
    intent: ReturnType<typeof resolveBudgetIntent>;
    gateStatus: 'ALLOW' | 'NEED_CONFIRM' | 'NEED_ADJUST' | 'REJECT' | null;
  }> {
    try {
      const profile = await this.budgetProfile.getProfile(tripId);
      return {
        intent: profile.intent,
        gateStatus: profile.gateStatus?.verdict ?? null,
      };
    } catch {
      const config = parseBudgetConfig(budgetConfigRaw);
      return {
        intent: resolveBudgetIntent(config),
        gateStatus: config.gateStatus?.verdict ?? null,
      };
    }
  }
}
