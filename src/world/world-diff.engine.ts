/**
 * World Diff Engine — 全局统一传播视角下的单次约束变更影响（相对 TripPlan）
 */

import type { TripPlan } from '../trips/decision/plan-model';
import type { ConstraintField } from './constraint-field.interface';

export interface WorldConstraintDiff {
  readonly affectedSlots: readonly string[];
  readonly affectedPOIs: readonly string[];
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly domains: readonly ConstraintField['type'][];
  readonly hasImpact: boolean;
}

function severityBand(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 67) {
    return 'HIGH';
  }
  if (score >= 34) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function collectSlotsAndPois(plan: TripPlan): {
  slotIds: Set<string>;
  slotToPoi: Map<string, string>;
  slotsByDate: Map<string, Set<string>>;
} {
  const slotIds = new Set<string>();
  const slotToPoi = new Map<string, string>();
  const slotsByDate = new Map<string, Set<string>>();
  for (const day of plan.days) {
    let set = slotsByDate.get(day.date);
    if (!set) {
      set = new Set<string>();
      slotsByDate.set(day.date, set);
    }
    for (const s of day.timeSlots) {
      slotIds.add(s.id);
      set.add(s.id);
      if (s.poiId) {
        slotToPoi.set(s.id, String(s.poiId));
      }
    }
  }
  return { slotIds, slotToPoi, slotsByDate };
}

/**
 * 基于刚写入的 `field` 与当前行程，计算统一世界 diff（MVP 相交规则）。
 */
export function computeWorldDiff(
  field: ConstraintField,
  plan?: TripPlan,
): WorldConstraintDiff {
  const domains = [field.type] as const;
  const affected = new Set<string>();
  const pois = new Set<string>();

  if (field.affectedSlotIds?.length) {
    for (const sid of field.affectedSlotIds) {
      affected.add(sid);
    }
  }
  if (field.affectedPoiIds?.length) {
    for (const p of field.affectedPoiIds) {
      pois.add(p);
    }
  }

  if (plan) {
    const { slotIds, slotToPoi, slotsByDate } = collectSlotsAndPois(plan);

    if (field.type === 'WEATHER') {
      const daySet = slotsByDate.get(field.id);
      if (daySet) {
        for (const sid of daySet) {
          affected.add(sid);
        }
      }
    }

    if (field.type === 'BOOKING') {
      if (field.userPolicy?.kind === 'POI_LOCK' && field.userPolicy.lockedPoiId) {
        const pid = field.userPolicy.lockedPoiId;
        for (const day of plan.days) {
          for (const s of day.timeSlots) {
            if (String(s.poiId ?? '') === pid) {
              affected.add(s.id);
            }
          }
        }
      } else if (field.userPolicy?.kind === 'DRIVING_SOFT_CAP') {
        for (const sid of slotIds) {
          affected.add(sid);
        }
      } else if (slotIds.has(field.id)) {
        affected.add(field.id);
      }
    }

    if (field.type === 'ROAD' && field.affectedSlotIds?.length) {
      for (const sid of field.affectedSlotIds) {
        if (slotIds.has(sid)) {
          affected.add(sid);
        }
      }
    }

    for (const sid of affected) {
      const poi = slotToPoi.get(sid);
      if (poi) {
        pois.add(poi);
      }
    }
  }

  const hasImpact =
    affected.size > 0 ||
    field.state === 'CLOSED' ||
    field.state === 'RESTRICTED' ||
    field.state === 'DEGRADED' ||
    field.severity >= 50;

  return {
    affectedSlots: [...affected].sort(),
    affectedPOIs: [...pois].sort(),
    severity: severityBand(field.severity),
    domains,
    hasImpact,
  };
}
