import { Injectable, NotFoundException } from '@nestjs/common';
import { CostCategory } from '../../../itinerary-items/dto/item-cost.dto';
import { ItemCostService } from '../../../itinerary-items/services/item-cost.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BudgetActualsSnapshot,
  TripBudgetProfile,
} from '../types/trip-budget-os.types';
import {
  parseBudgetConfig,
  resolveBudgetIntent,
  resolveBudgetStructure,
} from '../utils/budget-config.util';
import { BudgetStructureService } from './budget-structure.service';
import { TripBudgetIntentService } from './trip-budget-intent.service';
import { TravelWalletService } from './travel-wallet.service';
import { BudgetStructurePresetService } from './budget-structure-preset.service';
import { TripValueFeedbackService } from './trip-value-feedback.service';

@Injectable()
export class TripBudgetProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intentService: TripBudgetIntentService,
    private readonly structureService: BudgetStructureService,
    private readonly itemCostService: ItemCostService,
    private readonly walletService: TravelWalletService,
    private readonly valueFeedbackService: TripValueFeedbackService,
    private readonly presetService: BudgetStructurePresetService,
  ) {}

  async getProfile(
    tripId: string,
    include: string[] = [],
    options?: { userId?: string },
  ): Promise<TripBudgetProfile> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const config = parseBudgetConfig(trip.budgetConfig);
    const intent = resolveBudgetIntent(config);
    let structure = resolveBudgetStructure(config, intent);

    if (structure) {
      structure = await this.structureService.getStructure(tripId);
    }

    const profile: TripBudgetProfile = {
      tripId,
      intent,
      structure,
      gateStatus: config.gateStatus,
      updatedAt: config.updatedAt ?? trip.updatedAt.toISOString(),
    };

    if (include.includes('actuals')) {
      profile.actuals = await this.buildActualsSnapshot(tripId, intent?.total);
    }

    if (include.includes('wallet')) {
      profile.wallet = await this.walletService.getWallet(tripId);
    }

    if (include.includes('value')) {
      profile.valueSummary = await this.valueFeedbackService.getValueSummary(tripId);
    }

    if (!structure && intent && options?.userId) {
      profile.suggestedStructure = await this.presetService.resolveSuggestedStructure(
        options.userId,
      );
    }

    return profile;
  }

  async buildActualsSnapshot(
    tripId: string,
    intentTotal?: number,
  ): Promise<BudgetActualsSnapshot> {
    const summary = await this.itemCostService.getTripCostSummary(tripId);

    const getActual = (key: CostCategory | string) =>
      summary.byCategory[key]?.actual ?? 0;

    const categoryBreakdown = {
      accommodation: getActual(CostCategory.ACCOMMODATION),
      transportation: getActual(CostCategory.TRANSPORTATION),
      food: getActual(CostCategory.FOOD),
      activities: getActual(CostCategory.ACTIVITIES),
      other: getActual(CostCategory.OTHER),
    };

    let unpaidCount = 0;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: { include: { ItineraryItem: true } },
      },
    });
    if (trip) {
      for (const day of trip.TripDay) {
        for (const item of day.ItineraryItem) {
          const hasCost = (item.estimatedCost ?? 0) > 0 || (item.actualCost ?? 0) > 0;
          if (hasCost && !item.isPaid) unpaidCount++;
        }
      }
    }

    const totalBudget = intentTotal ?? summary.totalBudget;
    const budgetUsagePercent =
      totalBudget > 0
        ? Math.round((summary.totalEstimated / totalBudget) * 1000) / 10
        : undefined;

    return {
      totalEstimated: summary.totalEstimated,
      totalActual: summary.totalActual,
      currency: summary.currency,
      categoryBreakdown,
      unpaidCount,
      budgetUsagePercent,
    };
  }
}
