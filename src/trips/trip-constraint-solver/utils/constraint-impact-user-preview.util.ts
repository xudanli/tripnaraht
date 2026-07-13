/**
 * 约束影响预览 — 用户决策层（verdict / schedule 明细 / follow-up）
 * 禁止透传 assess 读模型、API path、persist 等开发术语。
 */

import type { PlanningRuleResult, DailyDrivePlan } from '../../tep/contracts/tep-self-drive.types';
import type { UnifiedConstraintAssessmentView } from '../../../decision-runtime/constraints/contracts/unified-constraint-assessment.types';
import { buildUnifiedConstraintAssessmentBundle } from '../../../decision-runtime/constraints/utils/unified-constraint-assessment.builder';
import { tepRuleResultsToAssessments } from '../../../decision-runtime/constraints/adapters/tep-rule-result-to-assessment.adapter';
import type { EvaluationContextVersion } from '../../../decision-runtime/constraints/contracts/evaluation-context-version.types';
import { resolveConstraintKeyForSdrRule } from './constraint-validator-registry.util';
import { TRIP_CONSTRAINT_LEGACY_IDS as LEGACY_IDS } from '../types/trip-constraint.types';
import type {
  ConstraintImpactAffectedDayDetail,
  ConstraintImpactAffectedDayTone,
  ConstraintImpactExecuteabilityDelta,
  ConstraintImpactPreviewConfidence,
  ConstraintImpactPreviewVerdict,
  ConstraintImpactScheduleDetailLevel,
  ConstraintImpactSuggestedFollowUp,
  ConstraintImpactUserSummary,
  ConstraintRefreshType,
  TripConstraint,
  TripConstraintAssessSummary,
  TripConstraintChangePatch,
  TripConstraintFeasibilitySnapshot,
  TripConstraintImpactPreviewResponse,
} from '../types/trip-constraint.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type { ConstraintImpactStructuredPreview } from './constraint-impact-preview.util';
import type { ScopedPreviewSimulation } from './constraint-impact-preview-scope.util';
import {
  formatDriveDurationZhLong,
} from './daily-drive-threshold.util';
import { buildFeasibilityIssueUserExplanation } from './feasibility-issue-user-copy.util';
import {
  buildDriveScheduleItems,
  driveLegsFromIssueAnchors,
  driveLegsFromTepPlan,
} from './constraint-impact-drive-schedule.util';
import {
  buildNoNightDayDetail,
  buildNoNightScheduleForPreview,
} from './constraint-impact-no-night-schedule.util';
import {
  formatNoNightDriveDetail,
  parseSdr202RuleMetadata,
  reprojectSdr202ForDraftBuffer,
} from '../../tep/utils/sdr-202-rule-metadata.util';

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

const VERDICT_LABELS: Record<ConstraintImpactPreviewVerdict, string> = {
  STILL_NOT_EXECUTABLE: '仍不可执行',
  IMPROVED: '有所改善',
  NOW_EXECUTABLE: '可以执行',
  NEEDS_CONFIRM: '需确认后检查',
};

const DEV_TEXT_PATTERNS = [
  /assess\s*读模型/i,
  /feasibility\s*读模型/i,
  /persist\s*=/i,
  /validate-scope/i,
  /forceRefreshEvidence/i,
  /^\/api\//i,
  /read-model/i,
];

const LEGACY_ID_TO_KEY: Record<string, string> = {
  [LEGACY_IDS.MAX_DAILY_DRIVE]: 'MAX_DAILY_DRIVE',
  [LEGACY_IDS.NO_NIGHT_DRIVE]: 'NO_NIGHT_DRIVE',
  [LEGACY_IDS.PACING_LEVEL]: 'PACING_LEVEL',
  [LEGACY_IDS.BUDGET_TOTAL]: 'BUDGET_TOTAL',
  [LEGACY_IDS.MAX_SEGMENT_DISTANCE]: 'MAX_SEGMENT_DISTANCE',
  [LEGACY_IDS.TIME_RANGE]: 'TIME_RANGE',
};

export interface BuildUserFacingImpactPreviewInput {
  tripId: string;
  tripDayCount: number;
  refreshType: ConstraintRefreshType;
  persist: boolean;
  changes: TripConstraintChangePatch[];
  items: TripConstraint[];
  conflictItems: PlanningConflictItem[];
  conflictsBefore: TripConstraintImpactPreviewResponse['conflictsBefore'];
  conflictsAfter?: TripConstraintImpactPreviewResponse['conflictsAfter'];
  assessBefore?: TripConstraintAssessSummary;
  assessAfter?: TripConstraintAssessSummary;
  feasibilityBefore?: TripConstraintFeasibilitySnapshot;
  feasibilityAfter?: TripConstraintFeasibilitySnapshot;
  structuredImpact: ConstraintImpactStructuredPreview;
  tepRuleResults?: PlanningRuleResult[];
  dailyDrivePlans?: DailyDrivePlan[];
  itemLabelsById?: Map<string, string>;
  contextVersion?: EvaluationContextVersion;
  evaluatedAt?: string;
  primaryConstraintId?: string;
  scopedPreview?: ScopedPreviewSimulation;
}

export interface UserFacingImpactPreview {
  userSummary: ConstraintImpactUserSummary;
  diffBullets: string[];
  executeabilityDelta: ConstraintImpactExecuteabilityDelta;
  scheduleDetailLevel: ConstraintImpactScheduleDetailLevel;
  scheduleDetailUnavailableReason?: string;
  affectedDays: ConstraintImpactAffectedDayTone[];
  affectedDayDetails: ConstraintImpactAffectedDayDetail[];
  suggestedFollowUp: ConstraintImpactSuggestedFollowUp;
  constraintAssessments: UnifiedConstraintAssessmentView[];
  structuredImpact: ConstraintImpactStructuredPreview;
  meta: TripConstraintImpactPreviewResponse['meta'];
}

function isDevFacingText(text: string): boolean {
  return DEV_TEXT_PATTERNS.some((re) => re.test(text));
}

