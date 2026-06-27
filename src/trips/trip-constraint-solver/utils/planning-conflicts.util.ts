/**
 * Plan Studio 冲突中心 — 合并 / 去重 / 分类（与前端 planning-conflicts.util 对齐）
 */

import {
  ConflictDto,
  ConflictSeverity,
  ConflictType,
} from '../../dto/trip-conflicts.dto';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import type {
  PlanningConflictCategory,
  PlanningConflictItem,
  PlanningConflictsSummary,
} from '../types/planning-conflicts.types';
import { buildFeasibilityIssueDedupeKey } from './feasibility-issue-dedup.util';

export function parseScheduleAffectedDayNumbers(values: string[] | undefined): number[] {
  if (!values?.length) return [];
  return values
    .map((v) => {
      const m = String(v).match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** 与前端 isLunchValidationConflict 对齐：低优先级餐饮窗校验噪声 */
export function isLunchValidationNoise(conflict: ConflictDto): boolean {
  const lunchTypes = new Set<ConflictType>([
    ConflictType.LUNCH_WINDOW,
    ConflictType.LUNCH_MISSING,
    ConflictType.DINNER_MISSING,
  ]);
  return lunchTypes.has(conflict.type) && conflict.severity === ConflictSeverity.LOW;
}

export function mapScheduleConflictCategory(type: ConflictType): PlanningConflictCategory {
  switch (type) {
    case ConflictType.TRANSPORT_TOO_LONG:
    case ConflictType.TRANSPORT_INSUFFICIENT:
      return 'transport';
    case ConflictType.BUFFER_INSUFFICIENT:
    case ConflictType.TIME_CONFLICT:
      return 'schedule';
    case ConflictType.FATIGUE_EXCEEDED:
    case ConflictType.ACCESSIBILITY_MISMATCH:
      return 'team_fit';
    case ConflictType.CLOSURE_RISK:
      return 'booking';
    case ConflictType.DUPLICATE_ITEM:
      return 'structure';
    default:
      return 'schedule';
  }
}

export function mapScheduleSeverityToPriority(
  severity: ConflictSeverity,
): FeasibilityIssueDto['priority'] {
  switch (severity) {
    case ConflictSeverity.HIGH:
      return 'must_handle';
    case ConflictSeverity.MEDIUM:
      return 'suggest_adjust';
    default:
      return 'pending_confirm';
  }
}

export function collectIssueItemIds(issue: FeasibilityIssueDto): Set<string> {
  const ids = new Set<string>();
  if (issue.fromItemId) ids.add(issue.fromItemId);
  if (issue.toItemId) ids.add(issue.toItemId);
  for (const p of issue.proofs ?? []) {
    if (p.itemId) ids.add(p.itemId);
  }
  if (issue.anchors?.fromItemId) ids.add(issue.anchors.fromItemId);
  if (issue.anchors?.toItemId) ids.add(issue.anchors.toItemId);
  return ids;
}

export function isScheduleConflictCoveredByFeasibilityIssue(
  conflict: ConflictDto,
  issue: FeasibilityIssueDto,
): boolean {
  const issueItems = collectIssueItemIds(issue);
  const conflictItems = new Set(conflict.affectedItemIds ?? []);
  if (conflict.fromItemId) conflictItems.add(conflict.fromItemId);
  if (conflict.toItemId) conflictItems.add(conflict.toItemId);

  if (issueItems.size > 0 && conflictItems.size > 0) {
    for (const id of conflictItems) {
      if (issueItems.has(id)) return true;
    }
  }

  const issueDays = new Set(issue.affectedDays ?? []);
  const conflictDays = parseScheduleAffectedDayNumbers(conflict.affectedDays);
  if (issueDays.size > 0 && conflictDays.length > 0) {
    for (const d of conflictDays) {
      if (issueDays.has(d)) return true;
    }
  }

  if (conflict.fromDayNumber && issueDays.has(conflict.fromDayNumber)) return true;
  if (conflict.toDayNumber && issueDays.has(conflict.toDayNumber)) return true;

  return false;
}

export function isScheduleConflictCoveredByAnyIssue(
  conflict: ConflictDto,
  issues: FeasibilityIssueDto[],
): boolean {
  return issues.some((issue) => isScheduleConflictCoveredByFeasibilityIssue(conflict, issue));
}

export function feasibilityIssueToPlanningItem(issue: FeasibilityIssueDto): PlanningConflictItem {
  const semanticKey = buildFeasibilityIssueDedupeKey(issue);
  return {
    id: issue.id,
    source: 'feasibility',
    priority: issue.priority,
    category: (issue.category as PlanningConflictCategory) ?? 'other',
    title: issue.title,
    message: issue.message,
    affectedDays: issue.affectedDays?.length ? [...issue.affectedDays] : undefined,
    semanticKey,
    issue: { ...issue, semanticKey },
  };
}

export function scheduleConflictToPlanningItem(conflict: ConflictDto): PlanningConflictItem {
  const affectedDays = parseScheduleAffectedDayNumbers(conflict.affectedDays);
  if (conflict.fromDayNumber && !affectedDays.includes(conflict.fromDayNumber)) {
    affectedDays.push(conflict.fromDayNumber);
  }
  if (conflict.toDayNumber && !affectedDays.includes(conflict.toDayNumber)) {
    affectedDays.push(conflict.toDayNumber);
  }
  affectedDays.sort((a, b) => a - b);

  return {
    id: `schedule:${conflict.id}`,
    source: 'schedule',
    priority: mapScheduleSeverityToPriority(conflict.severity),
    category: mapScheduleConflictCategory(conflict.type),
    title: conflict.title,
    message: conflict.description,
    affectedDays: affectedDays.length ? affectedDays : undefined,
    studioConflict: conflict,
  };
}

export function buildPlanningConflictsSummary(
  items: PlanningConflictItem[],
): PlanningConflictsSummary {
  const byCategory: Record<string, number> = {};
  let mustHandle = 0;
  let suggestAdjust = 0;
  let pendingConfirm = 0;

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    if (item.priority === 'must_handle') mustHandle += 1;
    else if (item.priority === 'suggest_adjust') suggestAdjust += 1;
    else pendingConfirm += 1;
  }

  return {
    total: items.length,
    mustHandle,
    suggestAdjust,
    pendingConfirm,
    byCategory,
  };
}

export function assemblePlanningConflicts(input: {
  tripId: string;
  issues: FeasibilityIssueDto[];
  scheduleConflicts: ConflictDto[];
}): PlanningConflictItem[] {
  const feasibilityItems = input.issues.map(feasibilityIssueToPlanningItem);

  const scheduleItems: PlanningConflictItem[] = [];
  for (const conflict of input.scheduleConflicts) {
    if (isLunchValidationNoise(conflict)) continue;
    if (isScheduleConflictCoveredByAnyIssue(conflict, input.issues)) continue;
    scheduleItems.push(scheduleConflictToPlanningItem(conflict));
  }

  return [...feasibilityItems, ...scheduleItems];
}
