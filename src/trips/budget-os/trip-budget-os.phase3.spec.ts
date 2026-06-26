import { BudgetStructurePresetService } from './services/budget-structure-preset.service';
import { TripBudgetProfileService } from './services/trip-budget-profile.service';
import { TravelProfileService } from './services/travel-profile.service';
import { MoneyDnaService } from './services/money-dna.service';

describe('Trip Budget OS Phase 3 (P2)', () => {
  const tripId = 'trip-p2';
  const userId = 'user-p2';

  it('returns structure presets with Money DNA recommendation', async () => {
    const moneyDnaService = {
      getProfile: jest.fn(async () => ({
        userId,
        experienceSensitivity: 0.75,
        accommodationSensitivity: 0.35,
        efficiencySensitivity: 0.25,
        frugalityIndex: 0.15,
        dominantPersona: 'experience',
        tripCount: 4,
        lastUpdatedAt: '2026-06-16T00:00:00.000Z',
        confidence: 0.8,
      })),
    } as unknown as MoneyDnaService;

    const presetService = new BudgetStructurePresetService(moneyDnaService);
    const result = await presetService.getPresetsForUser(userId);

    expect(result.recommendedPersona).toBe('experience');
    expect(result.presets.some((p) => p.recommended)).toBe(true);
    expect(result.presets.find((p) => p.id === 'personalized')).toBeDefined();
  });

  it('includes suggestedStructure on profile when L1 set but L2 missing', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({
          id: tripId,
          budgetConfig: {
            budgetIntent: {
              total: 10000,
              currency: 'CNY',
              source: 'user',
              setAt: '2026-06-16T00:00:00.000Z',
            },
            updatedAt: '2026-06-16T00:00:00.000Z',
          },
          updatedAt: new Date('2026-06-16'),
        })),
      },
    };

    const intentService = { getIntent: jest.fn(async () => ({ total: 10000, currency: 'CNY' })) };
    const structureService = { getStructure: jest.fn(async () => null) };
    const presetService = {
      resolveSuggestedStructure: jest.fn(async () => ({
        mode: 'percent' as const,
        percentages: {
          transportation: 20,
          accommodation: 10,
          experience: 50,
          food: 15,
          other: 5,
        },
        spendingPersona: 'experience' as const,
        source: 'money_dna' as const,
      })),
    };

    const profileService = new TripBudgetProfileService(
      prisma as never,
      intentService as never,
      structureService as never,
      { getTripCostSummary: jest.fn() } as never,
      { getWallet: jest.fn() } as never,
      { getValueSummary: jest.fn() } as never,
      presetService as never,
    );

    const profile = await profileService.getProfile(tripId, [], { userId });
    expect(profile.intent?.total).toBe(10000);
    expect(profile.structure).toBeNull();
    expect(profile.suggestedStructure?.spendingPersona).toBe('experience');
    expect(profile.suggestedStructure?.percentages.experience).toBe(50);
  });

  it('aggregates odyssey + money DNA + travel profile', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          id: userId,
          displayName: 'Alice',
          updatedAt: new Date('2026-06-16'),
          profile: {
            preferences: {
              odyssey: {
                mbtiType: 'ENFP',
                cardTitle: '探索者',
                interactionMode: 'easy_companion',
                completed: true,
              },
            },
          },
        })),
      },
      userTravelProfile: {
        findUnique: jest.fn(async () => ({
          userId,
          pacePreference: 'MODERATE',
          altitudeTolerance: 'MEDIUM',
          riskTolerance: 'MEDIUM',
          travelPhilosophy: 'SCENIC',
          preferredRouteTypes: ['NATURE'],
          confidence: 0.6,
          source: 'mixed',
          extendedProfile: null,
          updatedAt: new Date('2026-06-15'),
        })),
      },
    };

    const moneyDnaService = {
      getProfile: jest.fn(async () => ({
        userId,
        experienceSensitivity: 0.6,
        accommodationSensitivity: 0.5,
        efficiencySensitivity: 0.4,
        frugalityIndex: 0.3,
        dominantPersona: 'balanced',
        tripCount: 2,
        lastUpdatedAt: '2026-06-16T00:00:00.000Z',
        confidence: 0.5,
        defaultStructure: {
          mode: 'percent',
          percentages: {
            transportation: 25,
            accommodation: 25,
            experience: 25,
            food: 20,
            other: 5,
          },
          spendingPersona: 'balanced',
          source: 'money_dna',
        },
      })),
    } as unknown as MoneyDnaService;

    const service = new TravelProfileService(prisma as never, moneyDnaService);
    const aggregate = await service.getAggregate(userId);

    expect(aggregate.odyssey?.mbtiType).toBe('ENFP');
    expect(aggregate.odyssey?.cardTitle).toBe('探索者');
    expect(aggregate.moneyDna?.dominantPersona).toBe('balanced');
    expect(aggregate.travelProfile?.pacePreference).toBe('MODERATE');
    expect(aggregate.userId).toBe(userId);
  });
});