function safeTrim(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function compactStrings(values: Array<string | undefined | null>): string[] {
  return values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function sanitizeUserBullets(bullets: Array<string | undefined | null>): string[] {
  return compactStrings(bullets).filter((b) => !isDevFacingText(b));
}

export function sanitizeDayNumbers(days: number[], tripDayCount: number): number[] {
  const maxDay = Math.max(1, tripDayCount);
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= maxDay))].sort(
    (a, b) => a - b,
  );
}

function readHoursValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const h =
      raw.maxHours ?? raw.hours ?? raw.maxDailyDrivingHours ?? raw.value;
    if (typeof h === 'number' && Number.isFinite(h)) return h;
  }
  return undefined;
}

function changedConstraintKeys(changes: TripConstraintChangePatch[] | null | undefined): string[] {
  return [
    ...new Set(
      asArray(changes)
        .map((ch) => LEGACY_ID_TO_KEY[ch.constraintId])
        .filter((k): k is string => Boolean(k)),
    ),
  ];
}

function driveConflicts(conflicts: PlanningConflictItem[] | null | undefined): PlanningConflictItem[] {
  return asArray(conflicts).filter(
    (c) =>
      c.issue?.issueKind === 'daily_drive' ||
      /daily.?drive|每日驾驶|驾驶超限|驾驶时长/.test(`${c.title} ${c.message}`),
  );
}

function proposedMaxDailyDriveHours(
  changes: TripConstraintChangePatch[] | null | undefined,
  items: TripConstraint[] | null | undefined,
): number | undefined {
  const changeList = asArray(changes);
  const itemList = asArray(items);
  const change = changeList.find((ch) => ch.constraintId === LEGACY_IDS.MAX_DAILY_DRIVE);
  if (!change) return undefined;
  const item = itemList.find((i) => i.id === LEGACY_IDS.MAX_DAILY_DRIVE);
  return readHoursValue(change.patch.value ?? item?.value);
}

function proposedMaxMinutesAfterSunset(
  changes: TripConstraintChangePatch[] | null | undefined,
  items: TripConstraint[] | null | undefined,
): number | undefined {
  const changeList = Array.isArray(changes) ? changes : [];
  const itemList = Array.isArray(items) ? items : [];
  const change = changeList.find((ch) => ch.constraintId === LEGACY_IDS.NO_NIGHT_DRIVE);
  const item = itemList.find((i) => i.id === LEGACY_IDS.NO_NIGHT_DRIVE);
  const raw =
    (change?.patch as { maxMinutesAfterSunset?: number } | undefined)?.maxMinutesAfterSunset ??
    (change?.patch as { value?: unknown } | undefined)?.value ??
    item?.value;
  if (typeof raw === 'number' && raw >= 0) return raw;
  if (raw && typeof raw === 'object' && typeof (raw as { maxMinutesAfterSunset?: number }).maxMinutesAfterSunset === 'number') {
    return (raw as { maxMinutesAfterSunset: number }).maxMinutesAfterSunset;
  }
  return item?.status === 'ACTIVE' ? 30 : undefined;
}

function buildDriveDayDetail(
  conflict: PlanningConflictItem,
  proposedLimitHours?: number,
  tepContext?: {
    dailyDrivePlans?: DailyDrivePlan[];
    itemLabelsById?: Map<string, string>;
  },
): ConstraintImpactAffectedDayDetail | undefined {
  const issue = conflict.issue;
  if (!issue) return undefined;

  const dayNumber = sanitizeDayNumbers(
    issue.affectedDays ?? conflict.affectedDays ?? [],
    99,
  )[0];
  if (dayNumber == null) return undefined;

  const driveMinutes =
    issue.anchors?.travelMinutes ??
    issue.anchors?.travelTimeMinutes ??
    conflict.studioConflict?.travelMinutes ??
    conflict.studioConflict?.travelTimeMinutes;
  const limitHours = proposedLimitHours;
  const actualLabel =
    driveMinutes != null
      ? formatDriveDurationZhLong(driveMinutes)
      : safeTrim(
          issue.proofs
            ?.find((p) => p.constraint === 'max_daily_drive')
            ?.currentFact?.replace(/^预计驾驶\s*/u, ''),
        );

  const stillOverLimit =
    driveMinutes != null &&
    limitHours != null &&
    driveMinutes > limitHours * 60;

  const daySummary =
    actualLabel && limitHours != null
      ? stillOverLimit
        ? `驾驶负荷超标，当日累计 ${actualLabel}，超过 ${limitHours} 小时上限`
        : `当日驾驶约 ${actualLabel}，在新上限 ${limitHours} 小时内`
      : buildFeasibilityIssueUserExplanation(issue);

  const items: ConstraintImpactAffectedDayDetail['items'] = [];
  let legs = driveLegsFromIssueAnchors(issue.anchors);
  if (!legs.length && asArray(tepContext?.dailyDrivePlans).length) {
    const plan = asArray(tepContext?.dailyDrivePlans).find((p) => p.dayIndex === dayNumber);
    if (plan) {
      legs = driveLegsFromTepPlan(plan, tepContext.itemLabelsById ?? new Map());
    }
  }

  if (legs.length) {
    items.push(
      ...buildDriveScheduleItems({
        legs,
        dayDriveMinutes: driveMinutes,
        limitHours,
      }),
    );
  } else if (actualLabel && limitHours != null) {
    items.push({
      label: `第 ${dayNumber} 天驾驶`,
      detail: `当日累计 ${actualLabel}，上限 ${limitHours} 小时/天`,
      impactType: 'DRIVE_OVER_LIMIT',
    });
  }

  return {
    dayNumber,
    tone: stillOverLimit || issue.priority === 'must_handle' ? 'major' : 'minor',
    daySummary,
    items: items.length ? items : undefined,
  };
}

function noNightConflicts(conflicts: PlanningConflictItem[] | null | undefined): PlanningConflictItem[] {
  return (Array.isArray(conflicts) ? conflicts : []).filter(
    (c) =>
      c?.issue?.issueKind === 'no_night_drive' ||
      /不夜驾|夜驾|no.?night|日落后.*驾驶/i.test(`${c?.title ?? ''} ${c?.message ?? ''}`),
  );
}

