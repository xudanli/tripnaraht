/**
 * planning-conflicts ↔ TripConstraint 卡片联动
 */

import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import { TRIP_CONSTRAINT_LEGACY_IDS as LEGACY_IDS } from '../types/trip-constraint.types';
import { inferOfficialConstraintIdsFromConflict } from './country-official-constraints.util';
import { inferOfficialPoiConstraintIdsFromConflict } from './iceland-poi-official-constraints.util';
import {
  constraintAppliesToConflict,
  readScopeBindingFromValue,
} from './constraint-scope-binding.util';
import type { TripConstraint } from '../types/trip-constraint.types';

/** 单条 conflict 关联的 constraintId（legacy + 国家官方 + POI 官方） */
export function inferRelatedConstraintIdsFromConflict(
  conflict: PlanningConflictItem,
): string[] {
  const ids = new Set<string>();
  const msg = `${conflict.title} ${conflict.message}`.toLowerCase();

  if (/预算|budget/.test(msg)) ids.add(LEGACY_IDS.BUDGET_TOTAL);
  if (/驾驶|交通|transport|车程|超长距离|长距离/.test(msg)) {
    ids.add(LEGACY_IDS.TRANSPORT_MODE);
    ids.add(LEGACY_IDS.MAX_SEGMENT_DISTANCE);
  }
  if (/每日驾驶|daily.?drive|max_daily_drive/.test(msg)) {
    ids.add(LEGACY_IDS.MAX_DAILY_DRIVE);
  }
  if (/不夜驾|夜驾|no.?night|night.?drive|日落后.*驾驶|sunset.*driv/i.test(msg)) {
    ids.add(LEGACY_IDS.NO_NIGHT_DRIVE);
  }
  if (/步行|walk|疲劳|fatigue/.test(msg)) {
    ids.add(LEGACY_IDS.DAILY_WALK_LIMIT);
    ids.add(LEGACY_IDS.PACING_LEVEL);
  }
  if (/时间|日期|天数|day/.test(msg)) ids.add(LEGACY_IDS.TIME_RANGE);
  if (/必去|must/.test(msg)) ids.add(LEGACY_IDS.MUST_PLACES);
  if (/团队|成员|team/.test(msg)) ids.add(LEGACY_IDS.TRAVELERS);
  if (/天气|道路|封闭|world|开放/.test(msg)) ids.add(LEGACY_IDS.WORLD_FEASIBILITY);

  for (const id of inferOfficialConstraintIdsFromConflict(conflict)) {
    ids.add(id);
  }
  for (const id of inferOfficialPoiConstraintIdsFromConflict(conflict)) {
    ids.add(id);
  }

  return Array.from(ids);
}

export function inferConflictConstraintIds(
  conflicts: PlanningConflictItem[],
): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    for (const id of inferRelatedConstraintIdsFromConflict(c)) {
      ids.add(id);
    }
  }
  return ids;
}

/** 按 value.scopeBinding 过滤 — 冲突仅关联范围内约束 */
export function inferScopedConflictConstraintIds(
  constraints: TripConstraint[],
  conflicts: PlanningConflictItem[],
): Set<string> {
  const byId = new Map(constraints.map((c) => [c.id, c]));
  const ids = new Set<string>();
  for (const conflict of conflicts) {
    const related =
      conflict.relatedConstraintIds ?? inferRelatedConstraintIdsFromConflict(conflict);
    for (const id of related) {
      const constraint = byId.get(id);
      if (!constraint || !readScopeBindingFromValue(constraint.value)) {
        ids.add(id);
        continue;
      }
      if (constraintAppliesToConflict(constraint, conflict)) ids.add(id);
    }
  }
  return ids;
}

export function enrichPlanningConflictsWithRelatedConstraintIds(
  conflicts: PlanningConflictItem[],
): PlanningConflictItem[] {
  return conflicts.map((c) => ({
    ...c,
    relatedConstraintIds: inferRelatedConstraintIdsFromConflict(c),
  }));
}
