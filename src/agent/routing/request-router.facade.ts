/**
 * RequestRouter 统一入口 facade：
 * - L1 Gateway：引擎 fork（LEGACY / CLAUDE_DYNAMIC / CLAUDE_SM）+ route_class_fork 对齐
 * - L2 Claude：orchestrate / SM entry（见 request-router.util）
 *
 * 两层决策树保持正交，禁止合成一个大 switch。
 */

import type { OrchestrationOptions } from '../utils/resolve-orchestration-mode.util';
import type { RoutingSignals } from '../utils/orchestration-signals.util';
import type {
  CircuitBreaker,
  ModeLock,
  StabilityContext,
} from '../services/orchestration-stability.util';
import {
  routePolicy,
  type OrchestrationPolicyDecision,
} from './gateway-route-policy.util';
import {
  applyRouteClassForkPolicyOverrides,
  type RouteClassForkV1,
} from './route-and-run-route-class-fork.util';
import {
  resolveOrchestrateEntry,
  resolveStateMachineEntryRedirect,
} from './request-router.util';
import type {
  OrchestrateEntryDecision,
  ResolveOrchestrateEntryInput,
  StateMachineEntryRedirect,
} from './request-router.types';
export {
  dispatchOrchestrateEntry,
  type DispatchOrchestrateEntryInput,
  type OrchestrateEntryDispatchOutcome,
} from './orchestrate-entry.dispatcher';
export type {
  OrchestrateEntryHost,
  OrchestrateEntryDeadline,
} from './orchestrate-entry.host';
export { buildNeedDestinationCountryResult } from './need-destination-country-result.util';
export {
  runItineraryDayViewPath,
  runWorkbenchPlaceholderPath,
} from './lightweight-path.runner';
export { runLightweightKnowledgeQueryPath } from './lightweight-knowledge-query.runner';
export type { LightweightTripLookupHost } from './lightweight-path.host';
export type { LightweightKnowledgeHost } from './lightweight-knowledge.host';
export { runPlanningStateMachinePath } from './planning-state-machine.runner';
export type { PlanningStateMachineHost } from './planning-state-machine.host';
export { runDynamicDagPath } from './dynamic-dag.runner';
export type { DynamicDagHost } from './dynamic-dag.host';
export { runExecutePlanPath } from './execute-plan.runner';
export type { ExecutePlanHost } from './execute-plan.host';
export {
  runAnalyzeIntent,
  runDecideRouting,
  runOrchestrationTriage,
  runPlanExecution,
  runSelectSkills,
  normalizeRoutingDecision,
  getDefaultRoutingDecision,
  extractJSONFromResponse,
  generateFallbackPlan,
} from './dag-intent-pipeline.runner';
export type { DagIntentPipelineHost } from './dag-intent-pipeline.host';
export {
  runValidatePlanInputs,
  runValidateSkillsInputs,
  injectWebBrowseUrlIfMissing,
  hasValue,
  validateSkillInputWithRule,
} from './dag-validate-inputs.runner';
export type {
  DagValidateInputsHost,
  DagValidateResult,
} from './dag-validate-inputs.host';
export {
  prepareSkillInput,
  prepareActionInput,
  mergeSkillOutputWithPlanStateInput,
  buildBootstrapPlanState,
  extractDaysFromMessageForPlanBootstrap,
  skillValidationRequiresPlanState,
} from './prepare-skill-input.runner';
export type { PrepareSkillInputHost } from './prepare-skill-input.host';
export {
  runLiveWeatherSensorBranch,
  runLiveFlightSensorBranch,
  runLiveHotelSensorBranch,
  runLiveCarRentalSensorBranch,
  runIcelandRentalGuidanceLightweightBranch,
} from './lightweight-live-sensors.runner';
export type { LightweightLiveSensorsHost } from './lightweight-live-sensors.host';
export {
  resolveLightweightLlmHttpTimeoutMs,
  coerceLightweightKnowledgeUserVisibleAnswer,
  stripConsultationPromptLeakageFromLightweightAnswer,
  buildDataLookupRagSupplement,
  buildLightweightDecisionContextForRealityGate,
} from './lightweight-knowledge-helpers.runner';
export type { LightweightKnowledgeHelpersHost } from './lightweight-knowledge-helpers.host';
export {
  tryApplyBoundTripItineraryItemDelete,
  tryApplyBoundTripItineraryItemAdd,
  tryApplyBoundTripItineraryAdjustDraft,
  tryApplyBoundTripItineraryDayReplan,
  tryApplyBoundTripLodgingReplace,
  tryApplyBoundTripItineraryItemUpdate,
} from './bound-trip-itinerary-mutations.runner';
export type { BoundTripItineraryMutationsHost } from './bound-trip-itinerary-mutations.host';
export {
  maybeAutoApplyItineraryAdjustCorridor,
  maybeAutoApplyPoiSlotFill,
} from './itinerary-adjust-auto-apply.runner';
export type { ItineraryAdjustAutoApplyHost } from './itinerary-adjust-auto-apply.host';
export {
  convertToTripPlanRequest,
  hydrateTripPlanRequestFromTripRecord,
  loadTripCoreForIntakeHydration,
  normalizeTripRecordDestinationForPlanning,
} from './intake-trip-plan-request.runner';
export type { IntakeTripPlanRequestHost } from './intake-trip-plan-request.host';
export {
  runShadowConflictEarlyWarningAfterResearch,
  applyIntakePredictiveFailureReportAfterResearch,
  runEarlyWarningClarificationInterceptAfterResearch,
} from './early-warning-after-research.runner';
export type { EarlyWarningAfterResearchHost } from './early-warning-after-research.host';
export {
  buildSuccessResult,
  buildBlockedResult,
  buildClarificationResult,
  buildErrorResult,
  buildTerminalNoSolutionResult,
} from './orchestration-result-builders.runner';
export type { OrchestrationResultBuildersHost } from './orchestration-result-builders.host';
export {
  enrichGuardianDebateTripContextAfterGateEval,
  maybeStartGuardiansDebateShadowAfterGate,
  maybeAwaitGuardiansDebateFuseAndShortCircuit,
} from './guardians-debate-gate.runner';
export type { GuardiansDebateGateHost } from './guardians-debate-gate.host';
export { maybeInterceptDegradedTransportEvidence } from './degraded-transport-intercept.runner';
export type { DegradedTransportInterceptHost } from './degraded-transport-intercept.host';
export { registerDependencyHealthChecks } from './dependency-health-checks.runner';
export type { DependencyHealthChecksHost } from './dependency-health-checks.host';
export { recordRepairPhaseObservability } from './repair-phase-observability.runner';
export type { RepairPhaseObservabilityHost } from './repair-phase-observability.host';
export { orchestrateTeamStructuredDiscussionBypass } from './team-structured-discussion-bypass.runner';
export type { TeamStructuredDiscussionBypassHost } from './team-structured-discussion-bypass.host';
export {
  applyPoiPlanningToResearchPois,
  buildPoiPlanningAnchorFallbackStub,
  applyPoiPlanningToPatch,
} from './poi-planning-apply.runner';
export type { PoiPlanningApplyHost } from './poi-planning-apply.host';
export {
  applyFallbackPlan,
  normalizeFallbackStrategyHint,
  resolvePoiPolicy,
} from './fallback-plan.runner';
export type { FallbackPlanHost } from './fallback-plan.host';
export { applyReturnToResearchInvalidation } from './return-to-research-invalidation.runner';
export type { ReturnToResearchInvalidationHost } from './return-to-research-invalidation.host';
export {
  fetchAuroraSlotPlacementRagSupplement,
  retrieveAuroraSlotPlacementRagSupplement,
} from './aurora-slot-placement-rag.runner';
export type { AuroraSlotPlacementRagHost } from './aurora-slot-placement-rag.host';
export { applyResearchScopeInvalidationCowBeforeResearch } from './research-scope-invalidation-cow.runner';
export type { ResearchScopeInvalidationCowHost } from './research-scope-invalidation-cow.host';
export { generateAnswerText } from './generate-answer-text.runner';
export {
  maybeTriggerDecisionProfilingQuiz,
  maybeTriggerProcessFairnessRound,
} from './gate-post-plan-triggers.runner';
export type { GatePostPlanTriggersHost } from './gate-post-plan-triggers.host';
export {
  loadTripDaySnapshotsForSlotPlacement,
  loadTripContextForPaSlotPlacement,
  resolveItinerarySlotCandidatesForIntake,
} from './itinerary-slot-placement-intake.runner';
export type { ItinerarySlotPlacementIntakeHost } from './itinerary-slot-placement-intake.host';
export { loadTripPlacePoiEvidenceForAdjust } from './trip-place-poi-evidence.runner';
export type { TripPlacePoiEvidenceHost } from './trip-place-poi-evidence.host';
export { enrichOrchestrationResultWithFullTripReplanHotel } from './full-trip-replan-hotel.runner';
export type { FullTripReplanHotelHost } from './full-trip-replan-hotel.host';
export { buildUserFacingAnswerText } from './build-user-facing-answer-text.runner';
export { extractTripContextFromState } from './extract-trip-context-from-state.runner';
export type { ExtractTripContextFromStateHost } from './extract-trip-context-from-state.host';
export {
  buildMissingParamClarificationMessage,
  extractSolutionsFromError,
  translateParamName,
} from './missing-param-clarification.runner';
export {
  resolveItineraryAdjustNeighborContextForHost,
  supplementItineraryAdjustCorridorPoisForHost,
} from './itinerary-adjust-neighbor-corridor.runner';
export type { ItineraryAdjustNeighborCorridorHost } from './itinerary-adjust-neighbor-corridor.host';
export { mergeCompoundDataLookupFollowup } from './compound-data-lookup-followup.runner';
export type { CompoundDataLookupFollowupHost } from './compound-data-lookup-followup.host';
export {
  maybeStateUpdateTerminalNoSolution,
  maybeStateUpdateStructuredIntakeClarification,
  maybeStateUpdateHardGapsClarification,
} from './state-update-halts.runner';
export type { StateUpdateHaltsHost } from './state-update-halts.host';
export {
  normalizeText,
  passesHardPoiGuards,
  selectClusteredPois,
  buildPoiTraceCommuteMatrix,
  estimateNearestTotalCommuteMinutes,
  poiLocalityScore,
} from './poi-selection-geometry.runner';
export {
  inferCountryFromDestination,
  buildPoiCountryClarificationQuestion,
  countryDisplayName,
  dedupePois,
} from './poi-destination-helpers.runner';
export {
  shouldReturnClarificationForHardGaps,
  shouldReturnClarificationForMarathonIntake,
  shouldReturnClarificationForFroad2wdIntake,
  shouldReturnClarificationForPeakSeasonTimeShiftIntake,
  shouldReturnClarificationForItinerarySlotPlacementIntake,
} from './intake-clarification-predicates.runner';
export { resolvePlaceIdForItineraryAdjustApply } from './resolve-place-id-for-adjust.runner';
export {
  relaxGateForPartialIfEligible,
  isDateOnlyDataMissingViolation,
} from './relax-gate-for-partial.runner';
export {
  getFallbackProviders,
  callLlmWithFallback,
  recordTokenIfEnabled,
} from './llm-call-fallback.runner';
export type { LlmCallFallbackHost } from './llm-call-fallback.host';
export { getAvailableSkills } from './available-skills.runner';
export type { AvailableSkillsHost } from './available-skills.host';
export { buildSkillInputIntentSnapshot } from './skill-input-intent-snapshot.runner';
export { mergeGovernanceRuntimeBranchDirective } from './governance-runtime-branch.runner';
export type { GovernanceRuntimeBranchHost } from './governance-runtime-branch.host';
export {
  attachHotelRouteRunUiToOrchestrationResult,
  persistRouteRunAccommodationsToClientSession,
} from './hotel-route-run-ui.runner';
export { djb2Fingerprint } from './djb2-fingerprint.runner';
export { applyRelaxationFingerprintAfterStateUpdate } from './relaxation-fingerprint.runner';
export type { RelaxationFingerprintHost } from './relaxation-fingerprint.host';
export {
  createIntakePhaseHost,
  createPoiSelectionPhaseHost,
  createPlanGenPhaseHost,
  createRepairPhaseHost,
  createGateEvalPhaseHost,
  createResearchPhaseHost,
} from './orchestrator-phase-host.factories';
export type { OrchestratorPhaseHostFactorySource } from './orchestrator-phase-host.factories';
export {
  buildClarificationMessage,
  translateSkillName,
  translateServiceName,
} from './service-unavailable-clarification.runner';
export {
  buildIntentAnalysisPrompt,
  buildRoutingPrompt,
  buildSkillsSelectionPrompt,
  buildExecutionPlanningPrompt,
} from './dag-prompt-builders.runner';
export { getLlmProvider } from './get-llm-provider.runner';
export type { GetLlmProviderHost } from './get-llm-provider.host';
export { executePhaseViaKernel } from './execute-phase-via-kernel.runner';
export type { ExecutePhaseViaKernelHost } from './execute-phase-via-kernel.host';
export { generateDecisionStepForStep } from './generate-decision-step.runner';
export type { GenerateDecisionStepHost } from './generate-decision-step.host';
export { itineraryToTdfpmDayContexts } from './itinerary-to-tdfpm.runner';
export { extractWorldModelFromContextPackage } from './extract-world-model.runner';
export { clearResearchAtomicPendingMetadata } from './research-atomic-metadata.runner';
export { orchestrate } from './orchestrate.runner';
export type { OrchestrateHost } from './orchestrate.host';
export { formatClarificationMessage } from './format-clarification-message.runner';
export { applyMarathonPipelineSignals } from './marathon-pipeline-signals.runner';
export {
  compactPoiPlanningSliceForOutcome,
  recordPoiPlanningOutcomeAfterSelection,
  recordPoiPlanningOutcomeAfterItinerary,
} from './poi-planning-outcome.runner';
export { stampRecoveryOntoOrchestratorDecisionLogs } from './stamp-recovery-decision-logs.runner';
export { syncConfidenceAfterVerify } from './sync-confidence-after-verify.runner';
export type { SyncConfidenceAfterVerifyHost } from './sync-confidence-after-verify.host';
export {
  mapSkillNameToStep,
  mapSkillNameToSubAgent,
} from './skill-name-mappers.runner';
export { extractSeason } from './extract-season.runner';
export {
  isKernelEnabled,
  isKernelEnabledForRequest,
  kernelCreateInitialOpts,
  finalizeHarnessTraceFromOrchestration,
  computeResumeHarnessEntryFromLast,
  isKernelNativeExecution,
  normalizeDecisionOsAuditReport,
  violationTypeToCn,
  isExistingTripRouteOrderOptimizationRequest,
} from './kernel-execution-flags.runner';
export type { KernelExecutionFlagsHost } from './kernel-execution-flags.host';
export {
  createNarratePhaseHost,
  createNarrateNodeHost,
  createFeedbackPhaseHost,
  createHallucinationPhaseHost,
  createPostPlanGraphHost,
} from './orchestrator-phase-host.factories';
export { createOrchestrateEntryHost } from './orchestrate-entry-host.factory';
export type { OrchestrateEntryHostFactorySource } from './orchestrate-entry-host.factory';
export { computePlanDraftFatigue } from './compute-plan-draft-fatigue.runner';
export type { ComputePlanDraftFatigueHost } from './compute-plan-draft-fatigue.host';
export { runPrePlanNode } from './run-pre-plan-node.runner';
export type { RunPrePlanNodeHost } from './run-pre-plan-node.host';
export { runPlanGenWithEmptyDraftGuard } from './plan-gen-empty-draft-guard-step.runner';
export type { PlanGenEmptyDraftGuardStepHost } from './plan-gen-empty-draft-guard-step.host';
export { runTravelCompilePhaseIfEnabled } from './travel-compile-phase-if-enabled.runner';
export type { TravelCompilePhaseIfEnabledHost } from './travel-compile-phase-if-enabled.host';
export {
  isDecisionReplayAutoSnapshotEnabled,
  maybeSnapshot,
} from './decision-replay-snapshot.runner';
export type { DecisionReplaySnapshotHost } from './decision-replay-snapshot.host';
export { resolveDosExecutionContext } from './resolve-dos-execution-context.runner';
export { extractCountryCodeFromMessage } from './extract-country-code-from-message.runner';
export { resolveClarificationIntroAnswerText } from './resolve-clarification-intro.runner';
export { persistDecisionTrajectoryAtOrchestrationExit } from './persist-decision-trajectory-at-exit.runner';
export type { PersistDecisionTrajectoryAtExitHost } from './persist-decision-trajectory-at-exit.host';
export { createLightweightTripLookupHost } from './lightweight-trip-lookup-host.factory';
export type { LightweightTripLookupHostFactorySource } from './lightweight-trip-lookup-host.factory';
export { executeNarrateStep } from './execute-narrate-step.runner';
export type { ExecuteNarrateStepHost } from './execute-narrate-step.host';

