/**
 * Slim payload attached to RouteAndRun `observability` when runtime materialization is enabled.
 */

import type { ExecutionGraphSnapshot } from './execution-graph.types';
import type { UnifiedRuntimeState } from './runtime-state.types';
import type { UnifiedSchedulerTickPlan } from './unified-scheduler.types';

export const RUNTIME_OBSERVABILITY_SLICE_SCHEMA = 'runtime/observability-slice/v1' as const;

export interface RuntimeObservabilitySlice {
  schema: typeof RUNTIME_OBSERVABILITY_SLICE_SCHEMA;
  unified_state: UnifiedRuntimeState;
  scheduler_plan: UnifiedSchedulerTickPlan;
  /** P1 — materialized node/edge lineage for this tick (optional). */
  execution_graph?: ExecutionGraphSnapshot;
}
