import type {
  FeasibilityIssueDto,
  TripFeasibilityReportDto,
} from '../types/trip-constraint-solver.types';
import { deriveTeamFitChecklistStatus } from './team-fit-assessment.util';

export type FeasibilityChecklistId =
  | 'schedule'
  | 'opening_hours'
  | 'team_fit'
  | 'weather'
  | 'booking';

export type FeasibilityChecklistResult = 'passed' | 'pending' | 'failed' | 'deferred';

export interface FeasibilityChecklistItem {
  result: FeasibilityChecklistResult;
  detail?: string;
}

export type FeasibilityChecklistMap = Record<FeasibilityChecklistId, FeasibilityChecklistItem>;

function issueHasProofEvidence(issue: FeasibilityIssueDto, evidenceType: string): boolean {
  return (issue.proofs ?? []).some((p) => p.evidenceType === evidenceType);
}

function issuesMatching(
  issues: FeasibilityIssueDto[],
  predicate: (issue: FeasibilityIssueDto) => boolean,
): FeasibilityIssueDto[] {
  return issues.filter(predicate);
}

function worstChecklistResult(
  issues: FeasibilityIssueDto[],
): FeasibilityChecklistItem {
  if (issues.some((i) => i.priority === 'must_handle')) {
    const top = issues.find((i) => i.priority === 'must_handle');
    return { result: 'failed', detail: top?.title ?? top?.message };
  }
  if (issues.some((i) => i.priority === 'suggest_adjust')) {
    const top = issues.find((i) => i.priority === 'suggest_adjust');
    return { result: 'pending', detail: top?.title ?? top?.message };
  }
  if (issues.some((i) => i.priority === 'pending_confirm')) {
    const top = issues.find((i) => i.priority === 'pending_confirm');
    return { result: 'pending', detail: top?.title ?? top?.message };
  }
  return { result: 'passed' };
}

function deriveScheduleChecklist(issues: FeasibilityIssueDto[]): FeasibilityChecklistItem {
  const scheduleIssues = issuesMatching(issues, (i) => i.category === 'schedule');
  if (scheduleIssues.length === 0) {
    return { result: 'passed', detail: '日程可执行' };
  }
  return worstChecklistResult(scheduleIssues);
}

function deriveOpeningHoursChecklist(issues: FeasibilityIssueDto[]): FeasibilityChecklistItem {
  const related = issuesMatching(
    issues,
    (i) =>
      issueHasProofEvidence(i, 'opening_hours') ||
      (i.category === 'booking' && /营业|开放|opening/i.test(`${i.title} ${i.message}`)),
  );
  if (related.length === 0) {
    return { result: 'passed', detail: '营业时间已覆盖' };
  }
  return worstChecklistResult(related);
}

function deriveBookingChecklist(issues: FeasibilityIssueDto[]): FeasibilityChecklistItem {
  const related = issuesMatching(
    issues,
    (i) =>
      issueHasProofEvidence(i, 'booking_confirmation') ||
      issueHasProofEvidence(i, 'permit') ||
      (i.category === 'booking' && /预订|预约|permit/i.test(`${i.title} ${i.message}`)),
  );
  if (related.length === 0) {
    return { result: 'passed', detail: '预订证据已覆盖' };
  }
  return worstChecklistResult(related);
}

function deriveWeatherChecklist(
  issues: FeasibilityIssueDto[],
  phaseHint?: string,
): FeasibilityChecklistItem {
  const related = issuesMatching(
    issues,
    (i) =>
      i.category === 'environment' &&
      (issueHasProofEvidence(i, 'weather') ||
        /天气|weather|wind|降水/i.test(`${i.title} ${i.message}`)),
  );

  if (related.length === 0) {
    return { result: 'passed', detail: '天气证据已覆盖' };
  }

  const onlyPending = related.every((i) => i.priority === 'pending_confirm');
  const farFromDeparture =
    typeof phaseHint === 'string' &&
    (phaseHint.includes('出发前') || phaseHint.includes('规划'));

  if (onlyPending && farFromDeparture) {
    return { result: 'deferred', detail: '出发前 7 天复查' };
  }

  return worstChecklistResult(related);
}

/**
 * Loop checklist 五项与 feasibility-report issues/proofs 同源映射。
 */
export function deriveFeasibilityChecklistFromReport(
  report: TripFeasibilityReportDto,
): FeasibilityChecklistMap {
  const issues = report.issues ?? [];
  const teamFitIssues = issues.filter((i) => i.category === 'team_fit');
  const teamFitDim = report.dimensions.find((d) => d.key === 'team_fit');

  return {
    schedule: deriveScheduleChecklist(issues),
    opening_hours: deriveOpeningHoursChecklist(issues),
    team_fit: deriveTeamFitChecklistStatus({
      score: report.teamFitSummary?.score ?? teamFitDim?.score ?? 100,
      memberCount: report.teamFitSummary?.memberCount ?? 1,
      profilingCompletedCount: report.teamFitSummary?.profilingCompletedCount ?? 0,
      issues: teamFitIssues,
    }),
    weather: deriveWeatherChecklist(issues, report.phaseHint),
    booking: deriveBookingChecklist(issues),
  };
}
