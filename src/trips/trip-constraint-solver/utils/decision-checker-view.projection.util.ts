/**
 * 决策检查器 BFF — 视图投影（禁止前端拼装文案/数值）
 */

import type { RepairOption, RepairOptionsResponse, ReadinessCascadeUiHint } from '../../readiness/types/coverage-map.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type {
  DecisionCheckerActionDto,
  DecisionCheckerCascadeNodeDto,
  DecisionCheckerCounterfactualDto,
  DecisionCheckerEvidenceDto,
  DecisionCheckerEvidenceItemDto,
  DecisionCheckerImpactDto,
  DecisionCheckerMetricDto,
  DecisionCheckerOverviewDto,
  DecisionCheckerRepairPlanDto,
  DecisionCheckerResponse,
  DecisionCheckerScenarioDto,
} from '../types/decision-checker.types';
import { DECISION_CHECKER_SCHEMA } from '../types/decision-checker.types';
import { collectDecisionCheckerEvidenceItems } from './decision-checker-evidence.projection.util';
import type {
  FeasibilityIssueDto,
  TripFeasibilityReportDto,
} from '../types/trip-constraint-solver.types';
import type { ConstraintsSummaryResponse } from '../types/constraints-summary.types';
import { resolveEffectiveRepairOptions } from './daily-drive-repair.util';
import {
  appendSplitSnapshotSuffix,
  projectSplitPlanBundle,
  type SplitPlanProjectionInput,
} from './split-plan.projection.util';
import type { SplitPlanScheduleSource } from './split-plan-schedule.source.util';
import { formatDriveDurationZhLong } from './daily-drive-threshold.util';
import { buildFeasibilityIssueUserExplanation } from './feasibility-issue-user-copy.util';
import {
  buildCounterfactualFromOptionPreviews,
} from './decision-checker-option-preview.util';
import type { UnifiedDecisionActionPreviewView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';

export type DecisionCheckerProjectionInput = {
  tripId: string;
  generatedAt: string;
  focusConflictId?: string;
  isStale?: boolean;
  staleReason?: string;
  constraintsSummary: ConstraintsSummaryResponse;
  report: TripFeasibilityReportDto;
  planningConflicts: PlanningConflictItem[];
  primaryIssue?: FeasibilityIssueDto;
  repairOptions?: RepairOptionsResponse;
  assessScoreDelta?: number;
  experienceCompletionDelta?: number;
  /** 已应用分流 id，投影时跳过 */
  appliedSplitPlanIds?: string[];
  /** Schedule 真源 — splitPlan 必须有对应 daySplits */
  schedule?: SplitPlanScheduleSource | null;
  /** 覆盖地图 POI — 证据 Tab 按当日 itinerary 全量投影 */
  coveragePois?: import('../../readiness/types/coverage-map.types').PoiCoverage[];
  coverageCalculatedAt?: string;
  evaluationMode?: 'CHANGE_PREVIEW' | 'PLAN_VERIFY';
  optionPreviews?: UnifiedDecisionActionPreviewView[];
};

const SCENARIO_VARIANTS: Array<'blue' | 'orange' | 'purple'> = ['blue', 'orange', 'purple'];
const SCENARIO_LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function formatMinuteDelta(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0 && m > 0) return `${sign}${h}h ${m}m`;
  if (h > 0) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

function currencySymbol(currency: string): string {
  if (currency === 'CNY') return '¥';
  if (currency === 'USD') return '$';
  return currency + ' ';
}

export function formatCurrencyDelta(amount: number, currency = 'CNY'): string {
  const sign = amount >= 0 ? '+' : '-';
  const abs = Math.abs(Math.round(amount));
  const symbol = currencySymbol(currency);
  return `${sign}${symbol}${abs}`;
}

export function formatScoreDelta(delta: number): string {
  const rounded = Math.round(delta);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

export { mapProofEvidenceKind, mapProofReliability } from './decision-checker-evidence-mapping.util';

function buildEvidenceSummary(items: DecisionCheckerEvidenceItemDto[]): DecisionCheckerEvidenceDto['summary'] {
  const summary = { high: 0, medium: 0, low: 0, lastUpdatedAt: undefined as string | undefined };
  for (const item of items) {
    summary[item.reliability]++;
    if (item.observedAt && (!summary.lastUpdatedAt || item.observedAt > summary.lastUpdatedAt)) {
      summary.lastUpdatedAt = item.observedAt;
    }
  }
  return summary;
}

function buildDailyDriveCascade(issue: FeasibilityIssueDto): DecisionCheckerCascadeNodeDto[] {
  const day = issue.affectedDays?.[0] ?? issue.anchors?.fromDayNumber ?? 1;
  const shortfall = issue.anchors?.shortfallMinutes;
  return [
    {
      id: `cascade_drive_fatigue_day${day}`,
      order: 1,
      title: '驾驶疲劳',
      description:
        typeof shortfall === 'number' && shortfall > 0
          ? `Day ${day} 超出每日驾驶上限约 ${formatMinuteDelta(shortfall).replace(/^\+/, '')}`
          : `Day ${day} 超出每日驾驶上限`,
      status: 'affected',
    },
    {
      id: `cascade_lodging_checkin_day${day}`,
      order: 2,
      title: '住宿签到',
      description: '晚抵达可能影响入住办理与次日出发节奏',
      status: 'at_risk',
    },
    {
      id: `cascade_safety_day${day}`,
      order: 3,
      title: '行车安全',
      description: '连续长途驾驶增加事故与注意力下降风险',
      status: 'at_risk',
    },
  ];
}

function buildCalculationDetailUrl(tripId: string, issue?: FeasibilityIssueDto): string | undefined {
  if (!issue?.id) return undefined;
  return `/trips/${tripId}/feasibility-report/issues/${encodeURIComponent(issue.id)}/repair-options`;
}

function isDailyDriveIssue(issue?: FeasibilityIssueDto): boolean {
  return issue?.issueKind === 'daily_drive';
}

function isNoNightDriveIssue(issue?: FeasibilityIssueDto): boolean {
  return issue?.issueKind === 'no_night_drive';
}

function resolveMaxDailyDriveHoursFromIssue(issue?: FeasibilityIssueDto): number | undefined {
  const travel = issue?.anchors?.travelMinutes;
  const shortfall = issue?.anchors?.shortfallMinutes;
  if (typeof travel === 'number' && typeof shortfall === 'number' && shortfall > 0) {
    const maxMinutes = travel - shortfall;
    if (maxMinutes > 0) return Math.round((maxMinutes / 60) * 10) / 10;
  }
  const match = issue?.message?.match(/每日上限\s*(\d+(?:\.\d+)?)\s*小时/);
  if (match) return Number(match[1]);
  return undefined;
}

function buildJudgmentExplanation(issue?: FeasibilityIssueDto): string | undefined {
  if (!issue) return undefined;
  return buildFeasibilityIssueUserExplanation(issue);
}

function severityToConflictLevel(priority: FeasibilityIssueDto['priority']): 'hard' | 'soft' {
  return priority === 'must_handle' ? 'hard' : 'soft';
}

function pickPrimaryConflict(
  planningConflicts: PlanningConflictItem[],
  focusConflictId?: string,
  primaryIssue?: FeasibilityIssueDto,
): PlanningConflictItem | undefined {
  if (focusConflictId) {
    const focused = planningConflicts.find((c) => c.id === focusConflictId);
    if (focused) return focused;
  }
  if (primaryIssue) {
    const byIssue = planningConflicts.find((c) => c.id === primaryIssue.id || c.issue?.id === primaryIssue.id);
    if (byIssue) return byIssue;
  }
  const hard = planningConflicts.find((c) => c.priority === 'must_handle');
  return hard ?? planningConflicts[0];
}

function repairSourceFromOption(option: RepairOption): DecisionCheckerRepairPlanDto['source'] {
  const action = String(option.actionType ?? option.id ?? '').toLowerCase();
  if (action.includes('relax')) return 'relaxation';
  if (action.includes('gate')) return 'gate_compare';
  return 'feasibility_repair';
}

function buildRepairMetrics(
  option: RepairOption,
  issue?: FeasibilityIssueDto,
  assessScoreDelta?: number,
  currency = 'CNY',
): DecisionCheckerMetricDto[] {
  const metrics: DecisionCheckerMetricDto[] = [];

  const shortfall = issue?.anchors?.shortfallMinutes;
  const scoreDelta =
    typeof assessScoreDelta === 'number' && assessScoreDelta !== 0
      ? assessScoreDelta
      : isDailyDriveIssue(issue) && typeof shortfall === 'number' && shortfall > 0
        ? Math.min(20, Math.max(8, Math.round(shortfall / 6)))
        : option.impact === 'high'
          ? 13
          : option.impact === 'medium'
            ? 8
            : 5;

  if (scoreDelta !== 0) {
    metrics.push({
      key: 'feasibility',
      label: '可行度',
      displayValue: formatScoreDelta(scoreDelta),
      tone: scoreDelta >= 0 ? 'good' : 'bad',
      raw: { delta: scoreDelta, unit: 'score' },
    });
  }

  const anchors = issue?.anchors;
  const netMinutes =
    (option.metadata?.netImpactMinutes as number | undefined) ??
    (typeof shortfall === 'number' && shortfall > 0 ? -shortfall : undefined);
  if (typeof netMinutes === 'number' && netMinutes !== 0) {
    metrics.push({
      key: 'drive_duration',
      label: '驾驶时长',
      displayValue: formatMinuteDelta(netMinutes),
      tone: netMinutes <= 0 ? 'good' : 'bad',
      raw: { delta: netMinutes, unit: 'minute' },
    });
  } else if (typeof shortfall === 'number' && shortfall > 0) {
    const driveDelta = -shortfall;
    metrics.push({
      key: 'drive_duration',
      label: '驾驶时长',
      displayValue: formatMinuteDelta(driveDelta),
      tone: 'good',
      raw: { delta: driveDelta, unit: 'minute' },
    });
  }

  if (typeof option.cost === 'number' && option.cost !== 0) {
    metrics.push({
      key: 'budget',
      label: '预算变化',
      displayValue: formatCurrencyDelta(option.cost, currency),
      tone: option.cost <= 0 ? 'good' : 'neutral',
      raw: { delta: option.cost, unit: 'currency', currency },
    });
  }

  return metrics;
}

function buildRepairBenefits(option: RepairOption, issue?: FeasibilityIssueDto): string[] {
  const benefits: string[] = [];
  const desc = option.description?.trim();
  if (desc && desc.length <= 80) benefits.push(desc);

  if (isDailyDriveIssue(issue)) {
    const travel = issue?.anchors?.travelMinutes;
    const shortfall = issue?.anchors?.shortfallMinutes;
    if (typeof travel === 'number' && typeof shortfall === 'number' && shortfall > 0) {
      const afterMinutes = Math.max(0, travel - shortfall);
      const line = `连续驾驶时长降至 ${formatDriveDurationZhLong(afterMinutes)}（符合限制）`;
      if (line.length <= 80) benefits.push(line);
    }
  }

  const anchors = issue?.anchors;
  if (!isDailyDriveIssue(issue) && typeof anchors?.shortfallMinutes === 'number' && anchors.shortfallMinutes > 0) {
    const fixed = `连续驾驶时长问题有望减少约 ${anchors.shortfallMinutes} 分钟`;
    if (fixed.length <= 80) benefits.push(fixed);
  }
  if (option.timeEstimate?.trim()) {
    const est = `预计操作耗时 ${option.timeEstimate}`;
    if (est.length <= 80) benefits.push(est);
  }
  return benefits.slice(0, 4);
}

function repairOptionToPlan(
  option: RepairOption,
  index: number,
  issue?: FeasibilityIssueDto,
  assessScoreDelta?: number,
  currency = 'CNY',
): DecisionCheckerRepairPlanDto {
  const recommended = index === 0;
  return {
    id: option.id,
    source: repairSourceFromOption(option),
    badge: recommended ? `方案 ${index + 1}（推荐）` : `方案 ${index + 1}`,
    title: option.title,
    description: option.description,
    recommended,
    metrics: buildRepairMetrics(option, issue, recommended ? assessScoreDelta : undefined, currency),
    benefits: buildRepairBenefits(option, issue),
    cta: {
      type: 'open_repair_plan',
      label: '查看修复方案',
      payload: { repairOptionId: option.id, issueId: issue?.id },
    },
  };
}

function repairOptionToScenario(
  option: RepairOption,
  index: number,
  issue?: FeasibilityIssueDto,
  currency = 'CNY',
): DecisionCheckerScenarioDto {
  const recommended = index === 0;
  return {
    id: option.id,
    letter: SCENARIO_LETTERS[index],
    title: option.title,
    badge: recommended ? 'recommended' : 'alternative',
    badgeLabel: recommended ? '推荐' : '备选',
    description: option.description,
    variant: SCENARIO_VARIANTS[index % SCENARIO_VARIANTS.length],
    metrics: buildRepairMetrics(option, issue, undefined, currency),
    action: {
      type: 'select_option',
      payload: { optionId: option.id, issueId: issue?.id },
    },
  };
}

function cascadeHintToNode(hint: ReadinessCascadeUiHint, order: number): DecisionCheckerCascadeNodeDto {
  const status: DecisionCheckerCascadeNodeDto['status'] =
    hint.riskLevel === 'HIGH' || hint.riskLevel === 'CRITICAL' ? 'affected' : 'at_risk';
  return {
    id: hint.id,
    order,
    title: hint.entityLabel?.trim() || hint.triggerFactType || '级联影响',
    description: hint.message?.trim() || hint.recommendation?.trim() || '',
    status,
  };
}

function formatAffectedDaysLabel(days: number[]): { value: string; detail: string } | undefined {
  if (!days.length) return undefined;
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const detail = sorted.map((d) => `Day ${d}`).join('、');
  return { value: `${sorted.length} 天`, detail };
}

function buildImpact(
  input: DecisionCheckerProjectionInput,
  primary?: PlanningConflictItem,
  issue?: FeasibilityIssueDto,
  effectiveRepair?: RepairOptionsResponse,
): DecisionCheckerImpactDto {
  const cascadeHints = effectiveRepair?.cascadeUiHints ?? input.repairOptions?.cascadeUiHints ?? [];
  const currency = input.constraintsSummary.budget.currency ?? 'CNY';
  const repairCost = effectiveRepair?.options?.[0]?.cost ?? input.repairOptions?.options?.[0]?.cost;

  const affectedDays = issue?.affectedDays ?? primary?.affectedDays;
  const daysLabel = affectedDays?.length ? formatAffectedDaysLabel(affectedDays) : undefined;

  const travelers = input.constraintsSummary.travelers;
  const affectedMembers =
    travelers.count > 0
      ? {
          value: `${travelers.count} 人`,
          detail:
            travelers.profilingCompletedCount < travelers.memberCount
              ? `画像完成 ${travelers.profilingCompletedCount}/${travelers.memberCount}`
              : undefined,
          tone: 'warning' as const,
        }
      : undefined;

  const summary: DecisionCheckerImpactDto['summary'] = {};
  if (daysLabel) {
    summary.affectedDays = { value: daysLabel.value, detail: daysLabel.detail, tone: 'bad' };
  }
  if (affectedMembers) summary.affectedMembers = affectedMembers;
  if (typeof repairCost === 'number' && repairCost !== 0) {
    summary.budgetImpact = {
      value: formatCurrencyDelta(repairCost, currency),
      tone: repairCost <= 0 ? 'good' : 'neutral',
    };
  }
  if (typeof input.experienceCompletionDelta === 'number' && input.experienceCompletionDelta !== 0) {
    const pct = Math.round(input.experienceCompletionDelta);
    summary.experienceCompletion = {
      value: formatScoreDelta(pct) + '%',
      tone: pct >= 0 ? 'good' : 'bad',
    };
  }

  const constraints: DecisionCheckerImpactDto['constraints'] = [];
  if (issue) {
    if (isDailyDriveIssue(issue)) {
      const maxH = resolveMaxDailyDriveHoursFromIssue(issue);
      const shortfall = issue.anchors?.shortfallMinutes;
      constraints.push({
        constraintId: 'c_max_daily_drive',
        type: 'hard',
        name: maxH != null ? `每日驾驶上限 ≤ ${maxH} 小时` : issue.title,
        status:
          typeof shortfall === 'number' && shortfall > 0
            ? `超出 ${formatMinuteDelta(shortfall).replace(/^\+/, '')}`
            : issue.message.length > 60
              ? `${issue.message.slice(0, 59)}…`
              : issue.message,
        impact: issue.severity === 'high' ? 'high' : issue.severity === 'medium' ? 'medium' : 'low',
      });
    } else if (isNoNightDriveIssue(issue)) {
      constraints.push({
        constraintId: 'c_no_night_drive',
        type: 'hard',
        name: issue.title,
        status: issue.message.length > 60 ? `${issue.message.slice(0, 59)}…` : issue.message,
        impact: 'high',
      });
    } else {
      constraints.push({
        type: severityToConflictLevel(issue.priority),
        name: issue.title,
        status: issue.message.length > 60 ? `${issue.message.slice(0, 59)}…` : issue.message,
        impact: issue.severity,
      });
    }
  }

  const cascadeFromHints = cascadeHints.map((h, i) => cascadeHintToNode(h, i + 1));
  const cascade =
    cascadeFromHints.length > 0
      ? cascadeFromHints
      : isDailyDriveIssue(issue)
        ? buildDailyDriveCascade(issue!)
        : [];

  let aiInterpretation: DecisionCheckerImpactDto['aiInterpretation'];
  if (isDailyDriveIssue(issue)) {
    aiInterpretation = {
      text: '该冲突主要由 Day 长途连续驾驶引起，建议拆分路段或调整休息点。',
      source: 'kernel',
    };
    const day = issue?.affectedDays?.[0];
    if (day != null) {
      aiInterpretation = {
        text: `该冲突主要由 Day ${day} 长途连续驾驶引起，建议拆分路段或调整休息点。`,
        source: 'kernel',
      };
    }
  } else if (issue?.issueKind?.includes('travel') || issue?.category === 'transport') {
    aiInterpretation = {
      text: '该冲突主要由长途连续驾驶引起，建议拆分路段或调整休息点。',
      source: 'kernel',
    };
  } else if (issue?.category === 'team_fit') {
    aiInterpretation = {
      text: '团队节奏或成员画像差异可能放大该冲突的影响，建议先对齐成员偏好。',
      source: 'kernel',
    };
  }

  return { summary, constraints, cascade, aiInterpretation };
}

function buildCounterfactual(
  repairOptions?: RepairOptionsResponse,
  issue?: FeasibilityIssueDto,
  currency = 'CNY',
): DecisionCheckerCounterfactualDto {
  const options = repairOptions?.options ?? [];
  const scenarios = options.slice(0, 5).map((o, i) => repairOptionToScenario(o, i, issue, currency));

  let ifUnchanged: DecisionCheckerCounterfactualDto['ifUnchanged'];
  if (issue?.priority === 'must_handle') {
    const cascadeHints = repairOptions?.cascadeUiHints ?? [];
    const points =
      cascadeHints.length > 0
        ? cascadeHints.slice(0, 3).map((h) => ({
            title: h.entityLabel?.trim() || '风险点',
            description: h.message?.trim() || h.recommendation?.trim() || issue.message,
          }))
        : isDailyDriveIssue(issue)
          ? [
              {
                title: '疲劳增加',
                description:
                  typeof issue.anchors?.shortfallMinutes === 'number' && issue.anchors.shortfallMinutes > 0
                    ? `Day ${issue.affectedDays?.[0] ?? '?'} 驾驶超出上限 ${formatMinuteDelta(issue.anchors.shortfallMinutes).replace(/^\+/, '')}，疲劳与安全风险上升`
                    : issue.message,
              },
            ]
          : [{ title: issue.title, description: issue.message }];

    const riskLevel: 'high' | 'medium' | 'low' =
      issue.severity === 'high' ? 'high' : issue.severity === 'medium' ? 'medium' : 'low';
    const label = riskLevel === 'high' ? '风险较高' : riskLevel === 'medium' ? '风险中等' : '风险较低';

    const letters = scenarios.map((s) => s.letter).filter(Boolean).slice(0, 2);
    const letterHint = letters.length ? letters.join(' 或 ') : '推荐方案';

    ifUnchanged = {
      riskLevel,
      label,
      points,
      recommendation: {
        text: `建议选择 ${letterHint} 以获得更好的行程体验和更低风险。`,
        source: 'rule',
      },
    };
  }

  return {
    headline: '如果调整这些内容，会怎样？',
    subheadline:
      scenarios.length > 0
        ? `共 ${scenarios.length} 种调整路径，可对比可行度、驾驶时长与预算变化`
        : undefined,
    scenarios,
    ifUnchanged,
  };
}

function buildOverview(
  planningConflicts: PlanningConflictItem[],
  focusConflictId?: string,
  primaryIssue?: FeasibilityIssueDto,
  repairOptions?: RepairOptionsResponse,
  assessScoreDelta?: number,
  currency = 'CNY',
): DecisionCheckerOverviewDto {
  const hardCount = planningConflicts.filter((c) => c.priority === 'must_handle').length;
  const softCount = planningConflicts.filter((c) => c.priority === 'suggest_adjust').length;
  const primary = pickPrimaryConflict(planningConflicts, focusConflictId, primaryIssue);

  const overview: DecisionCheckerOverviewDto = {
    conflict: { hardCount, softCount },
  };

  if (primary) {
    overview.conflict.primary = {
      conflictId: primary.id,
      severity: primary.priority === 'must_handle' ? 'hard' : 'soft',
      title: primary.title,
      message: primary.message,
      affectedDays: primary.affectedDays,
    };
  }

  const firstOption = repairOptions?.options?.[0];
  if (firstOption) {
    overview.repairPlan = repairOptionToPlan(firstOption, 0, primaryIssue, assessScoreDelta, currency);
  }

  if (hardCount > 0) {
    overview.aiSuggestion = {
      text: '建议优先修复硬冲突，再优化软偏好以提升可行度。',
      source: 'rule',
    };
  }

  return overview;
}

export function buildSnapshotVersion(
  constraintsVersion: number,
  report: TripFeasibilityReportDto,
  generatedAt: string,
): string {
  const ts = generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', 'T');
  const planPart = report.verifiedForTripVersion ? `plan_${report.verifiedForTripVersion}` : 'plan_v0';
  return `constraints_v${constraintsVersion}:${planPart}:conflicts_${ts}`;
}

export function projectDecisionCheckerResponse(input: DecisionCheckerProjectionInput): DecisionCheckerResponse {
  const currency = input.constraintsSummary.budget.currency ?? 'CNY';
  const primary = pickPrimaryConflict(input.planningConflicts, input.focusConflictId, input.primaryIssue);
  const issue = input.primaryIssue ?? primary?.issue;
  const effectiveRepair = resolveEffectiveRepairOptions({
    tripId: input.tripId,
    primaryIssue: issue,
    repairOptions: input.repairOptions,
  });

  const evidenceItems = collectDecisionCheckerEvidenceItems({
    issue,
    allIssues: input.report.issues,
    coveragePois: input.coveragePois,
    coverageCalculatedAt: input.coverageCalculatedAt,
    planningConflicts: input.planningConflicts,
    focusConflictId: input.focusConflictId,
    dayTimeline: input.report.dayTimeline,
  });
  const evidence: DecisionCheckerEvidenceDto = {
    items: evidenceItems,
    summary: buildEvidenceSummary(evidenceItems),
    judgmentExplanation: buildJudgmentExplanation(issue),
    calculationDetailUrl: buildCalculationDetailUrl(input.tripId, issue),
  };

  const overview = buildOverview(
    input.planningConflicts,
    input.focusConflictId,
    issue,
    effectiveRepair,
    input.assessScoreDelta,
    currency,
  );
  const impact = buildImpact(input, primary, issue, effectiveRepair);
  const counterfactual =
    input.evaluationMode === 'CHANGE_PREVIEW' && input.optionPreviews?.length
      ? buildCounterfactualFromOptionPreviews(input.optionPreviews, issue)
      : buildCounterfactual(effectiveRepair, issue, currency);

  const splitBundleInput: SplitPlanProjectionInput = {
    tripId: input.tripId,
    report: input.report,
    constraintsSummary: input.constraintsSummary,
    primaryIssue: issue,
    repairOptions: effectiveRepair,
    experienceCompletionDelta: input.experienceCompletionDelta,
    appliedSplitPlanIds: input.appliedSplitPlanIds,
    schedule: input.schedule,
  };
  const splitBundle = projectSplitPlanBundle(splitBundleInput);

  const actions: DecisionCheckerActionDto[] = [];
  if (effectiveRepair?.options?.[0]) {
    actions.push({
      type: 'open_repair_plan',
      label: '查看修复方案',
      payload: { repairOptionId: effectiveRepair.options[0].id, issueId: issue?.id },
    });
  }
  if (counterfactual.scenarios.length > 1) {
    actions.push({
      type: 'select_option',
      label: '探索更多方案',
      payload: { issueId: issue?.id, optionIds: counterfactual.scenarios.map((s) => s.id) },
    });
  }
  if (issue) {
    actions.push({
      type: 'open_feasibility',
      label: '查看可行性报告',
      payload: { issueId: issue.id },
    });
  }
  if (evidenceItems.length) {
    actions.push({
      type: 'open_evidence',
      label: '查看证据链',
      payload: { issueId: issue?.id },
    });
  }

  if (splitBundle) {
    actions.push(...splitBundle.splitPlan.actions);
  }

  const baseSnapshot = buildSnapshotVersion(
    input.constraintsSummary.constraintsVersion,
    input.report,
    input.generatedAt,
  );
  const snapshotVersion = splitBundle
    ? appendSplitSnapshotSuffix(baseSnapshot, splitBundle.splitPlan.id)
    : baseSnapshot;

  return {
    schema: DECISION_CHECKER_SCHEMA,
    tripId: input.tripId,
    generatedAt: input.generatedAt,
    isStale: input.isStale,
    staleReason: input.staleReason,
    focusConflictId: input.focusConflictId ?? primary?.id,
    overview,
    evidence,
    impact,
    counterfactual,
    snapshotVersion,
    actions: actions.length ? actions : undefined,
    splitPlan: splitBundle
      ? {
          ...splitBundle.splitPlan,
          snapshotVersion,
        }
      : undefined,
    daySplits: splitBundle?.daySplits?.length ? splitBundle.daySplits : undefined,
    evaluationMode: input.evaluationMode,
  };
}
