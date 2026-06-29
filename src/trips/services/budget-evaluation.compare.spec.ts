import { BadRequestException } from '@nestjs/common';
import { BudgetEvaluationService } from './budget-evaluation.service';

describe('BudgetEvaluationService.compareBudgetPlans', () => {
  const tripId = 'trip-compare';

  let service: BudgetEvaluationService;

  beforeEach(() => {
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({ id: tripId, budgetConfig: {} })),
      },
      tripCollaborator: { findMany: jest.fn(async () => []) },
    };

    service = new BudgetEvaluationService(
      prisma as never,
      {} as never,
      {
        getIntent: jest.fn(async () => ({
          total: 10000,
          currency: 'CNY',
          source: 'user',
          setAt: '2026-06-16',
        })),
      } as never,
      {
        getStructure: jest.fn(async () => ({
          mode: 'absolute',
          allocations: {
            transportation: 3000,
            accommodation: 500,
            experience: 5000,
            food: 1500,
            other: 0,
          },
          updatedAt: '2026-06-16',
        })),
        evaluateStructureMismatch: jest.fn(() => [
          {
            category: 'accommodation',
            intentAmount: 500,
            estimatedAmount: 4200,
            variancePercent: 7.4,
          },
        ]),
      } as never,
      { hasPaymentRule: jest.fn(async () => true) } as never,
      {} as never,
      { remove: jest.fn() } as never,
      { getProfile: jest.fn() } as never,
    );
  });

  it('returns comparison rows with recommended plan', async () => {
    const result = await service.compareBudgetPlans({
      tripId,
      plans: [
        {
          planId: 'plan-a',
          label: '方案 A',
          estimatedCost: 9500,
          categoryBreakdown: {
            accommodation: 4200,
            transportation: 2000,
            food: 1500,
            activities: 1800,
            other: 0,
          },
        },
        {
          planId: 'plan-b',
          label: '方案 B',
          estimatedCost: 7800,
          categoryBreakdown: {
            accommodation: 3000,
            transportation: 2000,
            food: 1300,
            activities: 1500,
            other: 0,
          },
        },
      ],
    });

    expect(result.schema).toBe('tripnara.budget_comparison@v1');
    expect(result.plans).toHaveLength(2);
    expect(result.recommendedPlanId).toBeDefined();
    expect(result.priceEvidence.length).toBeGreaterThan(0);
  });

  it('rejects empty plans', async () => {
    await expect(
      service.compareBudgetPlans({ tripId, plans: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
