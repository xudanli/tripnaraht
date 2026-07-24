/**
 * SolverResponse — OR-Tools service output before platform IR mapping.
 * Candidates must already be expressed as platform plan patches / day plans —
 * never OR-Tools route/vehicle indices for Decision Runtime consumption.
 *
 * @see ADR-008-OR-Tools-Candidate-Provider.md
 * @see ../PLANNING_IR_FREEZE.md (S4.5 / M1.5)
 */

import type { SolverRepairOperation } from './solver-problem';

/** Frozen wire schemaId — bump to @v2 on breaking change. */
export const SOLVER_RESPONSE_SCHEMA_ID = 'tripnara.solver_response@v1' as const;

export type SolverStatus = 'SOLVED' | 'PARTIAL' | 'INFEASIBLE' | 'TIMEOUT' | 'ERROR';

export type SolverEngine = 'OR_TOOLS_ROUTING' | 'OR_TOOLS_CP_SAT';

export interface SolverMeta {
  engine: SolverEngine;
  version: string;
  strategy: string;
  /**
   * True only when ortools.sat.python.cp_model.CpSolver actually solved.
   * RoutingModel / GUIDED_LOCAL_SEARCH → false.
   */
  nativeCpSat: boolean;
  seed: number;
  elapsedMs: number;
}

/**
 * Ordered activity on a single day after repair — platform node ids only.
 */
export interface SolverDayPlan {
  dayId: string;
  /** OptimizationNode.nodeId / sourceActivityId order */
  nodeIds: string[];
  /** Planned start minutes from day origin, parallel to nodeIds when present */
  startMin?: number[];
}

/**
 * Diff hints for shadow compare — not authority.
 */
export interface SolverCandidateDiffHint {
  shiftedActivityIds?: string[];
  swappedPairs?: Array<{ a: string; b: string }>;
  removedActivityIds?: string[];
  addedPoiIds?: string[];
  /** M2 MOVE_DAY */
  movedDayPairs?: Array<{ nodeId: string; fromDayId: string; toDayId: string }>;
}

export interface SolverCandidate {
  candidateId: string;
  operation: SolverRepairOperation;
  label: string;
  /** Platform day plans — mapper turns these into TripPlan / RepairProposal */
  dayPlans: SolverDayPlan[];
  objectiveValue?: number;
  diffHint?: SolverCandidateDiffHint;
  /** Solver-claimed hard constraint ids satisfied (projected ids only) */
  satisfiedSolverConstraintIds?: string[];
}

export interface SolverResponse {
  schemaId: typeof SOLVER_RESPONSE_SCHEMA_ID;
  requestId: string;
  status: SolverStatus;
  candidates: SolverCandidate[];
  solverMeta: SolverMeta;
  /** Human/debug — never used as executability */
  message?: string;
}
