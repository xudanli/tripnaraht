import type { ConfigService } from '@nestjs/config';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { Itinerary, OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { TravelCompilerService } from '../../../travel-compiler/travel-compiler.service';
import type { TravelGraphStoreService } from '../../../travel-compiler/services/travel-graph-store.service';
import type { CompilationResult } from '../../../travel-compiler/contracts/compilation-result.types';
import type { CanonicalTravelGraph } from '../../../travel-compiler/contracts/canonical-travel-graph.types';
import { itineraryToPlannerDraftIR } from '../../../travel-compiler/utils/itinerary-to-planner-draft-ir.util';
import {
  isTravelCompilerEnabled,
  isTravelCompilerIncrementalRepairEnabled,
  isTravelCompilerStrict,
  isTravelCompilerVerifySsotEnabled,
} from '../../../travel-compiler/utils/travel-compiler-config.util';
import { graphToItinerary } from '../../../travel-compiler/projection/graph-to-itinerary.util';
import { applyGraphVerifySsot } from '../../../travel-compiler/projection/apply-graph-verify-ssot.util';
import { mergeIncrementalTravelGraph } from '../../../travel-compiler/utils/merge-incremental-travel-graph.util';
import {
  inferRepairAffectedDayIndices,
  type RepairIssueDayHint,
} from '../../../travel-compiler/utils/infer-repair-affected-days.util';
import {
  buildCtreCompileProgressView,
  type CtreCompileProgressView,
} from '../../../travel-compiler/contracts/ctre-compile-progress.types';

export type TravelCompilePhaseOutcome = {
  skipped: boolean;
  result?: CompilationResult;
};

export type TravelCompilePhaseOptions = {
  trigger?: 'plan_gen' | 'repair';
  affectedDayIndices?: number[];
  itineraryBeforeRepair?: Itinerary;
  verificationIssues?: RepairIssueDayHint[];
};

function readPreviousGraph(state: OrchestratorState): CanonicalTravelGraph | undefined {
  const meta = (state.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.canonical_travel_graph;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as CanonicalTravelGraph;
}

function readPreviousCompilation(state: OrchestratorState): CompilationResult | undefined {
  const meta = (state.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.travel_compilation_result;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as CompilationResult;
}

async function persistCompilationArtifacts(params: {
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  result: CompilationResult;
  graphStore?: TravelGraphStoreService;
  stepStart: number;
  draftSummary: string;
  phaseOptions?: TravelCompilePhaseOptions;
  configService?: ConfigService;
  onProgress?: (view: CtreCompileProgressView) => void;
}): Promise<CompilationResult> {
  const { state, request, graphStore, stepStart, draftSummary, phaseOptions, configService, onProgress } = params;
  let { result } = params;
  const meta = state.metadata as Record<string, unknown>;

  meta.travel_compilation_result = result;
  if (result.graph) {
    meta.canonical_travel_graph = result.graph;
    meta.graph_projected_itinerary = graphToItinerary(result.graph);
  }
  meta.last_updated_at = new Date().toISOString();
  const trigger = phaseOptions?.trigger ?? 'plan_gen';
  meta.travel_compile_trigger = trigger;

  const progressView = buildCtreCompileProgressView(result, trigger);
  meta.ctre_compile_progress = progressView;
  onProgress?.(progressView);

  if (
    result.graph &&
    isTravelCompilerVerifySsotEnabled(configService) &&
    result.status !== 'failed'
  ) {
    const ssot = applyGraphVerifySsot(state);
    if (ssot.applied) {
      meta.verify_ssot_applied = true;
    }
  }

  const affectedDays =
    phaseOptions?.affectedDayIndices ?? result.incremental?.affectedDayIndices ?? [];

  state.decision_log.push({
    request_id: state.request_id,
    step: 'TRAVEL_COMPILE',
    actor: 'Orchestrator',
    inputs_summary: `${draftSummary} trigger=${trigger}`,
    outputs_summary: `status=${result.status} score=${result.score} poi=${result.graph?.stats.poiResolved ?? 0}/${(result.graph?.stats.poiResolved ?? 0) + (result.graph?.stats.poiUnresolved ?? 0)} warnings=${result.warnings.length} errors=${result.errors.length}${result.incremental?.merged ? ` incremental_days=${affectedDays.join(',')}` : ''}`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      duration_ms: Date.now() - stepStart,
      trigger,
      affectedDayIndices: affectedDays,
      incremental: Boolean(result.incremental?.merged),
      engine: result.engine ?? 'CTRE',
    },
  });

  if (result.status === 'failed' && isTravelCompilerStrict(configService)) {
    state.errors.push({
      step: 'TRAVEL_COMPILE',
      error_code: 'TRAVEL_COMPILE_FAILED',
      message: result.errors.map((e) => e.message).join('; ') || 'Travel compile failed',
      timestamp: new Date().toISOString(),
    });
  } else if (result.warnings.length > 0 || result.errors.length > 0) {
    meta.warnings = [
      ...(Array.isArray(meta.warnings) ? meta.warnings : []),
      ...result.warnings.map((w) => ({
        type: 'TRAVEL_COMPILE',
        message: w.message,
        items: [w.code],
      })),
    ];
  }

  const tripId = (request.trip_id ?? meta.tripId ?? '').toString().trim();
  if (tripId && graphStore && result.graph) {
    await graphStore.persistCompilation(tripId, result).catch(() => undefined);
  }

  return result;
}

export async function runTravelCompilePhase(params: {
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  compiler?: TravelCompilerService;
  graphStore?: TravelGraphStoreService;
  configService?: ConfigService;
  phaseOptions?: TravelCompilePhaseOptions;
  onProgress?: (view: CtreCompileProgressView) => void;
}): Promise<TravelCompilePhaseOutcome> {
  const { state, request, compiler, graphStore, configService, phaseOptions, onProgress } = params;
  const enabled = isTravelCompilerEnabled(
    configService,
    request.options?.enable_travel_compiler,
  );

  if (!enabled || !compiler) {
    return { skipped: true };
  }

  if (!state.itinerary?.days?.length) {
    return { skipped: true };
  }

  const stepStart = Date.now();
  state.current_step = 'TRAVEL_COMPILE';

  const draft = itineraryToPlannerDraftIR({
    itinerary: state.itinerary,
    tripPlanRequest: state.trip_plan_request,
    tripId: request.trip_id ?? undefined,
    source: phaseOptions?.trigger === 'repair' ? 'agent_planner' : 'agent_planner',
  });

  const trigger = phaseOptions?.trigger ?? 'plan_gen';
  let affectedDayIndices = phaseOptions?.affectedDayIndices;
  const previousGraph = readPreviousGraph(state);
  const previousCompilation = readPreviousCompilation(state);

  if (trigger === 'repair' && !affectedDayIndices?.length) {
    affectedDayIndices = inferRepairAffectedDayIndices({
      itineraryBefore: phaseOptions?.itineraryBeforeRepair,
      itineraryAfter: state.itinerary,
      verificationIssues: phaseOptions?.verificationIssues,
    });
  }

  const useIncremental =
    trigger === 'repair' &&
    isTravelCompilerIncrementalRepairEnabled(configService) &&
    Boolean(previousGraph) &&
    Boolean(affectedDayIndices?.length);

  let result = await compiler.compile(draft, {
    countryCode: draft.destination.countryCode,
    allowPartialGraph: true,
    locale: request.conversation_context?.locale,
    compileTrigger: trigger,
  });

  if (useIncremental && result.graph && previousGraph && affectedDayIndices?.length) {
    const mergedGraph = mergeIncrementalTravelGraph({
      previous: previousGraph,
      incremental: result.graph,
      affectedDayIndices,
    });
    result = {
      ...result,
      graph: mergedGraph,
      incremental: {
        affectedDayIndices,
        previousCompileId: previousCompilation?.compileId,
        merged: true,
      },
    };
  }

  const draftSummary = `days=${draft.days.length} slots=${draft.days.reduce((n, d) => n + d.slots.length, 0)}`;
  result = await persistCompilationArtifacts({
    state,
    request,
    result,
    graphStore,
    stepStart,
    draftSummary,
    phaseOptions: { ...phaseOptions, affectedDayIndices },
    configService,
    onProgress,
  });

  return { skipped: false, result };
}

export async function runTravelRecompileAfterRepair(params: {
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  compiler?: TravelCompilerService;
  graphStore?: TravelGraphStoreService;
  configService?: ConfigService;
  itineraryBeforeRepair: Itinerary;
  repairApplied: boolean;
  verificationIssues?: RepairIssueDayHint[];
  onProgress?: (view: CtreCompileProgressView) => void;
}): Promise<TravelCompilePhaseOutcome> {
  if (!params.repairApplied) {
    return { skipped: true };
  }

  return runTravelCompilePhase({
    state: params.state,
    request: params.request,
    compiler: params.compiler,
    graphStore: params.graphStore,
    configService: params.configService,
    phaseOptions: {
      trigger: 'repair',
      itineraryBeforeRepair: params.itineraryBeforeRepair,
      verificationIssues: params.verificationIssues,
    },
    onProgress: params.onProgress,
  });
}
