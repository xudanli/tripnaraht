import { TravelWalletService } from './services/travel-wallet.service';
import { computeSharePerPerson } from './utils/wallet-balances.util';
import { BudgetEvaluationService } from '../services/budget-evaluation.service';
import { TripBudgetService } from '../services/trip-budget.service';
import { TripBudgetIntentService } from './services/trip-budget-intent.service';
import { BudgetStructureService } from './services/budget-structure.service';

describe('Travel Wallet Phase 1', () => {
  const tripId = 'trip-wallet';
  const roster = [
    { userId: 'u1', displayName: 'Alice', role: 'leader' as const },
    { userId: 'u2', displayName: 'Bob', role: 'member' as const },
    { userId: 'u3', displayName: 'Carol', role: 'member' as const },
    { userId: 'u4', displayName: 'Dave', role: 'member' as const },
  ];

  let ledger: Array<Record<string, unknown>>;
  let walletRule: Record<string, unknown> | null;

  const prisma = {
    trip: {
      findUnique: jest.fn(async () => ({
        id: tripId,
        budgetConfig: { currency: 'CNY' },
      })),
    },
    tripCollaborator: {
      findMany: jest.fn(async () =>
        roster.map((m, i) => ({
          id: `c${i}`,
          tripId,
          userId: m.userId,
          role: m.role === 'leader' ? 'owner' : 'member',
          createdAt: new Date(),
        })),
      ),
    },
    user: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          displayName: roster.find((r) => r.userId === id)?.displayName,
          email: `${id}@test.com`,
        })),
      ),
    },
    tripWalletRule: {
      findUnique: jest.fn(async () => walletRule),
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        walletRule = { id: 'rule-1', tripId, ...create, ...update, updatedAt: new Date() };
        return walletRule;
      }),
    },
    tripSplitMechanismConsensus: {
      findUnique: jest.fn(async () => null),
    },
    tripWalletLedgerEntry: {
      findMany: jest.fn(async () => ledger),
      count: jest.fn(async () => ledger.length),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `ledger-${ledger.length + 1}`,
          ...data,
          settled: false,
          settledAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        ledger.push(row);
        return row;
      }),
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = ledger.find(
          (e) =>
            e.tripId === create.tripId &&
            e.sourceType === create.sourceType &&
            e.sourceId === create.sourceId,
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const row = {
          id: `ledger-${ledger.length + 1}`,
          ...create,
          settled: false,
          settledAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        ledger.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        ledger.find((e) => e.id === where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = ledger.find((e) => e.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
    },
  };

  let service: TravelWalletService;

  beforeEach(() => {
    ledger = [];
    walletRule = null;
    jest.clearAllMocks();
    service = new TravelWalletService(prisma as never);
  });

  it('rejects putPaymentRule when split consensus is locked', async () => {
    (prisma.tripSplitMechanismConsensus.findUnique as jest.Mock).mockResolvedValueOnce({
      lockedAt: new Date(),
      lockedMode: 'split_aa',
    });
    await expect(
      service.putPaymentRule(tripId, { mode: 'split_aa', splitBase: 4 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SPLIT_CONSENSUS_LOCKED' }),
    });
  });

  it('scenario 7: split_aa rule + auto ledger from itinerary item', async () => {
    await service.putPaymentRule(tripId, {
      mode: 'split_aa',
      splitBase: 4,
    });

    const split = await service.resolveSplitForExpense(tripId, 'food', 'u1');
    expect(split).toHaveLength(4);

    await service.syncItineraryItemLedger({
      itemId: 'item-1',
      tripId,
      title: '晚餐',
      category: 'food',
      amount: 400,
      currency: 'CNY',
      paidByUserId: 'u1',
      isPaid: true,
      autoLedger: true,
    });

    const balances = await service.getBalances(tripId);
    expect(balances.netByUser.u1).toBe(300);
    expect(balances.netByUser.u2).toBe(-100);
    expect(computeSharePerPerson(400, 4)).toBe(100);
  });

  it('creates manual ledger entry', async () => {
    const entry = await service.createManualLedger(tripId, {
      title: '超市',
      category: 'food',
      amount: 280,
      currency: 'CNY',
      paidByUserId: 'u1',
      splitAmongUserIds: ['u1', 'u2'],
    });
    expect(entry.sharePerPerson).toBe(140);
    expect(ledger).toHaveLength(1);
  });

  it('evaluate returns WALLET_UNSET for group trip without payment rule', async () => {
    const budgetConfig: Record<string, unknown> = {};
    const evalPrisma = {
      ...prisma,
      trip: {
        findUnique: jest.fn(async () => ({
          id: tripId,
          budgetConfig,
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-07-07'),
        })),
        update: jest.fn(async ({ data }: { data: { budgetConfig: Record<string, unknown> } }) => {
          Object.assign(budgetConfig, data.budgetConfig);
          return { id: tripId, budgetConfig };
        }),
      },
    };

    const intentService = new TripBudgetIntentService(evalPrisma as never);
    const structureService = new BudgetStructureService(
      evalPrisma as never,
      intentService,
      { getTripCostSummary: jest.fn() } as never,
    );
    const tripBudgetService = new TripBudgetService(evalPrisma as never, intentService);
    const walletService = new TravelWalletService(evalPrisma as never);
    const decisionLogService = {
      appendLog: jest.fn(async () => undefined),
      listLogs: jest.fn(async () => ({ items: [], total: 0 })),
      getLatestLog: jest.fn(async () => null),
    };
    const evaluationService = new BudgetEvaluationService(
      evalPrisma as never,
      tripBudgetService,
      intentService,
      structureService,
      walletService,
      decisionLogService as never,
    );

    await intentService.setIntent(tripId, { total: 10000, currency: 'CNY' });

    const result = await evaluationService.evaluateBudget({
      planId: 'plan-wallet',
      tripId,
      estimatedCost: 5000,
      categoryBreakdown: {
        accommodation: 2000,
        transportation: 1000,
        food: 1000,
        activities: 1000,
        other: 0,
      },
      budgetConstraint: { total: 10000, currency: 'CNY' },
    });

    expect(result.verdict).toBe('NEED_CONFIRM');
    expect(result.budgetViolations?.some((v) => v.type === 'WALLET_UNSET')).toBe(true);
  });
});
