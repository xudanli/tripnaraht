/** Shared replay artifact taxonomy (no dependency on identity/descriptor graphs). */

export type ReplayArtifactType =
  | 'FULL_RESPONSE'
  | 'ROUTE_SELECTION'
  | 'TOOL_PLAN'
  | 'PLANNER_GRAPH'
  | 'WORLD_MODEL'
  | 'SIMULATION_RESULT';

export type ReplayEligibilityClass = 'FULL' | 'PARTIAL' | 'NON_REPLAYABLE';
