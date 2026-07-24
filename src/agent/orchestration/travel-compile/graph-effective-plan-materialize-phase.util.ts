import type { ConfigService } from '@nestjs/config';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { GraphEffectivePlanMaterializerService } from '../../../travel-compiler/services/graph-effective-plan-materializer.service';
import {
  isTravelCompilerEnabled,
  isTravelCompilerMaterializeEnabled,
} from '../../../travel-compiler/utils/travel-compiler-config.util';
import { readCanonicalGraphFromState } from '../../../travel-compiler/projection/apply-graph-verify-ssot.util';
import type { Itinerary } from '../../interfaces/trip-plan.interface';

export type GraphMaterializePhaseOutcome = {
  skipped: boolean;
  itemCount?: number;
};

/**
 * Phase D — VERIFY 通过后，将 CanonicalTravelGraph 投影 materialize 到 Trip 时间线（RFC001 写链）。
 */
export async function runGraphEffectivePlanMaterializePhase(params: {
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  materializer?: GraphEffectivePlanMaterializerService;
  configService?: ConfigService;
}): Promise<GraphMaterializePhaseOutcome> {
  const { state, request, materializer, configService } = params;

  const enabled = isTravelCompilerEnabled(
    configService,
    request.options?.enable_travel_compiler,
  );
  if (!enabled || !isTravelCompilerMaterializeEnabled(configService) || !materializer) {
    return { skipped: true };
  }

  const tripId = (request.trip_id ?? (state.metadata as Record<string, unknown>)?.tripId ?? '')
    .toString()
    .trim();
  if (!tripId) return { skipped: true };

  const graph = readCanonicalGraphFromState(state);
  const meta = (state.metadata ?? {}) as Record<string, unknown>;
  const itinerary =
    (state.itinerary as Itinerary | undefined) ??
    (meta.graph_projected_itinerary as Itinerary | undefined);

  if (!graph || !itinerary?.days?.length) {
    return { skipped: true };
  }

  if (meta.verify_itinerary_source !== 'canonical_travel_graph@v0') {
    return { skipped: true };
  }

  const stepStart = Date.now();
  const result = await materializer.materializeFromGraph({ tripId, graph, itinerary }).catch(() => ({
    applied: false,
    skipped: true,
    itemCount: 0,
    removedItemCount: 0,
    reason: 'materialize_failed',
  }));

  if (!result.applied) {
    return { skipped: true };
  }

  meta.graph_effective_plan_materialized_at = new Date().toISOString();
  meta.graph_effective_plan_item_count = result.itemCount;
  state.metadata = { ...state.metadata, ...meta };

  state.decision_log.push({
    request_id: state.request_id,
    step: 'VERIFY',
    actor: 'Orchestrator',
    inputs_summary: `tripId=${tripId} compileId=${graph.compileId}`,
    outputs_summary: `graph_materialized items=${result.itemCount} removed=${result.removedItemCount}`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      duration_ms: Date.now() - stepStart,
      phase: 'GRAPH_EFFECTIVE_PLAN_MATERIALIZE',
      compileId: graph.compileId,
      graphId: graph.graphId,
    },
  });

  return { skipped: false, itemCount: result.itemCount };
}
