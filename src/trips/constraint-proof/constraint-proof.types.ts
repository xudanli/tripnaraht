/**
 * P12 — Constraint Proof Graph: feasibility summary before IR simulation (no learning).
 */

export type ConstraintProofSeverity = 'HARD' | 'SOFT';

export type ConstraintProofSat = 'SAT' | 'UNSAT' | 'UNKNOWN';

export interface ConstraintProofNode {
  id: string;
  type: ConstraintProofSeverity;
  /** Stable label for audit (not free-form reasoning). */
  constraint: string;
  status: ConstraintProofSat;
}

export type ConstraintProofImplication = 'IMPLIES' | 'CONFLICTS' | 'DEPENDS_ON';

export interface ConstraintProofEdge {
  from: string;
  to: string;
  implication: ConstraintProofImplication;
}

export type ConstraintProofGlobalStatus = 'FEASIBLE' | 'INFEASIBLE' | 'UNCERTAIN';

export interface ExecutionConstraintProof {
  dagId: string;
  nodes: ConstraintProofNode[];
  edges: ConstraintProofEdge[];
  globalStatus: ConstraintProofGlobalStatus;
}
