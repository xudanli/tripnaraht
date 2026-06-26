import { Injectable } from '@nestjs/common';
import { DECISION_PROFILING_QUIZ_VERSION } from '../config/quiz-version.config';
import { MONEY_DNA_QUIZ_QUESTIONS } from '../config/money-dna-quiz.config';
import { TRAVEL_STYLE_QUIZ_QUESTIONS } from '../config/travel-style-quiz.config';
import type { OnboardingStatus } from '../types/decision-profiling.types';
import { DecisionProfilingAccessService } from './decision-profiling-access.service';
import { DecisionProfilingProfileService } from './decision-profiling-profile.service';

@Injectable()
export class DecisionProfilingService {
  constructor(
    private readonly access: DecisionProfilingAccessService,
    private readonly profile: DecisionProfilingProfileService,
  ) {}

  getQuizBundle() {
    return {
      quizVersion: DECISION_PROFILING_QUIZ_VERSION,
      travelStyleQuestions: TRAVEL_STYLE_QUIZ_QUESTIONS,
      moneyDnaQuestions: MONEY_DNA_QUIZ_QUESTIONS,
      estimatedMinutes: { min: 5, max: 8 },
    };
  }

  async getOnboardingStatus(tripId: string, userId: string): Promise<OnboardingStatus> {
    await this.access.assertTripMember(tripId, userId);
    return this.profile.buildOnboardingStatus(tripId, userId);
  }
}
