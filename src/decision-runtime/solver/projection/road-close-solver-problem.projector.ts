/**
 * Project road-close evidence → SolverProblem (constraint projection only).
 * Canonical road-close rules remain SSOT; this is a solvable subset for OR-Tools.
 *
 * @see ADR-008-OR-Tools-Candidate-Provider.md
 */

import type {
  OptimizationNode,
  SolverConfig,
  SolverConstraint,
  SolverProblem,
  SolverRepairOperation,
} from '../contracts/solver-problem';

export interface DayStopForSolver {
  nodeId: string;
  sourceActivityId?: string;
  poiId?: string;
  serviceDurationMin: number;
  timeWindow?: { startMin: number; endMin: number };
  fixedStartMin?: number;
  isBooked?: boolean;
  isMandatory?: boolean;
  canRemove?: boolean;
  /** First depot stop — recommended true for index 0 */
  isDepot?: boolean;
  /** When true, stop is a REPLACE alternate — not on the base route order */
  isReplaceAlternate?: boolean;
}

export interface ForbiddenTravelEdge {
  fromNodeId: string;
  toNodeId: string;
  /** Closed road id, e.g. F208 */
  roadId: string;
  canonicalConstraintId?: string;
}

export interface ProjectRoadCloseToSolverProblemInput {
  requestId: string;
  tripId: string;
  planVersionId: string;
  evidenceVersionId?: string;
  snapshotId?: string;
  dayId: string;
  /** S1–S3 ops (MOVE_DAY still excluded) */
  operation?: Extract<
    SolverRepairOperation,
    'SWAP' | 'SHIFT' | 'REROUTE' | 'SHORTEN' | 'REPLACE'
  >;
  stops: DayStopForSolver[];
  /** Square matrix minutes, same order as stops */
  travelMatrixMin: number[][];
  forbiddenEdges: ForbiddenTravelEdge[];
  /** True POI substitutes (both endpoints must be in stops) */
  replacePool?: Array<{ fromNodeId: string; toNodeId: string }>;
  solverConfig?: Partial<SolverConfig>;
}

const DEFAULT_TW = { startMin: 480, endMin: 1200 };

export function projectRoadCloseToSolverProblem(
  input: ProjectRoadCloseToSolverProblemInput,
): SolverProblem {
  if (input.stops.length < 2) {
    throw new Error('projectRoadCloseToSolverProblem: need ≥2 stops');
  }
  if (input.travelMatrixMin.length !== input.stops.length) {
    throw new Error('travelMatrixMin must match stops length');
  }
  for (const row of input.travelMatrixMin) {
    if (row.length !== input.stops.length) {
      throw new Error('travelMatrixMin must be square');
    }
  }

  const nodeIds = input.stops.map((s) => s.nodeId);
  const nodes: OptimizationNode[] = input.stops.map((s, i) => {
    const tw = s.timeWindow ?? DEFAULT_TW;
    return {
      nodeId: s.nodeId,
      sourceActivityId: s.sourceActivityId,
      poiId: s.poiId,
      serviceDurationMin: s.serviceDurationMin,
      timeWindows: [tw],
      fixedStartMin: s.fixedStartMin ?? (i === 0 || s.isDepot ? tw.startMin : undefined),
      isMandatory: s.isMandatory ?? !(s.canRemove || s.isReplaceAlternate),
      isBooked: s.isBooked ?? Boolean(s.isDepot || i === 0),
      canRemove: s.canRemove ?? false,
      canMoveDay: false,
    };
  });

  const depotId = nodes[0].nodeId;
  const constraints: SolverConstraint[] = [
    {
      constraintId: `depot-fixed:${depotId}`,
      kind: 'DEPOT_FIXED',
      hard: true,
      payload: { nodeId: depotId },
    },
  ];

  for (const pair of input.replacePool ?? []) {
    if (!nodeIds.includes(pair.fromNodeId) || !nodeIds.includes(pair.toNodeId)) {
      continue;
    }
    constraints.push({
      constraintId: `replace-pool:${pair.fromNodeId}->${pair.toNodeId}`,
      kind: 'REPLACE_POOL',
      hard: false,
      payload: {
        fromNodeId: pair.fromNodeId,
        toNodeId: pair.toNodeId,
      },
    });
  }

  for (const edge of input.forbiddenEdges) {
    if (!nodeIds.includes(edge.fromNodeId) || !nodeIds.includes(edge.toNodeId)) {
      continue;
    }
    constraints.push({
      constraintId: `edge-forbidden:${edge.roadId}:${edge.fromNodeId}->${edge.toNodeId}`,
      kind: 'EDGE_FORBIDDEN',
      hard: true,
      canonicalConstraintId:
        edge.canonicalConstraintId ?? `road.close.${edge.roadId}`,
      payload: {
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        roadId: edge.roadId,
      },
    });
  }

  const cfg = input.solverConfig ?? {};
  return {
    schemaId: 'tripnara.solver_problem@v1',
    requestId: input.requestId,
    tripId: input.tripId,
    planVersionId: input.planVersionId,
    evidenceVersionId: input.evidenceVersionId,
    snapshotId: input.snapshotId,
    operation: input.operation ?? 'SWAP',
    scope: { dayIds: [input.dayId] },
    nodes,
    travelMatrix: {
      nodeIds,
      costsMin: input.travelMatrixMin.map((r) => r.slice()),
    },
    constraints,
    objectives: [
      { objectiveId: 'min-travel', kind: 'MINIMIZE_TRAVEL', weight: 1 },
      { objectiveId: 'preserve-base', kind: 'MAXIMIZE_PRESERVE_BASE', weight: 0.5 },
    ],
    solverConfig: {
      maxCandidates: cfg.maxCandidates ?? 3,
      timeLimitMs: cfg.timeLimitMs ?? 2000,
      seed: cfg.seed ?? 42,
    },
  };
}

/** Infer forbidden POI-hop edges from closed road + sequential day stops. */
export function inferForbiddenEdgesFromClosedRoad(input: {
  roadId: string;
  /** Ordered day node ids (depot first) */
  orderedNodeIds: string[];
  /** Indices i where hop orderedNodeIds[i] → orderedNodeIds[i+1] uses the closed road */
  closedHopIndices: number[];
  canonicalConstraintId?: string;
}): ForbiddenTravelEdge[] {
  const edges: ForbiddenTravelEdge[] = [];
  for (const i of input.closedHopIndices) {
    const from = input.orderedNodeIds[i];
    const to = input.orderedNodeIds[i + 1];
    if (!from || !to) continue;
    edges.push({
      fromNodeId: from,
      toNodeId: to,
      roadId: input.roadId,
      canonicalConstraintId: input.canonicalConstraintId,
    });
  }
  return edges;
}
