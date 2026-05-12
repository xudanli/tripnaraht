/**
 * 路网 SSOT 写入实现 — 业务侧请优先使用 `applyRoadFactMutation`（world-mutation.gateway）。
 */

import type { TripPlan } from '../trips/decision/plan-model';
import type {
  ConstraintField,
  WorldConstraintState,
} from './constraint-field.interface';
import type { RoadConstraintDiff } from './road-constraint-diff.types';
import { computeWorldDiff } from './world-diff.engine';
import type { ApplyWorldEventResult } from './world-constraint.pipeline';
import type { WorldConstraintStore } from './world-constraint.store';
import type { CanonicalRoadWorldState } from './road-canonical.types';

export interface ApplyRoadDiffOptions {
  readonly tripPlan?: TripPlan;
  readonly atMs?: number;
}

function canonicalToWorldState(
  s: CanonicalRoadWorldState,
): WorldConstraintState {
  switch (s) {
    case 'OPEN':
      return 'OPEN';
    case 'DEGRADED':
      return 'DEGRADED';
    case 'RESTRICTED':
      return 'RESTRICTED';
    case 'CLOSED':
      return 'CLOSED';
    default: {
      const _e: never = s;
      return _e;
    }
  }
}

function resolveAffectedSlotIds(
  diff: RoadConstraintDiff,
  plan: TripPlan,
): string[] {
  const blocked = new Set(
    diff.impactedEntities.poiIds.map((p) => String(p).trim()),
  );
  const slots: string[] = [];
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      const pid =
        slot.poiId != null ? String(slot.poiId).trim() : '';
      if (pid && blocked.has(pid)) {
        slots.push(slot.id);
      }
    }
  }
  return slots;
}

function buildRoadField(
  diff: RoadConstraintDiff,
  options?: ApplyRoadDiffOptions,
): ConstraintField {
  const at = options?.atMs ?? Date.now();
  const temporalScope = {
    start: new Date(at).toISOString(),
    end: new Date(at).toISOString(),
  };

  const affectedSlotIds =
    options?.tripPlan !== undefined
      ? resolveAffectedSlotIds(diff, options.tripPlan)
      : [];

  const weight =
    diff.state === 'CLOSED' ? 1 : diff.state === 'RESTRICTED' ? 0.75 : 0.4;

  return {
    id: diff.roadId,
    type: 'ROAD',
    state: canonicalToWorldState(diff.state),
    severity: diff.severity,
    temporalScope,
    impactWeight: weight,
    version: 0,
    ...(affectedSlotIds.length > 0 ? { affectedSlotIds: affectedSlotIds } : {}),
    ...(diff.impactedEntities.poiIds.length > 0
      ? { affectedPoiIds: [...diff.impactedEntities.poiIds] }
      : {}),
  };
}

/**
 * 将图引擎产出的 `RoadConstraintDiff` 写入 SSOT 并计算 `WorldConstraintDiff`。
 * 禁止在图层直接 `store.upsert`；应经过本函数。
 */
export function applyRoadDiff(
  store: WorldConstraintStore,
  roadDiff: RoadConstraintDiff,
  options?: ApplyRoadDiffOptions,
): ApplyWorldEventResult {
  const field = buildRoadField(roadDiff, options);
  store.upsert(field);
  const written = store.get('ROAD', roadDiff.roadId)!;
  const diff = computeWorldDiff(written, options?.tripPlan);
  return {
    store,
    diff,
    emittedKind: 'WORLD_CONSTRAINT_DIFF',
  };
}
