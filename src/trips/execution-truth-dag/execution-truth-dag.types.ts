/**
 * P5-2 Execution Truth DAG — single structural model for provable execution causality.
 * Nodes carry overlay-derived truth only; edges encode propagation / dependency (not raw drift scans).
 */

/** Canonical fused execution posture for graph semantics (maps from overlay ExecutionState). */
export type ExecutionTruthFinalState =
  | 'BLOCKED'
  | 'HARD'
  | 'DEGRADED'
  | 'SOFT'
  | 'OK';

export type ExecutionTruthNodeType = 'LEG' | 'STAY' | 'ACTIVITY';

export interface ExecutionNodeExecution {
  finalState: ExecutionTruthFinalState;
  delayMinutes: number;
  reliabilityScore: number;
}

export interface ExecutionNodeTemporal {
  daylightViolation: boolean;
  crossDayRisk: number;
  /** 0–1 aggregate proxy (cross-day + daylight stress); not a second feasibility engine. */
  arrivalRisk: number;
}

export interface ExecutionNodeWeather {
  /** 0–1 exposure / severity proxy from overlay weather.delayFactor + severity. */
  exposureScore: number;
}

export interface ExecutionNodeRoad {
  /** 0–1 accessibility (1 = unconstrained). */
  accessibility: number;
}

export type ExecutionTruthRepairKind = 'RELOCATE' | 'SHIFT' | 'COMPRESS' | 'NONE';

export interface ExecutionNodeRepair {
  required: boolean;
  type?: ExecutionTruthRepairKind;
}

export interface ExecutionNode {
  id: string;
  date: string;
  slotId?: string;
  type: ExecutionTruthNodeType;
  geometryRef?: string;
  execution: ExecutionNodeExecution;
  temporal: ExecutionNodeTemporal;
  weather: ExecutionNodeWeather;
  road: ExecutionNodeRoad;
  repair?: ExecutionNodeRepair;
}

export type ExecutionEdgeType =
  | 'TEMPORAL_SEQUENCE'
  | 'CROSS_DAY_SPILL'
  | 'ROUTE_DEPENDENCY'
  | 'WEATHER_DEPENDENCY'
  | 'REPAIR_DEPENDENCY';

export interface ExecutionEdge {
  /** Stable identity for graph patches / traversal provenance (builder-assigned). */
  id: string;
  from: string;
  to: string;
  type: ExecutionEdgeType;
  /** Primary stress / delay propagation scalar for traversal & ranking. */
  weight: number;
  /** Repair proposals that influence this edge (mutation layer — does not rewrite overlay nodes). */
  repairProposalIds?: string[];
}

export interface ExecutionTruthDAG {
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
}
