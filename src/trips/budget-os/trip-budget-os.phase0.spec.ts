import { BadRequestException } from '@nestjs/common';
import { BudgetStructureService } from './services/budget-structure.service';
import { TripBudgetIntentService } from './services/trip-budget-intent.service';
import { TripBudgetProfileService } from './services/trip-budget-profile.service';
import { BudgetEvaluationService } from '../services/budget-evaluation.service';
import { TripBudgetService } from '../services/trip-budget.service';
import { StructureOverflowException } from './exceptions/structure-overflow.exception';
import { TravelWalletService } from './services/travel-wallet.service';

describe('Trip Budget OS Phase 0', () => {
  const tripId = 'trip-phase0';
  const baseTrip = {
    id: tripId,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-07'),
    budgetConfig: null as unknown,
    updatedAt: new Date('2026-06-16'),
  };

  let budgetConfig: Record<string, unknown>;
  let prisma: {
    trip: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let itemCostService: { getTripCostSummary: jest.Mock };

  let intentService: TripBudgetIntentService;
  let structureService: BudgetStructureService;
  let profileService: TripBudgetProfileService;
  let evaluationService: BudgetEvaluationService;
  let tripBudgetService: TripBudgetService;

  beforeEach(() => {
    budgetConfig = {};
    prisma = {
      trip: {
        findUnique: jest.fn(async () => ({
          ...baseTrip,
          budgetConfig,
          TripDay: [],
        })),
        update: jest.fn(async ({ data }: { data: { budgetConfig: Record<string, unknown> } }) => {
          budgetConfig = data.budgetConfig;
          return { ...baseTrip, budgetConfig };
        }),
      },
      tripCollaborator: {
        findMany: jest.fn(async () => []),
      },
    };
    itemCostService = {
      getTripCostSummary: jest.fn(async () => ({
        totalBudget: 10000,
        totalEstimated: 4200,
        totalActual: 0,
        totalPaid: 0,
        totalUnpaid: 4200,
        currency: 'CNY',
        byCategory: {
          ACCOMMODATION: { estimated: 4200, actual: 0, count: 1 },
          TRANSPORTATION: { estimated: 0, actual: 0, count: 0 },
          FOOD: { estimated: 0, actual: 0, count: 0 },
          ACTIVITIES: { estimated: 0, actual: 0, count: 0 },
          OTHER: { estimated: 0, actual: 0, count: 0 },
        },
        byDay: [],
        variance: { amount: -5800, percentage: -58, status: 'UNDER_BUDGET' },
        budgetUsagePercent: 42,
      })),
    };

    intentService = new TripBudgetIntentService(prisma as never);
    structureService = new BudgetStructureService(
      prisma as never,
      intentService,
      itemCostService as never,
    );
    profileService = new TripBudgetProfileService(
      prisma as never,
      intentService,
      structureService,
      itemCostService as never,
      { getWallet: jest.fn() } as never,
      { getValueSummary: jest.fn() } as never,
      {
        resolveSuggestedStructure: jest.fn(async () => ({
          mode: 'percent' as const,
          percentages: {
            transportation: 25,
            accommodation: 25,
            experience: 25,
            food: 20,
            other: 5,
          },
          spendingPersona: 'balanced' as const,
          source: 'canonical' as const,
        })),
      } as never,
    );
    tripBudgetService = new TripBudgetService(prisma as never, intentService);

    const walletService = {
      hasPaymentRule: jest.fn(async () => false),
    } as unknown as TravelWalletService;

    const decisionLogService = {
      appendLog: jest.fn(async () => undefined),
      listLogs: jest.fn(async () => ({ items: [], total: 0 })),
      getLatestLog: jest.fn(async () => null),
    };

    evaluationService = new BudgetEvaluationService(
      prisma as never,
      tripBudgetService,
      intentService,
      structureService,
      walletService,
      decisionLogService as never,
      { remove: jest.fn() } as never,
      { getProfile: jest.fn() } as never,
    );
  });

  it('scenario 1: PUT intent 10000 → profile shows L1=10000', async () => {
    await intentService.setIntent(tripId, { total: 10000, currency: 'CNY' });
    const profile = await profileService.getProfile(tripId);
    expect(profile.intent?.total).toBe(10000);
    expect(profile.intent?.currency).toBe('CNY');
  });

  it('scenario 2: PUT structure sum=10000 → experience persona', async () => {
    await intentService.setIntent(tripId, { total: 10000, currency: 'CNY' });
    const structure = await structureService.setStructure(tripId, {
      mode: 'absolute',
      allocations: {
        transportation: 3000,
        accommodation: 500,
        experience: 5000,
        food: 1500,
        other: 0,
      },
    });
    expect(structure.spendingPersona).toBe('experience');
    expect(structure.allocations.experience).toBe(5000);
  });

  it('scenario 3: structure overflow when lowering L1', async () => {
    await intentService.setIntent(tripId, { total: 12000, currency: 'CNY' });
    await structureService.setStructure(tripId, {
      mode: 'absolute',
      allocations: {
        transportation: 3000,
        accommodation: 500,
        experience: 7000,
        food: 1500,
        other: 0,
      },
    });
    await expect(
      intentService.setIntent(tripId, { total: 10000, currency: 'CNY' }),
    ).rejects.toBeInstanceOf(StructureOverflowException);
  });

  it('scenario 4: evaluate STRUCTURE_MISMATCH + NEED_CONFIRM for hotel overrun', async () => {
    await intentService.setIntent(tripId, { total: 10000, currency: 'CNY' });
    await structureService.setStructure(tripId, {
      mode: 'absolute',
      allocations: {
        transportation: 3000,
        accommodation: 500,
        experience: 5000,
        food: 1500,
        other: 0,
      },
    });

    const result = await evaluationService.evaluateBudget({
      planId: 'plan-1',
      tripId,
      estimatedCost: 4200,
      categoryBreakdown: {
        accommodation: 4200,
        transportation: 0,
        food: 0,
        activities: 0,
        other: 0,
      },
      budgetConstraint: { total: 10000, currency: 'CNY' },
    });

    expect(result.verdict).toBe('NEED_CONFIRM');
    expect(result.budgetViolations?.some((v) => v.type === 'STRUCTURE_MISMATCH')).toBe(true);
    expect(result.budgetViolations?.some((v) => v.category === 'accommodation')).toBe(true);
  });

  it('scenario 5: legacy constraint total-only dual-writes L1', async () => {
    const constraint = await tripBudgetService.setBudgetConstraint(tripId, {
      total: 8000,
      currency: 'CNY',
    });
    expect(constraint.total).toBe(8000);
    const intent = await intentService.getIntent(tripId);
    expect(intent?.total).toBe(8000);
  });

  it('rejects legacy categoryLimits write', async () => {
    await expect(
      tripBudgetService.setBudgetConstraint(tripId, {
        total: 8000,
        categoryLimits: { accommodation: 3000 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
