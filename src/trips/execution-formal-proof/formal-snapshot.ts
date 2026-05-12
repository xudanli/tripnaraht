/**
 * Compact formal snapshots of execution state for distance metrics.
 */

import { createHash } from 'crypto';
import type { TripWorldState } from '../decision/world-model';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';

export interface FormalIterationSnapshot {
  dagSummary: string;
  irSummary: string;
  physicsSummary: string;
  causalConfidence: number;
  patchMagnitude: number;
}

function hashDag(dag: ExecutionTruthDAG | undefined): string {
  if (!dag?.edges?.length && !dag?.nodes?.length) {
    return 'dag:empty';
  }
  const nodePart = [...(dag.nodes ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(n => `${n.id}:${n.execution?.finalState ?? ''}`)
    .join('|');
  const edgePart = [...(dag.edges ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(e => `${e.id}:${e.weight.toFixed(3)}`)
    .join('|');
  return createHash('sha256')
    .update(`n:${nodePart}#e:${edgePart}`, 'utf8')
    .digest('hex')
    .slice(0, 24);
}

function hashIr(ir: ExecutionIR | undefined): string {
  if (!ir?.steps?.length) return 'ir:empty';
  const part = ir.steps
    .map(s =>
      s.type === 'TRAVERSE'
        ? `T:${s.edgeId}:${s.cost.toFixed(3)}`
        : `${s.type}:${'nodeId' in s ? s.nodeId : ''}`,
    )
    .join(';');
  return createHash('sha256').update(part, 'utf8').digest('hex').slice(0, 24);
}

function hashPhysics(idx: PhysicsFieldIndex | undefined): string {
  if (!idx?.byLegId || !Object.keys(idx.byLegId).length) {
    return 'phys:empty';
  }
  const rows = Object.values(idx.byLegId)
    .sort((a, b) => a.legId.localeCompare(b.legId))
    .map(
      r =>
        `${r.legId}:${r.stateVector.mobility.toFixed(2)}:${r.stateVector.exposure.toFixed(2)}:${r.derived}`,
    )
    .join('|');
  return createHash('sha256').update(rows, 'utf8').digest('hex').slice(0, 24);
}

/** Materialize a reproducible snapshot from current world signals. */
export function buildFormalIterationSnapshot(
  state: TripWorldState,
  patchMagnitude: number,
): FormalIterationSnapshot {
  const causal =
    state.signals.reflectiveCausalModel?.meta.confidence ?? 0.85;
  return {
    dagSummary: hashDag(state.signals.executionTruthDAG),
    irSummary: hashIr(state.signals.executionIR),
    physicsSummary: hashPhysics(state.signals.physicsFieldIndex),
    causalConfidence: Math.min(1, Math.max(0, causal)),
    patchMagnitude: Math.min(1, Math.max(0, patchMagnitude)),
  };
}
