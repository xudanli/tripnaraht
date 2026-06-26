import { DecisionProfilingOrchestratorService } from './decision-profiling-orchestrator.service';

describe('DecisionProfilingOrchestratorService', () => {
  const tripId = 'trip-1';
  const userId = 'user-a';

  function makeService(overrides?: {
    onboarding?: Partial<{
      travelStyleCompleted: boolean;
      moneyDnaCompleted: boolean;
      quizCompleted: boolean;
      teamCompletionRate: number;
    }>;
    memberIds?: string[];
  }) {
    const access = {
      assertTripMember: jest.fn(async () => undefined),
      listMemberIds: jest.fn(async () => overrides?.memberIds ?? ['user-a', 'user-b']),
    };
    const profiling = {
      getOnboardingStatus: jest.fn(async () => ({
        tripId,
        userId,
        travelStyleCompleted: false,
        moneyDnaCompleted: false,
        quizCompleted: false,
        teamCompletionRate: 0,
        ...overrides?.onboarding,
      })),
    };
    return {
      service: new DecisionProfilingOrchestratorService(access as never, profiling as never),
      access,
      profiling,
    };
  }

  it('triggers first_prompt for incomplete quiz on multi-member trip', async () => {
    const { service } = makeService();
    const hint = await service.tryAutoPromptQuiz({ tripId, userId });

    expect(hint.triggered).toBe(true);
    expect(hint.nextStep).toBe('travel_style');
    expect(hint.promptKind).toBe('first_prompt');
    expect(hint.clientNavigation).toEqual({
      route: 'decision_profiling_quiz',
      tripId,
      step: 'travel_style',
    });
    expect(hint.agentIntroZh).toContain('欢迎加入');
  });

  it('skips when quiz already completed', async () => {
    const { service } = makeService({
      onboarding: { quizCompleted: true, travelStyleCompleted: true, moneyDnaCompleted: true },
    });
    const hint = await service.tryAutoPromptQuiz({ tripId, userId });
    expect(hint.triggered).toBe(false);
    expect(hint.skippedReason).toBe('quiz_already_completed');
  });

  it('routes to money_dna when travel style done', async () => {
    const { service } = makeService({
      onboarding: { travelStyleCompleted: true, moneyDnaCompleted: false, quizCompleted: false },
    });
    const hint = await service.tryAutoPromptQuiz({ tripId, userId });
    expect(hint.triggered).toBe(true);
    expect(hint.nextStep).toBe('money_dna');
    expect(hint.promptKind).toBe('reminder');
  });
});
