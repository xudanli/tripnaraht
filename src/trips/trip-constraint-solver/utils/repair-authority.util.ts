/**
 * P4 — Repair authority：方案写库仅 feasibility-report/apply-repair
 */

import type { RepairOption } from '../../readiness/types/coverage-map.types';
import { normalizeIssueId } from './trip-revision.util';
import { isDecisionEngineRepairAction } from '../../readiness/utils/trip-decision-repair-bridge.util';
import { isRoadClassStructuralRepairOption } from './road-class-repair-options.util';

export type RepairAuthority = 'feasibility' | 'readiness_prep';

/** 出发准备域 — readiness 可处理（勾选、标记、刷新证据） */
const PREP_ONLY_ACTION_TYPES = new Set([
  'manual_confirm',
  'mark_resolved',
  'ignore',
  'refresh',
  'fetch_weather',
  'confirm_regret_bound',
]);

const PLAN_FEASIBILITY_BLOCKER_PREFIXES = [
  'issue-',
  'coverage-gap:',
  'poi-access:',
  'experience-regret:',
  'prereq:',
  'transport-',
  'schedule-',
  'buffer-',
  'conflict-',
] as const;

export function isPrepOnlyRepairAction(actionType: string | undefined): boolean {
  if (!actionType) return false;
  return PREP_ONLY_ACTION_TYPES.has(actionType);
}

export function isPlanMutationRepairOption(option: Pick<RepairOption, 'actionType' | 'payload'>): boolean {
  const actionType = option.actionType ?? '';
  if (isPrepOnlyRepairAction(actionType)) return false;
  if (isRoadClassStructuralRepairOption(option)) return true;
  if (isDecisionEngineRepairAction(actionType)) return true;
  const structuralActions = new Set([
    'add_buffer',
    'insert_rest_day',
    'shift_departure',
    'add_buffer_minutes',
    'adjust_time',
    'move_to_day',
    'replace_poi',
    'book_parking',
    'repair',
    'alternative',
  ]);
  return structuralActions.has(actionType);
}

export function assertFeasibilityRepairAuthority(
  authority: RepairAuthority | undefined,
  option: Pick<RepairOption, 'actionType' | 'payload'>,
): void {
  if (authority === 'feasibility') return;
  if (!isPlanMutationRepairOption(option)) return;
  throw new Error(
    'REPAIR_AUTHORITY_FEASIBILITY: 行程方案修复请使用 POST /api/trips/:tripId/feasibility-report/issues/:issueId/apply-repair',
  );
}

export function isPlanFeasibilityBlockerId(blockerId: string): boolean {
  const id = blockerId.trim();
  if (!id) return false;
  return PLAN_FEASIBILITY_BLOCKER_PREFIXES.some((p) => id.startsWith(p));
}

/** blockerId / prerequisiteId → feasibility issueId */
export function resolveRepairTargetIssueId(blockerId: string): string {
  const id = blockerId.trim();
  if (id.startsWith('prereq:poi-access:')) {
    return `poi-access:${id.slice('prereq:poi-access:'.length)}`;
  }
  if (id.startsWith('prereq:experience-regret:')) {
    return `experience-regret:unconfirmed:${id.slice('prereq:experience-regret:'.length)}`;
  }
  if (id.startsWith('coverage-gap:')) {
    return normalizeIssueId(id);
  }
  return id;
}
