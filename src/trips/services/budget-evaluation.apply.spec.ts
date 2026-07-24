import { BadRequestException } from '@nestjs/common';
import { BudgetEvaluationService } from './budget-evaluation.service';

describe('BudgetEvaluationService.applyBudgetOptimizations', () => {
  const tripId = 'trip-apply';
  const planId = 'plan-apply';

  let budgetConfig: Record<string, unknown>;
  let prisma: {
    trip: { findUnique: jest.Mock; update: jest.Mock };
    itineraryItem: { findUnique: jest.Mock; update: jest.Mock };
  };
  let itineraryItemsService: { remove: jest.Mock };
  let tripBudgetService: { getBudgetSummary: jest.Mock };

  let service: BudgetEvaluationService;

  beforeEach(() => {
    budgetConfig = {
      pendingOptimizations: {
        [planId]: [
          {
            id: 'opt-1',
            type: 'REDUCE',
            action: '下调酒店',
            impact: '缓解住宿偏差',
            estimatedSavings: 500,
            itemId: 'item-1',
          },
        ],
      },
    };

    prisma = {
      trip: {
        findUnique: jest.fn(async () => ({
          id: tripId,
          budgetConfig,
        })),
        update: jest.fn(async ({ data }: { data: { budgetConfig: Record<string, unknown> } }) => {
          budgetConfig = data.budgetConfig;
          return { id: tripId, budgetConfig };
        }),
      },
      itineraryItem: {
        findUnique: jest.fn(async () => ({
          id: 'item-1',
          estimatedCost: 4200,
          actualCost: null,
          costNote: null,
          TripDay: { tripId },
        })),
        update: jest.fn(async () => ({
          id: 'item-1',
          estimatedCost: 3700,
        })),
      },
    };

    itineraryItemsService = { remove: jest.fn(async () => undefined) };
    tripBudgetService = {
      getBudgetSummary: jest.fn(async () => ({
        totalSpent: 4200,
        totalBudget: 10000,
      })),
    };

    service = new BudgetEvaluationService(
      prisma as never,
      tripBudgetService as never,
      { getIntent: jest.fn() } as never,
      { getStructure: jest.fn() } as never,
      { hasPaymentRule: jest.fn() } as never,
      {
        appendLog: jest.fn(),
        getLatestLog: jest.fn(async () => ({
          id: 'log-1',
          planId,
          estimatedCost: 4200,
          verdict: 'NEED_CONFIRM',
          reason: 'test',
          evidenceRefs: [],
          budgetConstraint: { total: 10000, currency: 'CNY' },
          timestamp: new Date().toISOString(),
        })),
      } as never,
      itineraryItemsService as never,
      { getProfile: jest.fn() } as never,
    );
  });

  it('preview mode does not mutate items', async () => {
    const result = await service.applyBudgetOptimizations({
      planId,
      tripId,
      optimizationIds: ['opt-1'],
      autoCommit: false,
    });

    expect(result.dryRun).toBe(true);
    expect(result.totalSavings).toBe(500);
    expect(prisma.itineraryItem.update).not.toHaveBeenCalled();
  });

  it('autoCommit applies cost reduction', async () => {
    const result = await service.applyBudgetOptimizations({
      planId,
      tripId,
      optimizationIds: ['opt-1'],
      autoCommit: true,
    });

    expect(result.dryRun).toBe(false);
    expect(result.appliedOptimizations[0].status).toBe('success');
    expect(prisma.itineraryItem.update).toHaveBeenCalled();
  });

  it('rejects unknown optimization ids', async () => {
    await expect(
      service.applyBudgetOptimizations({
        planId,
        tripId,
        optimizationIds: ['missing'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
