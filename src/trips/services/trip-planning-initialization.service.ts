import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { InitializeTripPlanningDto } from '../dto/initialize-trip-planning.dto';
import { MobilityTag, TravelerDto, TripPace } from '../dto/create-trip.dto';
import { TripStatus } from '../dto/trip-status.dto';
import { PacingCalculator } from '../utils/pacing-calculator.util';
import { TripDraftGenerationService } from './trip-draft-generation.service';

@Injectable()
export class TripPlanningInitializationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripDraftGenerationService: TripDraftGenerationService,
  ) {}

  async initialize(tripId: string, userId: string, dto: InitializeTripPlanningDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: true, TripDay: true },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    if (!trip.TripCollaborator.some((c) => c.userId === userId)) {
      throw new ForbiddenException('无权初始化该行程');
    }

    const metadata = ((trip.metadata as Record<string, any>) || {}) as Record<string, any>;
    const nlDraft = (metadata.nlDraft || {}) as Record<string, any>;
    const partial = (nlDraft.partialParams || {}) as Record<string, any>;
    const destination = dto.destinationCountryCode || partial.destinationCountryCode || nlDraft.destinationCountryCode || trip.destination;
    const startDate = dto.startDate;
    const endDate = dto.endDate;
    const missing = [
      !destination || destination === 'UNSPECIFIED' ? 'destinationCountryCode' : undefined,
      !startDate ? 'startDate' : undefined,
      !endDate ? 'endDate' : undefined,
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      return {
        initialized: false,
        tripId,
        lifecycleStatus: metadata.lifecycleStatus || 'IDEA_CAPTURED',
        planningReadiness: 'PARTIAL',
        feasibilityStatus: metadata.feasibilityStatus || 'NOT_CHECKED',
        missingFields: missing,
        message: 'Draft Trip 已存在，但还缺少初始化规划结构所需的信息。',
      };
    }

    const start = DateTime.fromISO(startDate!);
    const end = DateTime.fromISO(endDate!);
    if (!start.isValid || !end.isValid || end < start) {
      throw new BadRequestException('startDate/endDate 必须是有效日期，且结束日期不能早于开始日期');
    }

    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
    const travelers = this.resolveTravelers(dto.travelers, partial);
    const pacingConfig = this.buildPacingConfig(travelers, dto.pace || partial.pace);
    const budgetConfig = this.buildBudgetConfig(dto, durationDays, travelers);
    const updatedMetadata = {
      ...metadata,
      lifecycleStatus: 'INTENT_UNDERSTOOD',
      planningReadiness: 'READY_FOR_ITINERARY',
      feasibilityStatus: metadata.feasibilityStatus || 'NOT_CHECKED',
      planningStages: {
        ...(metadata.planningStages || {}),
        tripDaysInitialized: true,
        strategyGenerated: Boolean(metadata.planningStages?.strategyGenerated),
        itineraryGenerated: false,
        feasibilityChecked: false,
      },
      nlDraft: {
        ...nlDraft,
        placeholderDates: false,
        initializedAt: new Date().toISOString(),
      },
    };

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          destination: String(destination).toUpperCase().trim(),
          startDate: start.toJSDate(),
          endDate: end.toJSDate(),
          status: TripStatus.PLANNING,
          pacingConfig: pacingConfig as any,
          budgetConfig: budgetConfig as any,
          metadata: updatedMetadata as any,
          updatedAt: new Date(),
        } as any,
      });

      if (trip.TripDay.length === 0) {
        for (let i = 0; i < durationDays; i++) {
          await tx.tripDay.create({
            data: {
              id: randomUUID(),
              tripId,
              date: start.plus({ days: i }).toJSDate(),
            } as any,
          });
        }
      }

      return tx.trip.findUnique({
        where: { id: tripId },
        include: { TripDay: { orderBy: { date: 'asc' } } },
      });
    });

    this.tripDraftGenerationService.startAsync(tripId, {
      destination: String(destination).toUpperCase().trim(),
      days: durationDays,
      startDate: start.toISODate()!,
      endDate: end.toISODate()!,
      style: typeof partial.travelStyle === 'string' ? partial.travelStyle : 'balanced',
      intensity: 'balanced',
      pace: dto.pace || partial.pace,
      useAlgorithmicDraft: process.env.USE_LLM_DRAFT !== 'true',
      draftRuntimeMode: process.env.USE_LLM_DRAFT === 'true' ? 'HYBRID' : 'ALGO',
      mustHavePois: Array.isArray(partial.mustHaveExperiences) ? partial.mustHaveExperiences : undefined,
      userInput: typeof nlDraft.rawUserIntent === 'string' ? nlDraft.rawUserIntent : undefined,
    } as any);

    return {
      initialized: true,
      trip: result,
      tripId,
      lifecycleStatus: 'INTENT_UNDERSTOOD',
      planningReadiness: 'READY_FOR_ITINERARY',
      feasibilityStatus: updatedMetadata.feasibilityStatus,
      daysCreated: trip.TripDay.length === 0 ? durationDays : 0,
      generationQueued: true,
      message: '规划结构已初始化，已开始后台生成 POI 行程项。',
    };
  }

  private resolveTravelers(input: TravelerDto[] | undefined, partial: Record<string, any>): TravelerDto[] {
    if (input?.length) return input;
    const travelers: TravelerDto[] = [];
    const companions = Array.isArray(partial.companions) ? partial.companions : [];
    if (companions.includes('PARENTS')) {
      travelers.push({ type: 'ELDERLY', mobilityTag: MobilityTag.ACTIVE_SENIOR });
    }
    if (companions.includes('CHILDREN')) {
      travelers.push({ type: 'CHILD', mobilityTag: MobilityTag.CITY_POTATO });
    }
    travelers.unshift({ type: 'ADULT', mobilityTag: MobilityTag.CITY_POTATO });
    return travelers;
  }

  private buildPacingConfig(travelers: TravelerDto[], pace?: string) {
    const base = PacingCalculator.calculateShortestStave(travelers);
    const normalized = String(pace || '').toLowerCase();
    const level =
      normalized === 'relaxed'
        ? TripPace.RELAXED
        : normalized === 'intensive' || normalized === 'tight'
          ? TripPace.TIGHT
          : normalized === 'moderate' || normalized === 'standard'
            ? TripPace.STANDARD
            : undefined;
    if (!level) return base;
    const maxDailyActivities = level === TripPace.RELAXED ? 3 : level === TripPace.TIGHT ? 7 : 5;
    return { ...base, level, maxDailyActivities };
  }

  private buildBudgetConfig(dto: InitializeTripPlanningDto, durationDays: number, travelers: TravelerDto[]) {
    if (dto.totalBudget == null) {
      return {
        currency: dto.currency || 'CNY',
        budgetKnown: false,
        travelers,
      };
    }
    const dailyBudget = dto.totalBudget / Math.max(durationDays, 1);
    return {
      totalBudget: dto.totalBudget,
      total: dto.totalBudget,
      currency: dto.currency || 'CNY',
      daily_budget: Math.round(dailyBudget),
      budgetKnown: true,
      travelers,
    };
  }
}
