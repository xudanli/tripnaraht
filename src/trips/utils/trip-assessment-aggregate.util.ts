import type { DayAssessmentDto } from '../dto/trip-metrics.dto';
import { AssessmentGrade, AssessmentStatus, DayType } from '../dto/trip-metrics.dto';

/** 参与整体分数/合理率统计的日程（排除未规划日与纯休息日） */
export function isActiveAssessmentDay(day: Pick<DayAssessmentDto, 'dayType'>): boolean {
  return day.dayType !== DayType.UNPLANNED && day.dayType !== DayType.REST_DAY;
}

export interface TripAssessmentAggregate {
  reasonableDays: number;
  needsAttentionDays: number;
  hasIssuesDays: number;
  unplannedDays: number;
  restDays: number;
  plannedDays: number;
  overallAverageScore: number;
  overallReasonableRate: number;
  daysPassRate: number;
}

export function aggregateTripAssessmentDays(days: DayAssessmentDto[]): TripAssessmentAggregate {
  let reasonableDays = 0;
  let needsAttentionDays = 0;
  let hasIssuesDays = 0;
  let unplannedDays = 0;
  let restDays = 0;

  for (const assessment of days) {
    if (assessment.dayType === DayType.REST_DAY) {
      restDays++;
      continue;
    }

    switch (assessment.status) {
      case AssessmentStatus.REASONABLE:
        reasonableDays++;
        break;
      case AssessmentStatus.NEEDS_ATTENTION:
        needsAttentionDays++;
        break;
      case AssessmentStatus.HAS_ISSUES:
        hasIssuesDays++;
        break;
      case AssessmentStatus.UNPLANNED:
        unplannedDays++;
        break;
    }
  }

  const plannedDays = days.filter(isActiveAssessmentDay).length;
  const scoredPlannedDays = days.filter(
    (day) => isActiveAssessmentDay(day) && day.overallScore !== null,
  );

  const overallAverageScore =
    scoredPlannedDays.length > 0
      ? Math.round(
          scoredPlannedDays.reduce((sum, day) => sum + (day.overallScore ?? 0), 0) /
            scoredPlannedDays.length,
        )
      : 0;

  const overallReasonableRate = overallAverageScore;

  const daysPassRate =
    plannedDays > 0 ? Math.round((reasonableDays / plannedDays) * 100) : 0;

  return {
    reasonableDays,
    needsAttentionDays,
    hasIssuesDays,
    unplannedDays,
    restDays,
    plannedDays,
    overallAverageScore,
    overallReasonableRate,
    daysPassRate,
  };
}

export interface PickTopSuggestionInput {
  overallScore: number;
  status: AssessmentStatus;
  worstDimensionScore: number;
  suggestion?: string;
}

/** 仅在确有改进空间时返回首要建议，避免「优秀 + 主要建议」矛盾 */
export function pickActionableTopSuggestion(input: PickTopSuggestionInput): string | undefined {
  const { overallScore, status, worstDimensionScore, suggestion } = input;
  if (!suggestion) return undefined;

  if (status === AssessmentStatus.REASONABLE && overallScore >= 90 && worstDimensionScore >= 80) {
    return undefined;
  }

  if (status === AssessmentStatus.REASONABLE && worstDimensionScore >= 85) {
    return undefined;
  }

  return suggestion;
}

export function collectTopSuggestions(
  days: DayAssessmentDto[],
  limit = 5,
): string[] {
  const suggestions: string[] = [];
  for (const day of days) {
    if (!isActiveAssessmentDay(day)) continue;
    if (!day.topSuggestion || suggestions.includes(day.topSuggestion)) continue;
    suggestions.push(day.topSuggestion);
  }
  return suggestions.slice(0, limit);
}

export function scoreToAssessmentGrade(score: number): AssessmentGrade {
  if (score >= 90) return AssessmentGrade.EXCELLENT;
  if (score >= 75) return AssessmentGrade.GOOD;
  if (score >= 60) return AssessmentGrade.FAIR;
  if (score >= 40) return AssessmentGrade.POOR;
  return AssessmentGrade.BAD;
}
