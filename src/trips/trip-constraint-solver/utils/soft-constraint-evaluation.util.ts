/**
 * SOFT 约束取舍与 check advisory — 不进 hard feasibility
 */

import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type { TripConstraint } from '../types/trip-constraint.types';
import { getConstraintTemplate } from './constraint-template-registry.util';
import {
  evaluateSoftConstraintsOnSchedule,
  type SoftScheduleEvalContext,
} from './soft-constraint-schedule-eval.util';
import { softConstraintWeight } from './soft-constraint-priority.util';

/** 同资源竞争时按 priority 升序牺牲（低 → 中 → 高） */
export function sortSoftConstraintsForSacrifice(constraints: TripConstraint[]): TripConstraint[] {
  return [...constraints]
    .filter((c) => c.type === 'SOFT' && c.status !== 'DISABLED')
    .sort((a, b) => {
      const pa = a.priority ?? 5;
      const pb = b.priority ?? 5;
      if (pa !== pb) return pa - pb;
      const ta = a.source.templateId ?? a.id;
      const tb = b.source.templateId ?? b.id;
      return ta.localeCompare(tb);
    });
}

/** 已知互斥软偏好组 — 资源不足时保留组内最高 priority */
const SOFT_TRADEOFF_GROUPS: Array<{ templateIds: string[]; message: string }> = [
  {
    templateIds: ['minimize_hotel_changes', 'sunset_photography', 'aurora_photo'],
    message: '连续住宿与摄影时段难以同时满足',
  },
  {
    templateIds: ['avoid_early', 'sunset_photography', 'aurora_photo'],
    message: '避免早起与日落/极光摄影时段冲突',
  },
  {
    templateIds: ['daily_free_time', 'max_major_pois_per_day'],
    message: '自由时间与主要景点数量存在取舍',
  },
];

function templateIdOf(c: TripConstraint): string | undefined {
  if (c.source.templateId) return c.source.templateId;
  if (c.value && typeof c.value === 'object') {
    const tid = (c.value as Record<string, unknown>).templateId;
    if (typeof tid === 'string' && tid.length > 0) return tid;
  }
  return undefined;
}

export interface SoftConstraintTradeoffResult {
  satisfiedIds: string[];
  sacrificedIds: string[];
  advisories: PlanningConflictItem[];
}

export function resolveSoftConstraintTradeoffs(
  constraints: TripConstraint[],
): SoftConstraintTradeoffResult {
  const active = constraints.filter((c) => c.type === 'SOFT' && c.status !== 'DISABLED');
  const byTemplate = new Map<string, TripConstraint>();
  for (const c of active) {
    const tid = templateIdOf(c);
    if (tid) byTemplate.set(tid, c);
  }

  const sacrificed = new Set<string>();
  for (const group of SOFT_TRADEOFF_GROUPS) {
    const present = group.templateIds
      .map((id) => byTemplate.get(id))
      .filter((c): c is TripConstraint => Boolean(c));
    if (present.length < 2) continue;
    const sorted = [...present].sort(
      (a, b) => (b.priority ?? 5) - (a.priority ?? 5) || a.id.localeCompare(b.id),
    );
    const keeper = sorted[0];
    for (const c of sorted.slice(1)) {
      if (c.id !== keeper.id) sacrificed.add(c.id);
    }
  }

  const satisfiedIds = active.filter((c) => !sacrificed.has(c.id)).map((c) => c.id);
  const sacrificedIds = [...sacrificed];
  const advisories: PlanningConflictItem[] = [];

  for (const id of sacrificedIds) {
    const c = active.find((x) => x.id === id);
    if (!c) continue;
    const tid = templateIdOf(c);
    const group = SOFT_TRADEOFF_GROUPS.find((g) => tid && g.templateIds.includes(tid));
    advisories.push({
      id: `soft-sacrificed-${c.id}`,
      source: 'feasibility',
      priority: 'suggest_adjust',
      category: 'experience_expectation',
      title: c.name,
      message: group?.message ?? `为保留更高优先级软约束，「${c.name}」暂未满足`,
      relatedConstraintIds: [c.id],
      semanticKey: `soft-sacrifice:${c.id}`,
    });
  }

  return { satisfiedIds, sacrificedIds, advisories };
}

export function buildSoftConstraintCheckConflicts(
  constraints: TripConstraint[],
  schedule?: SoftScheduleEvalContext,
): PlanningConflictItem[] {
  const active = constraints.filter((c) => c.type === 'SOFT' && c.status !== 'DISABLED');
  const tradeoff = resolveSoftConstraintTradeoffs(active);
  const sacrificed = new Set(tradeoff.sacrificedIds);
  const advisories: PlanningConflictItem[] = [...tradeoff.advisories];

  if (schedule) {
    for (const v of evaluateSoftConstraintsOnSchedule(active, schedule)) {
      if (sacrificed.has(v.constraintId)) continue;
      advisories.push({
        id: `soft-violation-${v.constraintId}${v.dayNumber ? `-d${v.dayNumber}` : ''}`,
        source: 'feasibility',
        priority: 'suggest_adjust',
        category: 'experience_expectation',
        title: active.find((c) => c.id === v.constraintId)?.name ?? v.templateId ?? '软约束',
        message: v.suggestedResolution
          ? `${v.message}。${v.suggestedResolution}`
          : v.message,
        affectedDays: v.dayNumber ? [v.dayNumber] : undefined,
        relatedConstraintIds: [v.constraintId],
        semanticKey: `soft-violation:${v.constraintId}`,
      });
    }
  }

  return advisories;
}

export function softConstraintSolverWeight(c: TripConstraint): number {
  const priority = c.priority ?? 5;
  return softConstraintWeight(priority);
}

export function softConstraintDescription(c: TripConstraint): string | undefined {
  if (c.description) return c.description;
  const tid = templateIdOf(c);
  if (!tid) return undefined;
  return getConstraintTemplate(tid)?.description;
}