function budgetConflicts(conflicts: PlanningConflictItem[] | null | undefined): PlanningConflictItem[] {
  return asArray(conflicts).filter((c) => /预算|budget/i.test(`${c.title} ${c.message}`));
}

function paceConflicts(conflicts: PlanningConflictItem[] | null | undefined): PlanningConflictItem[] {
  return asArray(conflicts).filter((c) => {
    const kind = c.issue?.issueKind ?? '';
    return (
      kind.startsWith('team_pacing_') ||
      kind.includes('pace') ||
      /节奏|偏紧|疲劳|步行|fatigue/i.test(`${c.title} ${c.message}`)
    );
  });
}

function buildGenericDayDetail(conflict: PlanningConflictItem): ConstraintImpactAffectedDayDetail | undefined {
  const issue = conflict.issue;
  const dayNumber = sanitizeDayNumbers(
    issue?.affectedDays ?? conflict.affectedDays ?? [],
    99,
  )[0];
  if (dayNumber == null) return undefined;
  const daySummary = issue
    ? buildFeasibilityIssueUserExplanation(issue)
    : conflict.message;
  return {
    dayNumber,
    tone: conflict.priority === 'must_handle' ? 'major' : 'minor',
    daySummary,
    items: issue?.title
      ? [
          {
            label: issue.title,
            detail: daySummary,
            impactType: 'TIME_WINDOW',
          },
        ]
      : undefined,
  };
}

function buildAffectedSchedule(input: {
  constraintId?: string;
  conflicts: PlanningConflictItem[];
  tripDayCount: number;
  proposedLimitHours?: number;
  proposedMaxMinutesAfterSunset?: number;
  refreshType: ConstraintRefreshType;
  persist: boolean;
  dailyDrivePlans?: DailyDrivePlan[];
  itemLabelsById?: Map<string, string>;
  tepRuleResults?: PlanningRuleResult[];
}): {
  affectedDays: ConstraintImpactAffectedDayTone[];
  affectedDayDetails: ConstraintImpactAffectedDayDetail[];
  scheduleDetailLevel: ConstraintImpactScheduleDetailLevel;
  scheduleDetailUnavailableReason?: string;
} {
  let sourceConflicts = Array.isArray(input.conflicts) ? input.conflicts : [];
  if (input.constraintId === LEGACY_IDS.MAX_DAILY_DRIVE) {
    sourceConflicts = driveConflicts(input.conflicts);
  } else if (input.constraintId === LEGACY_IDS.NO_NIGHT_DRIVE) {
    sourceConflicts = noNightConflicts(input.conflicts);
  } else if (input.constraintId === LEGACY_IDS.BUDGET_TOTAL) {
    sourceConflicts = budgetConflicts(input.conflicts);
  } else if (input.constraintId === LEGACY_IDS.PACING_LEVEL) {
    sourceConflicts = paceConflicts(input.conflicts);
  }

  const driveIssues = driveConflicts(sourceConflicts);
  const noNightIssues = noNightConflicts(sourceConflicts);
  const driveDetails = driveIssues
    .map((c) =>
      buildDriveDayDetail(c, input.proposedLimitHours, {
        dailyDrivePlans: input.dailyDrivePlans,
        itemLabelsById: input.itemLabelsById,
      }),
    )
    .filter((d): d is ConstraintImpactAffectedDayDetail => Boolean(d));

  const noNightDetails =
    input.constraintId === LEGACY_IDS.NO_NIGHT_DRIVE
      ? buildNoNightScheduleForPreview({
          conflicts: noNightIssues,
          tepRuleResults: input.tepRuleResults,
          dailyDrivePlans: input.dailyDrivePlans,
          itemLabelsById: input.itemLabelsById,
          maxMinutesAfterSunset: input.proposedMaxMinutesAfterSunset,
        })
      : noNightIssues
          .map((c) => buildNoNightDayDetail(c, input.proposedMaxMinutesAfterSunset))
          .filter((d): d is ConstraintImpactAffectedDayDetail => Boolean(d));

  const genericDetails = sourceConflicts
    .filter((c) => !driveIssues.includes(c) && !noNightIssues.includes(c))
    .map((c) => buildGenericDayDetail(c))
    .filter((d): d is ConstraintImpactAffectedDayDetail => Boolean(d));

  const details = [...driveDetails, ...noNightDetails, ...genericDetails];

  const byDay = new Map<number, ConstraintImpactAffectedDayDetail>();
  for (const detail of details) {
    const existing = byDay.get(detail.dayNumber);
    if (!existing || detail.tone === 'major') {
      byDay.set(detail.dayNumber, detail);
    }
  }

  const affectedDayDetails = [...byDay.values()].sort((a, b) => a.dayNumber - b.dayNumber);
  const validDays = sanitizeDayNumbers(
    affectedDayDetails.map((d) => d.dayNumber),
    input.tripDayCount,
  );
  const filteredDetails = affectedDayDetails.filter((d) => validDays.includes(d.dayNumber));

  const affectedDays: ConstraintImpactAffectedDayTone[] = filteredDetails.map((d) => ({
    dayNumber: d.dayNumber,
    tone: d.tone,
  }));

  if (filteredDetails.some((d) => (d.items?.length ?? 0) > 0)) {
    return {
      affectedDays,
      affectedDayDetails: filteredDetails,
      scheduleDetailLevel: 'activity',
    };
  }

  if (filteredDetails.length > 0) {
    const hasActivityItems = filteredDetails.some((d) => (d.items?.length ?? 0) > 0);
    return {
      affectedDays,
      affectedDayDetails: filteredDetails,
      scheduleDetailLevel: 'day_summary',
      ...(input.constraintId === LEGACY_IDS.NO_NIGHT_DRIVE &&
      !hasActivityItems &&
      filteredDetails.length > 0
        ? {
            scheduleDetailUnavailableReason:
              '当前仅有不夜驾验证摘要，保存后将重新检查具体路段是否超日落',
          }
        : {}),
    };
  }

  if (input.constraintId === LEGACY_IDS.NO_NIGHT_DRIVE) {
    return {
      affectedDays: [],
      affectedDayDetails: [],
      scheduleDetailLevel: 'none',
      scheduleDetailUnavailableReason:
        input.refreshType === 'deep' && !input.persist
          ? '需保存后运行完整检查，才能看到具体路段是否超日落'
          : '当前暂无按路段不夜驾明细，保存后将重新检查',
    };
  }

  if (input.refreshType === 'deep' && !input.persist) {
    return {
      affectedDays: [],
      affectedDayDetails: [],
      scheduleDetailLevel: 'none',
      scheduleDetailUnavailableReason: '需保存后运行完整检查，才能看到具体活动影响',
    };
  }

  return {
    affectedDays: [],
    affectedDayDetails: [],
    scheduleDetailLevel: 'none',
    scheduleDetailUnavailableReason:
      input.refreshType === 'quick'
        ? '快速预览暂不包含活动明细，保存后将重新检查是否走得通'
        : '当前行程暂无按天驾驶明细',
  };
}

