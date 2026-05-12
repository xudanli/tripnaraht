/**
 * P-Next 5 — Typed invariant surface for offline verification of compressed execution proofs.
 */

import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';

export type ExecutionInvariantSeverity = 'HARD' | 'SOFT';

export type ExecutionInvariantDomain =
  | 'TEMPORAL'
  | 'WEATHER'
  | 'ROUTE'
  | 'FUEL'
  | 'PHYSICS';

export interface ExecutionInvariant {
  id: string;
  check: (proof: ExecutionProof) => boolean;
  severity: ExecutionInvariantSeverity;
  domain: ExecutionInvariantDomain;
}
