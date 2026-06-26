import { Injectable, Logger } from '@nestjs/common';
import type { DecisionProfilingOrchestrationHint } from '../types/decision-profiling-orchestration.types';
import { DecisionProfilingAccessService } from './decision-profiling-access.service';
import { DecisionProfilingService } from './decision-profiling.service';

const MIN_GROUP_SIZE_FOR_TEAM_COPY = 2;

@Injectable()
export class DecisionProfilingOrchestratorService {
  private readonly logger = new Logger(DecisionProfilingOrchestratorService.name);

  constructor(
    private readonly access: DecisionProfilingAccessService,
    private readonly profiling: DecisionProfilingService,
  ) {}

  /**
   * PDI-4 / F4.1–F4.2：Gate 通过后，对未完成调查的成员自动推送 Robo-advisor 问卷入口。
   */
  async tryAutoPromptQuiz(args: {
    tripId: string;
    userId: string;
    message?: string;
  }): Promise<DecisionProfilingOrchestrationHint> {
    const { tripId, userId } = args;
    const empty = this.emptyHint(tripId, userId);

    if (!tripId || !userId) {
      return { ...empty, skippedReason: 'missing_trip_or_user' };
    }

    try {
      await this.access.assertTripMember(tripId, userId);
    } catch {
      return { ...empty, skippedReason: 'not_trip_member' };
    }

    const memberIds = await this.access.listMemberIds(tripId);
    const memberCount = memberIds.length;
    if (memberCount < 1) {
      return { ...empty, skippedReason: 'no_members' };
    }

    const onboarding = await this.profiling.getOnboardingStatus(tripId, userId);
    if (onboarding.quizCompleted) {
      return {
        ...empty,
        memberCount,
        onboarding: this.pickOnboarding(onboarding),
        skippedReason: 'quiz_already_completed',
      };
    }

    const nextStep = !onboarding.travelStyleCompleted
      ? 'travel_style'
      : !onboarding.moneyDnaCompleted
        ? 'money_dna'
        : 'overview';

    const promptKind: DecisionProfilingOrchestrationHint['promptKind'] =
      onboarding.travelStyleCompleted || onboarding.moneyDnaCompleted
        ? 'reminder'
        : 'first_prompt';

    const agentIntroZh = this.buildIntro({
      nextStep,
      promptKind,
      memberCount,
      teamCompletionRate: onboarding.teamCompletionRate,
      message: args.message ?? '',
    });

    this.logger.log(
      `[DecisionProfiling] auto-prompt trip=${tripId} user=${userId} step=${nextStep} kind=${promptKind}`,
    );

    return {
      triggered: true,
      tripId,
      userId,
      onboarding: this.pickOnboarding(onboarding),
      memberCount,
      nextStep,
      promptKind,
      agentIntroZh,
      clientNavigation: {
        route: 'decision_profiling_quiz',
        tripId,
        step: nextStep,
      },
    };
  }

  private emptyHint(tripId: string, userId: string): DecisionProfilingOrchestrationHint {
    return {
      triggered: false,
      tripId,
      userId,
      onboarding: {
        travelStyleCompleted: false,
        moneyDnaCompleted: false,
        quizCompleted: false,
        teamCompletionRate: 0,
      },
      memberCount: 0,
      nextStep: 'travel_style',
      promptKind: 'first_prompt',
      agentIntroZh: null,
      clientNavigation: null,
    };
  }

  private pickOnboarding(
    onboarding: Awaited<ReturnType<DecisionProfilingService['getOnboardingStatus']>>,
  ): DecisionProfilingOrchestrationHint['onboarding'] {
    return {
      travelStyleCompleted: onboarding.travelStyleCompleted,
      moneyDnaCompleted: onboarding.moneyDnaCompleted,
      quizCompleted: onboarding.quizCompleted,
      teamCompletionRate: onboarding.teamCompletionRate,
    };
  }

  private buildIntro(args: {
    nextStep: DecisionProfilingOrchestrationHint['nextStep'];
    promptKind: DecisionProfilingOrchestrationHint['promptKind'];
    memberCount: number;
    teamCompletionRate: number;
    message: string;
  }): string {
    const { nextStep, promptKind, memberCount, teamCompletionRate } = args;
    const isTeam = memberCount >= MIN_GROUP_SIZE_FOR_TEAM_COPY;
    const teamNote =
      isTeam && teamCompletionRate < 95
        ? `目前团队完成率约 ${teamCompletionRate}%，完成调查后我们才能生成摩擦预警与分摊建议。`
        : '';

    if (promptKind === 'reminder') {
      const segment =
        nextStep === 'money_dna'
          ? '消费人格（Money DNA）'
          : nextStep === 'travel_style'
            ? '旅行决策风格'
            : '调查';
      return (
        `你还有一次行前小调查未完成（${segment}），大约 3–5 分钟。` +
        `${teamNote}` +
        `完成后我会帮你们提前识别偏好差异，减少行程中的摩擦。`
      );
    }

    const opener = isTeam
      ? '欢迎加入这次团队旅行！在正式敲定行程前，'
      : '在规划行程前，';

    const segmentGuide =
      nextStep === 'travel_style'
        ? '先从几个情境选择题开始，了解你的旅行决策风格（约 3 分钟）'
        : '请继续完成消费人格调查（Money DNA，约 2–5 分钟）';

    return (
      `${opener}我想邀请你完成一次轻量「旅行风格」小调查（Robo-advisor 式，非传统问卷）。` +
      `${segmentGuide}；` +
      `完成后你会收到个人风格卡片，团队将看到脱敏的兼容提示。` +
      `${teamNote}`
    );
  }
}