function findTepRuleForKey(
  results: PlanningRuleResult[] | undefined,
  constraintKey: string,
): PlanningRuleResult | undefined {
  return results?.find((r) => resolveConstraintKeyForSdrRule(r.ruleId) === constraintKey);
}

function resolveNoNightVerdictReason(
  tepRule: PlanningRuleResult | undefined,
  proposedMaxMinutesAfterSunset?: number,
): string | undefined {
  if (!tepRule || tepRule.ruleId !== 'SDR-202') return undefined;
  if (tepRule.degraded) {
    const meta = parseSdr202RuleMetadata(tepRule);
    return (
      safeTrim(tepRule.explanation) ??
      (meta.degradationReason
        ? `第 ${meta.dayIndex ?? 1} 日不夜驾检查已降级（${meta.degradationReason}）`
        : '不夜驾检查数据不足，需保存后重新验证')
    );
  }

  const baseMeta = parseSdr202RuleMetadata(tepRule);
  const buffer = proposedMaxMinutesAfterSunset ?? baseMeta.maxMinutesAfterSunset ?? 30;
  const meta = reprojectSdr202ForDraftBuffer(baseMeta, buffer);

  if (
    meta.finishLocal &&
    meta.sunsetLocal &&
    meta.cutoffLocal &&
    meta.overMinutes != null &&
    meta.overMinutes > 0
  ) {
    return formatNoNightDriveDetail({
      arriveLocal: meta.finishLocal,
      sunsetLocal: meta.sunsetLocal,
      cutoffLocal: meta.cutoffLocal,
      maxMinutesAfterSunset: buffer,
      overMinutes: meta.overMinutes,
    });
  }

  if (meta.finishLocal && meta.sunsetLocal && meta.cutoffLocal) {
    return `预计 ${meta.finishLocal} 结束，安全截止 ${meta.cutoffLocal}（日落 ${meta.sunsetLocal} + ${buffer} 分钟）`;
  }

  return safeTrim(tepRule.explanation);
}

