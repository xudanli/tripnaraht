import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CostCategory } from '../../../itinerary-items/dto/item-cost.dto';
import { ItemCostService } from '../../../itinerary-items/services/item-cost.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BudgetStructure,
  PutBudgetStructureInput,
  STRUCTURE_MISMATCH_THRESHOLD,
  StructureVsActualEntry,
  TripBudgetIntent,
} from '../types/trip-budget-os.types';
import {
  parseBudgetConfig,
  resolveBudgetIntent,
  resolveBudgetStructure,
} from '../utils/budget-config.util';
import {
  normalizeAllocations,
  resolveStructureAllocations,
} from '../utils/budget-structure.util';
import { inferSpendingPersona } from '../utils/spending-persona.util';
import { toInputJsonValue } from '../utils/prisma-json.util';
import { TripBudgetIntentService } from './trip-budget-intent.service';

const STRUCTURE_CATEGORY_MAP: Record<string, keyof ReturnType<typeof normalizeAllocations>> = {
  ACCOMMODATION: 'accommodation',
  accommodation: 'accommodation',
  TRANSPORTATION: 'transportation',
  transportation: 'transportation',
  FOOD: 'food',
  food: 'food',
  ACTIVITIES: 'experience',
  activities: 'experience',
  experience: 'experience',
  OTHER: 'other',
  other: 'other',
};

@Injectable()
export class BudgetStructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intentService: TripBudgetIntentService,
    private readonly itemCostService: ItemCostService,
  ) {}

  async getStructure(tripId: string): Promise<BudgetStructure | null> {
    const trip = await this.requireTrip(tripId);
    const config = parseBudgetConfig(trip.budgetConfig);
    const intent = resolveBudgetIntent(config);
    const structure = resolveBudgetStructure(config, intent);
    if (!structure) return null;

    return this.enrichStructure(tripId, structure, intent);
  }

  async setStructure(
    tripId: string,
    input: PutBudgetStructureInput,
  ): Promise<BudgetStructure> {
    const intent = await this.intentService.getIntent(tripId);
    if (!intent) {
      throw new BadRequestException('请先设置 L1 总预算（budget/intent）');
    }

    let allocations;
    let percentages;
    try {
      ({ allocations, percentages } = resolveStructureAllocations(input, intent));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const persona = inferSpendingPersona(allocations, intent.total);
    const structure: BudgetStructure = {
      mode: input.mode,
      allocations,
      percentages,
      spendingPersona: persona.spendingPersona,
      personaConfidence: persona.personaConfidence,
      updatedAt: new Date().toISOString(),
    };

    const trip = await this.requireTrip(tripId);
    const config = parseBudgetConfig(trip.budgetConfig);
    const updated = {
      ...config,
      budgetStructure: structure,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { budgetConfig: toInputJsonValue(updated) },
    });

    return this.enrichStructure(tripId, structure, intent);
  }

  async buildStructureVsActual(
    tripId: string,
    structure: BudgetStructure,
  ): Promise<Record<string, StructureVsActualEntry>> {
    const costSummary = await this.itemCostService.getTripCostSummary(tripId);
    const result: Record<string, StructureVsActualEntry> = {};

    for (const [apiKey, allocKey] of [
      ['accommodation', 'accommodation'],
      ['transportation', 'transportation'],
      ['experience', 'experience'],
      ['food', 'food'],
      ['other', 'other'],
    ] as const) {
      const intent = structure.allocations[allocKey] ?? 0;
      const categoryKey =
        allocKey === 'experience' ? CostCategory.ACTIVITIES : allocKey.toUpperCase();
      const cat = costSummary.byCategory[categoryKey] ?? costSummary.byCategory[allocKey];
      const estimated = cat?.estimated ?? 0;
      const actual = cat?.actual ?? 0;
      result[apiKey] = {
        intent,
        estimated,
        actual,
        variance: estimated - intent,
      };
    }

    return result;
  }

  /** Evaluate structure mismatch violations for gate */
  evaluateStructureMismatch(
    structure: BudgetStructure,
    categoryBreakdown: Record<string, number>,
  ): Array<{ category: string; intentAmount: number; estimatedAmount: number; variancePercent: number }> {
    const mismatches: Array<{
      category: string;
      intentAmount: number;
      estimatedAmount: number;
      variancePercent: number;
    }> = [];

    const intentByCategory = {
      accommodation: structure.allocations.accommodation,
      transportation: structure.allocations.transportation,
      experience: structure.allocations.experience,
      food: structure.allocations.food,
      other: structure.allocations.other ?? 0,
    };

    const estimatedByCategory = {
      accommodation: categoryBreakdown.accommodation ?? 0,
      transportation: categoryBreakdown.transportation ?? 0,
      experience: categoryBreakdown.activities ?? categoryBreakdown.experience ?? 0,
      food: categoryBreakdown.food ?? 0,
      other: categoryBreakdown.other ?? 0,
    };

    for (const category of Object.keys(intentByCategory) as (keyof typeof intentByCategory)[]) {
      const intentAmount = intentByCategory[category];
      if (intentAmount <= 0) continue;
      const estimatedAmount = estimatedByCategory[category];
      const variancePercent = Math.abs(estimatedAmount - intentAmount) / intentAmount;
      if (variancePercent > STRUCTURE_MISMATCH_THRESHOLD) {
        mismatches.push({ category, intentAmount, estimatedAmount, variancePercent });
      }
    }

    return mismatches;
  }

  private async enrichStructure(
    tripId: string,
    structure: BudgetStructure,
    intent: TripBudgetIntent | null,
  ): Promise<BudgetStructure> {
    const persona =
      structure.spendingPersona && structure.personaConfidence != null
        ? { spendingPersona: structure.spendingPersona, personaConfidence: structure.personaConfidence }
        : inferSpendingPersona(structure.allocations, intent?.total ?? 0);

    const structureVsActual = await this.buildStructureVsActual(tripId, structure);

    return {
      ...structure,
      spendingPersona: persona.spendingPersona,
      personaConfidence: persona.personaConfidence,
      structureVsActual,
    };
  }

  private async requireTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    return trip;
  }
}

export { STRUCTURE_CATEGORY_MAP };
