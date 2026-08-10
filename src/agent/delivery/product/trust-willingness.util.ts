/**
 * 产品目标度量 — 用户愿意把重要旅行决策交给 Nara。
 * 替代「继续增加 Nara 能力」作为 Release Operations 北极星。
 */

import type { BetaTripCohortV1 } from './beta-trip-cohort.util';
import type { TripQualityScorecardV1 } from './trip-quality-scorecard.util';

export const TRUST_WILLINGNESS_REPORT_SCHEMA =
  'nara.trust_willingness_report@v1' as const;

export type TrustWillingnessReportV1 = {
  schemaId: typeof TRUST_WILLINGNESS_REPORT_SCHEMA;
  version: 1;
  completeTripN: number;
  willingN: number;
  willingnessRate: number;
  importantDecisionHandoffScore: number;
  capabilityExpansionIsNotGoal: true;
  passed: boolean;
  reasonsZh: string[];
  productGoalZh: string;
};

export function buildTrustWillingnessReport(input: {
  cohort: BetaTripCohortV1;
  scorecards: TripQualityScorecardV1[];
  minCompleteTrips?: number;
  minWillingnessRate?: number;
  minHandoffScore?: number;
}): TrustWillingnessReportV1 {
  const complete = input.cohort.trips.filter((t) => t.completeTrip);
  const completeTripN = complete.length;
  const willingN = complete.filter((t) => t.userWillingToContinue === true)
    .length;
  const willingnessRate =
    completeTripN === 0 ? 0 : willingN / completeTripN;

  const handoffScore =
    input.scorecards.length === 0
      ? 0
      : input.scorecards.reduce(
          (s, c) =>
            s +
            c.taskSuccessScore * 0.5 +
            c.experienceScore * 0.3 +
            (c.userWillingToContinue ? 0.2 : 0),
          0,
        ) / input.scorecards.length;

  const reasonsZh: string[] = [];
  if (completeTripN < (input.minCompleteTrips ?? 3)) {
    reasonsZh.push(`完整 Trip 不足 ${completeTripN}`);
  }
  if (willingnessRate < (input.minWillingnessRate ?? 0.7)) {
    reasonsZh.push(
      `继续依赖意愿率 ${willingnessRate.toFixed(2)} 不足`,
    );
  }
  if (handoffScore < (input.minHandoffScore ?? 0.7)) {
    reasonsZh.push(
      `重要决策托付分 ${handoffScore.toFixed(2)} 不足`,
    );
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push(
      '用户在完整旅行中愿意把重要旅行决策交给 Nara（能力扩张不是目标）',
    );
  }

  return {
    schemaId: TRUST_WILLINGNESS_REPORT_SCHEMA,
    version: 1,
    completeTripN,
    willingN,
    willingnessRate,
    importantDecisionHandoffScore: handoffScore,
    capabilityExpansionIsNotGoal: true,
    passed,
    reasonsZh,
    productGoalZh:
      '让真实用户在完整旅行中越来越愿意把重要旅行决策交给 Nara',
  };
}
