/**
 * Planning Conflicts = Decision Problems (PLANNING phase projection).
 */

import type {
  PlanningConflictCategory,
  PlanningConflictItem,
  PlanningConflictsSummary,
} from '../../../trips/trip-constraint-solver/types/planning-conflicts.types';
import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { UnifiedDecisionProblemListItem } from '../contracts/unified-decision-ui.types';
import type { InternalUnifiedProblemRow } from './unified-decision-problem-projection.util';
import {
  inferEnforcementForQueue,
  qualifiesForDecisionQueue,
} from './decision-queue-admission.util';

const ENFORCEMENT_TO_PRIORITY: Record<
  string,
  FeasibilityIssueDto['priority']
> = {
  BLOCK: 'must_handle',
  REQUIRE_ADJUSTMENT: 'suggest_adjust',
  REQUIRE_CONFIRMATION: 'pending_confirm',
  WARN: 'pending_confirm',
  INFORM: 'pending_confirm',
};

const DIMENSION_TO_CATEGORY: Record<string, PlanningConflictCategory> = {
  SCHEDULE: 'schedule',
  TRANSPORT: 'transport',
  BOOKING: 'booking',
  ENVIRONMENT: 'environment',
  TEAM_FIT: 'team_fit',
  STRUCTURE: 'structure',
  ACCESS_CAPACITY: 'access_capacity',
  EXPERIENCE: 'experience_expectation',
  BUDGET: 'booking',
  OTHER: 'other',
};

/** SSOT — project open decision-queue items (same set as meta.openCount). */
export function projectListItemsToPlanningConflicts(
  items: UnifiedDecisionProblemListItem[],
): PlanningConflictItem[] {
  return items
    .filter((item) => !['RESOLVED', 'DISMISSED'].includes(item.workflowStatus))
    .map(projectListItemToPlanningConflict);
}

export function projectListItemToPlanningConflict(
  item: UnifiedDecisionProblemListItem,
): PlanningConflictItem {
  const affectedDayNumbers =
    item.legacySummary?.affectedDayNumbers ??
    (item.scope.dayIds?.length ? [...item.scope.dayIds] : undefined);

  return {
    id: item.problemId,
    source: 'feasibility',
    priority: ENFORCEMENT_TO_PRIORITY[item.enforcement] ?? 'suggest_adjust',
    category: DIMENSION_TO_CATEGORY[item.dimension] ?? 'other',
    title:
      item.occurrenceCount > 1 && !item.title.includes('×')
        ? `${item.title} ×${item.occurrenceCount}`
        : item.title,
    message: item.legacySummary?.description ?? item.summary,
    affectedDays: affectedDayNumbers,
    affectedDayNumbers,
    affectedScopeSummary: item.legacySummary?.affectedScopeSummary,
    semanticKey: item.instanceKey,
  };
}

export function projectDecisionProblemsToPlanningConflicts(
  rows: InternalUnifiedProblemRow[],
): PlanningConflictItem[] {
  const items: PlanningConflictItem[] = [];

  for (const row of rows) {
    const enforcement = inferEnforcementForQueue(row.enforcement, row);
    if (
      !qualifiesForDecisionQueue({
        enforcement,
        workflowStatus: row.workflowStatus,
        semanticKey: row.semanticKey,
        title: row.title,
        summary: row.summary,
        hasExecutableOptions: row.hasExecutableOptions,
        blocksPlan: enforcement === 'BLOCK',
        requiresAdjustment: enforcement === 'REQUIRE_ADJUSTMENT',
        requiresConfirmation: enforcement === 'REQUIRE_CONFIRMATION',
      })
    ) {
      continue;
    }

    items.push({
      id: row.problemId,
      source: 'feasibility',
      priority: ENFORCEMENT_TO_PRIORITY[enforcement] ?? 'suggest_adjust',
      category: DIMENSION_TO_CATEGORY[row.dimension] ?? 'other',
      title:
        row.occurrenceCount > 1
          ? `${row.title}${row.title.includes('×') ? '' : ` ×${row.occurrenceCount}`}`
          : row.title,
      message: row.summary,
      affectedDays: row.scope.dayIds?.length ? [...row.scope.dayIds] : undefined,
      semanticKey: row.instanceKey,
    });
  }

  return items;
}

export function buildPlanningConflictsSummaryFromItems(
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
