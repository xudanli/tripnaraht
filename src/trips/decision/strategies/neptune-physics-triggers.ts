import type { TripPlan } from '../plan-model';
import type { PhysicsFieldIndex } from '../../physics/unified-physics-field-index.types';

function dateForLegId(plan: TripPlan, legId: string): string | undefined {
  for (const day of plan.days) {
    if (day.timeSlots.some(s => s.id === legId)) {
      return day.date;
    }
  }
  return undefined;
}

export interface CollectPhysicsFirstTriggersOptions {
  /** When ≥ this many legs are DEGRADED, emit per-leg pressure triggers. Default 3. */
  degradedPressureThreshold?: number;
}

/**
 * P-Next 2 — Deterministic triggers from {@link PhysicsFieldIndex} (O(1) bucket reads).
 */
export function collectPhysicsFirstTriggers(
  index: PhysicsFieldIndex,
  plan: TripPlan,
  options?: CollectPhysicsFirstTriggersOptions,
): Array<{
  code: 'PHYSICS_IMPASSABLE' | 'PHYSICS_DEGRADED_PRESSURE';
  slotId?: string;
  date?: string;
  details?: Record<string, unknown>;
}> {
  const threshold = options?.degradedPressureThreshold ?? 3;
  const out: Array<{
    code: 'PHYSICS_IMPASSABLE' | 'PHYSICS_DEGRADED_PRESSURE';
    slotId?: string;
    date?: string;
    details?: Record<string, unknown>;
  }> = [];

  for (const legId of index.byState.IMPASSABLE) {
    const date = dateForLegId(plan, legId);
    out.push({
      code: 'PHYSICS_IMPASSABLE',
      slotId: legId,
      date,
      details: {
        decisionSource: 'PhysicsFieldIndex',
        derived: 'IMPASSABLE',
      },
    });
  }

  const degraded = index.byState.DEGRADED;
  if (degraded.length >= threshold) {
    for (const legId of degraded) {
      const date = dateForLegId(plan, legId);
      out.push({
        code: 'PHYSICS_DEGRADED_PRESSURE',
        slotId: legId,
        date,
        details: {
          decisionSource: 'PhysicsFieldIndex',
          derived: 'DEGRADED',
          batchPressure: true,
          degradedCount: degraded.length,
        },
      });
    }
  }

  return out;
}
