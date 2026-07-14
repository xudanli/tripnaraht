import type { PlanningRuleResult } from '../../tep/contracts/tep-self-drive.types';
import type { DailyDrivePlan } from '../../tep/contracts/tep-self-drive.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type {
  ConstraintImpactAffectedDayDetail,
  ConstraintImpactAffectedDayItem,
} from '../types/trip-constraint.types';
import {
  addMinutesToClock,
  buildNoNightDetailFromSdr202Rule,
  computeMinutesOverCutoff,
  formatNoNightDriveDetail,
  parseSdr202RuleMetadata,
} from '../../tep/utils/sdr-202-rule-metadata.util';
import { formatClockLabelOptional } from '../../../common/utils/format-clock-label.util';

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function formatClockLabel(value?: string): string | undefined {
  return formatClockLabelOptional(value);
}

function parseSunsetFromText(text: string): string | undefined {
  return /日落\s*(\d{2}:\d{2})/.exec(text)?.[1];
}

function parseCutoffFromText(text: string): string | undefined {
  return /截止\s*(\d{2}:\d{2})/.exec(text)?.[1];
}

function parseArriveFromText(text: string): string | undefined {
  return /预计\s*(\d{2}:\d{2})\s*抵达/.exec(text)?.[1];
}

function resolveDayNumber(conflict: PlanningConflictItem): number | undefined {
  const issueDays = conflict.issue?.affectedDays;
  const conflictDays = conflict.affectedDays;
  const day =
    (Array.isArray(issueDays) ? issueDays[0] : undefined) ??
    (Array.isArray(conflictDays) ? conflictDays[0] : undefined);
  return typeof day === 'number' && Number.isFinite(day) ? day : undefined;
}

function buildNoNightItemFromConflict(
  conflict: PlanningConflictItem,
  maxMinutesAfterSunset = 30,
): ConstraintImpactAffectedDayItem | undefined {
  const issue = conflict.issue;
  const from = issue?.anchors?.fromPlaceLabel;
  const to = issue?.anchors?.toPlaceLabel;
  const text = `${safeText(conflict.message)} ${safeText(issue?.message)}`.trim();
  const arriveLabel =
    formatClockLabel(issue?.anchors?.arriveAt) ?? parseArriveFromText(text);
  const sunsetLabel = parseSunsetFromText(text);
  const cutoffLabel =
    sunsetLabel && maxMinutesAfterSunset != null
      ? addMinutesToClock(sunsetLabel, maxMinutesAfterSunset)
      : parseCutoffFromText(text);
  const label = from && to ? `${from} → ${to}` : safeText(conflict.title) || '不夜驾';

  const detail =
    arriveLabel && sunsetLabel && cutoffLabel
      ? (() => {
          const over = computeMinutesOverCutoff(arriveLabel, cutoffLabel);
          return over != null && over > 0
            ? formatNoNightDriveDetail({
                arriveLocal: arriveLabel,
                sunsetLocal: sunsetLabel,
                cutoffLocal: cutoffLabel,
                maxMinutesAfterSunset,
                overMinutes: over,
              })
            : `预计 ${arriveLabel} 结束，安全截止 ${cutoffLabel}（日落 ${sunsetLabel} + ${maxMinutesAfterSunset} 分钟）`;
        })()
      : safeText(issue?.message) || safeText(conflict.message) || '存在不夜驾风险';

  return {
    itemId: issue?.anchors?.toItemId ?? issue?.toItemId,
    label,
    startTimeLabel: formatClockLabel(issue?.anchors?.departAt ?? issue?.anchors?.fromTime),
    detail,
    impactType: 'TIME_WINDOW',
  };
}

function buildNoNightAssessmentSummaryFromConflict(
  conflict: PlanningConflictItem,
): ConstraintImpactAffectedDayDetail | undefined {
  const dayNumber = resolveDayNumber(conflict);
  if (dayNumber == null) return undefined;
  const issue = conflict.issue;
  const daySummary =
    safeText(issue?.message) ||
    safeText(conflict.message) ||
    `第 ${dayNumber} 日存在不夜驾风险`;

  return {
    dayNumber,
    tone: conflict.priority === 'must_handle' ? 'major' : 'minor',
    daySummary,
  };
}

function buildNoNightAssessmentSummaryFromSdr202Rule(
  rule: PlanningRuleResult,
): ConstraintImpactAffectedDayDetail | undefined {
  const meta = parseSdr202RuleMetadata(rule);
  if (meta.dayIndex == null) return undefined;
  const explanation = safeText(rule.explanation);
  const daySummary =
    explanation ||
    (rule.degraded
      ? `第 ${meta.dayIndex} 日不夜驾检查已降级${meta.degradationReason ? `（${meta.degradationReason}）` : ''}`
      : `第 ${meta.dayIndex} 日存在不夜驾风险，需保存后运行完整检查`);

  return {
    dayNumber: meta.dayIndex,
    tone:
      rule.outcome === 'REJECT' || rule.severity === 'CRITICAL' || rule.severity === 'HIGH'
        ? 'major'
        : 'minor',
    daySummary,
  };
}

