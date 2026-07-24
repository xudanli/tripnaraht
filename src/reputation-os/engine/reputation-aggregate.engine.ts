import type { ReputationSurveySubmission } from '@prisma/client';
import type { InternalRiskLevel, UserReputationAssets } from '../types/reputation-os.types';

export interface AggregateInput {
  submissions: Array<{
    q1Overall: number;
    q2PaceSync: number;
    q3Communication: number;
    q4Spending: number;
    q5WouldAgain: number;
  }>;
}

function roundStars(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 从全部收到的互评提交计算信用资产 */
export function computeUserReputationAggregate(
  userId: string,
  submissions: ReputationSurveySubmission[],
): Omit<UserReputationAssets, 'updatedAt'> & {
  internalRiskLevel: InternalRiskLevel;
  severeLowCount: number;
} {
  if (submissions.length === 0) {
    return {
      userId,
      averageStars: null,
      surveyCount: 0,
      tagCloud: [],
      safetyWarning: null,
      internalRiskLevel: 'none',
      severeLowCount: 0,
    };
  }

  const avg =
    submissions.reduce((sum, s) => sum + s.q1Overall, 0) / submissions.length;

  const severeLowCount = submissions.filter(
    (s) => s.q1Overall <= 2 || (s.q3Communication <= 2 && s.q1Overall <= 3),
  ).length;

  const tagCloud = buildTagCloud(submissions);
  const { safetyWarning, internalRiskLevel } = buildSafetyAssessment(severeLowCount, submissions);

  return {
    userId,
    averageStars: roundStars(avg),
    surveyCount: submissions.length,
    tagCloud,
    safetyWarning,
    internalRiskLevel,
    severeLowCount,
  };
}

/** PRD 5.4 — 正面评价高频标签（规则提取，P2 占位） */
export function buildTagCloud(submissions: ReputationSurveySubmission[]): string[] {
  const tags = new Set<string>();

  for (const s of submissions) {
    if (s.q5WouldAgain >= 4 && s.q3Communication >= 4) {
      tags.add('高效靠谱');
    }
    if (s.q2PaceSync >= 4) {
      tags.add('节奏同步达人');
    }
    if (s.q4Spending >= 4) {
      tags.add('消费观合拍');
    }
    if (s.q3Communication >= 5) {
      tags.add('沟通能力 MAX');
    }
    if (s.q1Overall >= 5) {
      tags.add('神仙旅伴');
    }
    if (s.q2PaceSync >= 5 && s.q1Overall >= 4) {
      tags.add('极度守时');
    }
  }

  return [...tags].slice(0, 8);
}

function buildSafetyAssessment(
  severeLowCount: number,
  submissions: ReputationSurveySubmission[],
): { safetyWarning: string | null; internalRiskLevel: InternalRiskLevel } {
  const noShowSignals = submissions.filter(
    (s) => s.q1Overall <= 1 && s.q5WouldAgain <= 1,
  ).length;
  const planningIssues = submissions.filter((s) => s.q2PaceSync <= 2 && s.q3Communication <= 2).length;

  if (severeLowCount >= 3 || noShowSignals >= 2) {
    return {
      internalRiskLevel: 'high',
      safetyWarning: '该用户历史存在放鸽子/计划执行度极低记录，审批前请谨慎确认',
    };
  }

  if (severeLowCount >= 1 || planningIssues >= 2) {
    return {
      internalRiskLevel: 'low',
      safetyWarning: '该用户近期收到偏低互评，建议队长进一步沟通确认',
    };
  }

  return { safetyWarning: null, internalRiskLevel: 'none' };
}
