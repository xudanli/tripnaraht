/**
 * ClaudeOrchestrator 各阶段 Phase/Node Host 工厂（从 Service 迁出，无 Nest DI）。
 */

import { projectToOrchestratorState } from '../../decision/kernel/dso-authority.util';
import {
  recordGateEvalTrajectoryDraft,
  recordPlanGenDraftSnapshot,
} from '../training/utils/decision-trajectory-orchestration.hook';
import {
  applyPostRepairRoutingMetricsSync,
  syncPlanRoutingMetricsToTripPlan,
} from '../axioms/sync-plan-routing-metrics-to-trip.util';
import { mergeVerificationIssuesIntoGateResult } from '../utils/merge-verify-issues-into-gate.util';
import { runTravelRecompileAfterRepair } from '../orchestration/travel-compile/travel-compile-phase.util';
import {
  runIntakePhase,
  runPoiSelectionPhase,
  runGateEvalPhase,
  runContextBuildPhase,
  runResearchPhase,
  runStateUpdatePhase,
  type IntakePhaseHost,
  type IntakeNodeHost,
  type PoiSelectionPhaseHost,
  type PoiSelectionNodeHost,
  type GateEvalPhaseHost,
  type GateEvalNodeHost,
  type ContextBuildPhaseHost,
  type ContextBuildNodeHost,
  type ResearchPhaseHost,
  type ResearchNodeHost,
  type StateUpdatePhaseHost,
  type StateUpdateNodeHost,
  type PlanGenPhaseHost,
  type VerifyPhaseHost,
  type OptimizePhaseHost,
  type RepairPhaseHost,
} from '../orchestration/graph';
import {
  runNarratePhase,
  runFeedbackPhase,
  runHallucinationPhase,
  type NarratePhaseHost,
  type NarrateNodeHost,
  type FeedbackPhaseHost,
  type HallucinationPhaseHost,
  type PostPlanGraphHost,
} from '../orchestration/post-plan';
import { isResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.util';
import { readRealtimeRerollCount } from '../memory/emotional-resonance/research-realtime-frustration.util';
import { MEMORY_REPLAY_DECISION_SOURCE } from '../memory/experience-replay/memory-replay.constants';
import type { OrchestrationStep, OrchestratorState, SubAgentType } from '../interfaces/trip-plan.interface';

/** Service bridge：工厂只依赖结构类型，不注入 Nest。 */
export type OrchestratorPhaseHostFactorySource = any;

export function createIntakePhaseHost(svc: OrchestratorPhaseHostFactorySource): IntakePhaseHost {
  return {
    logger: svc.logger,
    clarificationHandler: svc.clarificationHandler,
    decisionKernel: svc.decisionKernel,
    localCaseStore: svc.localCaseStore,
    convertToTripPlanRequest: (req, st) => svc.convertToTripPlanRequest(req, st),
    hydrateTripPlanRequestFromTripRecord: (req, tp, st) =>
      svc.hydrateTripPlanRequestFromTripRecord(req, tp, st),
    isConstraintSinkHydrateEnabled: () => svc.constraintSinkService?.isEnabled() ?? false,
    getActiveTripStateForConstraintSink: () =>
      svc.agentMemoryContextStore?.get()?.activeTripState ?? null,
    recordConstraintSinkHydrated: (keys) =>
      svc.promMetrics?.recordConstraintSinkHydrated(keys.length),
    kernelCreateInitialOpts: (req, st) => svc.kernelCreateInitialOpts(req, st),
    generateDecisionStepForStep: (st, step, actor) =>
      svc.generateDecisionStepForStep(st, step, actor as SubAgentType),
    applyMarathonPipelineSignals: (st, req) => svc.applyMarathonPipelineSignals(st, req),
    loadTripDaySnapshotsForSlotPlacement: (tripId, userId) =>
      svc.loadTripDaySnapshotsForSlotPlacement(tripId, userId),
    resolveItinerarySlotCandidatesForIntake: (msg, tp, tripId, userId, snaps) =>
      svc.resolveItinerarySlotCandidatesForIntake(msg, tp, tripId, userId, snaps),
    fetchAuroraSlotPlacementRagSupplement: (msg, opts) =>
      svc.fetchAuroraSlotPlacementRagSupplement(msg, opts),
    tryApplyBoundTripItineraryItemDelete: (tripId, userId, message) =>
      svc.tryApplyBoundTripItineraryItemDelete(tripId, userId, message),
    tryApplyBoundTripItineraryItemAdd: (tripId, userId, message) =>
      svc.tryApplyBoundTripItineraryItemAdd(tripId, userId, message),
    tryApplyBoundTripItineraryItemUpdate: (tripId, userId, message) =>
      svc.tryApplyBoundTripItineraryItemUpdate(tripId, userId, message),
    tryApplyBoundTripLodgingReplace: (tripId, userId, message, dateRange) =>
      svc.tryApplyBoundTripLodgingReplace(tripId, userId, message, dateRange),
    tryApplyBoundTripItineraryDayReplan: (tripId, userId, message, dateRange) =>
      svc.tryApplyBoundTripItineraryDayReplan(tripId, userId, message, dateRange),
    tryApplyBoundTripItineraryAdjustDraft: (tripId, userId, req) =>
      svc.tryApplyBoundTripItineraryAdjustDraft(tripId, userId, req),
    recordIntakeDecisionTelemetry: svc.decisionTelemetry
      ? (event) =>
          svc.decisionTelemetry!.record(event).catch((err: unknown) => {
            svc.logger.warn(
              `[INTAKE Telemetry] record failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          })
      : undefined,
    persistRelaxationToTrip: (tripId, userId, applied) =>
      svc.relaxationTripPersist?.persistFromIntake(tripId, userId, applied) ??
      Promise.resolve(undefined),
  };
}

export function createIntakeNodeHost(svc: OrchestratorPhaseHostFactorySource): IntakeNodeHost {
  const phaseHost = createIntakePhaseHost(svc);
  return {
    logger: svc.logger,
    promMetrics: svc.promMetrics,
    executeIntakeStep: (req, ctx, st, llm) =>
      runIntakePhase(phaseHost, { request: req, context: ctx, state: st, llmProvider: llm }),
    maybeSnapshot: (st, trigger) => svc.maybeSnapshot(st, trigger),
    buildPrePlanSuccessResult: (st, start, dso, ctx) =>
      svc.buildSuccessResult(st, start, dso, ctx),
    tryApplyBoundTripItineraryItemDelete: (tripId, userId, message) =>
      svc.tryApplyBoundTripItineraryItemDelete(tripId, userId, message),
    tryApplyBoundTripItineraryItemAdd: (tripId, userId, message) =>
      svc.tryApplyBoundTripItineraryItemAdd(tripId, userId, message),
    tryApplyBoundTripItineraryItemUpdate: (tripId, userId, message) =>
      svc.tryApplyBoundTripItineraryItemUpdate(tripId, userId, message),
    tryApplyBoundTripLodgingReplace: (tripId, userId, message, dateRange) =>
      svc.tryApplyBoundTripLodgingReplace(tripId, userId, message, dateRange),
    tryApplyBoundTripItineraryDayReplan: (tripId, userId, message, dateRange) =>
      svc.tryApplyBoundTripItineraryDayReplan(tripId, userId, message, dateRange),
    tryApplyBoundTripItineraryAdjustDraft: (tripId, userId, req) =>
      svc.tryApplyBoundTripItineraryAdjustDraft(tripId, userId, req),
    mergeCompoundDataLookupFollowup: (st, req, ctx, llm) =>
      svc.mergeCompoundDataLookupFollowup(st, req, ctx, llm),
  };
}

export function createStateUpdatePhaseHost(svc: OrchestratorPhaseHostFactorySource): StateUpdatePhaseHost {
  return {
    logger: svc.logger,
    decisionKernel: svc.decisionKernel,
    dsoLatestStateProvider: svc.dsoLatestStateProvider,
    isDsoAsPrimary: () => svc.isDsoAsPrimary(),
    applyPoiPlanningToPatch: (patch, dso, st) => svc.applyPoiPlanningToPatch(patch, dso, st),
    extractWorldModelFromContextPackage: (dso) => svc.extractWorldModelFromContextPackage(dso),
  };
}

export function createStateUpdateNodeHost(svc: OrchestratorPhaseHostFactorySource): StateUpdateNodeHost {
  const phaseHost = createStateUpdatePhaseHost(svc);
  return {
    logger: svc.logger,
    executeStateUpdateStep: (st, dso) => runStateUpdatePhase(phaseHost, { state: st, decisionState: dso }),
    maybeSnapshot: (st, trigger) => svc.maybeSnapshot(st, trigger),
    applyRelaxationFingerprintToDso: (st, dso) =>
      svc.applyRelaxationFingerprintAfterStateUpdate(st, dso),
    maybeHaltTerminalNoSolution: (input, dso) =>
      svc.maybeStateUpdateTerminalNoSolution(input, dso),
    maybeHaltHardGapsClarification: (input, dso) =>
      svc.maybeStateUpdateHardGapsClarification(input, dso),
    maybeHaltStructuredIntakeClarification: (input, dso) =>
      svc.maybeStateUpdateStructuredIntakeClarification(input, dso),
    applyResearchScopeInvalidationCow: (req, st) =>
      svc.applyResearchScopeInvalidationCowBeforeResearch(req, st),
  };
}

export function createPoiSelectionPhaseHost(svc: OrchestratorPhaseHostFactorySource): PoiSelectionPhaseHost {
  return {
    logger: svc.logger,
    llmService: svc.llmService,
    resolvePoiPolicy: (explicit, require) => svc.resolvePoiPolicy(explicit, require),
    inferCountryFromDestination: (dest) => svc.inferCountryFromDestination(dest),
    normalizeText: (s) => svc.normalizeText(s),
    dedupePois: (pois) => svc.dedupePois(pois),
    loadTripPlacePoiEvidenceForAdjust: (tripId, userId) =>
      svc.loadTripPlacePoiEvidenceForAdjust(tripId, userId),
    resolveItineraryAdjustNeighborContext: (tripId, targetDateIso, userId) =>
      svc.resolveItineraryAdjustNeighborContextForHost(tripId, targetDateIso, userId),
    supplementItineraryAdjustCorridorPois: (params) =>
      svc.supplementItineraryAdjustCorridorPoisForHost(params),
    applyPoiPlanningToResearchPois: (pois, dso, country) =>
      svc.applyPoiPlanningToResearchPois(pois, dso, country),
    passesHardPoiGuards: (poi, country, dest) =>
      svc.passesHardPoiGuards(poi, country, dest),
    poiLocalityScore: (poi, country, city) => svc.poiLocalityScore(poi, country, city),
    selectClusteredPois: (ranked, topN, coords, dest) =>
      svc.selectClusteredPois(
        ranked,
        topN,
        coords as { lat: number; lng: number },
        dest,
      ),
    buildPoiPlanningAnchorFallbackStub: (slug) => svc.buildPoiPlanningAnchorFallbackStub(slug),
    tryExtractStartCoordinates: (origin) => svc.tryExtractStartCoordinates(origin),
    toPoiTraceNode: (poi) => svc.toPoiTraceNode(poi),
    buildPoiTraceCommuteMatrix: (nodes, mode, coords) =>
      svc.buildPoiTraceCommuteMatrix(
        nodes as Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
        mode as 'walk' | 'drive' | 'transit' | 'mixed' | undefined,
        coords as { lat: number; lng: number } | undefined,
      ),
    estimateNearestTotalCommuteMinutes: (nodes, mode, coords) =>
      svc.estimateNearestTotalCommuteMinutes(
        nodes as Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
        mode as 'walk' | 'drive' | 'transit' | 'mixed' | undefined,
        coords as { lat: number; lng: number } | undefined,
      ),
    countryDisplayName: (country) => svc.countryDisplayName(country),
    buildPoiCountryClarificationQuestion: (dest, country) =>
      svc.buildPoiCountryClarificationQuestion(dest, country),
    recordPoiPlanningOutcomeAfterSelection: (st, dso, scored, diag) =>
      svc.recordPoiPlanningOutcomeAfterSelection(st, dso, scored, diag),
    generateDecisionStepForStep: (st, step, actor) =>
      svc.generateDecisionStepForStep(st, step, actor as SubAgentType),
  };
}

export function createPoiSelectionNodeHost(svc: OrchestratorPhaseHostFactorySource): PoiSelectionNodeHost {
  const phaseHost = createPoiSelectionPhaseHost(svc);
  return {
    logger: svc.logger,
    executePoiSelectionStep: (st, dso) => runPoiSelectionPhase(phaseHost, { state: st, decisionState: dso }),
    maybeSnapshot: (st, trigger) => svc.maybeSnapshot(st, trigger),
    applyFallbackPlan: (st) => svc.applyFallbackPlan(st),
    recordPoiPlanningOutcomeAfterItinerary: (st, dso) =>
      svc.recordPoiPlanningOutcomeAfterItinerary(st, dso),
    buildSuccessResult: (st, start, dso, ctx) =>
      svc.buildSuccessResult(st, start, dso, ctx),
    buildClarificationResult: (st, start, dso, ctx) =>
      svc.buildClarificationResult(st, start, dso, ctx),
  };
}

export function createGateEvalPhaseHost(svc: OrchestratorPhaseHostFactorySource): GateEvalPhaseHost {
  return {
    logger: svc.logger,
    isKernelNativeExecution: (c) => svc.isKernelNativeExecution(c),
    decisionKernel: svc.decisionKernel,
    syncOrchestratorFromDecisionState: (newState, st) => {
      projectToOrchestratorState(newState, st);
    },
    generateDecisionStepForStep: (st, step, actor) =>
      svc.generateDecisionStepForStep(st, step, actor),
    executePhaseViaKernel: (dso, st, phase, run) =>
      svc.executePhaseViaKernel(dso, st, phase, run),
    executeGateEvalStep: (req, ctx, st, llm) =>
      svc.executeGateEvalStep(req, ctx, st, llm),
    enrichGuardianDebateTripContextAfterGateEval: (st) =>
      svc.enrichGuardianDebateTripContextAfterGateEval(st),
    applyMarathonPipelineSignals: (st, req) => svc.applyMarathonPipelineSignals(st, req),
    onGateEvalCompleted: (st, req) => recordGateEvalTrajectoryDraft(svc.decisionTrajectoryInterlocutor, st, req),
  };
}

export function createGateEvalNodeHost(svc: OrchestratorPhaseHostFactorySource): GateEvalNodeHost {
  const phaseHost = createGateEvalPhaseHost(svc);
  return {
    logger: svc.logger,
    touchAsyncTaskProgress: (step) =>
      svc.touchAsyncTaskProgress(step as OrchestrationStep),
    executeGateEvalPhase: (dso, st, req, ctx, llm) =>
      runGateEvalPhase(phaseHost, {
        decisionState: dso,
        state: st,
        request: req,
        context: ctx,
        llmProvider: llm,
      }),
    relaxGateForPartialIfEligible: (st) => svc.relaxGateForPartialIfEligible(st),
    applyMarathonPipelineSignals: (st, req) => svc.applyMarathonPipelineSignals(st, req),
    maybeStartGuardiansDebateShadowAfterGate: (req, st) =>
      svc.maybeStartGuardiansDebateShadowAfterGate(req, st),
    maybeAwaitGuardiansDebateFuseAndShortCircuit: async (req, st, dso, ctx, start, deadline) => {
      const r = await svc.maybeAwaitGuardiansDebateFuseAndShortCircuit(
        req,
        st,
        dso,
        ctx,
        start,
        deadline,
      );
      return r ?? null;
    },
    maybeSnapshot: (st, trigger) => svc.maybeSnapshot(st, trigger),
    recordPoiPlanningOutcomeAfterItinerary: (st, dso) =>
      svc.recordPoiPlanningOutcomeAfterItinerary(st, dso),
    buildBlockedResult: (st, start, dso, ctx) =>
      svc.buildBlockedResult(st, start, dso, ctx),
    isGateBlocked: (st) => st.gate_result?.gate_result === 'BLOCK',
  };
}

export function createContextBuildPhaseHost(svc: OrchestratorPhaseHostFactorySource): ContextBuildPhaseHost {
  return {
    logger: svc.logger,
    decisionKernel: svc.decisionKernel,
    memoryPort: svc.agentMemoryContextStore
      ? {
          getTravelerNationality: () =>
            svc.agentMemoryContextStore!.get()?.userBasics?.nationality,
        }
      : undefined,
    extractCountryCodeFromMessage: (msg) => svc.extractCountryCodeFromMessage(msg),
  };
}

export function createContextBuildNodeHost(svc: OrchestratorPhaseHostFactorySource): ContextBuildNodeHost {
  const phaseHost = createContextBuildPhaseHost(svc);
  return {
    logger: svc.logger,
    executeContextBuildStep: (req, ctx, st, dso) =>
      runContextBuildPhase(phaseHost, { request: req, context: ctx, state: st, decisionState: dso }),
    maybeSnapshot: (st, trigger) => svc.maybeSnapshot(st, trigger),
  };
}

export function createResearchPhaseHost(svc: OrchestratorPhaseHostFactorySource): ResearchPhaseHost {
  return {
    logger: svc.logger,
    isKernelNativeExecution: (c) => svc.isKernelNativeExecution(c),
    decisionKernel: svc.decisionKernel,
    researchPriorSnapshot: svc.researchPriorSnapshot,
    clearResearchAtomicPendingMetadata: (s) => svc.clearResearchAtomicPendingMetadata(s),
    syncOrchestratorFromDecisionState: (newState, st) => {
      projectToOrchestratorState(newState, st);
    },
    generateDecisionStepForStep: (s, step, actor) => svc.generateDecisionStepForStep(s, step, actor),
    executePhaseViaKernel: (dso, st, phase, run) =>
      svc.executePhaseViaKernel(dso, st, phase, async () => {
        await run();
      }),
    executeResearchStep: async (req, ctx, st, llm, dso) => {
      await svc.executeResearchStep(req, ctx, st, llm, dso);
    },
  };
}

export function createResearchNodeHost(svc: OrchestratorPhaseHostFactorySource): ResearchNodeHost {
  const phaseHost = createResearchPhaseHost(svc);
  return {
    logger: svc.logger,
    touchAsyncTaskProgress: (step) =>
      svc.touchAsyncTaskProgress(step as OrchestrationStep),
    executeResearchPhase: (dso, st, req, ctx, llm) =>
      runResearchPhase(phaseHost, {
        decisionState: dso,
        state: st,
        request: req,
        context: ctx,
        llmProvider: llm,
      }),
    maybeSnapshot: (st, trigger) => svc.maybeSnapshot(st, trigger),
    maybeInterceptDegradedTransportEvidence: (st, dso, startTime, ctx) =>
      svc.maybeInterceptDegradedTransportEvidence(st, dso, startTime, ctx) ?? null,
    clearTransportClarifyReinjectFlag: (st) => {
      if ((st.metadata as Record<string, unknown>)?.transport_clarify_force_reinject) {
        st.metadata = { ...(st.metadata ?? {}), transport_clarify_force_reinject: false } as OrchestratorState['metadata'];
      }
    },
    runShadowConflictEarlyWarning: (dso, st, req) =>
      svc.runShadowConflictEarlyWarningAfterResearch(dso, st, req),
    applyIntakePredictiveFailureReport: (dso, st) =>
      svc.applyIntakePredictiveFailureReportAfterResearch(dso, st),
    runEarlyWarningClarificationIntercept: (input, dso) =>
      svc.runEarlyWarningClarificationInterceptAfterResearch(input, dso),
  };
}

export function createPlanGenPhaseHost(svc: OrchestratorPhaseHostFactorySource): PlanGenPhaseHost {
  return {
    logger: svc.logger,
    isKernelNativeExecution: (c) => svc.isKernelNativeExecution(c),
    decisionKernel: svc.decisionKernel,
    syncOrchestratorFromDecisionState: (newState, st) => {
      projectToOrchestratorState(newState, st);
    },
    syncPlanRoutingMetricsToTripPlan: (trip, itinerary) =>
      trip ? syncPlanRoutingMetricsToTripPlan(trip, itinerary) : trip,
    generateDecisionStepForStep: (st, step, actor) =>
      svc.generateDecisionStepForStep(st, step, actor),
    onPlanGenDraftCaptured: (requestId, itinerary) =>
      recordPlanGenDraftSnapshot(svc.decisionTrajectoryInterlocutor, requestId, itinerary),
    collectTrajectoryAfterPlanGen: async ({ request, state }) => {
      if (!svc.trajectoryCollection || !state.itinerary || !state.gate_result) return;
      try {
        let complianceResult = state.compliance_result;
        if (!complianceResult && svc.complianceAgent) {
          try {
            complianceResult = await svc.complianceAgent.checkCompliance(
              state.itinerary,
              state.gate_result,
              state,
            );
          } catch {
            complianceResult = { risk_warnings: [], disclaimers: [], required_confirmations: [] };
          }
        } else if (!complianceResult) {
          complianceResult = { risk_warnings: [], disclaimers: [], required_confirmations: [] };
        }
        await svc.trajectoryCollection.collectTrajectory({
          requestId: state.request_id,
          tripId: (request as any).trip_id,
          plan: state.itinerary,
          decisionTrace: state.decision_log,
          researchData: state.research_data || {},
          gateResult: state.gate_result,
          complianceResult: complianceResult as any,
          modelVersion: 'v1.0',
          countryCode: undefined,
        });
      } catch (e: any) {
        svc.logger.warn(`[Claude Orchestrator] 轨迹收集失败: ${e?.message}`);
      }
    },
    executePhaseViaKernel: (dso, st, phase, run) =>
      svc.executePhaseViaKernel(dso, st, phase, run),
    executePlanGenStep: (req, ctx, st, llm) =>
      svc.executePlanGenStep(req, ctx, st, llm),
    runAdaptiveReplanAfterPlanGen: (st) => svc.runAdaptiveReplanAfterPlanGen(st),
  };
}

export function createVerifyPhaseHost(svc: OrchestratorPhaseHostFactorySource): VerifyPhaseHost {
  return {
    logger: svc.logger,
    isKernelNativeExecution: (c) => svc.isKernelNativeExecution(c),
    decisionKernel: svc.decisionKernel,
    syncOrchestratorFromDecisionState: (newState, st) => {
      projectToOrchestratorState(newState, st);
    },
    mergeVerificationIssuesIntoGateResult: (gate, issues) =>
      mergeVerificationIssuesIntoGateResult(gate, issues) ?? null,
    generateDecisionStepForStep: (st, step, actor) =>
      svc.generateDecisionStepForStep(st, step, actor),
    executePhaseViaKernel: (dso, st, phase, run) =>
      svc.executePhaseViaKernel(dso, st, phase, run),
    executeVerifyStep: (req, ctx, st, llm) =>
      svc.executeVerifyStep(req, ctx, st, llm),
  };
}

export function createOptimizePhaseHost(svc: OrchestratorPhaseHostFactorySource): OptimizePhaseHost {
  return {
    logger: svc.logger,
    decisionKernel: svc.decisionKernel,
    computeOptimizeFatigue: (planDraft) => svc.computePlanDraftFatigue(planDraft),
  };
}

export function createRepairPhaseHost(svc: OrchestratorPhaseHostFactorySource): RepairPhaseHost {
  return {
    logger: svc.logger,
    isKernelNativeExecution: (c) => svc.isKernelNativeExecution(c),
    decisionKernel: svc.decisionKernel,
    syncOrchestratorFromDecisionState: (newState, st) => {
      projectToOrchestratorState(newState, st);
    },
    applyPostRepairRoutingSync: (p) => {
      const postRepair = applyPostRepairRoutingMetricsSync({
        trip: p.trip!,
        itinerary: p.itinerary,
        metadata: p.metadata,
        message: p.message,
        routeAndRunIntent: p.routeAndRunIntent as any,
        clarificationAnswers: p.clarificationAnswers as any,
      });
      return { trip: postRepair.trip };
    },
    generateDecisionStepForStep: (st, step, actor) =>
      svc.generateDecisionStepForStep(st, step, actor),
    executePhaseViaKernel: (dso, st, phase, run) =>
      svc.executePhaseViaKernel(dso, st, phase, run),
    executeRepairStep: (req, ctx, st, llm) =>
      svc.executeRepairStep(req, ctx, st, llm),
    recordRepairObservability: (p) => svc.recordRepairPhaseObservability(p),
    runTravelRecompileAfterRepair: (p) =>
      runTravelRecompileAfterRepair({
        state: p.state,
        request: p.request,
        compiler: svc.travelCompiler,
        graphStore: svc.travelGraphStore,
        configService: svc.configService,
        itineraryBeforeRepair: p.itineraryBeforeRepair,
        repairApplied: p.repairApplied,
        verificationIssues: p.verificationIssues,
        onProgress: (view) => {
          void svc.routeAndRunTaskProgress?.reportCtreCompilationProgress(view);
        },
      }),
  };
}

export function createNarratePhaseHost(svc: OrchestratorPhaseHostFactorySource): NarratePhaseHost {
  return {
    logger: svc.logger,
    decisionKernel: svc.decisionKernel,
    narratorAgent: svc.narratorAgent,
    resolveDosExecutionContext: (req) => {
      const ctx = svc.resolveDosExecutionContext(req);
      const tripId = ctx?.tripId;
      if (!ctx || !tripId) return null;
      return { planDelta: [...ctx.planDelta], tripId };
    },
    kernelCreateInitialOpts: (req, st) => svc.kernelCreateInitialOpts(req, st),
    parseResearchConflictReport: (raw) =>
      isResearchConflictNegotiationReport(raw) ? raw : undefined,
    readRealtimeRerollCount: (rd) => readRealtimeRerollCount(rd),
    memoryReplayDecisionSource: MEMORY_REPLAY_DECISION_SOURCE,
  };
}

export function createNarrateNodeHost(svc: OrchestratorPhaseHostFactorySource): NarrateNodeHost {
  const phaseHost = createNarratePhaseHost(svc);
  return {
    ...phaseHost,
    recordPoiPlanningOutcomeAfterItinerary: (st, dso) =>
      svc.recordPoiPlanningOutcomeAfterItinerary(st, dso),
    touchAsyncTaskProgress: (step) =>
      svc.touchAsyncTaskProgress(step as OrchestrationStep),
    maybeSnapshot: (st, trigger) =>
      svc.maybeSnapshot(st, trigger as 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'),
    runNarratePhase: (params) => runNarratePhase(phaseHost, params),
  };
}

export function createFeedbackPhaseHost(svc: OrchestratorPhaseHostFactorySource): FeedbackPhaseHost {
  return {
    logger: svc.logger,
    decisionKernel: svc.decisionKernel,
    isDsoAsPrimary: () => svc.isDsoAsPrimary(),
  };
}

export function createHallucinationPhaseHost(
  svc: OrchestratorPhaseHostFactorySource,
): HallucinationPhaseHost {
  return {
    logger: svc.logger,
    hallucinationDetection: svc.hallucinationDetection,
  };
}

export function createPostPlanGraphHost(svc: OrchestratorPhaseHostFactorySource): PostPlanGraphHost {
  const narrateHost = createNarrateNodeHost(svc);
  const feedbackHost = createFeedbackPhaseHost(svc);
  const hallucinationHost = createHallucinationPhaseHost(svc);
  return {
    ...narrateHost,
    runFeedbackPhase: (params) => runFeedbackPhase(feedbackHost, params),
    runHallucinationPhase: (params) => runHallucinationPhase(hallucinationHost, params),
    buildSuccessResult: (st, start, dso, ctx) => svc.buildSuccessResult(st, start, dso, ctx),
    buildErrorResult: (st, error, start, dso, failingStep, robust, ctx) =>
      svc.buildErrorResult(st, error, start, dso, failingStep as any, robust as any, ctx),
  };
}
