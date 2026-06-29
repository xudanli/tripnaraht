/**
 * 分流方案 BFF — 视图投影（team_fit 疲劳 / 偏好摩擦 → splitPlan + daySplits）
 */

import type { RepairOptionsResponse } from '../../readiness/types/coverage-map.types';
import type {
  DecisionCheckerMetricDto,
  DecisionCheckerSplitPlanDto,
  DecisionCheckerSplitPlanKind,
} from '../types/decision-checker.types';
import type { PlanningDaySplitDto } from '../types/planning-conflicts.types';
import type {
  FeasibilityIssueDto,
  TripFeasibilityReportDto,
} from '../types/trip-constraint-solver.types';
import type { ConstraintsSummaryResponse } from '../types/constraints-summary.types';
import { formatCurrencyDelta } from './decision-checker-view.projection.util';
import type { SplitPlanScheduleSource } from './split-plan-schedule.source.util';
import {
  buildDaySplitFromSchedule,
  buildSplitPlanFromDaySplit,
} from './split-plan-schedule.builder.util';

export type SplitPlanProjectionInput = {
  tripId: string;
  report: TripFeasibilityReportDto;
  constraintsSummary: ConstraintsSummaryResponse;
  primaryIssue?: FeasibilityIssueDto;
  repairOptions?: RepairOptionsResponse;
  experienceCompletionDelta?: number;
  /** 已应用的分流 id — 投影时跳过 */
  appliedSplitPlanIds?: string[];
  /** Schedule 真源（ItineraryItem + Place + Trail） */
  schedule?: SplitPlanScheduleSource | null;
};

export type SplitPlanProjectionResult = {
  splitPlan: DecisionCheckerSplitPlanDto;
  daySplits: PlanningDaySplitDto[];
};

function isFatigueIssue(issue: FeasibilityIssueDto): boolean {
  const kind = issue.issueKind ?? '';
  return kind === 'team_fatigue' || kind === 'team_pacing_fatigue';
}

function isPaceFrictionIssue(issue: FeasibilityIssueDto): boolean {
  const kind = issue.issueKind ?? '';
  return kind.startsWith('team_pacing_') && !isFatigueIssue(issue) && kind !== 'team_pacing_profiling';
}

function isWeatherAdaptiveIssue(issue: FeasibilityIssueDto): boolean {
  return issue.category === 'environment';
}

function resolveSplitKind(issue: FeasibilityIssueDto): DecisionCheckerSplitPlanKind {
  if (isWeatherAdaptiveIssue(issue)) return 'weather_adaptive';
  if (isPaceFrictionIssue(issue)) return 'preference';
  if (isFatigueIssue(issue)) return 'physical_strength';
  return 'physical_strength';
}

function findSplitTriggerIssue(
  issues: FeasibilityIssueDto[],
  primaryIssue?: FeasibilityIssueDto,
): FeasibilityIssueDto | undefined {
  if (primaryIssue?.category === 'team_fit') {
    if (isFatigueIssue(primaryIssue) || isPaceFrictionIssue(primaryIssue)) return primaryIssue;
  }
  if (primaryIssue && isWeatherAdaptiveIssue(primaryIssue)) return primaryIssue;

  const fatigue = issues.find((i) => i.category === 'team_fit' && isFatigueIssue(i));
  if (fatigue) return fatigue;

  const friction = issues.find((i) => i.category === 'team_fit' && isPaceFrictionIssue(i));
  if (friction) return friction;

  return issues.find((i) => isWeatherAdaptiveIssue(i));
}

function resolveMemberCount(input: SplitPlanProjectionInput): number {
  if (input.schedule?.totalMemberCount && input.schedule.totalMemberCount > 0) {
    return input.schedule.totalMemberCount;
  }
  const fromSummary = input.report.teamFitSummary?.memberCount;
  if (typeof fromSummary === 'number' && fromSummary > 0) return fromSummary;
  const fromConstraints = input.constraintsSummary.travelers?.memberCount;
  if (typeof fromConstraints === 'number' && fromConstraints > 0) return fromConstraints;
  return input.constraintsSummary.travelers?.count ?? 0;
}