function resolveVerdict(input: {
  constraintId?: string;
  proposedLimitHours?: number;
  proposedMaxMinutesAfterSunset?: number;
  driveConflicts: PlanningConflictItem[];
  scopedConflicts: PlanningConflictItem[];
  conflictsBefore: TripConstraintImpactPreviewResponse['conflictsBefore'];
  conflictsAfter?: TripConstraintImpactPreviewResponse['conflictsAfter'];
  feasibilityAfter?: TripConstraintFeasibilitySnapshot;
  assessAfter?: TripConstraintAssessSummary;
  tepRule?: PlanningRuleResult;
  persist: boolean;
  refreshType: ConstraintRefreshType;
}): { verdict: ConstraintImpactPreviewVerdict; verdictReason: string; confidence: ConstraintImpactPreviewConfidence } {
  const primaryIssue = input.driveConflicts[0]?.issue;
  const driveMinutes =
    primaryIssue?.anchors?.travelMinutes ?? primaryIssue?.anchors?.travelTimeMinutes;
  const limit = input.proposedLimitHours;

  if (input.tepRule?.outcome === 'NEED_CONFIRM') {
    return {
      verdict: 'NEEDS_CONFIRM',
      verdictReason: input.tepRule.explanation || '部分规则需确认后才能判断是否可执行',
      confidence: 'MEDIUM',
    };
  }

  if (input.constraintId === LEGACY_IDS.NO_NIGHT_DRIVE && input.tepRule) {
    const noNightReason = resolveNoNightVerdictReason(
      input.tepRule,
      input.proposedMaxMinutesAfterSunset,
    );
    const baseMeta = parseSdr202RuleMetadata(input.tepRule);
    const buffer = input.proposedMaxMinutesAfterSunset ?? baseMeta.maxMinutesAfterSunset ?? 30;
    const meta = reprojectSdr202ForDraftBuffer(baseMeta, buffer);

    if (input.tepRule.degraded) {
      return {
        verdict: 'NEEDS_CONFIRM',
        verdictReason: noNightReason ?? '不夜驾检查数据不足，需保存后重新验证',
        confidence: 'MEDIUM',
      };
    }

    if (meta.overMinutes != null && meta.overMinutes > 0) {
      return {
        verdict: 'STILL_NOT_EXECUTABLE',
        verdictReason: noNightReason ?? '仍存在不夜驾风险',
        confidence: input.persist ? 'HIGH' : 'MEDIUM',
      };
    }

    if (
      input.proposedMaxMinutesAfterSunset != null &&
      input.proposedMaxMinutesAfterSunset > (baseMeta.maxMinutesAfterSunset ?? 30)
    ) {
      return {
        verdict: 'IMPROVED',
        verdictReason:
          noNightReason ??
          `放宽至日落后 ${buffer} 分钟内结束驾驶后，相关路段可能符合不夜驾要求`,
        confidence: 'MEDIUM',
      };
    }
  }

  const stillBlockedByDrive =
    driveMinutes != null &&
    limit != null &&
    driveMinutes > limit * 60;

  const tepBlocked =
    input.tepRule?.outcome === 'REJECT' ||
    input.tepRule?.outcome === 'SUGGEST_REPAIR';

  if (stillBlockedByDrive || tepBlocked) {
    const actual =
      driveMinutes != null ? formatDriveDurationZhLong(driveMinutes) : undefined;
    const day = primaryIssue?.affectedDays?.[0] ?? 1;
    const reason =
      actual && limit != null
        ? `第 ${day} 天驾驶 ${actual}，仍超过 ${limit} 小时上限`
        : input.tepRule?.explanation ??
          buildFeasibilityIssueUserExplanation(primaryIssue!) ??
          '收紧约束后仍存在驾驶负荷问题';
    return {
      verdict: 'STILL_NOT_EXECUTABLE',
      verdictReason: reason,
      confidence: input.persist ? 'HIGH' : 'MEDIUM',
    };
  }

  if (input.feasibilityAfter?.canStartExecute || input.assessAfter) {
    const improved =
      (input.feasibilityAfter?.mustHandle ?? 99) <
      (input.driveConflicts.length > 0 ? 1 : 0);
    if (input.feasibilityAfter?.canStartExecute) {
      return {
        verdict: 'NOW_EXECUTABLE',
        verdictReason: '按新约束检查后，行程可以执行',
        confidence: 'HIGH',
      };
    }
    if (improved) {
      return {
        verdict: 'IMPROVED',
        verdictReason: '冲突有所减少，建议保存后再次确认可执行性',
        confidence: input.persist ? 'HIGH' : 'MEDIUM',
      };
    }
  }

  if (!input.persist) {
    const mhDelta =
      input.conflictsAfter != null
        ? input.conflictsAfter.mustHandle - input.conflictsBefore.mustHandle
        : undefined;
    if (input.constraintId === LEGACY_IDS.PACING_LEVEL) {
      return {
        verdict: mhDelta != null && mhDelta < 0 ? 'IMPROVED' : 'NEEDS_CONFIRM',
        verdictReason:
          mhDelta != null && mhDelta < 0
            ? '放慢节奏后，与行程偏紧相关的提醒可能减少'
            : '行程节奏变更尚未保存，保存后将重新评估日程松紧',
        confidence: 'MEDIUM',
      };
    }
    if (input.constraintId === LEGACY_IDS.BUDGET_TOTAL && mhDelta != null) {
      if (mhDelta < 0) {
        return {
          verdict: 'IMPROVED',
          verdictReason: '提高预算后，与预算相关的必处理项可能减少',
          confidence: 'MEDIUM',
        };
      }
      if (mhDelta > 0) {
        return {
          verdict: 'STILL_NOT_EXECUTABLE',
          verdictReason: '降低预算后，仍可能有景点或交通超出预算',
          confidence: 'MEDIUM',
        };
      }
    }
    if (input.constraintId === LEGACY_IDS.MAX_DAILY_DRIVE && input.scopedConflicts.length > 0) {
      const primaryIssue = input.driveConflicts[0]?.issue;
      const driveMinutes =
        primaryIssue?.anchors?.travelMinutes ?? primaryIssue?.anchors?.travelTimeMinutes;
      const limit = input.proposedLimitHours;
      const actual =
        driveMinutes != null ? formatDriveDurationZhLong(driveMinutes) : undefined;
      const day = primaryIssue?.affectedDays?.[0] ?? 1;
      if (actual && limit != null && driveMinutes != null && driveMinutes > limit * 60) {
        return {
          verdict: 'STILL_NOT_EXECUTABLE',
          verdictReason: `第 ${day} 天驾驶 ${actual}，仍超过 ${limit} 小时上限`,
          confidence: 'MEDIUM',
        };
      }
    }
    return {
      verdict: 'NEEDS_CONFIRM',
      verdictReason:
        input.refreshType === 'deep'
          ? '变更尚未保存，保存后将运行完整检查是否走得通'
          : '变更尚未保存，保存后将重新检查是否走得通',
      confidence: 'MEDIUM',
    };
  }

  return {
    verdict: 'IMPROVED',
    verdictReason: '约束已更新，请查看下方日程与冲突变化',
    confidence: 'MEDIUM',
  };
}

function buildScoreDeltaReason(input: {
  scoreDelta?: number;
  mustHandleDelta?: number;
  refreshType: ConstraintRefreshType;
  persist: boolean;
  proposedLimitHours?: number;
  driveConflicts: PlanningConflictItem[];
}): string | undefined {
  if (
    input.mustHandleDelta != null &&
    input.mustHandleDelta !== 0 &&
    (input.scoreDelta == null || input.scoreDelta === 0)
  ) {
    return '冲突计数已更新，可执行性分数待完整检查后刷新';
  }

  if (input.scoreDelta != null && input.scoreDelta !== 0) {
    if (input.proposedLimitHours != null && input.driveConflicts.length > 0) {
      return `每日驾驶上限收紧后，相关天数仍可能超载`;
    }
    return `可执行性评分预计变化 ${input.scoreDelta >= 0 ? '+' : ''}${input.scoreDelta}`;
  }

  if (!input.persist && input.refreshType === 'quick') {
    return '快速预览未重算评分，保存后将运行完整检查';
  }

  return undefined;
}

function buildConflictBucketLabel(
  bucket: 'mustHandle' | 'suggestAdjust' | 'pendingConfirm',
  before: number,
  after?: number,
  driveRelated?: boolean,
): string {
  if (after == null) {
    if (bucket === 'mustHandle' && before > 0) {
      return driveRelated
        ? `当前有 ${before} 条必处理项与驾驶负荷相关，保存后将按新上限重算`
        : `当前有 ${before} 条必处理项，保存后将重算`;
    }
    return `当前 ${before} 条，保存后重算`;
  }
  const delta = after - before;
  if (delta === 0) return `仍为 ${after} 条`;
  if (bucket === 'mustHandle' && driveRelated) {
    return delta < 0
      ? `与驾驶上限相关的必处理项减少 ${Math.abs(delta)} 条`
      : `与驾驶上限相关的必处理项增加 ${delta} 条`;
  }
  return delta < 0 ? `减少 ${Math.abs(delta)} 条` : `增加 ${delta} 条`;
}

