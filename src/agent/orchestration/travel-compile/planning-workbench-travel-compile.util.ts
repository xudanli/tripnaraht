import type { ConfigService } from '@nestjs/config';
import type { PlanContext, PlanState } from '../../../skills/plan/shared/plan-state.types';
import type { TravelCompilerService } from '../../../travel-compiler/travel-compiler.service';
import type { TravelGraphStoreService } from '../../../travel-compiler/services/travel-graph-store.service';
import type { CtreCompileProgressView } from '../../../travel-compiler/contracts/ctre-compile-progress.types';
import { buildCtreCompileProgressView } from '../../../travel-compiler/contracts/ctre-compile-progress.types';
import { graphToItinerary } from '../../../travel-compiler/projection/graph-to-itinerary.util';
import { itineraryToPlannerDraftIR } from '../../../travel-compiler/utils/itinerary-to-planner-draft-ir.util';
import type { CanonicalTravelGraph } from '../../../travel-compiler/contracts/canonical-travel-graph.types';
import type { CompilationResult } from '../../../travel-compiler/contracts/compilation-result.types';
import {
  isTravelCompilerEnabled,
  isTravelCompilerIncrementalRepairEnabled,
  isTravelCompilerVerifySsotEnabled,
} from '../../../travel-compiler/utils/travel-compiler-config.util';
import { mergeIncrementalTravelGraph } from '../../../travel-compiler/utils/merge-incremental-travel-graph.util';
import {
  planStateToItinerary,
  resolveWorkbenchCountryCode,
} from '../../utils/plan-state-to-itinerary.util';
import { applyGraphCanonicalTagsToPlanState } from './apply-graph-to-plan-state-segments.util';
import {
  applyGraphVerifySsotToPlanState,
  inferWorkbenchRepairAffectedDayIndices,
} from './apply-graph-verify-ssot-to-plan-state.util';

export type PlanningWorkbenchCtreOutcome = {
  skipped: boolean;
  reason?: string;
  progress?: CtreCompileProgressView;
  graphProjectedItemCount?: number;
  segmentEnrichment?: ReturnType<typeof applyGraphCanonicalTagsToPlanState>;
  verifySsotApplied?: boolean;
  incrementalRepair?: {
    affectedDayIndices: number[];
    merged: boolean;
  };
};

export async function runPlanningWorkbenchTravelCompile(params: {
  planState: PlanState;
  context: PlanContext;
  tripId?: string;
  userAction?: string;
  enableTravelCompiler?: boolean;
  compiler?: TravelCompilerService;
  graphStore?: TravelGraphStoreService;
  configService?: ConfigService;
  onProgress?: (message: string) => void;
}): Promise<PlanningWorkbenchCtreOutcome> {
  const {
    planState,
    context,
    tripId,
    userAction,
    compiler,
    graphStore,
    configService,
    onProgress,
  } = params;

  if (!isTravelCompilerEnabled(configService, params.enableTravelCompiler)) {
    return { skipped: true, reason: 'travel_compiler_disabled' };
  }

  if (!compiler) {
    return { skipped: true, reason: 'travel_compiler_unavailable' };
  }

  if (userAction === 'compare') {
    return { skipped: true, reason: 'compare_action_skipped' };
  }

  const segments = planState.itinerary?.segments ?? [];
  if (segments.length === 0) {
    return { skipped: true, reason: 'no_segments' };
  }

  const itinerary = planStateToItinerary({
    planState,
    context,
    requestId: planState.plan_id,
  });

  if (!itinerary.days.length) {
    return { skipped: true, reason: 'no_itinerary_items' };
  }

  onProgress?.('CTRE 旅行编译：正在解析 POI、路线与依赖关系…');

  const countryCode = resolveWorkbenchCountryCode(context);
  const compileTrigger = userAction === 'adjust' ? 'repair' : 'plan_gen';
  const metaBeforeCompile = (planState.metadata ?? {}) as Record<string, unknown>;
  const previousGraph = metaBeforeCompile.canonical_travel_graph as CanonicalTravelGraph | undefined;
  const segmentsBeforeRepair = metaBeforeCompile.workbench_raw_segments as
    | PlanState['itinerary']['segments']
    | undefined;

  const draft = itineraryToPlannerDraftIR({
    itinerary,
    tripPlanRequest: { destination: countryCode } as never,
    tripId,
    source: 'planning_workbench',
  });

  let result = await compiler.compile(draft, {
    countryCode,
    allowPartialGraph: true,
    compileTrigger,
  });

  let incrementalRepair: PlanningWorkbenchCtreOutcome['incrementalRepair'];
  const affectedDayIndices =
    compileTrigger === 'repair'
      ? inferWorkbenchRepairAffectedDayIndices({
          segmentsBefore: segmentsBeforeRepair ?? planState.itinerary?.segments,
          segmentsAfter: planState.itinerary?.segments ?? [],
        })
      : [];

  const useIncremental =
    compileTrigger === 'repair' &&
    isTravelCompilerIncrementalRepairEnabled(configService) &&
    Boolean(previousGraph) &&
    Boolean(result.graph) &&
    affectedDayIndices.length > 0;

  if (useIncremental && previousGraph && result.graph) {
    result = {
      ...result,
      graph: mergeIncrementalTravelGraph({
        previous: previousGraph,
        incremental: result.graph,
        affectedDayIndices,
      }),
      incremental: {
        affectedDayIndices,
        previousCompileId: previousGraph.compileId,
        merged: true,
      },
    };
    incrementalRepair = { affectedDayIndices, merged: true };
  } else if (compileTrigger === 'repair' && affectedDayIndices.length > 0) {
    incrementalRepair = { affectedDayIndices, merged: false };
  }

  const progress = buildCtreCompileProgressView(
    result,
    userAction === 'adjust' ? 'repair' : 'plan_gen',
  );

  onProgress?.(
    `CTRE 编译：${progress.status} score=${progress.score}（POI ${progress.counters.POI?.done ?? 0}/${progress.counters.POI?.total ?? 0}）`,
  );

  if (tripId && graphStore && result.graph) {
    await graphStore.persistCompilation(tripId, result).catch(() => undefined);
  }

  const projected = result.graph ? graphToItinerary(result.graph) : undefined;
  const graphProjectedItemCount = projected?.days.reduce((n, d) => n + d.items.length, 0);

  let segmentEnrichment: PlanningWorkbenchCtreOutcome['segmentEnrichment'];
  if (result.graph) {
    segmentEnrichment = applyGraphCanonicalTagsToPlanState({
      planState,
      graph: result.graph,
    });
  }

  planState.metadata = {
    ...(planState.metadata ?? {}),
    canonical_travel_graph: result.graph,
    travel_compilation_result: result as CompilationResult,
    ctre_compile_progress: progress,
    graph_projected_itinerary: projected,
    travel_compile_trigger: compileTrigger,
    ...(segmentEnrichment ? { ctre_segment_enrichment: segmentEnrichment } : {}),
    ...(incrementalRepair ? { ctre_incremental_repair: incrementalRepair } : {}),
  };

  let verifySsotApplied: boolean | undefined;
  if (result.graph && isTravelCompilerVerifySsotEnabled(configService) && result.status !== 'failed') {
    verifySsotApplied = applyGraphVerifySsotToPlanState(planState).applied;
    if (verifySsotApplied) {
      planState.metadata = {
        ...planState.metadata,
        verify_ssot_applied: true,
      };
    }
  }

  return {
    skipped: false,
    progress,
    graphProjectedItemCount,
    segmentEnrichment,
    verifySsotApplied,
    incrementalRepair,
  };
}
