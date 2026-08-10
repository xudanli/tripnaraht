/**
 * Weekly 核心问题：这周真实 Trip 告诉了我们什么？
 * 若无新系统性问题 → 继续跑 Trip（正确动作）。
 */

export const WEEKLY_TRIP_INSIGHT_SCHEMA =
  'nara.weekly_trip_insight@v1' as const;

export type WeeklyTripInsightV1 = {
  schemaId: typeof WEEKLY_TRIP_INSIGHT_SCHEMA;
  version: 1;
  weekId: string;
  primaryAnswerZh: string;
  hasNewSystemicIssue: boolean;
  correctAction: 'CONTINUE_TRIPS' | 'MINIMAL_FIX_LOOP' | 'V11_PROPOSAL_REVIEW';
  noEvidenceNoFeature: true;
};

export function concludeWeeklyTripInsight(input: {
  weekId: string;
  /** 自由文本：真实 Trip 告诉了我们什么 */
  whatTripsToldUsZh: string;
  repeatedUnsolvableHighValue?: boolean;
  hasP0OrP1OrFrictionOrDataGap?: boolean;
}): WeeklyTripInsightV1 {
  const told = input.whatTripsToldUsZh.trim();
  if (!told) {
    throw new Error(
      '[WeeklyInsight] must_answer:这周真实Trip告诉了我们什么',
    );
  }

  if (input.repeatedUnsolvableHighValue) {
    return {
      schemaId: WEEKLY_TRIP_INSIGHT_SCHEMA,
      version: 1,
      weekId: input.weekId,
      primaryAnswerZh: told,
      hasNewSystemicIssue: true,
      correctAction: 'V11_PROPOSAL_REVIEW',
      noEvidenceNoFeature: true,
    };
  }

  if (input.hasP0OrP1OrFrictionOrDataGap) {
    return {
      schemaId: WEEKLY_TRIP_INSIGHT_SCHEMA,
      version: 1,
      weekId: input.weekId,
      primaryAnswerZh: told,
      hasNewSystemicIssue: true,
      correctAction: 'MINIMAL_FIX_LOOP',
      noEvidenceNoFeature: true,
    };
  }

  return {
    schemaId: WEEKLY_TRIP_INSIGHT_SCHEMA,
    version: 1,
    weekId: input.weekId,
    primaryAnswerZh: told || '没有新的系统性问题',
    hasNewSystemicIssue: false,
    correctAction: 'CONTINUE_TRIPS',
    noEvidenceNoFeature: true,
  };
}
