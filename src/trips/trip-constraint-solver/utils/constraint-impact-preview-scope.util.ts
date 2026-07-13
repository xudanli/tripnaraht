/**
 * preview-impact — 按变更约束过滤冲突 + quick/deep 模拟 after 快照
 */

import { TRIP_CONSTRAINT_LEGACY_IDS as LEGACY_IDS } from '../types/trip-constraint.types';
import type {
  TripConstraint,
  TripConstraintAssessSummary,
  TripConstraintChangePatch,
  TripConstraintFeasibilitySnapshot,
  TripConstraintImpactPreviewResponse,
} from '../types/trip-constraint.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import {
  enrichPlanningConflictsWithRelatedConstraintIds,
  inferRelatedConstraintIdsFromConflict,
} from './constraint-conflict-link.util';
import { sanitizeDayNumbers } from './constraint-impact-user-preview.util';

export interface ConflictBucketSummary {
  mustHandle: number;
  suggestAdjust: number;
  pendingConfirm: number;
}

export interface ScopedPreviewSimulation {
  constraintId: string;
  scopedConflicts: PlanningConflictItem[];
  conflictsBefore: ConflictBucketSummary;
  conflictsAfter: ConflictBucketSummary;
  affectedDays: number[];
  estimatedScoreDelta?: number;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function readHoursValue(value: unknown): number | undefined {
  if (typeof value === 'number') return asNumber(value);
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    return (
      asNumber(raw.maxHours) ??
      asNumber(raw.hours) ??
      asNumber(raw.maxDailyDrivingHours) ??
      asNumber(raw.value)
    );
  }
  return undefined;
}

function pacingRank(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const map: Record<string, number> = {
    relaxed: 1,
    slow: 1,
    normal: 2,
    balanced: 2,
    intensive: 3,
    fast: 3,
  };
  return map[value.trim().toLowerCase()];
}

