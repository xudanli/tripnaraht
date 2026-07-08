import type { Itinerary } from '../../interfaces/trip-plan.interface';
import type { PlanState } from '../../../skills/plan/shared/plan-state.types';
import type { RouteSegment } from '../../../trips/decision/shared/world-model.types';
import type { CanonicalTravelGraph } from '../../../travel-compiler/contracts/canonical-travel-graph.types';
import { collectSegmentStops } from '../../utils/planning-workbench-execute-enrich.util';

export type PlanStateVerifySsotResult = {
  applied: boolean;
  projectedItemCount?: number;
};

function segmentFingerprint(segment: RouteSegment): string {
  const metadata = (segment.metadata ?? {}) as Record<string, unknown>;
  const stops = collectSegmentStops(metadata);
  return `${segment.dayIndex}:${stops.join('|')}:${metadata.theme ?? ''}:${metadata.routeTemplateId ?? ''}`;
}

/** Workbench REPAIR/adjust：对比上次 VERIFY SSOT 快照与当前 segments，推断需增量重编译的 dayIndex。 */
export function inferWorkbenchRepairAffectedDayIndices(params: {
  segmentsBefore?: RouteSegment[];
  segmentsAfter: RouteSegment[];
}): number[] {
  const beforeByDay = new Map<number, string>();
  for (const segment of params.segmentsBefore ?? []) {
    beforeByDay.set(segment.dayIndex, segmentFingerprint(segment));
  }

  const affected = new Set<number>();
  for (const segment of params.segmentsAfter) {
    const fingerprint = segmentFingerprint(segment);
    if (beforeByDay.get(segment.dayIndex) !== fingerprint) {
      affected.add(segment.dayIndex);
    }
  }

  for (const segment of params.segmentsAfter) {
    if (!beforeByDay.has(segment.dayIndex)) {
      affected.add(segment.dayIndex);
    }
  }

  if (affected.size === 0 && params.segmentsAfter.length > 0) {
    affected.add(params.segmentsAfter[0].dayIndex);
  }

  return [...affected].sort((a, b) => a - b);
}

/**
 * Phase G — 将 Graph 投影 Itinerary 登记为 Plan Gate / 后续 VERIFY 的输入 SSOT。
 * Workbench segments 仍为 UI 展示 SSOT（含 canonical_poi_id 回写）；不覆盖 segments 正文。
 */
export function applyGraphVerifySsotToPlanState(planState: PlanState): PlanStateVerifySsotResult {
  const meta = { ...(planState.metadata ?? {}) } as Record<string, unknown>;
  const graph = meta.canonical_travel_graph as CanonicalTravelGraph | undefined;
  const projected = meta.graph_projected_itinerary as Itinerary | undefined;

  if (!graph || !projected?.days?.length) {
    return { applied: false };
  }

  if (!meta.workbench_raw_segments && planState.itinerary?.segments?.length) {
    meta.workbench_raw_segments = structuredClone(planState.itinerary.segments);
  }

  const projectedItemCount = projected.days.reduce((count, day) => count + day.items.length, 0);

  meta.verify_itinerary_source = 'canonical_travel_graph@v0';
  meta.verify_graph_compile_id = graph.compileId;
  meta.verify_graph_id = graph.graphId;
  meta.verify_ssot_applied = true;

  const priorShadow = (meta.verify_shadow ?? {}) as Record<string, unknown>;
  meta.verify_shadow = {
    ...priorShadow,
    ctre_graph_projection: {
      schemaId: 'tripnara.ctre_verify_shadow@v0',
      itemCount: projectedItemCount,
      dayCount: projected.days.length,
      graphId: graph.graphId,
      compileId: graph.compileId,
    },
  };

  planState.metadata = meta;

  return { applied: true, projectedItemCount };
}