function buildExecuteabilityDelta(input: {
  base?: TripConstraintImpactPreviewResponse['executeabilityDelta'];
  conflictsBefore: TripConstraintImpactPreviewResponse['conflictsBefore'];
  conflictsAfter?: TripConstraintImpactPreviewResponse['conflictsAfter'];
  refreshType: ConstraintRefreshType;
  persist: boolean;
  proposedLimitHours?: number;
  driveConflicts: PlanningConflictItem[];
  tepRule?: PlanningRuleResult;
}): ConstraintImpactExecuteabilityDelta {
  const scoreDeltaReason = buildScoreDeltaReason({
    scoreDelta: input.base?.scoreDelta,
    mustHandleDelta: input.base?.mustHandleDelta,
    refreshType: input.refreshType,
    persist: input.persist,
    proposedLimitHours: input.proposedLimitHours,
    driveConflicts: input.driveConflicts,
  });

  const blockingRuleIds = input.tepRule?.ruleId ? [input.tepRule.ruleId] : undefined;
  const driveRelated = input.driveConflicts.length > 0;

  return {
    ...input.base,
    scoreDeltaReason,
    blockingRuleIds,
    conflictsDeltaSummary: {
      mustHandle: {
        before: input.conflictsBefore.mustHandle,
        after: input.conflictsAfter?.mustHandle,
        label: buildConflictBucketLabel(
          'mustHandle',
          input.conflictsBefore.mustHandle,
          input.conflictsAfter?.mustHandle,
          driveRelated,
        ),
      },
      suggestAdjust: {
        before: input.conflictsBefore.suggestAdjust,
        after: input.conflictsAfter?.suggestAdjust,
        label: buildConflictBucketLabel(
          'suggestAdjust',
          input.conflictsBefore.suggestAdjust,
          input.conflictsAfter?.suggestAdjust,
        ),
      },
      pendingConfirm: {
        before: input.conflictsBefore.pendingConfirm,
        after: input.conflictsAfter?.pendingConfirm,
        label: buildConflictBucketLabel(
          'pendingConfirm',
          input.conflictsBefore.pendingConfirm,
          input.conflictsAfter?.pendingConfirm,
        ),
      },
    },
  };
}

function buildSuggestedFollowUp(input: {
  tripId: string;
  refreshType: ConstraintRefreshType;
  persist: boolean;
  verdict: ConstraintImpactPreviewVerdict;
}): ConstraintImpactSuggestedFollowUp {
  if (input.persist) {
    return {
      label: '查看更新后的诊断结果',
      action: 'OPEN_FEASIBILITY_REPORT',
      deepLink: `/dashboard/plan-studio?tripId=${input.tripId}&tab=schedule&view=diagnosis`,
    };
  }
  if (input.refreshType === 'deep' || input.verdict === 'STILL_NOT_EXECUTABLE') {
    return {
      label: '保存并检查是否走得通',
      action: 'CONFIRM_AND_DEEP_CHECK',
      deepLink: `/dashboard/plan-studio?tripId=${input.tripId}&tab=constraints&view=impact`,
    };
  }
  return {
    label: '保存后查看完整影响',
    action: 'CONFIRM_AND_DEEP_CHECK',
    deepLink: `/dashboard/plan-studio?tripId=${input.tripId}&tab=constraints`,
  };
}

function buildPreviewConstraintAssessments(input: {
  tripId: string;
  changedKeys: string[];
  conflicts: PlanningConflictItem[];
  items: TripConstraint[] | null | undefined;
  tepRuleResults?: PlanningRuleResult[];
  dailyDrivePlans?: DailyDrivePlan[];
  itemLabelsById?: Map<string, string>;
  proposedLimitHours?: number;
  proposedMaxMinutesAfterSunset?: number;
  contextVersion?: EvaluationContextVersion;
  evaluatedAt?: string;
}): UnifiedConstraintAssessmentView[] {
  if (!input.changedKeys.length) return [];

  const itemList = asArray(input.items);
  const issues = asArray(input.conflicts).map((c) => c.issue).filter((i): i is NonNullable<typeof i> => Boolean(i));
  const relevantTep = (input.tepRuleResults ?? []).filter((r) => {
    const key = resolveConstraintKeyForSdrRule(r.ruleId);
    return key != null && input.changedKeys.includes(key);
  });

  const constraintMeta: Record<string, { legacyConstraintId?: string; contractRequirement?: string }> =
    {};
  for (const key of input.changedKeys) {
    const legacyId = Object.entries(LEGACY_ID_TO_KEY).find(([, k]) => k === key)?.[0];
    const item = legacyId ? itemList.find((i) => i.id === legacyId) : undefined;
    const limit =
      key === 'MAX_DAILY_DRIVE' && input.proposedLimitHours != null
        ? `≤ ${input.proposedLimitHours}h`
        : undefined;
    constraintMeta[key] = {
      legacyConstraintId: legacyId,
      contractRequirement: limit,
    };
    if (item && !constraintMeta[key].contractRequirement) {
      const hours = readHoursValue(item.value);
      if (hours != null) constraintMeta[key].contractRequirement = `≤ ${hours}h`;
    }
  }

  const bundle = buildUnifiedConstraintAssessmentBundle({
    tripId: input.tripId,
    generatedAt: input.evaluatedAt ?? new Date().toISOString(),
    contextVersion: input.contextVersion ?? {
      planVersionId: 'preview',
      policyVersion: 0,
      worldRevision: 'preview',
      rulePackVersion: 'preview',
    },
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    feasibilityIssues: issues,
    tepAssessments: tepRuleResultsToAssessments(relevantTep, {
      tripId: input.tripId,
      evaluationMode: 'PLAN_VERIFY',
      contextVersion: input.contextVersion ?? {
        planVersionId: 'preview',
        policyVersion: 0,
        worldRevision: 'preview',
        rulePackVersion: 'preview',
      },
      evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
      dailyDrivePlans: input.dailyDrivePlans,
      itemLabelsById: input.itemLabelsById,
    }),
    constraintMeta,
  });

  return bundle.items
    .filter((item) => input.changedKeys.includes(item.constraintKey))
    .map((view) =>
      enrichAssessmentViewForPreview(
        view,
        input.proposedLimitHours,
        input.proposedMaxMinutesAfterSunset,
      ),
    );
}

