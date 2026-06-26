import { Test, TestingModule } from '@nestjs/testing';
import { AnchorHandoffService } from './anchor-handoff.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripBudgetIntentService } from '../../budget-os/services/trip-budget-intent.service';
import { BudgetStructureService } from '../../budget-os/services/budget-structure.service';
import { TravelWalletService } from '../../budget-os/services/travel-wallet.service';
import { DecisionProfilingAccessService } from '../../decision-profiling/services/decision-profiling-access.service';
import { DecisionProfilingService } from '../../decision-profiling/services/decision-profiling.service';
import { FrictionRadarService } from '../../decision-profiling/services/friction-radar.service';
import { TravelStyleQuizService } from '../../decision-profiling/services/travel-style-quiz.service';

describe('AnchorHandoffService', () => {
  let service: AnchorHandoffService;

  const prisma = {
    trip: { findUnique: jest.fn() },
    tripDay: { count: jest.fn() },
    tripSplitMechanismConsensus: { findUnique: jest.fn() },
    tripDecisionProfilingStatus: { count: jest.fn() },
    tripInTripAnchorSnapshot: { findUnique: jest.fn(), create: jest.fn() },
  };

  const intentService = { getIntent: jest.fn() };
  const structureService = { getStructure: jest.fn() };
  const walletService = { getWallet: jest.fn() };
  const profilingAccess = { listMemberIds: jest.fn() };
  const profilingService = { getOnboardingStatus: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnchorHandoffService,
        { provide: PrismaService, useValue: prisma },
        { provide: TripBudgetIntentService, useValue: intentService },
        { provide: BudgetStructureService, useValue: structureService },
        { provide: TravelWalletService, useValue: walletService },
        { provide: DecisionProfilingAccessService, useValue: profilingAccess },
        { provide: DecisionProfilingService, useValue: profilingService },
        { provide: FrictionRadarService, useValue: { getRadar: jest.fn() } },
        { provide: TravelStyleQuizService, useValue: { getMyCard: jest.fn() } },
      ],
    }).compile();

    service = module.get(AnchorHandoffService);
  });

  describe('verifyHandoffReadiness', () => {
    it('returns ready=false when core anchors are missing', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        id: 'trip-1',
        metadata: {},
      });
      intentService.getIntent.mockResolvedValue(null);
      structureService.getStructure.mockResolvedValue(null);
      walletService.getWallet.mockResolvedValue({ paymentRule: null });
      prisma.tripSplitMechanismConsensus.findUnique.mockResolvedValue(null);
      prisma.tripDay.count.mockResolvedValue(0);
      profilingAccess.listMemberIds.mockResolvedValue(['u1']);

      const result = await service.verifyHandoffReadiness('trip-1');

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([
          'plan_confirmed',
          'budget_intent',
          'budget_structure',
          'wallet_rule',
          'split_mechanism_locked',
          'itinerary_days',
        ]),
      );
    });

    it('returns ready=true when all required anchors exist', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        id: 'trip-1',
        metadata: { planConfirmed: true },
      });
      intentService.getIntent.mockResolvedValue({ total: 10000, currency: 'CNY' });
      structureService.getStructure.mockResolvedValue({ mode: 'absolute', allocations: {} });
      walletService.getWallet.mockResolvedValue({
        paymentRule: { mode: 'split_aa', splitBase: 2 },
      });
      prisma.tripSplitMechanismConsensus.findUnique.mockResolvedValue({
        lockedAt: new Date(),
      });
      prisma.tripDay.count.mockResolvedValue(3);
      profilingAccess.listMemberIds.mockResolvedValue(['u1', 'u2']);
      prisma.tripDecisionProfilingStatus.count.mockResolvedValue(2);

      const result = await service.verifyHandoffReadiness('trip-1');

      expect(result.ready).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('adds warning when profiling completion is below 80%', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        id: 'trip-1',
        metadata: { planConfirmed: true },
      });
      intentService.getIntent.mockResolvedValue({ total: 10000, currency: 'CNY' });
      structureService.getStructure.mockResolvedValue({ mode: 'absolute', allocations: {} });
      walletService.getWallet.mockResolvedValue({
        paymentRule: { mode: 'split_aa', splitBase: 2 },
      });
      prisma.tripSplitMechanismConsensus.findUnique.mockResolvedValue({
        lockedAt: new Date(),
      });
      prisma.tripDay.count.mockResolvedValue(1);
      profilingAccess.listMemberIds.mockResolvedValue(['u1', 'u2', 'u3', 'u4', 'u5']);
      prisma.tripDecisionProfilingStatus.count.mockResolvedValue(2);

      const result = await service.verifyHandoffReadiness('trip-1');

      expect(result.ready).toBe(true);
      expect(result.warnings.some((w) => w.startsWith('decision_profiling_completion_'))).toBe(
        true,
      );
    });
  });

  describe('toPublicSnapshot', () => {
    it('redacts internal team vectors from public view', () => {
      const pub = service.toPublicSnapshot({
        tripId: 'trip-1',
        materializedAt: '2026-06-18T00:00:00.000Z',
        schemaVersion: 1,
        budget: {
          intent: { total: 20000, currency: 'CNY', source: 'user', setAt: 'x' },
          structure: { mode: 'absolute', allocations: {}, updatedAt: 'x' },
          walletRule: { mode: 'split_aa', splitBase: 2 },
          splitMechanism: {
            recommendedMode: 'split_aa',
            selectedMode: 'split_aa',
            lockedMode: 'split_aa',
            lockedAt: '2026-06-18T00:00:00.000Z',
          },
        },
        team: {
          members: [{ userId: 'u1', displayName: 'A', role: 'OWNER' }],
          travelStyles: [],
          frictionMatrix: [],
          compatibilityScore: 72,
          highRiskAlerts: [{ id: 'a1' } as any],
          profilingCompletionRate: 100,
        },
        itinerary: {
          planId: null,
          lockedAt: 'x',
          days: [{ date: '2026-07-01', items: [{ id: 'i1' } as any] }],
          bigTransportRefs: [],
          nonRefundableItemIds: ['i1'],
        },
        conflictWatchlist: [],
        metadata: {
          destination: 'IS',
          startDate: '2026-07-01',
          endDate: '2026-07-07',
          totalDays: 7,
          timezone: 'Atlantic/Reykjavik',
        },
      });

      expect(pub.team.memberCount).toBe(1);
      expect(pub.itinerary.itemCount).toBe(1);
      expect(pub.budget.splitMechanismLocked).toBe(true);
      expect(pub).not.toHaveProperty('team.frictionMatrix');
    });
  });
});