export type ResolveGatewayRoutePolicyInput = {
  env: NodeJS.ProcessEnv;
  options: OrchestrationOptions | undefined;
  signals: RoutingSignals;
  stabilityContext?: StabilityContext;
  modeLock?: ModeLock;
  breakers?: {
    sm?: CircuitBreaker;
    dyn?: CircuitBreaker;
    legacy?: CircuitBreaker;
  };
  /** 上游 route_class_fork；缺省则跳过 depth 对齐 */
  routeClassFork?: RouteClassForkV1 | null;
  /** P2：供 ModeLock 旁路只读统一意图 */
  message?: string;
  tripId?: string | null;
};

/**
 * L1：Gateway 主链唯一应调用的引擎选择入口（routePolicy + fork overrides）。
 */
export function resolveGatewayRoutePolicy(
  input: ResolveGatewayRoutePolicyInput,
): OrchestrationPolicyDecision {
  let decision = routePolicy(
    input.env,
    input.options,
    input.signals,
    input.stabilityContext,
    input.modeLock,
    input.breakers,
    { message: input.message, tripId: input.tripId },
  );
  decision = applyRouteClassForkPolicyOverrides(decision, input.routeClassFork);
  return decision;
}

/** L2：Claude orchestrate() 入口（re-export 便于单点 import） */
export function resolveClaudeOrchestrateEntry(
  input: ResolveOrchestrateEntryInput,
): OrchestrateEntryDecision {
  return resolveOrchestrateEntry(input);
}

/** L2：CLAUDE_SM 入口轻量 redirect（re-export） */
export function resolveClaudeStateMachineEntryRedirect(input: {
  tripId?: string | null;
  message?: string | null;
  routingTaskType?: RoutingSignals['taskType'];
}): StateMachineEntryRedirect {
  return resolveStateMachineEntryRedirect(input);
}

export type { OrchestrationPolicyDecision };