function enrichAssessmentViewForPreview(
  view: UnifiedConstraintAssessmentView,
  proposedLimitHours?: number,
  proposedMaxMinutesAfterSunset?: number,
): UnifiedConstraintAssessmentView {
  if (view.constraintKey === 'NO_NIGHT_DRIVE') {
    const lane = view.lanes.executability;
    if (!lane) return view;
    const persistedBuffer = lane.evidence?.maxMinutesAfterSunset ?? 30;
    const buffer = proposedMaxMinutesAfterSunset ?? persistedBuffer;
    const arriveLocal = lane.evidence?.arriveLocal;
    const sunsetLocal = lane.evidence?.sunsetLocal;
    const cutoffLocal =
      sunsetLocal && buffer != null
        ? reprojectSdr202ForDraftBuffer(
            {
              sunsetLocal,
              finishLocal: arriveLocal,
              cutoffLocal: lane.evidence?.cutoffLocal,
              maxMinutesAfterSunset: persistedBuffer,
              overMinutes: lane.evidence?.measuredMinutes,
            },
            buffer,
          ).cutoffLocal ?? lane.evidence?.cutoffLocal
        : lane.evidence?.cutoffLocal;
    const overMinutes =
      arriveLocal && cutoffLocal
        ? reprojectSdr202ForDraftBuffer(
            {
              sunsetLocal,
              finishLocal: arriveLocal,
              cutoffLocal,
              maxMinutesAfterSunset: persistedBuffer,
            },
            buffer,
          ).overMinutes ?? lane.evidence?.measuredMinutes
        : lane.evidence?.measuredMinutes;
    const message =
      arriveLocal && sunsetLocal && cutoffLocal && overMinutes != null && overMinutes > 0
        ? formatNoNightDriveDetail({
            arriveLocal,
            sunsetLocal,
            cutoffLocal,
            maxMinutesAfterSunset: buffer,
            overMinutes,
          })
        : lane.message;

    return {
      ...view,
      contractRequirement: `日落后 ${buffer} 分钟内结束驾驶`,
      lanes: {
        ...view.lanes,
        executability: {
          ...lane,
          message,
          evidence: {
            ...lane.evidence,
            limit: sunsetLocal ? `日落 ${sunsetLocal} + ${buffer}min` : `日落 + ${buffer}min`,
            maxMinutesAfterSunset: buffer,
            cutoffLocal,
            measuredMinutes: overMinutes,
            actual: arriveLocal ?? lane.evidence?.actual,
          },
        },
      },
    };
  }

  if (view.constraintKey !== 'MAX_DAILY_DRIVE' || proposedLimitHours == null) {
    return view;
  }
  const lane = view.lanes.executability;
  if (!lane) return view;
  const actual = lane.evidence?.actual ?? lane.message;
  return {
    ...view,
    contractRequirement: `≤ ${proposedLimitHours}h`,
    lanes: {
      ...view.lanes,
      executability: {
        ...lane,
        message:
          lane.message ??
          (actual ? `第 ${lane.evidence?.day ?? 1} 日驾驶负荷仍超过 ${proposedLimitHours} 小时上限` : lane.message),
        evidence: {
          ...lane.evidence,
          limit: `${proposedLimitHours}h`,
        },
      },
    },
  };
}

function buildDiffBullets(input: {
  structuredBullets: string[];
  userSummary: ConstraintImpactUserSummary;
  executeabilityDelta: ConstraintImpactExecuteabilityDelta;
  constraintChanges: ConstraintImpactStructuredPreview['constraintChanges'];
  affectedDayDetails: ConstraintImpactAffectedDayDetail[];
}): string[] {
  const bullets = sanitizeUserBullets([
    input.userSummary.verdictReason,
    ...input.constraintChanges.map((c) => c.userFacingSummary),
    ...input.affectedDayDetails.map((d) => d.daySummary),
    input.executeabilityDelta.conflictsDeltaSummary?.mustHandle?.label,
    input.executeabilityDelta.conflictsDeltaSummary?.suggestAdjust?.label,
    input.executeabilityDelta.conflictsDeltaSummary?.pendingConfirm?.label,
    input.executeabilityDelta.scoreDeltaReason,
    ...input.structuredBullets,
  ]);

  return [...new Set(bullets)].slice(0, 8);
}

function conflictsForPreviewScope(
  constraintId: string | undefined,
  conflicts: PlanningConflictItem[],
): PlanningConflictItem[] {
  if (!constraintId) return conflicts;
  return conflicts.filter((c) => {
    const related = c.relatedConstraintIds;
    if (related?.includes(constraintId)) return true;
    const inferred = /每日驾驶|daily.?drive/.test(`${c.title} ${c.message}`)
      ? constraintId === LEGACY_IDS.MAX_DAILY_DRIVE
      : /不夜驾|夜驾/.test(`${c.title} ${c.message}`)
        ? constraintId === LEGACY_IDS.NO_NIGHT_DRIVE
        : /预算|budget/i.test(`${c.title} ${c.message}`)
          ? constraintId === LEGACY_IDS.BUDGET_TOTAL
          : /节奏|偏紧|fatigue/i.test(`${c.title} ${c.message}`)
            ? constraintId === LEGACY_IDS.PACING_LEVEL
            : false;
    return inferred;
  });
}

