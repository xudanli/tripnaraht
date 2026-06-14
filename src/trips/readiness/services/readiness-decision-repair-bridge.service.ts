import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripDecisionEngineService } from '../../decision/trip-decision-engine.service';
import type { TripPlan } from '../../decision/plan-model';
import type { DecisionRunLog } from '../../decision/decision-log';
import {
  buildTripPlanFromPrismaTrip,
  buildTripWorldStateFromPrismaTrip,
  mapReadinessActionToDecisionTrigger,
  type PrismaTripWithDays,
} from '../utils/trip-decision-repair-bridge.util';
import { applyGuardianRepairHintsToState } from '../../decision/repair/guardian-repair-hints.util';
import type { GuardianRepairHints } from '../../decision/repair/guardian-repair-hints.types';
import type { NonTransactionalReplanResult } from '../../../travel-cognition';
import { applyCausalPreAnalysisToWorldState } from '../utils/readiness-causal-preanalysis.util';

@Injectable()
export class ReadinessDecisionRepairBridgeService {
  private readonly logger = new Logger(ReadinessDecisionRepairBridgeService.name);
  private decisionEngine?: TripDecisionEngineService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async executeDecisionRepair(input: {
    tripId: string;
    actionType: string;
    blockerMessage?: string;
    guardianRepairHints?: GuardianRepairHints;
    causalPreAnalysis?: NonTransactionalReplanResult | null;
  }): Promise<{ plan: TripPlan; log: DecisionRunLog }> {
    const engine = this.getDecisionEngine();
    if (!engine) {
      throw new BadRequestException('决策引擎不可用，无法执行计划修复');
    }

    const trip = await this.loadTrip(input.tripId);
    const plan = buildTripPlanFromPrismaTrip(trip);
    const state = buildTripWorldStateFromPrismaTrip(trip);

    if (plan.days.every((day) => day.timeSlots.length === 0)) {
      throw new BadRequestException('行程没有可修复的活动项');
    }

    state.signals = {
      ...state.signals,
      lastUpdatedAt: new Date().toISOString(),
      alerts: [
        {
          code: 'readiness_repair',
          severity: 'warn',
          message: input.blockerMessage || `readiness action: ${input.actionType}`,
        },
      ],
    };

    if (input.guardianRepairHints) {
      applyGuardianRepairHintsToState(state, plan, input.guardianRepairHints);
    }

    if (input.causalPreAnalysis) {
      applyCausalPreAnalysisToWorldState(state, input.causalPreAnalysis);
    }

    const trigger = mapReadinessActionToDecisionTrigger(input.actionType);
    this.logger.debug(
      `executeDecisionRepair trip=${input.tripId} action=${input.actionType} trigger=${trigger}`,
    );

    return engine.repairPlan(state, plan, trigger);
  }

  private getDecisionEngine(): TripDecisionEngineService | null {
    if (this.decisionEngine) {
      return this.decisionEngine;
    }
    try {
      this.decisionEngine = this.moduleRef.get(TripDecisionEngineService, { strict: false });
      return this.decisionEngine;
    } catch (error) {
      this.logger.warn(`TripDecisionEngineService unavailable: ${(error as Error).message}`);
      return null;
    }
  }

  private async loadTrip(tripId: string): Promise<PrismaTripWithDays> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: [{ startTime: 'asc' }, { order: 'asc' }],
              include: {
                Place: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    await this.enrichPlaceCoordinatesFromPostgis(trip as PrismaTripWithDays);
    return trip as PrismaTripWithDays;
  }

  private async enrichPlaceCoordinatesFromPostgis(trip: PrismaTripWithDays): Promise<void> {
    const placeIds = new Set<number>();
    for (const day of trip.TripDay) {
      for (const item of day.ItineraryItem) {
        if (item.placeId) placeIds.add(item.placeId);
      }
    }
    if (placeIds.size === 0) return;

    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
        SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ANY(${[...placeIds]}::int[]) AND location IS NOT NULL
      `;
      const coordById = new Map(rows.map((row) => [row.id, { lat: row.lat, lng: row.lng }]));

      for (const day of trip.TripDay) {
        for (const item of day.ItineraryItem) {
          if (!item.Place || !item.placeId) continue;
          const coords = coordById.get(item.placeId);
          if (!coords) continue;
          const meta = (item.Place.metadata ?? {}) as Record<string, unknown>;
          if (meta.coordinates) continue;
          item.Place.metadata = { ...meta, coordinates: coords };
        }
      }
    } catch (error) {
      this.logger.debug(`PostGIS coordinate enrich skipped: ${(error as Error).message}`);
    }
  }
}