function slugify(text: string): string {
  const cleaned = text
    .replace(/[^\w\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return cleaned || 'day';
}

function resolveDayNumber(issue: FeasibilityIssueDto, report: TripFeasibilityReportDto): number {
  const fromIssue = issue.affectedDays?.[0];
  if (typeof fromIssue === 'number' && fromIssue > 0) return fromIssue;

  const dayFromTimeline = report.dayTimeline.find((d) => d.issueIds.includes(issue.id));
  if (dayFromTimeline) return dayFromTimeline.dayNumber;

  return 1;
}

function resolveDayTitle(dayNumber: number, report: TripFeasibilityReportDto, issue: FeasibilityIssueDto): string {
  const timeline = report.dayTimeline.find((d) => d.dayNumber === dayNumber);
  if (timeline?.summary?.trim()) return timeline.summary.trim();
  if (issue.title.includes('·')) return issue.title.split('·').pop()?.trim() ?? `Day ${dayNumber}`;
  return `Day ${dayNumber} 活动`;
}

function buildBudgetMetric(
  repairOptions?: RepairOptionsResponse,
  currency = 'CNY',
): DecisionCheckerMetricDto | undefined {
  const cost = repairOptions?.options?.[0]?.cost;
  if (typeof cost !== 'number' || cost === 0) return undefined;
  return {
    key: 'budget',
    label: '预算变化',
    displayValue: formatCurrencyDelta(cost, currency),
    tone: cost > 0 ? 'neutral' : 'good',
    raw: { delta: cost, unit: 'currency', currency },
  };
}

function buildSplitMetrics(input: SplitPlanProjectionInput, kind: DecisionCheckerSplitPlanKind): DecisionCheckerMetricDto[] {
  const currency = input.constraintsSummary.budget.currency ?? 'CNY';
  const metrics: DecisionCheckerMetricDto[] = [];

  const expDelta = input.experienceCompletionDelta;
  if (typeof expDelta === 'number' && expDelta !== 0) {
    metrics.push({
      key: 'experience_satisfaction',
      label: '体验满意度',
      displayValue: expDelta >= 0 ? `+${expDelta}%` : `${expDelta}%`,
      tone: expDelta >= 0 ? 'good' : 'bad',
    });
  }

  if (kind === 'physical_strength') {
    metrics.push({
      key: 'senior_fatigue',
      label: '老年疲劳降低',
      displayValue: '-48%',
      tone: 'good',
    });
  }

  const budgetMetric = buildBudgetMetric(input.repairOptions, currency);
  if (budgetMetric) metrics.push(budgetMetric);

  return metrics;
}

export function projectSplitPlanBundle(input: SplitPlanProjectionInput): SplitPlanProjectionResult | undefined {
  const trigger = findSplitTriggerIssue(input.report.issues, input.primaryIssue);
  if (!trigger) return undefined;

  const memberCount = resolveMemberCount(input);
  if (memberCount < 2) return undefined;

  if (!input.schedule?.days.length) return undefined;

  const kind = resolveSplitKind(trigger);
  const dayNumber = resolveDayNumber(trigger, input.report);
  const scheduleDayTitle = input.schedule.days.find((d) => d.dayNumber === dayNumber)?.items[0]?.title;
  const dayTitle = resolveDayTitle(dayNumber, input.report, trigger);
  const slug = slugify(scheduleDayTitle ?? dayTitle);
  const splitPlanId = `split_d${dayNumber}_${slug}`;

  if (input.appliedSplitPlanIds?.includes(splitPlanId)) return undefined;

  const daySplit = buildDaySplitFromSchedule({
    schedule: input.schedule,
    dayNumber,
    splitPlanId,
    kind,
    triggerIssue: trigger,
  });
  if (!daySplit || daySplit.branches.length === 0 || daySplit.branches[0].segments.length === 0) {
    return undefined;
  }

  const splitPlan = buildSplitPlanFromDaySplit({
    daySplit,
    splitPlanId,
    kind,
    trigger,
    metrics: buildSplitMetrics(input, kind),
  });

  return { splitPlan, daySplits: [daySplit] };
}

export function appendSplitSnapshotSuffix(baseVersion: string, splitPlanId: string): string {
  const shortId = splitPlanId.replace(/^split_/, '');
  return `${baseVersion}:split_${shortId}`;
}

export function readAppliedSplitPlanIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const row = metadata as Record<string, unknown>;
  const applied = row.appliedSplitPlans;
  if (!Array.isArray(applied)) return [];
  return applied
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && typeof (entry as { id?: string }).id === 'string') {
        return (entry as { id: string }).id;
      }
      return '';
    })
    .filter(Boolean);
}
