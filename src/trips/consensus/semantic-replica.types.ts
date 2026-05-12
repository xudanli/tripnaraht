/**
 * P-Next 7 — One materialized world line: physics index + proof + trust weight.
 */

import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';
import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';

export interface SemanticReplica {
  replicaId: string;
  /** One snapshot of the compiled physics index (may differ from other replicas’ time / source). */
  physicsField: PhysicsFieldIndex;
  /** Per-replica proof (Neptune + semantic layer on that snapshot). */
  executionProof: ExecutionProof;
  /** Epoch ms — ordering / staleness only; consensus scoring uses {@link confidence}. */
  timestamp: number;
  /** 0–1 external confidence in this replica’s inputs (weather age, routing freshness, …). */
  confidence: number;
}
