import type { Itinerary, OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import type { CanonicalTravelGraph } from '../contracts/canonical-travel-graph.types';

export type GraphVerifySsotResult = {
  applied: boolean;
  graph?: CanonicalTravelGraph;
  projectedItinerary?: Itinerary;
};

/**
 * Phase D — 将 CanonicalTravelGraph 投影的 Itinerary 设为 VERIFY 输入 SSOT。
 * 原始 PLAN_GEN itinerary 保留在 metadata.planner_raw_itinerary 供审计/回滚。
 */
export function applyGraphVerifySsot(state: OrchestratorState): GraphVerifySsotResult {
  const meta = (state.metadata ?? {}) as Record<string, unknown>;
  const graph = meta.canonical_travel_graph as CanonicalTravelGraph | undefined;
  const projected =
    (meta.graph_projected_itinerary as Itinerary | undefined) ??
    (meta.graphProjectedItinerary as Itinerary | undefined);

  if (!graph || !projected?.days?.length) {
    return { applied: false };
  }

  if (!meta.planner_raw_itinerary && state.itinerary) {
    meta.planner_raw_itinerary = structuredClone(state.itinerary);
  }

  state.itinerary = projected;
  meta.graph_projected_itinerary = projected;
  meta.verify_itinerary_source = 'canonical_travel_graph@v0';
  meta.verify_graph_compile_id = graph.compileId;
  meta.verify_graph_id = graph.graphId;
  state.metadata = { ...state.metadata, ...meta };

  return { applied: true, graph, projectedItinerary: projected };
}

export function readCanonicalGraphFromState(
  state: OrchestratorState,
): CanonicalTravelGraph | undefined {
  const meta = (state.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.canonical_travel_graph;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as CanonicalTravelGraph;
}
