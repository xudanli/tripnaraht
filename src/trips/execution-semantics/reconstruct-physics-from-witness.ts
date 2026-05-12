/**
 * P-Next 6 — Rebuild a {@link PhysicsFieldIndex} from proof witness rows for semantic replay / verification.
 */

import type { ExecutionProofWitness } from '../execution-trace-compressor/execution-proof.types';
import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';
import type { UnifiedPhysicsField } from '../physics/unified-physics-field.types';
import { buildPhysicsFieldIndex } from '../physics/build-physics-field-index';
import { computeSeverity } from '../physics/build-unified-physics-field';
import { normalizeUnifiedPhysicsField } from '../physics/physics-field-normalization';

function syntheticField(
  legId: string,
  row: ExecutionProofWitness['physicsByLegId'][string],
): UnifiedPhysicsField {
  const { mobility, exposure, energy, temporalPressure } = row;
  const severity = computeSeverity(mobility, exposure, energy);
  const raw: UnifiedPhysicsField = {
    legId,
    date: '',
    stateVector: { mobility, exposure, energy, temporalPressure },
    constraints: {
      blocked: row.derived === 'IMPASSABLE',
      severity,
    },
    derived: row.derived,
  };
  return normalizeUnifiedPhysicsField(raw);
}

export function reconstructPhysicsFieldIndexFromWitness(
  witness: ExecutionProofWitness,
): PhysicsFieldIndex {
  const rows = Object.keys(witness.physicsByLegId).map(legId =>
    syntheticField(legId, witness.physicsByLegId[legId]!),
  );
  return buildPhysicsFieldIndex(rows);
}