function findPlanForRule(
  rule: PlanningRuleResult,
  dailyDrivePlans: DailyDrivePlan[] | undefined,
): DailyDrivePlan | undefined {
  const affectedRefs = asArray(rule.affectedRefs);
  const dayRef = affectedRefs.find((ref) => /^day_(\d+)$/.test(ref));
  const dayIndex = dayRef ? Number(dayRef.replace('day_', '')) : undefined;
  if (dayIndex == null) return undefined;
  return asArray(dailyDrivePlans).find((row) => row.dayIndex === dayIndex);
}

export function buildNoNightDayDetail(
  conflict: PlanningConflictItem,
  maxMinutesAfterSunset?: number,
): ConstraintImpactAffectedDayDetail | undefined {
  const dayNumber = resolveDayNumber(conflict);
  if (dayNumber == null) return undefined;

  const issue = conflict.issue;
  const from = issue?.anchors?.fromPlaceLabel;
  const to = issue?.anchors?.toPlaceLabel;
  if (!from && !to) {
    return buildNoNightAssessmentSummaryFromConflict(conflict);
  }

  const item = buildNoNightItemFromConflict(conflict, maxMinutesAfterSunset ?? 30);
  if (!item) {
    return buildNoNightAssessmentSummaryFromConflict(conflict);
  }

  return {
    dayNumber,
    tone: conflict.priority === 'must_handle' ? 'major' : 'minor',
    daySummary: item.detail,
    items: [item],
  };
}

export function buildNoNightDetailsFromTepRules(input: {
  tepRuleResults?: PlanningRuleResult[] | null;
  dailyDrivePlans?: DailyDrivePlan[] | null;
  itemLabelsById?: Map<string, string>;
  maxMinutesAfterSunset?: number;
}): ConstraintImpactAffectedDayDetail[] {
  const rules = asArray(input.tepRuleResults).filter((rule) => rule?.ruleId === 'SDR-202');

  const byDay = new Map<number, ConstraintImpactAffectedDayDetail>();
  for (const rule of rules) {
    if (!rule || rule.outcome === 'PASS') continue;

    const plan = findPlanForRule(rule, input.dailyDrivePlans ?? undefined);
    const built =
      !rule.degraded && rule.outcome !== 'UNKNOWN'
        ? buildNoNightDetailFromSdr202Rule({
            rule,
            plan,
            itemLabelsById: input.itemLabelsById,
            maxMinutesAfterSunset: input.maxMinutesAfterSunset,
          })
        : undefined;

    if (built) {
      const item: ConstraintImpactAffectedDayItem = {
        itemId: built.itemId,
        label: built.label,
        startTimeLabel: built.startTimeLabel,
        detail: built.detail,
        impactType: 'TIME_WINDOW',
      };

      const existing = byDay.get(built.dayNumber);
      if (existing) {
        existing.items = [...(existing.items ?? []), item];
        if (rule.outcome === 'REJECT' || rule.severity === 'CRITICAL') {
          existing.tone = 'major';
        }
        continue;
      }

      byDay.set(built.dayNumber, {
        dayNumber: built.dayNumber,
        tone:
          rule.outcome === 'REJECT' || rule.severity === 'CRITICAL' || rule.severity === 'HIGH'
            ? 'major'
            : 'minor',
        daySummary: built.detail,
        items: [item],
      });
      continue;
    }

    const summary = buildNoNightAssessmentSummaryFromSdr202Rule(rule);
    if (!summary) continue;
    const existing = byDay.get(summary.dayNumber);
    if (!existing || summary.tone === 'major') {
      byDay.set(summary.dayNumber, summary);
    }
  }

  return [...byDay.values()].sort((a, b) => a.dayNumber - b.dayNumber);
}

export function buildNoNightScheduleForPreview(input: {
  conflicts?: PlanningConflictItem[] | null;
  tepRuleResults?: PlanningRuleResult[] | null;
  dailyDrivePlans?: DailyDrivePlan[] | null;
  itemLabelsById?: Map<string, string>;
  maxMinutesAfterSunset?: number;
}): ConstraintImpactAffectedDayDetail[] {
  const details: ConstraintImpactAffectedDayDetail[] = [];

  for (const conflict of asArray(input.conflicts)) {
    if (!conflict) continue;
    const detail = buildNoNightDayDetail(conflict, input.maxMinutesAfterSunset);
    if (detail) details.push(detail);
  }

  const hasActivityDetail = details.some((detail) => (detail.items?.length ?? 0) > 0);
  if (!hasActivityDetail) {
    details.push(
      ...buildNoNightDetailsFromTepRules({
        tepRuleResults: input.tepRuleResults,
        dailyDrivePlans: input.dailyDrivePlans,
        itemLabelsById: input.itemLabelsById,
        maxMinutesAfterSunset: input.maxMinutesAfterSunset,
      }),
    );
  }

  return details;
}
