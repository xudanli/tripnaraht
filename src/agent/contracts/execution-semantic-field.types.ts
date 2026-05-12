/**
 * Continuous execution semantic field — replaces categorical SYSTEM1/SYSTEM2 **as decision variables**.
 * Legacy tier strings remain only as **observability projections** (see `legacy-execution-projection.util.ts`).
 */

/** ECPS execution kernel (authoritative runtime selector). */
export type ExecutionKernel =
  | 'REFLEX_KERNEL'
  | 'LIGHTWEIGHT_KERNEL'
  | 'REASONING_KERNEL'
  | 'WORKFLOW_KERNEL';

/** Tool expansion — discrete depth ladder (replaces NONE/LIGHT/FULL as names only). */
export type ExecutionToolDepth = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

/** Latent state chart ∈ [0,1]⁴ — ECPS decision substrate. */
export interface ExecutionStateFeatures {
  /** Cognitive load / compute depth proxy. */
  intensity: number;
  /** Exploratory freedom vs deterministic replay. */
  entropy: number;
  /** Convergence / replay stability. */
  determinism: number;
  toolDepth: ExecutionToolDepth;
}

/** Claude / DAG planner shape (non-engine categorical). */
export type PlannerMode = 'STRUCTURED' | 'EXPLORATORY' | 'CONSTRAINED';

/** Optional router hints — estimates only, never authoritative (legacy RouteType may still exist for migration). */
export interface SemanticRouteHint {
  intensityEstimate?: number;
  entropyEstimate?: number;
  determinismEstimate?: number;
  toolDepthHint?: ExecutionToolDepth;
}
