import { BadRequestException } from '@nestjs/common';
import { DecisionProfilingProfileService } from './decision-profiling-profile.service';
import { DECISION_PROFILING_QUIZ_VERSION } from '../config/quiz-version.config';

describe('DecisionProfilingProfileService', () => {
  const tripA = 'trip-a';
  const tripB = 'trip-b';
  const userId = 'user-1';

  const profileRow = {
    userId,
    travelStyleAnswers: [{ questionId: 'ts_q1', optionId: 'a' }],
    travelStyleCard: {
      styleType: 'RATIONAL_EXPLORER',
      styleLabel: '理性探索者',
      coreDrivers: ['分析'],
      teamRole: '分析师',
      compatibilityHints: ['兼容'],
      confidence: 0.72,
      completedAt: '2026-05-10T08:00:00.000Z',
      source: 'quiz',
    },
    moneyDnaAnswers: [{ questionId: 'md_q1', optionId: 'b' }],
    moneyDnaCard: {
      vector: {
        experienceTendency: 0.72,
        qualityTendency: 0.5,
        timeValueTendency: 0.5,
        socialScarcityTendency: 0.5,
      },
      consumptionPace: 'balanced',
      confidence: 0.68,
      completedAt: '2026-05-10T08:00:00.000Z',
      source: 'quiz',
    },
    lastCompletedTripId: tripA,
    lastCompletedAt: new Date('2026-05-10T08:00:00.000Z'),
    quizVersion: DECISION_PROFILING_QUIZ_VERSION,
    lastCompletedTripLabel: '冰岛环岛 · 5月',
  };

  function makeService(overrides?: {
    profile?: typeof profileRow | null;
    status?: {
      travelStyleCompleted: boolean;
      moneyDnaCompleted: boolean;
      quizCompleted: boolean;
    } | null;
    travelStyleSource?: string;
    moneyDnaSource?: string;
    memberIds?: string[];
    completedCount?: number;
    inferredTravel?: boolean;
    inferredMoney?: boolean;
  }) {
    const statusState = {
      travelStyleCompleted: overrides?.status?.travelStyleCompleted ?? false,
      moneyDnaCompleted: overrides?.status?.moneyDnaCompleted ?? false,
      quizCompleted: overrides?.status?.quizCompleted ?? false,
    };
    if (overrides?.status === null) {
      statusState.travelStyleCompleted = false;
      statusState.moneyDnaCompleted = false;
      statusState.quizCompleted = false;
    }

    const tx = {
      userTravelStyleCard: {
        upsert: jest.fn(async () => ({})),
      },
      userMoneyDnaQuiz: {
        upsert: jest.fn(async () => ({})),
      },
      tripDecisionProfilingStatus: {
        upsert: jest.fn(async () => {
          statusState.travelStyleCompleted = true;
          statusState.moneyDnaCompleted = true;
          statusState.quizCompleted = true;
        }),
      },
    };

    const prisma = {
      userDecisionProfilingProfile: {
        findUnique: jest.fn(async () =>
          overrides?.profile === undefined ? profileRow : overrides.profile,
        ),
        findUniqueOrThrow: jest.fn(async () => {
          if (!overrides?.profile && overrides?.profile !== null) return profileRow;
          if (overrides?.profile) return overrides.profile;
          throw new Error('not found');
        }),
        upsert: jest.fn(async () => ({})),
      },
      tripDecisionProfilingStatus: {
        findUnique: jest.fn(async () =>
          overrides?.status === undefined || overrides?.status
            ? { ...statusState }
            : { ...statusState },
        ),
        count: jest.fn(async () => overrides?.completedCount ?? 0),
        upsert: jest.fn(async () => ({})),
      },
      userTravelStyleCard: {
        findUnique: jest.fn(async () =>
          overrides?.inferredTravel
            ? { source: 'inferred' }
            : null,
        ),
      },
      userMoneyDnaQuiz: {
        findUnique: jest.fn(async () =>
          overrides?.inferredMoney ? { source: 'inferred' } : null,
        ),
      },
      trip: {
        findUnique: jest.fn(async () => ({
          name: '冰岛环岛',
          destination: 'Iceland',
          startDate: new Date('2026-05-01'),
        })),
      },
      $transaction: jest.fn(async (fn: (tx: typeof tx) => Promise<void>) => fn(tx)),
    };

    const access = {
      assertTripMember: jest.fn(async () => undefined),
      listMemberIds: jest.fn(async () => overrides?.memberIds ?? [userId, 'user-2']),
    };

    return {
      service: new DecisionProfilingProfileService(prisma as never, access as never),
      prisma,
      access,
      tx,
    };
  }

  it('returns reuse.eligible=true when profile exists and trip incomplete', async () => {
    const { service } = makeService();
    const reuse = await service.evaluateReuseEligibility(tripB, userId, {
      travelStyleCompleted: false,
      moneyDnaCompleted: false,
      quizCompleted: false,
    });

    expect(reuse?.eligible).toBe(true);
    expect(reuse?.preview?.travelStyleLabel).toBe('理性探索者');
    expect(reuse?.lastCompletedTripLabel).toBe('冰岛环岛 · 5月');
  });

  it('reuses profile into trip cards and marks status completed', async () => {
    const { service, tx } = makeService();
    const result = await service.reuseProfile(tripB, userId);

    expect(result.travelStyle.source).toBe('reused');
    expect(result.moneyDna.source).toBe('reused');
    expect(result.onboarding.quizCompleted).toBe(true);
    expect(tx.tripDecisionProfilingStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          quizCompleted: true,
          travelStyleSource: 'reused',
          moneyDnaSource: 'reused',
          reusedFromTripId: tripA,
        }),
      }),
    );
  });

  it('blocks reuse when quiz_version mismatches', async () => {
    const { service } = makeService({
      profile: { ...profileRow, quizVersion: 'legacy-v0' },
    });
    const reuse = await service.evaluateReuseEligibility(tripB, userId, {
      travelStyleCompleted: false,
      moneyDnaCompleted: false,
      quizCompleted: false,
    });

    expect(reuse?.eligible).toBe(false);
    expect(reuse?.blockedReason).toBe('quiz_version_mismatch');
  });

  it('blocks inferred-only users with no profile', async () => {
    const { service } = makeService({
      profile: null,
      inferredTravel: true,
    });
    const reuse = await service.evaluateReuseEligibility(tripB, userId, {
      travelStyleCompleted: false,
      moneyDnaCompleted: false,
      quizCompleted: false,
    });

    expect(reuse?.eligible).toBe(false);
    expect(reuse?.blockedReason).toBe('inferred_only');
  });

  it('blocks stale profiles older than 24 months', async () => {
    const { service } = makeService({
      profile: {
        ...profileRow,
        lastCompletedAt: new Date('2023-01-01T00:00:00.000Z'),
      },
    });
    const reuse = await service.evaluateReuseEligibility(tripB, userId, {
      travelStyleCompleted: false,
      moneyDnaCompleted: false,
      quizCompleted: false,
    });

    expect(reuse?.eligible).toBe(false);
    expect(reuse?.blockedReason).toBe('profile_stale');
  });

  it('rejects reuse when section already completed', async () => {
    const { service } = makeService({
      status: {
        travelStyleCompleted: true,
        moneyDnaCompleted: true,
        quizCompleted: true,
      },
    });

    await expect(service.reuseProfile(tripB, userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.reuseProfile(tripB, userId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SECTION_ALREADY_COMPLETED' }),
    });
  });

  it('rejects reuse when not eligible', async () => {
    const { service } = makeService({ profile: null });

    await expect(service.reuseProfile(tripB, userId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REUSE_NOT_ELIGIBLE' }),
    });
  });

  it('computes team completion rate after reuse onboarding build', async () => {
    const { service } = makeService({ completedCount: 1, memberIds: [userId, 'user-2'] });
    const onboarding = await service.buildOnboardingStatus(tripB, userId);
    expect(onboarding.teamCompletionRate).toBe(50);
  });
});
