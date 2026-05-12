import type { UnifiedPhysicsDerivedState, UnifiedPhysicsField } from './unified-physics-field.types';
import type { PhysicsFieldBucketsByDerivedState, PhysicsFieldIndex } from './unified-physics-field-index.types';

function emptyBuckets(): PhysicsFieldBucketsByDerivedState {
  return {
    STABLE: [],
    DEGRADED: [],
    UNSTABLE: [],
    IMPASSABLE: [],
  };
}

/**
 * Deterministic index over compiled {@link UnifiedPhysicsField} rows — enables slot/date/phase keyed reads without scanning overlay frames.
 */
export function buildPhysicsFieldIndex(fields: UnifiedPhysicsField[]): PhysicsFieldIndex {
  const byLegId: Record<string, UnifiedPhysicsField> = {};
  const byDate: Record<string, UnifiedPhysicsField[]> = {};
  const byState = emptyBuckets();

  for (const f of fields) {
    byLegId[f.legId] = f;

    const dateKey = f.date || '_unknown';
    if (!byDate[dateKey]) {
      byDate[dateKey] = [];
    }
    byDate[dateKey].push(f);

    byState[f.derived as UnifiedPhysicsDerivedState].push(f.legId);
  }

  return { byLegId, byDate, byState };
}
