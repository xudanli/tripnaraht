import type { OnboardingStatus } from './decision-profiling.types';

export type DecisionProfilingQuizStep = 'travel_style' | 'money_dna' | 'overview';

export interface DecisionProfilingOrchestrationHint {
  triggered: boolean;
  tripId: string;
  userId: string;
  /** 当前用户调查进度 */
  onboarding: Pick<
    OnboardingStatus,
    'travelStyleCompleted' | 'moneyDnaCompleted' | 'quizCompleted' | 'teamCompletionRate'
  >;
  memberCount: number;
  /** travel_style | money_dna — 建议从哪一段开始 */
  nextStep: DecisionProfilingQuizStep;
  /** first_prompt | reminder */
  promptKind: 'first_prompt' | 'reminder';
  agentIntroZh: string | null;
  clientNavigation: {
    route: 'decision_profiling_quiz';
    tripId: string;
    step: DecisionProfilingQuizStep;
  } | null;
  skippedReason?: string;
}
