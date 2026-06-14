import {
  aggregateTripAssessmentDays,
  collectTopSuggestions,
  pickActionableTopSuggestion,
} from './trip-assessment-aggregate.util';
import type { DayAssessmentDto } from '../dto/trip-metrics.dto';
import {
  AssessmentGrade,
  AssessmentStatus,
  DayType,
} from '../dto/trip-metrics.dto';

function buildDay(partial: Partial<DayAssessmentDto> & Pick<DayAssessmentDto, 'date'>): DayAssessmentDto {
  return {
    dayType: DayType.TOURING_DAY,
    status: AssessmentStatus.REASONABLE,
    activityCount: 2,
    activeDurationHours: 4,
    overallScore: 96,
    overallGrade: AssessmentGrade.EXCELLENT,
    isReasonable: true,
    criticalIssueCount: 0,
    warningCount: 0,
    ...partial,
  };
}

describe('trip-assessment-aggregate.util', () => {
  it('uses average score for overallReasonableRate instead of binary pass rate', () => {
    const days = [
      buildDay({ date: '2026-11-01', overallScore: 96 }),
      buildDay({ date: '2026-11-02', overallScore: 94 }),
    ];

    const aggregate = aggregateTripAssessmentDays(days);

    expect(aggregate.overallReasonableRate).toBe(95);
    expect(aggregate.overallAverageScore).toBe(95);
    expect(aggregate.daysPassRate).toBe(100);
    expect(aggregate.plannedDays).toBe(2);
  });

  it('excludes rest days from plannedDays and status counters', () => {
    const days = [
      buildDay({ date: '2026-11-01', overallScore: 96 }),
      buildDay({
        date: '2026-11-02',
        dayType: DayType.REST_DAY,
        status: AssessmentStatus.REASONABLE,
        overallScore: 90,
      }),
      buildDay({
        date: '2026-11-03',
        dayType: DayType.REST_DAY,
        status: AssessmentStatus.REASONABLE,
        overallScore: 90,
      }),
    ];

    const aggregate = aggregateTripAssessmentDays(days);

    expect(aggregate.restDays).toBe(2);
    expect(aggregate.plannedDays).toBe(1);
    expect(aggregate.reasonableDays).toBe(1);
    expect(aggregate.overallReasonableRate).toBe(96);
  });

  it('returns zero reasonable rate when nothing is actively planned', () => {
    const days = [
      buildDay({
        date: '2026-11-01',
        dayType: DayType.UNPLANNED,
        status: AssessmentStatus.UNPLANNED,
        overallScore: null,
        overallGrade: null,
        isReasonable: false,
      }),
    ];

    const aggregate = aggregateTripAssessmentDays(days);

    expect(aggregate.overallReasonableRate).toBe(0);
    expect(aggregate.daysPassRate).toBe(0);
    expect(aggregate.plannedDays).toBe(0);
  });

  it('suppresses top suggestions for excellent reasonable days', () => {
    expect(
      pickActionableTopSuggestion({
        overallScore: 96,
        status: AssessmentStatus.REASONABLE,
        worstDimensionScore: 85,
        suggestion: '建议再添加 1 个活动',
      }),
    ).toBeUndefined();
  });

  it('keeps suggestions when day needs attention', () => {
    expect(
      pickActionableTopSuggestion({
        overallScore: 68,
        status: AssessmentStatus.NEEDS_ATTENTION,
        worstDimensionScore: 55,
        suggestion: '建议再添加 1 个活动',
      }),
    ).toBe('建议再添加 1 个活动');
  });

  it('collectTopSuggestions skips rest days and days without actionable suggestions', () => {
    const days = [
      buildDay({
        date: '2026-11-01',
        topSuggestion: undefined,
      }),
      buildDay({
        date: '2026-11-02',
        dayType: DayType.REST_DAY,
        topSuggestion: '不应出现',
      }),
      buildDay({
        date: '2026-11-03',
        status: AssessmentStatus.NEEDS_ATTENTION,
        overallScore: 65,
        topSuggestion: '建议减少活动数量',
      }),
    ];

    expect(collectTopSuggestions(days)).toEqual(['建议减少活动数量']);
  });
});