export function buildUserFacingImpactPreview(
  input: BuildUserFacingImpactPreviewInput,
): UserFacingImpactPreview {
  const primaryConstraintId =
    input.primaryConstraintId ?? input.changes[0]?.constraintId ?? input.scopedPreview?.constraintId;
  const scopedConflicts =
    input.scopedPreview?.scopedConflicts ??
    conflictsForPreviewScope(primaryConstraintId, input.conflictItems);
  const scopedConflictsBefore =
    input.scopedPreview?.conflictsBefore ?? {
      mustHandle: scopedConflicts.filter((c) => c.priority === 'must_handle').length,
      suggestAdjust: scopedConflicts.filter((c) => c.priority === 'suggest_adjust').length,
      pendingConfirm: scopedConflicts.filter((c) => c.priority === 'pending_confirm').length,
    };
  const scopedConflictsAfter =
    input.scopedPreview?.conflictsAfter ?? input.conflictsAfter ?? scopedConflictsBefore;

  const changedKeys = changedConstraintKeys(input.changes);
  const proposedLimitHours = proposedMaxDailyDriveHours(input.changes, input.items);
  const proposedSunsetBuffer = proposedMaxMinutesAfterSunset(input.changes, input.items);
  const driveIssueList = driveConflicts(scopedConflicts);
  const tepRule = changedKeys.includes('MAX_DAILY_DRIVE')
    ? findTepRuleForKey(input.tepRuleResults, 'MAX_DAILY_DRIVE')
    : changedKeys.includes('NO_NIGHT_DRIVE')
      ? findTepRuleForKey(input.tepRuleResults, 'NO_NIGHT_DRIVE')
      : undefined;

  const schedule = buildAffectedSchedule({
    constraintId: primaryConstraintId,
    conflicts: scopedConflicts,
    tripDayCount: input.tripDayCount,
    proposedLimitHours,
    proposedMaxMinutesAfterSunset: proposedSunsetBuffer,
    refreshType: input.refreshType,
    persist: input.persist,
    dailyDrivePlans: input.dailyDrivePlans,
    itemLabelsById: input.itemLabelsById,
    tepRuleResults: input.tepRuleResults,
  });

  const verdictPack = resolveVerdict({
    constraintId: primaryConstraintId,
    proposedLimitHours,
    proposedMaxMinutesAfterSunset: proposedSunsetBuffer,
    driveConflicts: driveIssueList,
    scopedConflicts,
    conflictsBefore: scopedConflictsBefore,
    conflictsAfter: scopedConflictsAfter,
    feasibilityAfter: input.feasibilityAfter,
    assessAfter: input.assessAfter,
    tepRule,
    persist: input.persist,
    refreshType: input.refreshType,
  });

  const userSummary: ConstraintImpactUserSummary = {
    verdict: verdictPack.verdict,
    verdictLabel: VERDICT_LABELS[verdictPack.verdict],
    verdictReason: verdictPack.verdictReason,
    confidence: verdictPack.confidence,
    previewMode: input.refreshType,
  };

  const baseDelta = {
    scoreDelta:
      input.assessBefore && input.assessAfter
        ? input.assessAfter.overallAverageScore - input.assessBefore.overallAverageScore
        : input.scopedPreview?.estimatedScoreDelta ??
          input.structuredImpact.executeability?.scoreDelta,
    mustHandleDelta: scopedConflictsAfter.mustHandle - scopedConflictsBefore.mustHandle,
    suggestAdjustDelta:
      scopedConflictsAfter.suggestAdjust - scopedConflictsBefore.suggestAdjust,
  };

  const executeabilityDelta = buildExecuteabilityDelta({
    base: baseDelta,
    conflictsBefore: scopedConflictsBefore,
    conflictsAfter: scopedConflictsAfter,
    refreshType: input.refreshType,
    persist: input.persist,
    proposedLimitHours,
    driveConflicts: driveIssueList,
    tepRule,
  });

  const suggestedFollowUp = buildSuggestedFollowUp({
    tripId: input.tripId,
    refreshType: input.refreshType,
    persist: input.persist,
    verdict: verdictPack.verdict,
  });

  const constraintAssessments = buildPreviewConstraintAssessments({
    tripId: input.tripId,
    changedKeys,
    conflicts: scopedConflicts,
    items: input.items,
    tepRuleResults: input.tepRuleResults,
    dailyDrivePlans: input.dailyDrivePlans,
    itemLabelsById: input.itemLabelsById,
    proposedLimitHours,
    proposedMaxMinutesAfterSunset: proposedSunsetBuffer,
    contextVersion: input.contextVersion,
    evaluatedAt: input.evaluatedAt,
  });

  const structuredImpact: ConstraintImpactStructuredPreview = {
    ...input.structuredImpact,
    schedule: {
      ...input.structuredImpact.schedule,
      scheduleDetailLevel: schedule.scheduleDetailLevel,
      scheduleDetailUnavailableReason: schedule.scheduleDetailUnavailableReason,
      affectedDays: schedule.affectedDays,
      affectedDayDetails: schedule.affectedDayDetails,
      daysNeedingSplit: sanitizeDayNumbers(
        input.structuredImpact.schedule?.daysNeedingSplit ?? schedule.affectedDays.map((d) => d.dayNumber),
        input.tripDayCount,
      ),
    },
  };

  const diffBullets = buildDiffBullets({
    structuredBullets: input.structuredImpact.summaryBullets,
    userSummary,
    executeabilityDelta,
    constraintChanges: structuredImpact.constraintChanges,
    affectedDayDetails: schedule.affectedDayDetails,
  });

  const meta: TripConstraintImpactPreviewResponse['meta'] =
    input.refreshType === 'deep' && !input.persist
      ? {
          debug: {
            endpoint: `/api/trips/${input.tripId}/feasibility-report/validate`,
            body: { forceRefreshEvidence: true },
            refreshType: input.refreshType,
            engines: ['assess', 'feasibility', 'tep'],
          },
        }
      : {
          debug: {
            refreshType: input.refreshType,
            engines: ['assess', 'planning-conflicts', 'tep'],
            scopedConstraintId: primaryConstraintId,
          },
        };

  return {
    userSummary,
    diffBullets,
    executeabilityDelta,
    scheduleDetailLevel: schedule.scheduleDetailLevel,
    scheduleDetailUnavailableReason: schedule.scheduleDetailUnavailableReason,
    affectedDays: schedule.affectedDays,
    affectedDayDetails: schedule.affectedDayDetails,
    suggestedFollowUp,
    constraintAssessments,
    structuredImpact,
    meta,
  };
}
