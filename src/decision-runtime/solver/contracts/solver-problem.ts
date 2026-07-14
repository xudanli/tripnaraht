/**
 * SolverProblem — wire IR projected to OR-Tools (non-authoritative).
 *
 * Distinct from Decision Runtime `OptimizationProblem`
 * (`contracts/optimization-problem.ts`), which is the assembler input
 * for OptimizationStrategy / DecisionCore.
 *
 * @see ADR-008-OR-Tools-Candidate-Provider.md
 * @see ../PLANNING_IR_FREEZE.md (S4.5 / M1.5)
 */

/** Frozen wire schemaId — bump to @v2 on breaking change. */
export const SOLVER_PROBLEM_SCHEMA_ID = 'tripnara.solver_problem@v1' as const;

export type SolverRepairOperation =
  | 'SHIFT'
  | 'SWAP'
  | 'SHORTEN'
  | 'REPLACE'
  | 'MOVE_DAY'
  | 'REROUTE';

/** Operations enabled in S0–S3. MOVE_DAY deferred to S5. */
export const SOLVER_MVP_OPERATIONS: readonly SolverRepairOperation[] = [
  'SHIFT',
  'SWAP',
  'REROUTE',
  'SHORTEN',
  'REPLACE',
] as const;

export interface SolverTimeWindow {
  startMin: number;
  endMin: number;
}

export interface OptimizationNode {
  nodeId: string;
  sourceActivityId?: string;
  poiId?: string;

  serviceDurationMin: number;
  timeWindows: SolverTimeWindow[];

  fixedStartMin?: number;
  lastEntryMin?: number;

  isMandatory: boolean;
  isBooked: boolean;
  canRemove: boolean;
  canMoveDay: boolean;
  /** Base day membership for MOVE_DAY (M2); single-day paths ignore. */
  assignedDayId?: string;
}

export interface TravelMatrix {
  /** Parallel to node order, or keyed; minutes, integer preferred. */
  nodeIds: string[];
  /** costs[i][j] = travel minutes from nodeIds[i] → nodeIds[j] */
  costsMin: number[][];
}

export type SolverConstraintKind =
  | 'TIME_WINDOW'
  | 'FIXED_START'
  | 'BOOKED_PIN'
  | 'EDGE_FORBIDDEN'
  | 'MAX_DAY_DRIVE_MIN'
  | 'DEPOT_FIXED'
  /** REPLACE: swap fromNodeId → toNodeId (toNodeId must exist in nodes/matrix) */
  | 'REPLACE_POOL';

export interface SolverConstraint {
  constraintId: string;
  kind: SolverConstraintKind;
  /** Projection from Canonical Constraint — not SSOT */
  canonicalConstraintId?: string;
  hard: boolean;
  payload: Record<string, unknown>;
}

export type SolverObjectiveKind =
  | 'MINIMIZE_TRAVEL'
  | 'MINIMIZE_LATENESS'
  | 'MAXIMIZE_PRESERVE_BASE'
  | 'MINIMIZE_CHANGES';

export interface SolverObjective {
  objectiveId: string;
  kind: SolverObjectiveKind;
  weight: number;
}

export interface SolverConfig {
  maxCandidates: number;
  timeLimitMs: number;
  seed: number;
  /** MOVE_DAY locality cap (default 3 on sidecar). */
  maxMovedActivities?: number;
}

export interface SolverDayAnchor {
  dayId: string;
  anchorNodeId: string;
}

export interface SolverDayCapacity {
  dayId: string;
  maxDriveMin?: number;
  maxServiceMin?: number;
  maxActivities?: number;
}

export interface SolverProblemScope {
  dayIds: string[];
  activityIds?: string[];
  /** M2 optional — per-day hotel/depot anchors */
  dayAnchors?: SolverDayAnchor[];
  dayCapacities?: SolverDayCapacity[];
}

/**
 * Request body for Python OR-Tools solver service.
 * schemaId pins wire compatibility for Nest ↔ Python.
 */
export interface SolverProblem {
  schemaId: typeof SOLVER_PROBLEM_SCHEMA_ID;
  requestId: string;
  tripId: string;
  planVersionId: string;
  /** Evidence / snapshot ids — for observability & re-validation, not routing internals */
  evidenceVersionId?: string;
  snapshotId?: string;

  operation: SolverRepairOperation;
  scope: SolverProblemScope;

  nodes: OptimizationNode[];
  travelMatrix: TravelMatrix;
  constraints: SolverConstraint[];
  objectives: SolverObjective[];
  solverConfig: SolverConfig;
}
