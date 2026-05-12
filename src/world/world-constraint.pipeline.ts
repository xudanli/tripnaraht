/**
 * World Update Pipeline — 所有域事件唯一入口 → SSOT → 统一 diff
 */

import type { TripPlan } from '../trips/decision/plan-model';
import type { ConstraintField, WorldConstraintState } from './constraint-field.interface';
import type { ExecutionSemanticWorldOverlay } from './execution-semantic-world.types';
import type { WorldConstraintDiff } from './world-diff.engine';
import { computeWorldDiff } from './world-diff.engine';
import { WorldConstraintStore } from './world-constraint.store';
import { snapshotWorldConstraintStore } from './world-snapshot';

export type WorldDomainEvent =
  | {
      readonly kind: 'ROAD';
      readonly roadId: string;
      readonly status: string;
      readonly at: number;
      readonly affectedSlotIds?: readonly string[];
      readonly affectedPoiIds?: readonly string[];
    }
  | {
      readonly kind: 'WEATHER';
      readonly date: string;
      readonly violation?: 'HARD' | 'SOFT' | 'NONE';
      readonly executionStress?: number;
      readonly at: number;
    }
  | {
      readonly kind: 'BOOKING';
      readonly slotId: string;
      readonly bookingStatus: 'CONFIRMED' | 'CANCELLED' | 'PENDING';
      readonly at: number;
      readonly poiId?: string;
    };

export interface ApplyWorldEventOptions {
  readonly tripPlan?: TripPlan;
}

export interface ApplyWorldEventResult {
  readonly store: WorldConstraintStore;
  readonly diff: WorldConstraintDiff;
  readonly emittedKind: 'WORLD_CONSTRAINT_DIFF';
}

function roadStatusToWorldState(status: string): WorldConstraintState {
  const u = status.toUpperCase();
  if (u.includes('OPEN')) {
    return 'OPEN';
  }
  if (
    u.includes('RESTRICTED') &&
    (u.includes('4WD') || u.includes('4x4'))
  ) {
    return 'RESTRICTED';
  }
  if (u.includes('IMPASS') || u.includes('CLOSE')) {
    return 'CLOSED';
  }
  if (u.includes('ADVISORY') || u.includes('DEGRAD')) {
    return 'DEGRADED';
  }
  return 'UNKNOWN';
}

function weatherToSeverity(v?: string, stress?: number): number {
  if (typeof stress === 'number' && Number.isFinite(stress)) {
    return Math.max(0, Math.min(100, stress));
  }
  if (v === 'HARD') {
    return 90;
  }
  if (v === 'SOFT') {
    return 55;
  }
  return 20;
}

function bookingToState(
  s: 'CONFIRMED' | 'CANCELLED' | 'PENDING',
): WorldConstraintState {
  if (s === 'CANCELLED') {
    return 'CLOSED';
  }
  if (s === 'PENDING') {
    return 'DEGRADED';
  }
  return 'OPEN';
}

export function toConstraintField(event: WorldDomainEvent): ConstraintField {
  switch (event.kind) {
    case 'ROAD': {
      const state = roadStatusToWorldState(event.status);
      const sev =
        state === 'CLOSED' ? 85 : state === 'DEGRADED' ? 50 : 15;
      return {
        id: event.roadId,
        type: 'ROAD',
        state,
        severity: sev,
        temporalScope: {
          start: new Date(event.at).toISOString(),
          end: new Date(event.at).toISOString(),
        },
        impactWeight: state === 'CLOSED' ? 1 : 0.4,
        version: 0,
        ...(event.affectedSlotIds?.length
          ? { affectedSlotIds: [...event.affectedSlotIds] }
          : {}),
        ...(event.affectedPoiIds?.length
          ? { affectedPoiIds: [...event.affectedPoiIds] }
          : {}),
      };
    }
    case 'WEATHER': {
      const sev = weatherToSeverity(event.violation, event.executionStress);
      const state: WorldConstraintState =
        event.violation === 'HARD' || event.violation === 'SOFT'
          ? 'DEGRADED'
          : 'OPEN';
      return {
        id: event.date,
        type: 'WEATHER',
        state,
        severity: sev,
        temporalScope: {
          start: `${event.date}T00:00:00.000Z`,
          end: `${event.date}T23:59:59.999Z`,
        },
        impactWeight: Math.min(1, sev / 100),
        version: 0,
      };
    }
    case 'BOOKING': {
      const state = bookingToState(event.bookingStatus);
      return {
        id: event.slotId,
        type: 'BOOKING',
        state,
        severity: state === 'CLOSED' ? 70 : state === 'DEGRADED' ? 40 : 10,
        temporalScope: {
          start: new Date(event.at).toISOString(),
          end: new Date(event.at).toISOString(),
        },
        impactWeight: state === 'CLOSED' ? 0.9 : 0.3,
        version: 0,
        ...(event.poiId ? { affectedPoiIds: [event.poiId] } : {}),
      };
    }
    default: {
      const _e: never = event;
      return _e;
    }
  }
}

/**
 * 唯一推荐写入路径：域事件 → ConstraintField → store → WorldConstraintDiff
 */
export function applyWorldEvent(
  store: WorldConstraintStore,
  event: WorldDomainEvent,
  options?: ApplyWorldEventOptions,
): ApplyWorldEventResult {
  const field = toConstraintField(event);
  store.upsert(field);
  const written = store.get(field.type, field.id)!;
  const diff = computeWorldDiff(written, options?.tripPlan);

  return {
    store,
    diff,
    emittedKind: 'WORLD_CONSTRAINT_DIFF',
  };
}

/** 写入 `UnifiedExecutionSemanticView.world` / `worldOverlay` 的便捷组装 */
export function buildExecutionSemanticWorldOverlay(
  store: WorldConstraintStore,
  lastDiff?: WorldConstraintDiff,
): ExecutionSemanticWorldOverlay {
  return {
    version: store.version,
    lastUpdatedAt: store.lastUpdatedAt,
    ...(lastDiff !== undefined ? { lastDiff } : {}),
    constraints: snapshotWorldConstraintStore(store),
  };
}

