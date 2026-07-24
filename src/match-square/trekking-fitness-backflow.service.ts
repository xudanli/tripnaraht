import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PreferenceEvolutionService } from '../agent/services/preference-evolution.service';
import { applyPhysicalFailurePenalty } from './engine/trekking-fitness-baseline.engine';
import { TrekkingFitnessBaselineService } from './trekking-fitness-baseline.service';
import type {
  TrekkingFitnessBaseline,
  TrekkingPhysicalFailureEventRecord,
  TrekkingPhysicalFailureEventType,
} from './types/physical-fitness-gate.types';

const EVENTS_KEY = 'physical_fitness_events';

@Injectable()
export class TrekkingFitnessBackflowService {
  private readonly logger = new Logger(TrekkingFitnessBackflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly baselineService: TrekkingFitnessBaselineService,
    @Optional() private readonly preferenceEvolution?: PreferenceEvolutionService,
  ) {}

  /**
   * PRD 3.14 §6 — 行后体能负反馈：Rollback / 下撤 / 救援 → 调低特征矩阵 + Decision DNA
   */
  async recordPhysicalFailureEvent(input: {
    tripId: string;
    subjectUserId: string;
    reporterUserId: string;
    eventType: TrekkingPhysicalFailureEventType;
    evidenceLabel?: string;
  }): Promise<{ baseline: TrekkingFitnessBaseline; event: TrekkingPhysicalFailureEventRecord }> {
    await this.assertTripCollaborator(input.tripId, input.reporterUserId);

    const current = await this.baselineService.resolveForUser(input.subjectUserId);
    const penalized = applyPhysicalFailurePenalty(current, {
      eventType: input.eventType,
      evidenceLabel: input.evidenceLabel,
    });
    penalized.hardTrekMatchPenaltyCount = (current.hardTrekMatchPenaltyCount ?? 0) + 1;

    const event: TrekkingPhysicalFailureEventRecord = {
      tripId: input.tripId,
      subjectUserId: input.subjectUserId,
      eventType: input.eventType,
      evidenceLabel: input.evidenceLabel ?? null,
      at: new Date().toISOString(),
    };

    await this.persistBaselineAndEvent(input.subjectUserId, penalized, event);

    this.preferenceEvolution?.scheduleDecisionDnaSync({
      userId: input.subjectUserId,
      tripId: input.tripId,
      reason: 'TREK_PHYSICAL_FAILURE',
    });

    this.logger.log(
      `[PhysicalBackflow] user=${input.subjectUserId} event=${input.eventType} ascent→${penalized.maxDailyAscentM}m`,
    );

    return { baseline: penalized, event };
  }

  private async persistBaselineAndEvent(
    userId: string,
    baseline: TrekkingFitnessBaseline,
    event: TrekkingPhysicalFailureEventRecord,
  ): Promise<void> {
    const row = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
      select: { extendedProfile: true },
    });
    const ext = (row?.extendedProfile as Record<string, unknown> | null) ?? {};
    const prev = Array.isArray(ext[EVENTS_KEY]) ? (ext[EVENTS_KEY] as TrekkingPhysicalFailureEventRecord[]) : [];
    const extendedProfile = {
      ...ext,
      trekking_fitness_baseline: baseline,
      [EVENTS_KEY]: [event, ...prev].slice(0, 20),
    } as unknown as Prisma.InputJsonValue;

    await this.prisma.userTravelProfile.upsert({
      where: { userId },
      update: { extendedProfile },
      create: {
        userId,
        preferredRouteTypes: [],
        extendedProfile,
        source: 'explicit',
        confidence: 0.85,
      },
    });
  }

  private async assertTripCollaborator(tripId: string, userId: string): Promise<void> {
    const collab = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collab) {
      throw new ForbiddenException('仅行程协作者可上报体能风控事件');
    }
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
    if (!trip) {
      throw new BadRequestException('行程不存在');
    }
  }
}
