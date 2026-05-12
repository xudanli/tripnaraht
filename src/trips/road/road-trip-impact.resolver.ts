/**
 * Road 物理影响 → 行程结构影响（World → Trip）
 */

import type { RoadConstraintGraph } from '../../iceland-road/road-constraint.graph';
import type { RoadConstraintImpact } from '../../iceland-road/road-constraint.propagation';
import type { RoadConstraintRuntimeTraceV0 } from '../decision/execution/unified-execution-semantic-view';
import type { TripPlan } from '../decision/plan-model';
import type { TripAction } from './trip-action.types';

export interface TripImpact {
  readonly affectedDays: string[];
  /** PlanSlot.id */
  readonly affectedSlots: string[];
  readonly affectedPOIs: string[];
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly requiredActions: TripAction[];
}

const norm = (s: string) => s.trim();

/**
 * 将路网闭包中的 POI 与当前 TripPlan 槽位对齐，生成日/槽位级影响与修复建议（MVP）。
 */
export function resolveTripImpact(
  impact: RoadConstraintImpact,
  plan: TripPlan,
  _graph?: RoadConstraintGraph,
): TripImpact {
  const blocked = new Set(impact.affectedPOIs.map((p) => norm(String(p))));

  const hitSlots: { dayDate: string; slotId: string; poiId: string }[] = [];
  for (const day of plan.days) {
    for (const s of day.timeSlots) {
      const pid = s.poiId != null ? norm(String(s.poiId)) : '';
      if (pid && blocked.has(pid)) {
        hitSlots.push({ dayDate: day.date, slotId: s.id, poiId: pid });
      }
    }
  }

  const affectedDays = [...new Set(hitSlots.map((h) => h.dayDate))].sort();
  const affectedSlots = hitSlots.map((h) => h.slotId);
  const affectedPOIsFromPlan = [...new Set(hitSlots.map((h) => h.poiId))];

  const tripSeverity: 'LOW' | 'MEDIUM' | 'HIGH' =
    impact.severity === 'HIGH' ? 'HIGH' : 'MEDIUM';

  const requiredActions: TripAction[] = affectedPOIsFromPlan.map((poiId) => ({
    type: 'MARK_INFEASIBLE',
    poiId,
  }));

  return {
    affectedDays,
    affectedSlots,
    affectedPOIs:
      affectedPOIsFromPlan.length > 0
        ? affectedPOIsFromPlan
        : [...impact.affectedPOIs],
    severity: tripSeverity,
    requiredActions,
  };
}

export function buildRoadConstraintRuntimeTrace(
  impact: RoadConstraintImpact,
  tripImpact?: TripImpact,
): RoadConstraintRuntimeTraceV0 {
  return {
    roadImpactSeverity: impact.severity,
    requiresReplan: impact.requiresReplan,
    affectedPoiIds: [...impact.affectedPOIs],
    ...(tripImpact
      ? {
          tripAffectedDays: tripImpact.affectedDays,
          tripAffectedSlotIds: tripImpact.affectedSlots,
          tripImpactSeverity: tripImpact.severity,
        }
      : {}),
  };
}