export function primaryChangedConstraintId(
  changes: TripConstraintChangePatch[] | null | undefined,
): string | undefined {
  return asArray(changes)[0]?.constraintId;
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function conflictsForConstraint(
  constraintId: string | undefined,
  conflicts: PlanningConflictItem[] | null | undefined,
): PlanningConflictItem[] {
  const conflictList = asArray(conflicts);
  if (!constraintId) return conflictList;
  const enriched = enrichPlanningConflictsWithRelatedConstraintIds(conflictList);
  const linked = enriched.filter((c) => {
    const related = c.relatedConstraintIds ?? inferRelatedConstraintIdsFromConflict(c);
    return related.includes(constraintId);
  });
  if (linked.length > 0) return linked;

  switch (constraintId) {
    case LEGACY_IDS.MAX_DAILY_DRIVE:
      return driveConflicts(enriched);
    case LEGACY_IDS.NO_NIGHT_DRIVE:
      return noNightConflicts(enriched);
    case LEGACY_IDS.BUDGET_TOTAL:
      return budgetConflicts(enriched);
    case LEGACY_IDS.PACING_LEVEL:
      return paceConflicts(enriched);
    case LEGACY_IDS.MAX_SEGMENT_DISTANCE:
      return segmentConflicts(enriched);
    default:
      return linked;
  }
}

export function summarizeConflictBuckets(
  conflicts: PlanningConflictItem[],
): ConflictBucketSummary {
  let mustHandle = 0;
  let suggestAdjust = 0;
  let pendingConfirm = 0;
  for (const c of conflicts) {
    if (c.priority === 'must_handle') mustHandle += 1;
    else if (c.priority === 'suggest_adjust') suggestAdjust += 1;
    else if (c.priority === 'pending_confirm') pendingConfirm += 1;
  }
  return { mustHandle, suggestAdjust, pendingConfirm };
}

function affectedDaysFromScopedConflicts(
  conflicts: PlanningConflictItem[],
  tripDayCount: number,
): number[] {
  const days = conflicts.flatMap((c) => c.affectedDays ?? c.issue?.affectedDays ?? []);
  return sanitizeDayNumbers(days, tripDayCount);
}

function driveConflicts(conflicts: PlanningConflictItem[]): PlanningConflictItem[] {
  return conflicts.filter(
    (c) =>
      c.issue?.issueKind === 'daily_drive' ||
      /daily.?drive|每日驾驶|驾驶超限|驾驶时长/.test(`${c.title} ${c.message}`),
  );
}

function noNightConflicts(conflicts: PlanningConflictItem[]): PlanningConflictItem[] {
  return conflicts.filter(
    (c) =>
      c.issue?.issueKind === 'no_night_drive' ||
      /不夜驾|夜驾|no.?night|日落后.*驾驶/i.test(`${c.title} ${c.message}`),
  );
}

function budgetConflicts(conflicts: PlanningConflictItem[]): PlanningConflictItem[] {
  return conflicts.filter((c) => /预算|budget/i.test(`${c.title} ${c.message}`));
}

function paceConflicts(conflicts: PlanningConflictItem[]): PlanningConflictItem[] {
  return conflicts.filter((c) => {
    const kind = c.issue?.issueKind ?? '';
    return (
      kind.startsWith('team_pacing_') ||
      kind.includes('pace') ||
      /节奏|偏紧|疲劳|步行|fatigue/i.test(`${c.title} ${c.message}`)
    );
  });
}

function segmentConflicts(conflicts: PlanningConflictItem[]): PlanningConflictItem[] {
  return conflicts.filter((c) =>
    /超长距离|长距离|segment|单段|max_segment/i.test(`${c.title} ${c.message}`),
  );
}

function estimateDriveMustHandleAfter(
  driveIssues: PlanningConflictItem[],
  proposedHours: number,
): number {
  const maxMinutes = proposedHours * 60;
  return driveIssues.filter((c) => {
    const mins =
      c.issue?.anchors?.travelMinutes ??
      c.issue?.anchors?.travelTimeMinutes ??
      c.studioConflict?.travelMinutes;
    return mins == null || mins > maxMinutes;
  }).length;
}

function estimateScoreDelta(
  assessBefore: TripConstraintAssessSummary | undefined,
  mustHandleDelta: number,
  driveHoursDelta?: number,
): number | undefined {
  if (!assessBefore) return undefined;
  let drop = mustHandleDelta * 8;
  if (driveHoursDelta != null && driveHoursDelta < 0) {
    drop += Math.min(25, Math.abs(driveHoursDelta) * 5);
  } else if (driveHoursDelta != null && driveHoursDelta > 0) {
    drop -= Math.min(15, driveHoursDelta * 3);
  }
  return -drop;
}

export function simulateScopedPreview(input: {
  constraintId: string;
  changes: TripConstraintChangePatch[] | null | undefined;
  items: TripConstraint[] | null | undefined;
  allConflicts: PlanningConflictItem[] | null | undefined;
  tripDayCount: number;
  assessBefore?: TripConstraintAssessSummary;
  feasibilityBefore?: TripConstraintFeasibilitySnapshot;
  /** persist=true 时传入真实 trip 级 after，再按约束过滤 */
  persistedAfter?: TripConstraintImpactPreviewResponse['conflictsAfter'];
  persistedScopedConflicts?: PlanningConflictItem[];
}): ScopedPreviewSimulation {
  const scopedConflicts = conflictsForConstraint(input.constraintId, input.allConflicts);
  const conflictsBefore = summarizeConflictBuckets(scopedConflicts);
  const changeList = asArray(input.changes);
  const itemList = asArray(input.items);

  if (input.persistedAfter && input.persistedScopedConflicts) {
    return {
      constraintId: input.constraintId,
      scopedConflicts: input.persistedScopedConflicts,
      conflictsBefore,
      conflictsAfter: summarizeConflictBuckets(input.persistedScopedConflicts),
      affectedDays: affectedDaysFromScopedConflicts(
        input.persistedScopedConflicts,
        input.tripDayCount,
      ),
      estimatedScoreDelta:
        input.assessBefore != null
          ? estimateScoreDelta(
              input.assessBefore,
              summarizeConflictBuckets(input.persistedScopedConflicts).mustHandle -
                conflictsBefore.mustHandle,
            )
          : undefined,
    };
  }

  const change = changeList.find((c) => c.constraintId === input.constraintId);
  const item = itemList.find((i) => i.id === input.constraintId);
  const beforeValue = item?.value;
  const afterValue = change?.patch.value ?? beforeValue;

  let conflictsAfter = { ...conflictsBefore };
  let estimatedScoreDelta: number | undefined;
  let filteredScoped = scopedConflicts;

  switch (input.constraintId) {
    case LEGACY_IDS.MAX_DAILY_DRIVE: {
      const beforeH = readHoursValue(beforeValue);
      const afterH = readHoursValue(afterValue);
      const drives = driveConflicts(scopedConflicts);
      filteredScoped = drives;
      if (afterH != null) {
        const afterMust = estimateDriveMustHandleAfter(drives, afterH);
        conflictsAfter = {
          mustHandle: afterMust,
          suggestAdjust: drives.filter((c) => c.priority === 'suggest_adjust').length,
          pendingConfirm: 0,
        };
        if (beforeH != null && afterH < beforeH && drives.length === 0) {
          conflictsAfter.mustHandle = Math.max(conflictsBefore.mustHandle, 1);
        }
        estimatedScoreDelta = estimateScoreDelta(
          input.assessBefore,
          conflictsAfter.mustHandle - conflictsBefore.mustHandle,
          afterH != null && beforeH != null ? afterH - beforeH : undefined,
        );
      }
      break;
    }
    case LEGACY_IDS.NO_NIGHT_DRIVE: {
      const nights = noNightConflicts(scopedConflicts);
      filteredScoped = nights;
      const disabling = change?.patch.status === 'DISABLED';
      conflictsAfter = {
        mustHandle: disabling ? 0 : nights.filter((c) => c.priority === 'must_handle').length,
        suggestAdjust: disabling ? 0 : nights.filter((c) => c.priority === 'suggest_adjust').length,
        pendingConfirm: 0,
      };
      estimatedScoreDelta = estimateScoreDelta(
        input.assessBefore,
        conflictsAfter.mustHandle - conflictsBefore.mustHandle,
      );
      break;
    }
    case LEGACY_IDS.BUDGET_TOTAL: {
      const budget = budgetConflicts(scopedConflicts);
      filteredScoped = budget.length > 0 ? budget : scopedConflicts;
      const beforeB = asNumber(beforeValue);
      const afterB = asNumber(afterValue);
      if (beforeB != null && afterB != null) {
        if (afterB > beforeB) {
          conflictsAfter = {
            mustHandle: 0,
            suggestAdjust: Math.max(0, conflictsBefore.suggestAdjust - 1),
            pendingConfirm: conflictsBefore.pendingConfirm,
          };
        } else if (afterB < beforeB) {
          conflictsAfter = {
            mustHandle: Math.max(conflictsBefore.mustHandle, 1),
            suggestAdjust: conflictsBefore.suggestAdjust,
            pendingConfirm: conflictsBefore.pendingConfirm,
          };
        }
        estimatedScoreDelta = estimateScoreDelta(
          input.assessBefore,
          conflictsAfter.mustHandle - conflictsBefore.mustHandle,
        );
      }
      break;
    }
    case LEGACY_IDS.PACING_LEVEL: {
      const pace = paceConflicts(scopedConflicts);
      filteredScoped = pace.length > 0 ? pace : scopedConflicts;
      const beforeRank = pacingRank(beforeValue);
      const afterRank = pacingRank(afterValue);
      if (beforeRank != null && afterRank != null) {
        if (afterRank < beforeRank) {
          conflictsAfter = {
            mustHandle: conflictsBefore.mustHandle,
            suggestAdjust: Math.max(0, conflictsBefore.suggestAdjust - 1),
            pendingConfirm: conflictsBefore.pendingConfirm,
          };
        } else if (afterRank > beforeRank) {
          conflictsAfter = {
            mustHandle: conflictsBefore.mustHandle,
            suggestAdjust: conflictsBefore.suggestAdjust + 1,
            pendingConfirm: conflictsBefore.pendingConfirm,
          };
        }
        estimatedScoreDelta = estimateScoreDelta(
          input.assessBefore,
          0,
          afterRank < beforeRank ? 1 : afterRank > beforeRank ? -1 : 0,
        );
      }
      break;
    }
    case LEGACY_IDS.MAX_SEGMENT_DISTANCE: {
      const segments = segmentConflicts(scopedConflicts);
      filteredScoped = segments.length > 0 ? segments : scopedConflicts;
      const beforeKm = asNumber(beforeValue);
      const afterKm = asNumber(afterValue);
      if (beforeKm != null && afterKm != null) {
        if (afterKm < beforeKm) {
          conflictsAfter = {
            mustHandle: Math.max(conflictsBefore.mustHandle, segments.length || 1),
            suggestAdjust: conflictsBefore.suggestAdjust,
            pendingConfirm: conflictsBefore.pendingConfirm,
          };
        } else if (afterKm > beforeKm) {
          conflictsAfter = {
            mustHandle: Math.max(0, conflictsBefore.mustHandle - 1),
            suggestAdjust: conflictsBefore.suggestAdjust,
            pendingConfirm: conflictsBefore.pendingConfirm,
          };
        }
        estimatedScoreDelta = estimateScoreDelta(
          input.assessBefore,
          conflictsAfter.mustHandle - conflictsBefore.mustHandle,
        );
      }
      break;
    }
    default:
      break;
  }

  return {
    constraintId: input.constraintId,
    scopedConflicts: filteredScoped,
    conflictsBefore,
    conflictsAfter,
    affectedDays: affectedDaysFromScopedConflicts(filteredScoped, input.tripDayCount),
    estimatedScoreDelta,
  };
}
