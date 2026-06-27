import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { StructureOverflowException } from '../exceptions/structure-overflow.exception';
import {
  BUDGET_OS_MAX_TOTAL,
  BUDGET_OS_MIN_TOTAL,
  BUDGET_OS_SUPPORTED_CURRENCIES,
  PutBudgetIntentInput,
  TripBudgetIntent,
} from '../types/trip-budget-os.types';
import {
  dualWriteLegacyTotals,
  parseBudgetConfig,
  resolveBudgetIntent,
  resolveBudgetStructure,
} from '../utils/budget-config.util';
import { sumAllocations } from '../utils/budget-structure.util';
import { toInputJsonValue } from '../utils/prisma-json.util';
import { bumpConstraintsVersion, snapshotConstraintsMeta } from '../../trip-constraint-solver/utils/constraints-metadata.util';

@Injectable()
export class TripBudgetIntentService {
  constructor(private readonly prisma: PrismaService) {}

  async getIntent(tripId: string): Promise<TripBudgetIntent | null> {
    const trip = await this.requireTrip(tripId);
    const config = parseBudgetConfig(trip.budgetConfig);
    return resolveBudgetIntent(config);
  }

  async setIntent(
    tripId: string,
    input: PutBudgetIntentInput,
    source: TripBudgetIntent['source'] = 'user',
  ): Promise<TripBudgetIntent & { constraints: ReturnType<typeof snapshotConstraintsMeta> }> {
    const trip = await this.requireTrip(tripId);
    this.validateIntentInput(input);

    const config = parseBudgetConfig(trip.budgetConfig);
    const structure = resolveBudgetStructure(config, resolveBudgetIntent(config));

    if (structure) {
      const structureTotal = sumAllocations(structure.allocations);
      if (structureTotal > input.total) {
        throw new StructureOverflowException(structureTotal, input.total);
      }
    }

    const dailyBudget =
      input.dailyBudget === null || input.dailyBudget === undefined
        ? this.computeDailyBudget(trip, input.total)
        : input.dailyBudget;

    const intent: TripBudgetIntent = {
      total: input.total,
      currency: input.currency ?? config.currency ?? 'CNY',
      dailyBudget,
      source,
      setAt: new Date().toISOString(),
    };

    const updated = dualWriteLegacyTotals(config, intent);
    if (!updated.createdAt) {
      updated.createdAt = new Date().toISOString();
    }

    const bumpedMeta = bumpConstraintsVersion(trip.metadata);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        budgetConfig: toInputJsonValue(updated),
        metadata: toInputJsonValue(bumpedMeta),
      },
    });

    return {
      ...intent,
      constraints: snapshotConstraintsMeta(bumpedMeta),
    };
  }

  async deleteIntent(tripId: string): Promise<void> {
    const trip = await this.requireTrip(tripId);
    const config = parseBudgetConfig(trip.budgetConfig);

    const updated = {
      ...config,
      budgetIntent: undefined,
      totalBudget: null,
      total: null,
      dailyBudget: null,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { budgetConfig: toInputJsonValue(updated) },
    });
  }

  /** Legacy constraint POST shim — total only */
  async upsertFromLegacyConstraint(
    tripId: string,
    input: PutBudgetIntentInput & { alertThreshold?: number },
  ): Promise<TripBudgetIntent> {
    const intent = await this.setIntent(tripId, input, 'user');

    if (input.alertThreshold !== undefined) {
      const refreshed = parseBudgetConfig(
        (await this.prisma.trip.findUnique({ where: { id: tripId } }))?.budgetConfig,
      );
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          budgetConfig: toInputJsonValue({
            ...refreshed,
            alertThreshold: input.alertThreshold,
            updatedAt: new Date().toISOString(),
          }),
        },
      });
    }

    return intent;
  }

  private validateIntentInput(input: PutBudgetIntentInput): void {
    if (input.total < BUDGET_OS_MIN_TOTAL || input.total > BUDGET_OS_MAX_TOTAL) {
      throw new BadRequestException(
        `预算范围必须在 ${BUDGET_OS_MIN_TOTAL} - ${BUDGET_OS_MAX_TOTAL} 之间`,
      );
    }
    const currency = input.currency ?? 'CNY';
    if (!BUDGET_OS_SUPPORTED_CURRENCIES.includes(currency as (typeof BUDGET_OS_SUPPORTED_CURRENCIES)[number])) {
      throw new BadRequestException(
        `不支持的货币单位: ${currency}。支持: ${BUDGET_OS_SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }
  }

  private computeDailyBudget(trip: { startDate: Date; endDate: Date }, total: number): number {
    const start = DateTime.fromJSDate(trip.startDate);
    const end = DateTime.fromJSDate(trip.endDate);
    const days = Math.floor(end.diff(start, 'days').days) + 1;
    return days > 0 ? Math.round((total / days) * 100) / 100 : 0;
  }

  private async requireTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    return trip;
  }
}
