// src/agent/services/claude-orchestrator.service.ts

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PreferenceRoundOrchestratorService } from '../../trips/process-fairness/services/preference-round-orchestrator.service';
import type { ProcessFairnessOrchestrationHint } from '../../trips/process-fairness/types/process-fairness-orchestration.types';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';
import {
  buildProcessFairnessSuggestedOperations,
  buildTeamStructuredDiscussionAnswer,
  isTeamStructuredDiscussionQuery,
  primaryDecisionNodeFromMessage,
} from '../utils/team-structured-discussion.util';
import { DecisionProfilingOrchestratorService } from '../../trips/decision-profiling/services/decision-profiling-orchestrator.service';
import type { DecisionProfilingOrchestrationHint } from '../../trips/decision-profiling/types/decision-profiling-orchestration.types';
import { ConfigService } from '@nestjs/config';
import { LlmService, type LlmTokenContext } from '../../llm/services/llm.service';
import { setLlmTraceRoutePath } from '../../llm/token-context.storage';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { ActionRegistryService } from './action-registry.service';
import { DependencyHealthCheckService, type DependencyCheckConfig } from './dependency-health-check.service';
import { SimpleLruCache } from './orchestration-utils';
import { createDeadline } from './orchestration-stability.util';
import {
  collectDecisionEvidenceSummaries,
  computeDecisionEvidenceFingerprint,
} from '../utils/decision-evidence-fingerprint.util';
import {
  extractDecisionLogTripContext,
  formatContextBuildInputsZh,
  formatContextBuildOutputsZh,
  formatGateEvalInputsKernelZh,
  formatGateEvalOutputsZh,
  formatGuardianDebateGateInputsZh,
  formatGuardianDebateGateOutputsZh,
  formatIntakeInputsPreviewZh,
  formatIntakeOutputsZh,
  formatOptimizeInputsZh,
  formatOptimizeOutputsZh,
  formatPlanGenInputsKernelZh,
  formatPlanGenOutputsZh,
  formatPoiSelectionInputsZh,
  formatPoiSelectionOutputsZh,
  formatRepairInputsKernelZh,
  formatRepairOutputsZh,
  formatResearchInputsKernelZh,
  formatResearchOutputsZh,
  formatResearchTeamAuditOutputsZh,
  formatStateUpdateOutputsZh,
  formatVerifyInputsKernelZh,
  formatVerifyOutputsZh,
  formatVerifyPoiClosedOutputsZh,
  formatVerifyTemporalOpeningInputsZh,
} from '../utils/decision-log-user-facing.zh.util';
import type { ResearchTeamAuditEntry } from '../teams/research/research-team.types';
import { isResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.util';
import { readRealtimeRerollCount } from '../memory/emotional-resonance/research-realtime-frustration.util';
import { MEMORY_REPLAY_DECISION_SOURCE } from '../memory/experience-replay/memory-replay.constants';
import { CONSTRAINT_IDS } from './constraint-registry';
import { buildL3PersuasionLine, selectPersuasionMode } from '../utils/narrator-l3-persuasion.util';
import { formatPredictiveFailureReport } from '../utils/repair-causal-explainer.util';
import { calculateEarlyWarningRisk } from '../utils/early-warning-risk-model.util';
import { injectGateRelaxationClarificationIfEligible } from '../utils/gate-relaxation-clarification.util';
import { hydrateRelaxationConstraintsFromTripRecord } from '../utils/trip-relaxation-hydrate.util';
import {
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
  ExecutionPlan,
  ExecutionStep,
  OrchestrationResult,
  AgentContext,
} from '../interfaces/claude-orchestration.interface';
import type {
  DecisionRecoveryLogContext,
  RecoveryAuditFailureDomain,
} from '../../trips/decision/shared/decision-log-metadata-prd.types';
import {
  INTENT_ANALYSIS_PROMPT,
  ROUTING_DECISION_PROMPT,
  SKILLS_SELECTION_PROMPT,
  EXECUTION_PLANNING_PROMPT,
} from './claude-orchestration-prompts';
import {
  normalizeExecutionPlanCoalesceVerifyRepair,
  normalizeSkillsPlanCoalesceVerifyRepair,
} from './claude-orchestrator-smart-update-normalize.util';
import {
  buildDestinationSupplementForTriage,
  buildOrchestrationTriagePrompt,
  isOrchestrationTriageEnabled,
  normalizeOrchestrationTriageResult,
  ORCHESTRATION_TRIAGE_JSON_SCHEMA,
} from '../utils/orchestration-triage.util';
import { resolveDestinationLlmPromptSupplement } from '../utils/destination-llm-prompt-supplement.util';
import {
  collectRepairAlternativesFromStepResults,
  mergeRepairAlternativesBundles,
} from '../utils/collect-repair-alternatives-from-step-results.util';
import {
  mergeWorldBuildIntoResearchData,
  resolveNorwaySubregionForWorldBuild,
} from '../../skills/world/utils/world-model-production-guards.util';
import { rssRefinedItemsToSafetravelRouteAlerts } from '../../skills/world/safetravel-rss-to-route-verify-alerts.util';
import type {
  IcelandVehicleIntentHints,
  SkillInputIntentSnapshot,
} from '../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { ContextSlidingWindowAdapter } from '../context/services/context-sliding-window-adapter.service';
import {
  computeGuardiansDebateAwaitBudgetMs,
  GuardiansDebateService,
} from './guardians-debate.service';
import {
  buildGuardianDebateFusionClarificationQuestions,
  fuseGuardianDebateVerdictIntoGate,
} from '../utils/guardian-debate-gate-fusion.util';
import {
  applyBoundTripDateAuthority,
  parseIntakeNlDatesAndDays,
} from '../utils/trip-plan-intake-dates.util';
import {
  extractVehicleTypeFromCurrentUserMessage,
  reconcileTripPlanVehicleConstraints,
} from '../utils/trip-plan-intake-vehicle.util';
import {
  isStructuredClarificationEchoMessage,
  isWorkbenchAssistantPlaceholderMessage,
  rebuildTripPlanMessagePreservingSystemBlocks,
  resolveCanonicalIntakeUserMessage,
} from '../utils/trip-plan-intake-message.util';
import { buildWorkbenchPlaceholderWelcomeText } from '../orchestration/graph/nodes/intake-workbench-placeholder.util';
import {
  applyFroadHighlandSignalsToTripPlan,
  buildFroadHighlandIntentSignals,
} from '../utils/froad-intake-signals.util';
import {
  applyPeakSeasonTimeShiftSignalsToTripPlan,
  buildPeakSeasonTimeShiftSignals,
} from '../utils/peak-season-time-shift-intake.util';
import {
  buildFroad2wdIntakeClarificationQuestion,
  buildMarathonIntakeClarificationQuestion,
  buildPeakSeasonTimeShiftIntakeClarificationQuestion,
  isFroad2wdIntakeClarificationPending,
  isMarathonDeferredIntakeClarificationPending,
  isPeakSeasonTimeShiftIntakeClarificationPending,
} from '../utils/structured-intake-clarification.util';
import { enrichStateForIntakeGuardianDebateShortCircuit } from '../utils/intake-guardian-debate-short-circuit.util';
import {
  analyzeRouteAndRunIntent,
  type RouteAndRunIntentAnalysis,
  type TripDaySnapshotForPlacement,
} from '../utils/route-and-run-intent-analyzer.util';
import {
  appendItineraryAdjustSystemHints,
  buildDestinationScopeClarificationOptions,
  mapTripPlacesToPoiEvidence,
  shouldPreferTripDestinationOnHydration,
  shouldSkipPoiDestinationClarificationForItineraryAdjust,
  type TripPlaceRowForPoiEvidence,
} from '../utils/itinerary-adjust-intent.util';
import { resolveItineraryAdjustNeighborContext } from '../utils/itinerary-trip-neighbor-anchor-load.util';
import {
  corridorSearchLatLng,
} from '../utils/itinerary-adjust-corridor-fallback.util';
import {
  buildItineraryAdjustAutoApplyLeadMessage,
  classifyItineraryAdjustSubIntent,
  evaluateItineraryAdjustConfidenceGate,
  resolveItineraryAdjustExecutionMode,
} from '../utils/itinerary-adjust-auto-apply.util';
import { runAdaptiveReplanForAdjustState } from '../utils/itinerary-adjust-adaptive-replan.util';
import {
  executeItineraryAdjustDraftApply,
  buildItineraryAdjustDraftApplyAnswerText,
} from '../utils/itinerary-adjust-draft-apply.util';
import {
  PENDING_ITINERARY_ADJUST_DRAFT_META_KEY,
  pendingDraftFromRequestSnapshot,
  readPendingItineraryAdjustDraft,
} from '../utils/itinerary-adjust-pending-draft.util';
import { TripRunManagerService } from './trip-run-manager.service';
import { ItineraryVersionService } from './itinerary-version.service';
import {
  buildCorridorDayApplyEdits,
  parseNumericPlaceId,
  pickTargetDayFromItinerary,
} from '../utils/itinerary-adjust-corridor-apply.util';
import {
  allNewPoiItemsHavePlaceIds,
  buildPoiSlotFillAppendEdits,
  collectResearchPools,
  collectSparseTripDayTargets,
  enrichItineraryWithPlaceIdsFromResearch,
  mergePoiSlotFillOrchestratorItinerary,
} from '../utils/itinerary-adjust-poi-slot-fill.util';
import { recordItineraryAdjustFunnel } from '../utils/itinerary-adjust-metrics.util';
import { extractItineraryAdjustTargetDateFromMessage } from '../utils/itinerary-adjust-intent.util';
import {
  buildCorridorAdjustPoiPlanningSlice,
  shouldSuppressTripRegionIdForItineraryAdjustPoiPlanning,
} from '../utils/itinerary-adjust-poi-planning.util';
import {
  collectOpeningHoursPoiIdsForHydration,
  hydrateOpeningHoursEvidenceForItinerary,
} from '../utils/opening-hours-evidence-hydration.util';
import type { TripUserEdit } from '../../skills/trip/utils/trip-user-edit.util';
import type { ItineraryItem } from '../interfaces/trip-plan.interface';
import type {
  ItineraryAdjustSpatialConstraints,
  NeighborAnchorContext,
} from '../utils/itinerary-adjust-neighbor-anchors.util';
import {
  buildItineraryItemDeleteAnswerText,
  detectItineraryItemDeleteIntent,
  parseItineraryItemDeleteSpec,
  resolveItemIdsForDeleteWithFallback,
  type TripLikeForDelete,
} from '../utils/itinerary-item-delete.util';
import {
  buildItineraryItemAddAnswerText,
  detectItineraryItemAddIntent,
  isPlausibleItineraryItemAddPoiQuery,
  itemAlreadyOnDay,
  parseItineraryItemAddSpec,
  resolvePlaceIdForAdd,
  resolveTripDayIdForAdd,
} from '../utils/itinerary-item-add.util';
import {
  detectItineraryAdjustIntent,
  detectFullTripReplanIntent,
  detectFullTripReplanHotelIntent,
  isItineraryFullTripReplanMetadata,
} from '../utils/itinerary-adjust-intent.util';
import {
  buildIntentAddAlreadyExistsAnswer,
  extractDaySearchAnchor,
  intentAlreadySatisfiedOnDay,
  isIntentBasedPoiQuery,
  resolvePlaceIdForIntentAdd,
  resolvePoiIntentProfile,
  type IntentPoiCandidate,
} from '../utils/itinerary-item-add-intent.util';
import { buildSupplyGapFailureGuidance } from '../intent/intent-supply-failure.util';
import {
  openingHoursEvidenceToText,
  suggestActivitySlotForDayAdd,
} from '../utils/itinerary-item-add-slot.util';
import {
  buildGoldenCircleDayReplanAnswerText,
  buildGoldenCircleScheduleSlots,
  collectActivityItemIdsForDayReplan,
  detectGoldenCircleDayReplanIntent,
  goldenCircleSearchQueryForSlug,
  parseGoldenCircleDayReplanSpec,
  pickGoldenCirclePlaceFromCandidates,
  resolveGoldenCirclePlaceIdsFromTrip,
  resolveTripDayByDate,
  type GoldenCircleAnchorSlug,
  type PoiCandidateLike,
} from '../utils/itinerary-day-replan.util';
import {
  buildItineraryDayViewAnswerText,
  detectItineraryDayViewIntent,
  parseItineraryDayViewSpec,
  resolveTripDayIndexFromViewSpec,
} from '../utils/itinerary-day-view.util';
import {
  applyExistingItemDurationToUpdateSpec,
  buildItineraryItemUpdateAnswerText,
  buildIsoTimesForUpdate,
  detectItineraryItemUpdateIntent,
  parseItineraryItemUpdateSpec,
  resolveItemForUpdateWithFallback,
} from '../utils/itinerary-item-update.util';
import { mapOrchestratorDecisionLogToStepsExecuted } from '../utils/itinerary-item-crud-decision-log.util';
import {
  buildItinerarySlotPlacementClarificationQuestion,
  isItinerarySlotPlacementIntakeClarificationPending,
  mapTripDaysToPlacementSnapshots,
  suggestItinerarySlotCandidates,
  type ItinerarySlotCandidate,
} from '../utils/itinerary-slot-placement.util';
import type { ItinerarySlotPlacementGapResult } from '../assistants/trip-planner/interfaces/itinerary-slot-placement.interface';
import { ContextAnalyzerService } from '../assistants/trip-planner/services/context-analyzer.service';
import {
  buildTripContextFromPrismaRow,
  type PrismaTripRowForPaContext,
} from '../utils/trip-context-from-prisma.util';
import {
  appendPolishAuditToAnalysisPath,
  paSuggestedDaysToSlotCandidatesWithPolish,
  shouldPreferPaSlotCandidates,
} from '../utils/itinerary-slot-pa-bridge.util';
import { ItinerarySlotPolisherService } from './itinerary-slot-polisher.service';
import type { IntakeGap } from '../utils/clarification-question-generator.util';
import { enrichGuardianDebateTripContextFromGateEval } from '../utils/guardian-debate-trip-context-enricher.util';
import { resolvePersonaClosureAudit } from '../utils/persona-closure-repair-skip.util';
import {
  applyMarathonIntakeSignalsToTripPlan,
  buildMarathonIntakeSignalsFromGaps,
  enrichGateForMarathonDeferredLowerBound,
} from '../utils/marathon-intake-signals.util';
import {
  resolveLiveWeatherLocationFromAnchoredTrip,
  resolveLiveWeatherLocationFromMessage,
  type LiveWeatherLocationResolve,
} from '../utils/resolve-live-weather-location.util';
import { applyTripPlanningStateMachineOptionDefaults } from '../utils/route-and-run-option-defaults.util';
import { mergeVerificationIssuesIntoGateResult } from '../utils/merge-verify-issues-into-gate.util';
import {
  isFactualMacroStatQuery,
  isLocalClockOrTimezoneFactQuery,
  isBoundTripLodgingDiningPlanQuery,
  isBoundTripLightConsultQuery,
  isTripStatusOverviewQuery,
  isTodayWeatherFactQuery,
  isWeatherRoadConditionFocusedQuery,
  shouldEnableLiveWeatherMcpForLightweightRoute,
  shouldInjectIcelandRentalGuidanceForLightweight,
  shouldPullSafetravelAdvisoriesForLightweightIceland,
  isWestfjordsLegTransportPreferenceConsultation,
} from '../utils/orchestration-signals.util';
import {
  buildLightweightTemporalGroundingZhLines,
  buildLightweightTemporalRepairSuffix,
  computeDaysUntilTripStartYmd,
  parseTripDatesFromLightweightContext,
  shouldRepairLightweightTemporalHallucination,
} from '../utils/temporal-grounding.util';
import {
  dedupeResearchScopes,
  invalidateResearchScopesInPlace,
  isResearchAssetScope,
  cloneResearchRecord,
} from '../utils/research-asset-scope.util';
import { resolveResearchInvalidation } from '../runtime/resolve-research-invalidation.util';
import {
  sanitizeOrchestrationHandoffForRequest,
  type RouteAndRunSubagentSandboxCarrier,
} from '../runtime/subagent-permission-sandbox-context.util';
import type { DecisionOsExecutionContext } from '../runtime/decision-os-execution-context';
import { DecisionOsExecutionContextStore } from '../runtime/decision-os-execution-context.store';
import {
  isExecutableFlightInventoryQuery,
  resolveFlightInventoryLegs,
} from '../utils/flight-inventory-signals.util';
import { normalizeLiveTools } from '../utils/live-tools.util';
import { buildInventorySnapshotsMeta } from '../inventory/lightweight-live-inventory.registry';
import {
  buildNarrativeSafetyPromptLines,
  evaluateNarrativeSafety,
} from '../inventory/narrative-safety-evaluator.util';
import {
  enforceNarrativeIntegrityPipeline,
  NARRATIVE_INTEGRITY_VALIDATOR_VERSION,
  type NarrativeIntegrityReport,
} from '../inventory/narrative-integrity-validator.util';
import { evaluateIcelandLightweightFroad2wdFastFail } from '../utils/iceland-lightweight-froad-2wd-fast-fail.util';
import { evaluateIcelandLightweightRedAlertFastFail } from '../utils/iceland-lightweight-red-alert-fast-fail.util';
import {
  isDiningRecommendationQuery,
  messageHasDiningLocationAnchor,
  tripSummaryIndicatesNonEmptyItineraryDraft,
} from '../utils/trip-dining-consultation.util';
import { buildLunchStrategyPromptLines } from '../utils/lunch-strategy-briefing.util';
import { isPoiSupplyConsultationQuery } from '../utils/trip-supply-consultation.util';
import {
  estimateLightweightKbTopicRelevanceScore,
  isActivityBookingRagSupplementQuery,
  LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD,
} from '../utils/lightweight-kb-relevance.util';
import {
  buildLightweightHardOntologyAppendixLines,
  buildOntologyEvidenceDisplayLinesZh,
  collectMatchedOntologyRegionDefinitions,
} from '../utils/lightweight-hard-road-ontology-appendix.util';
import { OntologyRoadStatusProviderService,
  type OntologyRegionRoadStatusPayload,
} from '../../infrastructure/external/road-is/ontology-road-status-provider.service';
import {
  buildCarRentalGuidanceFootnotesZh,
  buildIcelandRentalGuidancePromptLines,
} from '../utils/iceland-rental-lightweight.util';
import { IcelandRentalGuidanceSkill, type IcelandRentalGuidanceOutput } from '../../skills/world/iceland-rental-guidance.skill';
import { SafetravelGetAdvisoriesSkill, type SafetravelGetAdvisoriesOutput } from '../../skills/world/safetravel-get-advisories.skill';
import {
  classifyDrivingRagIntentPhase,
  expandedRentalTransactionRagQuery,
} from '../utils/driving-rag-intent-phase.util';
import {
  buildDefaultTripConsultationSuggestedOperations,
  buildDiningAnchorSuggestedOperations,
  extractSuggestedOperationsFromAnswer,
  mergeSuggestedOperations,
  type TripConsultationSuggestedOperation,
} from '../utils/trip-consultation-suggested-operations.util';
import { extractConsultationDashboardFromAnswer } from '../utils/consultation-dashboard-extract.util';
import { TripsService } from '../../trips/trips.service';
import {
  CONSULTATION_DAY_SKELETON_FOOTER_ZH,
  CONSULTATION_NAMED_DRAFT_APPENDIX_FOOTER_ZH,
  buildBriefItineraryLinesFromTripDays,
  formatConsultationTripDaySkeletonLines,
  formatTripPromptSummaryForConsultation,
  shouldIncludeNamedDraftAppendixForLightweightConsultation,
} from '../../trips/utils/trip-prompt-summary.util';
import {
  ChunkRetrievalService,
  type ChunkRetrievalParams,
  type ChunkRetrievalResult,
} from '../../rag/services/chunk-retrieval.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import type { RagSoftWorldScope } from '../../rag/reality-policy/rag-soft-world-policy';
import {
  getBoundDecisionContext,
  runWithDecisionContextAsync,
} from '../../trips/reality-kernel/reality-context.storage';
import { isRagRealityPolicyGateActive } from '../../rag/reality-policy/rag-reality-policy.env';
import { buildDecisionContextV0 } from '../../trips/reality-kernel/build-decision-context-v0';
import {
  buildSnapshotValidityV0,
  computeRealitySnapshotId,
} from '../../trips/reality-kernel/build-shadow-reality-snapshot-v0';
import {
  REALITY_SNAPSHOT_SCHEMA_V0,
  type RealityConsistencyV0,
  type RealitySnapshotLayersV0,
  type RealitySnapshotV0,
} from '../../trips/reality-kernel/reality-snapshot.types';
import type { DecisionContextV0 } from '../../trips/reality-kernel/decision-context.types';
import { McpToolDispatcherService } from '../assistants/planning-assistant/services/mcp-tool-dispatcher.service';
import {
  extractHotelListingDisplayName,
  extractHotelListingPriceHint,
  addDaysYmd,
  buildHotelSensorPromptBlockFromPayload,
  countStayNightsBetweenInclusive,
  formatStayLabelZh,
  mergeSegmentHotelSearchResults,
  attachDistanceToAnchorForCards,
  parseExplicitHotelNightScopeIndices,
  parseExplicitStayWindowFromUserMessage,
  parseHotelProximityAnchorDayNumber,
  inferNightIndex0FromExplicitStayInTripWindow,
  messageExpressesMultiNightStayPlanningIntent,
  narrowHotelStayWindowWithNlMessage,
  pickFullTripReplanNightIndices,
  pickSpreadNightIndices,
  wrapSingleHotelPayload,
  diffCalendarDaysYmd,
  type AccommodationNightGroup,
  type HotelPartyAndPreferenceContext,
  type HotelRouteRunUiPayload,
  type RouteAndRunAccommodationCard,
} from '../utils/hotel-mcp-route-run.mapper';
import {
  enrichHotelRouteRunUiForClientApply,
  mapHotelRouteRunUiToAccommodationItems,
} from '../utils/route-run-accommodation-apply.util';
import { PlanningAssistantV2Service } from '../assistants/planning-assistant/services/planning-assistant-v2.service';
import {
  buildTemplateHotelDecisionSupportZh,
  extractHotelDecisionLayers,
  inferPersonaDnaZh,
  shouldInvokeStewardNarrator,
} from '../utils/hotel-decision-support.signals';
import { extractTripnaraStructuredSlicesFromPreferences } from '../utils/tripnara-structured-preferences-context.util';
import { resolveRouteRunPartyProfileSnapshot } from '../utils/route-and-run-party-profile.util';
import { isValidUuidForUserProfile } from './user-standing-preference.service';
import { HotelDecisionSupportNarratorService } from './hotel-decision-support-narrator.service';
import { AgentMemoryContextStore } from '../memory/context/agent-memory-context.store';
import { ConstraintSinkService } from '../memory/constraint-sink/constraint-sink.service';
import { attachTravelPreferenceSnapshotToOrchestratorState } from '../memory/utils/travel-preference-snapshot.util';
import { attachAgentMemorySnapshotToOrchestratorState } from '../memory/utils/agent-memory-snapshot.util';
import { mergeEmotionalClientSignalsFromRouteAndRunRequest } from '../narrator/emotional-orchestrator-metadata.util';
import { AmadeusDirectService } from '../../mcp/amadeus-direct.service';
import type { AmadeusDirectFlightOffer } from '../../mcp/amadeus-direct.service';
import { FlightMcpService, isFlightMcpToolResultFailure } from '../../mcp/flight-mcp.service';
import {
  enrichSampleOffersFromLines,
  mapAmadeusOffersToSampleCards,
  parseFlightMcpToolResultToSampleOffers,
  sanitizeFlightInventoryLinesForUi,
} from '../../mcp/flight-inventory-snapshot.mapper';
import {
  TripPlanRequest,
  OrchestratorState,
  OrchestrationStep,
  GateResult,
  Itinerary,
  GuardianType,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import { ClaudePlannerAgentService } from './sub-agents/planner-agent.service';
import { ClaudeGatekeeperAgentService } from './sub-agents/gatekeeper-agent.service';
import { ClaudeComplianceAgentService } from './sub-agents/compliance-agent.service';
import { ClaudeLocalInsightAgentService } from './sub-agents/local-insight-agent.service';
import { ClaudeCoreDecisionAgentService } from './sub-agents/core-decision-agent.service';
import { ClaudeNarratorAgentService } from './sub-agents/narrator-agent.service';
import { getSkillFailureStrategy } from '../utils/skill-importance.util';
import { isInGrayBucket } from '../utils/gray-release.util';
import { ErrorType, inferErrorType, getErrorHandlingStrategy } from '../interfaces/error-types.interface';
import { ClarificationQuestion } from '../interfaces/clarification.interface';
import { clarificationIntroNumberedPrefix, clarificationIntroPlain } from '../../common/constants/agent-prompts';
import { SKILL_VALIDATION_RULES } from './skill-validation-rules.config';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import { SYSTEM_ORCHESTRATOR_ACTIONS } from '../constants/action-execution.constants';
import { ClarificationHandlerService } from './clarification-handler.service';
import { ResearchPriorSnapshotService } from './research-prior-snapshot.service';
import { ShadowConflictScannerService, type EarlyWarning } from './shadow-conflict-scanner.service';
import { LocalCaseStoreService } from '../cbr/local-case-store.service';
import { CbrAggregatorService } from '../cbr/cbr-aggregator.service';
import { auditReportToCaseRecord } from '../cbr/case-extractor.util';
import { ConstraintScorer, type RelaxationActionId } from '../cbr/constraint-scorer.util';
import { groupMinCutPaths } from '../cbr/option-grouper.util';
import { SignatureBuilder } from '../cbr/signature-builder.util';
import {
  classifyOrchestratorFailure,
  coerceOrchestratorFailureForWallClockTimeout,
  truncateOrchestratorFailurePreview,
  type OrchestratorRobustnessMetadata,
} from '../utils/orchestrator-failure-taxonomy.util';
import { SkillInputValidatorService } from './skill-input-validator.service';
import { HallucinationDetectionService } from './hallucination-detection.service';
import { TrajectoryCollectionService } from '../training/services/trajectory-collection.service';
import { DecisionTrajectoryInterlocutorService } from '../training/services/decision-trajectory-interlocutor.service';
import {
  finalizeOrchestrationDecisionTrajectory,
  recordGateEvalTrajectoryDraft,
  recordPlanGenDraftSnapshot,
} from '../training/utils/decision-trajectory-orchestration.hook';
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { CoverageMapService } from '../../trips/readiness/services/coverage-map.service';
import { UserDecisionService } from '../../trips/readiness/services/user-decision.service';
import { TripContext, TravelerProfile, ItineraryInfo } from '../../trips/readiness/types/trip-context.types';
import type { ReadinessCheckResult } from '../../trips/readiness/types/readiness-findings.types';
import type { ReadinessScoreResponse } from '../../trips/readiness/types/coverage-map.types';
import { DecisionDraftGeneratorService } from '../../decision-draft/services/decision-draft-generator.service';
import { DecisionReplayService } from './decision-replay.service';
import { DecisionTelemetryService } from '../../trips/decision/telemetry/decision-telemetry.service';
import type { DecisionDnaDto } from './user-profile-learning.service';
// Domain Agents (World Model Layer)
import { GeoAgentService } from './domain-agents/geo-agent.service';
import { WeatherAgentService } from './domain-agents/weather-agent.service';
import { CostAgentService } from './domain-agents/cost-agent.service';
import { ExperienceAgentService } from './domain-agents/experience-agent.service';
import { TokenStatsService } from './token-stats.service';
// Phase 2.1: Decision Kernel
import { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { HarnessTraceFinalStatus } from '../../harness/tracing/harness-trace.types';
import { HarnessStepName } from '../../harness/contracts/harness-step.types';
import { TdfpmCalculatorService } from '../../trips/decision/services/tdfpm-calculator.service';
import type { TdfpmDayContext } from '../../trips/decision/services/tdfpm-calculator.service';
import { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';
import { buildAxiomMatchContext } from '../axioms/build-axiom-match-context.util';
import {
  applyPostRepairRoutingMetricsSync,
  syncPlanRoutingMetricsToTripPlan,
} from '../axioms/sync-plan-routing-metrics-to-trip.util';
import { matchAxioms, pickDominantAxiom } from '../axioms/axiom-matchers';
import {
  axiomMatchSourceForMetrics,
  normalizeAxiomCidForMetrics,
} from '../axioms/axiom-prometheus.util';
import {
  orchestratorStateToDecisionStatePatch,
  decisionStateToOrchestratorState,
  buildPatchFromDSOPrimary,
} from '../../decision/kernel/orchestrator-state-mapper';
import {
  DecisionState,
  type DecisionStatePatch,
  type PoiPlanningDecisionSlice,
} from '../../decision/kernel/decision-state.types';
import type { PlanGenTerminalFailure } from '../../decision/kernel/decision-state.types';
import { otelHarnessRuntimeFieldsFromRequest } from '../../harness/tracing/harness-otel-correlation.util';
import type { RuntimeBranchDirective } from '../../governance/activation/runtime/runtime-branch-directive.types';
import { AuditReportGenerator } from '../utils/terminal-audit-report.generator';
import { normalizeDecisionOsAuditContract } from '../contracts/decision-os-audit.contract';
import {
  mergeReplanLineageIntoTripRunMetadata,
  resolveOrchestratorPlanVersionAfterReplan,
} from '../utils/trip-run-replan-metadata.util';
import {
  buildDecisionFeedbackCorrelationId,
  computePredictiveFailureStateHash,
  digestSimulatedRepairTracesForCorrelation,
  digestTripPlanRequestLight,
} from '../../decision/kernel/utils/decision-feedback-correlation.util';
import type { UserRouteIntent } from '../../planning-policy/interfaces/region-intent.types';
import { RegionAnchorPlanningService } from '../../planning-policy/services/region-anchor-planning.service';
import { ICELAND_POI_SLUG_KEYWORDS } from '../../planning-policy/regions/iceland-poi-slugs';
import { buildSpecialRegionSupplementLanes } from '../utils/special-region-supplement.registry';
import { buildItineraryAdjustCorridorPoiSearchPlan } from '../utils/itinerary-adjust-corridor-poi-search.util';
import { POI_PLANNING_SCORE_REASON } from '../../planning-policy/constants/poi-planning-score-reasons';
import {
  computeResumeGraphEntryFromLast,
  runPostPlanGraph,
  runPrePlanUntilContextBuild,
  PRE_PLAN_NODE_ORDER,
  suggestGraphEntryFromHarnessAdmission,
  type PostPlanGraphHost,
  type PrePlanGraphHost,
} from '../orchestration/graph';
import {
  runPlanVerifyOptimizeRepairLoop,
  runVerifyReturnToResearchRetryLoop,
  tryPlanGenEmptyDraftTerminal as tryPlanGenEmptyDraftTerminalGuard,
  type PlanGenEmptyDraftGuardHost,
  type PlanGenEmptyDraftGuardParams,
  type PlanGenWithEmptyDraftResult,
  type PlanVerifyLoopHost,
  type PlanVerifyLoopRunParams,
} from '../orchestration/plan-verify-loop';
import { runTravelCompilePhase, runTravelRecompileAfterRepair } from '../orchestration/travel-compile/travel-compile-phase.util';
import { runGraphEffectivePlanMaterializePhase } from '../orchestration/travel-compile/graph-effective-plan-materialize-phase.util';
import { TravelCompilerService } from '../../travel-compiler/travel-compiler.service';
import { TravelGraphStoreService } from '../../travel-compiler/services/travel-graph-store.service';
import { GraphEffectivePlanMaterializerService } from '../../travel-compiler/services/graph-effective-plan-materializer.service';
import {
  IntakeOrchestratorNode,
  ResearchOrchestratorNode,
  StateUpdateOrchestratorNode,
  PoiSelectionOrchestratorNode,
  GateEvalOrchestratorNode,
  ContextBuildOrchestratorNode,
  runIntakePhase,
  runPoiSelectionPhase,
  runGateEvalPhase,
  runContextBuildPhase,
  runResearchPhase,
  runStateUpdatePhase,
  readFitnessProfileLinesForLightweightQa,
  readIcelandMarketPriorForLightweightQa,
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
  runPlanGenPhase,
  runVerifyPhase,
  runOptimizePhase,
  runRepairPhase,
  buildVerifyPhaseVerdict,
  type PlanGenPhaseHost,
  type VerifyPhaseHost,
  type VerifyPhaseResult,
  type OptimizePhaseHost,
  type RepairPhaseHost,
} from '../orchestration/graph/nodes';
import {
  runNarratePhase,
  runFeedbackPhase,
  runHallucinationPhase,
  type NarratePhaseHost,
  type NarrateNodeHost,
  type FeedbackPhaseHost,
  type HallucinationPhaseHost,
} from '../orchestration/post-plan';
import { persistHarnessTraceOnPlanVerifyReturnToResearch } from '../orchestration/plan-verify-loop/plan-verify-loop-trace.util';
import {
  buildPlanningPhaseTripOverviewPromptLines,
  parseTripStartDateFromContextLines,
  shouldSkipAgentReadinessPackCheck,
} from '../utils/agent-readiness-phase.util';
import {
  isActivityRecommendationQuery,
  loadWishlistPromptInjectionForAgent,
} from '../../trips/wishlist/utils/wish-prompt-injection.util';
import {
  buildPoiPlanningOutcomePhaseReport,
  type PoiPlanningAdmissionDiagnosticsInput,
} from '../../planning-policy/utils/poi-planning-outcome-metrics.util';
import {
  buildPoiPlanningAdmissionDiagnostics,
  enforceRequiredAnchorsTopN,
  poiPlanningRowIdentityKey,
} from '../../planning-policy/utils/poi-planning-anchor-admission.util';
import {
  goldenCircleEntityStrongMatch,
  keywordMatchResearchPoiToSlug,
  researchPoiHasStableId,
} from '../../planning-policy/utils/anchor-entity-match.util';
import {
  buildCandidateRetrievalQueryPlan,
  mergeResearchPoiLists,
} from '../../planning-policy/utils/build-candidate-retrieval-query-plan.util';
import {
  buildPoiSearchContext,
  extractSelectedPlaceIdsFromItinerary,
} from '../../planning-policy/utils/build-poi-search-context.util';
import {
  filterPoisByRejectedIds,
} from '../../planning-policy/utils/contextual-poi-search-query.util';
import { buildPoiSearchPlanFromContext } from '../utils/query-rewriting-poi-context.util';
import { ragRetrievalExpansionParams } from '../utils/query-rewrite-rag-expansion.util';
import {
  AURORA_SLOT_RAG_POIS_QUERY,
  AURORA_SLOT_RAG_PRACTICAL_QUERY,
  buildAuroraSlotPlacementRagSection,
  mapChunkToAuroraSlotRagEntry,
} from '../utils/aurora-slot-placement-rag.util';
import {
  applyDiversityPenaltyToSortedRows,
  applySelectedPoiPenalty,
  sortPoiScoreRowsDesc,
} from '../../planning-policy/utils/poi-selection-diversity.util';
import {
  annotateRetrievalTraceAfterPoiSelection,
  buildFailedRetrievalTrace,
  buildPlanningRetrievalDecisionTrace,
} from '../../planning-policy/utils/build-retrieval-decision-trace.util';
import { buildGapBehaviorObservation } from '../../planning-policy/utils/build-gap-behavior-observation.util';
import type { RetrievalDecisionTrace } from '../../planning-policy/types/retrieval-decision-trace.types';
import { detectItineraryGapsV1, gapRetrievalIntentQuerySuffix } from '../../planning-policy/utils/detect-itinerary-gaps.util';
import {
  countPoiPlanningFallbackInPois,
  extractPlanningSlugsFromItinerary,
  extractPlanningSlugsFromPois,
  type MinimalItineraryItem,
} from '../../planning-policy/utils/poi-planning-slug-resolve.util';
import type { IDsoLatestStateProvider } from '../../decision/kernel/dso-latest-state-provider.interface';
import { DSO_LATEST_STATE_PROVIDER } from '../../decision/kernel/dso-latest-state-provider.interface';
// 护城河扩展：预测性世界模型
import { WeatherPredictionService } from '../../skills/world/services/weather-prediction.service';
import { FailureRiskPredictionService } from '../../skills/world/services/failure-risk-prediction.service';
import { aggregateWeatherRisk } from '../utils/weather-risk-aggregator.util';
import {
  generateClarificationQuestions,
  identifyGapsFromRequest,
} from '../utils/clarification-question-generator.util';
import { TRANSPORT_SEARCH_UNRESOLVED_COORDS_MARKER } from '../../skills/transport/transport-search.skill';
import { detectRhythmOrDiningPlanningIntent } from '../context-engine/utils/sparse-poi-day-allocation.util';
import { applySparseRegionPoiGate, attachSparseRegionMetadata } from '../../planning-policy/open-world/sparse-poi-gate.util';
import { resolveSparseRegionProfile } from '../../planning-policy/profiles/sparse-region.profile';
import {
  mergeDiscoveryStubsIntoPoiEvidence,
  runOpenWorldDiscoveryBuffer,
} from '../../planning-policy/open-world/discovery-buffer.util';
import { runOpenWorldDiscoveryPipeline } from '../utils/open-world-discovery-pipeline.util';
import { openWorldStubsToPoiEvidence } from '../../planning-policy/open-world/open-world-poi-stub.util';
import {
  hydrateTripPlanTransportEndpoints,
  normalizeTransportEndpointsForSkill,
} from '../execution/shared/transport-endpoint-hydration.util';
import { resolveResearchPoiBaseQueryHint } from '../utils/research-poi-retrieval-geography-hint.util';
import {
  TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH,
  TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
} from '../execution/shared/transport-evidence-messages';
import {
  buildFallbackPlan,
  buildFallbackPlans,
  chooseFallbackStrategy,
  fallbackPlanToItinerary,
  getFallbackTemplateVersion,
} from '../../decision/planner/fallback-planner';

type LiveSensorAuditRow = {
  tool_id: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
  orchestrator_robustness?: OrchestratorRobustnessMetadata;
};

/**
 * Claude Orchestrator Service
 * 
 * 使用 Claude 3.5 Sonnet 作为智能编排引擎，统一管理：
 * - 路由决策（理解用户意图，选择 System 1/2）
 * - Skills 选择（动态选择需要的 Skills）
 * - 执行编排（决定 Skills 的执行顺序和依赖关系）
 */
@Injectable()
export class ClaudeOrchestratorService {
  private readonly logger = new Logger(ClaudeOrchestratorService.name);
  private readonly worldCache = new SimpleLruCache<any>(64, 10 * 60 * 1000); // 10分钟TTL

  constructor(
    private llmService: LlmService,
    private readonly prisma: PrismaService,
    private readonly ragRealityPolicyGate: RagRealityPolicyGateService,
    private readonly contextSlidingWindow: ContextSlidingWindowAdapter,
    @Inject(SKILLS_REGISTRY_TOKEN) @Optional() private skillsRegistry?: SkillsRegistryService,
    @Optional() private actionRegistry?: ActionRegistryService,
    @Optional() private plannerAgent?: ClaudePlannerAgentService,
    @Optional() private gatekeeperAgent?: ClaudeGatekeeperAgentService,
    @Optional() private complianceAgent?: ClaudeComplianceAgentService,
    @Optional() private localInsightAgent?: ClaudeLocalInsightAgentService,
    @Optional() private coreDecisionAgent?: ClaudeCoreDecisionAgentService,
    @Optional() private narratorAgent?: ClaudeNarratorAgentService,
    @Optional() private readonly skillInputValidator?: SkillInputValidatorService,
    @Optional() private hallucinationDetection?: HallucinationDetectionService,
    @Optional() private readonly clarificationHandler?: ClarificationHandlerService,
    @Optional() private readonly relaxationTripPersist?: import('./relaxation-trip-persist.service').RelaxationTripPersistService,
    @Optional() private readonly shadowConflictScanner?: ShadowConflictScannerService,
    @Optional() private readonly localCaseStore?: LocalCaseStoreService,
    @Optional() private readonly cbrAggregator?: CbrAggregatorService,
    @Optional() private trajectoryCollection?: TrajectoryCollectionService,
    @Optional() private readonly decisionTrajectoryInterlocutor?: DecisionTrajectoryInterlocutorService,
    @Optional() private readonly readinessService?: ReadinessService,
    @Optional() private readonly coverageMapService?: CoverageMapService,
    @Optional() private readonly userDecisionService?: UserDecisionService,
    @Optional() @Inject(forwardRef(() => DecisionDraftGeneratorService))
    private readonly decisionDraftGenerator?: DecisionDraftGeneratorService,
    //领域智能体（世界模型层）
    @Optional() private readonly geoAgent?: GeoAgentService,
    @Optional() private readonly weatherAgent?: WeatherAgentService,
    @Optional() private readonly costAgent?: CostAgentService,
    @Optional() private readonly experienceAgent?: ExperienceAgentService,
    // 护城河扩展：预测性世界模型
    @Optional() private readonly weatherPredictionService?: WeatherPredictionService,
    @Optional() private readonly failureRiskPredictionService?: FailureRiskPredictionService,
    // Phase 2.1: Decision Kernel（DSO 中心化）
    @Optional() private readonly decisionKernel?: DecisionKernelService,
    @Optional() private readonly configService?: ConfigService,
    // P0: Token 按阶段打点（AI 科学家评审要求）
    @Optional() private readonly tokenStatsService?: TokenStatsService,
    // P1: TDFPM → fatigueTrend（按日计算疲劳，写入 DSO tripState.fatigue）
    @Optional() private readonly tdfpmCalculator?: TdfpmCalculatorService,
    // 多代理并发：提交前从 store 读取最新 DSO，冲突时重试
    @Optional() @Inject(DSO_LATEST_STATE_PROVIDER) private readonly dsoLatestStateProvider?: IDsoLatestStateProvider,
    // Decision Replay snapshots (optional)
    @Optional() private readonly decisionReplay?: DecisionReplayService,
    /** Phase 1：区域锚点 → DSO.poiPlanning */
    @Optional() private readonly regionAnchorPlanning?: RegionAnchorPlanningService,
    /** Monitoring (Prometheus) */
    @Optional() private readonly promMetrics?: PrometheusMetricsService,
    /** 依赖健康检查 */
    @Optional() private readonly dependencyHealthCheck?: DependencyHealthCheckService,
    /** 有 trip_id 时从 Trip 记录回填目的地/日期，避免「已在行程上下文仍追问目的地」 */
    @Optional() @Inject(forwardRef(() => TripsService)) private readonly tripsService?: TripsService,
    @Optional() private readonly tripRunManager?: TripRunManagerService,
    /** DATA_LOOKUP 轻量咨询：行前/装备类可合并 practical+risks 知识块检索 */
    @Optional() private readonly chunkRetrieval?: ChunkRetrievalService,
    /** 只读 MCP 传感器（天气等）；由 PlanningAssistantModule 导出 */
    @Optional() private readonly mcpToolDispatcher?: McpToolDispatcherService,
    /** Amadeus Flight Offers（轻量咨询航班库存 sensor；需 AMADEUS_CLIENT_ID/SECRET） */
    @Optional() private readonly amadeusDirect?: AmadeusDirectService,
    /** Flight MCP（Smithery/Kiwi 等；需 SMITHERY_API_KEY + FLIGHT_MCP_URL） */
    @Optional() private readonly flightMcp?: FlightMcpService,
    @Optional() private readonly researchPriorSnapshot?: ResearchPriorSnapshotService,
    /** L2：住宿卡片「管家」叙事（批量 LLM）；未注入或 DISABLE_HOTEL_DECISION_LLM 时仅用规则模版 */
    @Optional() private readonly hotelDecisionNarrator?: HotelDecisionSupportNarratorService,
    @Optional() private readonly ontologyRoadStatusProvider?: OntologyRoadStatusProviderService,
    @Optional() private readonly agentMemoryContextStore?: AgentMemoryContextStore,
    @Optional() private readonly constraintSinkService?: ConstraintSinkService,
    @Optional() private readonly decisionOsExecutionContextStore?: DecisionOsExecutionContextStore,
    /** 冰岛租车决策层（与 Booking 租车 MCP 轻量双路合并） */
    @Optional() private readonly icelandRentalGuidanceSkill?: IcelandRentalGuidanceSkill,
    /** SafeTravel RSS（轻量路径红警闸数据通路） */
    @Optional() private readonly safetravelGetAdvisoriesSkill?: SafetravelGetAdvisoriesSkill,
    @Optional() private readonly guardiansDebate?: GuardiansDebateService,
    @Optional() private readonly routeAndRunTaskProgress?: import('../runtime/route-and-run-task-progress.reporter').RouteAndRunTaskProgressReporter,
    /** PA 行程缺口/槽位语义分析（Layer1 选日；失败时回退启发式） */
    @Optional() private readonly contextAnalyzerService?: ContextAnalyzerService,
    @Optional() private readonly itinerarySlotPolisher?: ItinerarySlotPolisherService,
    @Optional() private readonly decisionTelemetry?: DecisionTelemetryService,
    /** route_and_run 住宿卡片写入 PA 会话，供 apply 接口按 index 读取 */
    @Optional()
    @Inject(forwardRef(() => PlanningAssistantV2Service))
    private readonly planningAssistantV2Service?: PlanningAssistantV2Service,
    @Optional() private readonly itineraryVersion?: ItineraryVersionService,
    /** F3.1 过程公平性：关键决策节点自动发起 Round Robin */
    @Optional() private readonly preferenceRoundOrchestrator?: PreferenceRoundOrchestratorService,
    /** PDI-4：未完成调查时自动推送 Travel Style / Money DNA 问卷 */
    @Optional() private readonly decisionProfilingOrchestrator?: DecisionProfilingOrchestratorService,
    @Optional() private readonly travelCompiler?: TravelCompilerService,
    @Optional() private readonly travelGraphStore?: TravelGraphStoreService,
    @Optional() private readonly graphEffectivePlanMaterializer?: GraphEffectivePlanMaterializerService,
  ) {
    this.logger.log(`[ClaudeOrchestratorService] Initialized`);
    this.logger.log(`[ClaudeOrchestratorService] SkillsRegistry: ${!!this.skillsRegistry}, ActionRegistry: ${!!this.actionRegistry}`);
    this.logger.log(`[ClaudeOrchestratorService] Sub-Agents: Planner=${!!this.plannerAgent}, Gatekeeper=${!!this.gatekeeperAgent}, Compliance=${!!this.complianceAgent}, LocalInsight=${!!this.localInsightAgent}, CoreDecision=${!!this.coreDecisionAgent}, Narrator=${!!this.narratorAgent}`);
    this.logger.log(`[ClaudeOrchestratorService] Domain Agents: Geo=${!!this.geoAgent}, Weather=${!!this.weatherAgent}, Cost=${!!this.costAgent}, Experience=${!!this.experienceAgent}`);
    this.logger.log(`[ClaudeOrchestratorService] Decision Kernel (DSO): ${!!this.decisionKernel}, enabled=${this.isKernelEnabled()}`);
    this.logger.log(
      `[ClaudeOrchestratorService] Trip summary deps: TripsService=${!!this.tripsService}, Prisma=${!!this.prisma}, ChunkRetrieval=${!!this.chunkRetrieval}, McpToolDispatcher=${!!this.mcpToolDispatcher}, AmadeusDirect=${!!this.amadeusDirect?.isAvailable}, FlightMcp=${!!this.flightMcp?.isAvailable}`,
    );
    if (this.skillsRegistry) {
      const skillsCount = this.skillsRegistry.getAllSkills().length;
      this.logger.log(`[ClaudeOrchestratorService] 可用 Skills 数量: ${skillsCount}`);
    } else {
      this.logger.warn(`[ClaudeOrchestratorService] ⚠️ SkillsRegistry 未注入！`);
    }

    // 注册依赖健康检查
    this.registerDependencyHealthChecks();
  }

  /**
   * 注册依赖健康检查
   */
  private registerDependencyHealthChecks(): void {
    if (!this.dependencyHealthCheck) {
      this.logger.debug('DependencyHealthCheckService 未注入，跳过依赖健康检查注册');
      return;
    }

    const checks: DependencyCheckConfig[] = [];

    // 核心依赖（必需）
    if (this.llmService) {
      checks.push({
        name: 'llm_service',
        required: true,
        timeout: 5000,
        check: async () => {
          try {
            // 简单的健康检查：调用一个轻量的 LLM 请求
            const start = Date.now();
            // 这里可以添加实际的 LLM 健康检查逻辑
            // 暂时返回健康状态
            return { healthy: true, latency: Date.now() - start };
          } catch (error: any) {
            return { healthy: false, error: error.message };
          }
        },
      });
    }

    // 子 Agent（可选但重要）
    if (this.plannerAgent) {
      checks.push({
        name: 'planner_agent',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    if (this.gatekeeperAgent) {
      checks.push({
        name: 'gatekeeper_agent',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    if (this.complianceAgent) {
      checks.push({
        name: 'compliance_agent',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    // 领域 Agent（可选）
    if (this.geoAgent) {
      checks.push({
        name: 'geo_agent',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    if (this.weatherAgent) {
      checks.push({
        name: 'weather_agent',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    if (this.costAgent) {
      checks.push({
        name: 'cost_agent',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    if (this.experienceAgent) {
      checks.push({
        name: 'experience_agent',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    // Decision Kernel（重要）
    if (this.decisionKernel) {
      checks.push({
        name: 'decision_kernel',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    // RAG 相关
    if (this.chunkRetrieval) {
      checks.push({
        name: 'chunk_retrieval',
        required: false,
        timeout: 5000,
        check: async () => ({ healthy: true }),
      });
    }

    // MCP 工具
    if (this.mcpToolDispatcher) {
      checks.push({
        name: 'mcp_tool_dispatcher',
        required: false,
        timeout: 3000,
        check: async () => ({ healthy: true }),
      });
    }

    // 注册所有检查
    this.dependencyHealthCheck.registerDependencies(checks);
    this.logger.log(`[ClaudeOrchestratorService] 已注册 ${checks.length} 个依赖健康检查`);
  }

  private resolveDosExecutionContext(
    request: RouteAndRunRequestDto,
  ): DecisionOsExecutionContext | undefined {
    return (
      this.decisionOsExecutionContextStore?.get() ??
      (request as RouteAndRunRequestDto & { __dosExecutionContext?: DecisionOsExecutionContext })
        .__dosExecutionContext
    );
  }

  private isDecisionReplayAutoSnapshotEnabled(): boolean {
    const v =
      this.configService?.get<string>('DECISION_REPLAY_AUTO_SNAPSHOT') ??
      process.env.DECISION_REPLAY_AUTO_SNAPSHOT ??
      'false';
    return v === 'true' || v === '1';
  }

  private maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void {
    if (!this.decisionReplay) return;
    if (!this.isDecisionReplayAutoSnapshotEnabled()) return;
    try {
      this.decisionReplay.createSnapshot(state, trigger);
    } catch (e: any) {
      this.logger.warn(`[Claude Orchestrator] DecisionReplay snapshot failed: ${e?.message}`);
    }
  }

  /**
   * Phase 2.4: Decision Kernel 是否启用（用于灰度/回滚）
   * DECISION_KERNEL_ENABLED=false 时可回滚到无 DSO 路径
   */
  private isKernelEnabled(): boolean {
    const v = this.configService?.get<string>('DECISION_KERNEL_ENABLED') ?? process.env.DECISION_KERNEL_ENABLED ?? 'true';
    return v !== 'false' && v !== '0';
  }

  /**
   * P1: A/B 实验流量切分
   * 当 DECISION_KERNEL_AB_PERCENT 设置时，按 userId/request_id hash 分流指定比例到 Kernel 路径
   * 例：DECISION_KERNEL_AB_PERCENT=10 → 10% 实验组（Kernel），90% 对照组（无 Kernel）
   */
  private isKernelEnabledForRequest(request: { request_id: string; user_id?: string }): boolean {
    if (!this.isKernelEnabled()) return false;
    const percent = parseInt(
      this.configService?.get<string>('DECISION_KERNEL_AB_PERCENT') ?? process.env.DECISION_KERNEL_AB_PERCENT ?? '0',
      10,
    );
    if (percent <= 0) return true;
    if (percent >= 100) return true;
    const seed = `${request.user_id ?? ''}|${request.request_id}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const bucket = h % 100;
    return bucket < percent;
  }

  /**
   * PRD I3：DecisionKernel.createInitialState 与 OrchestratorState.plan_version / metadata.replan_context 对齐。
   */
  private kernelCreateInitialOpts(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): {
    evaluationRunId?: string;
    otelTraceId?: string;
    otelSpanId?: string;
    replanLineage?: { previous_plan_version?: number; previous_world_snapshot_hash?: string };
    orchestratorPlanVersion?: number;
    userId?: string;
  } {
    const rc = state.metadata?.replan_context as
      | { previous_plan_version?: number; previous_world_snapshot_hash?: string }
      | undefined;
    const otel = otelHarnessRuntimeFieldsFromRequest(request);
    return {
      evaluationRunId: request.meta?.run_id,
      ...(otel ?? {}),
      ...(rc ? { replanLineage: rc } : {}),
      orchestratorPlanVersion: state.plan_version,
      ...(request.user_id ? { userId: request.user_id } : {}),
    };
  }

  private mergeGovernanceRuntimeBranchDirective(
    request: RouteAndRunRequestDto,
    decisionState: DecisionState | undefined,
  ): DecisionState | undefined {
    if (!this.decisionKernel || !decisionState) return decisionState;
    const dir = (request as { __runtimeBranchDirective?: RuntimeBranchDirective }).__runtimeBranchDirective;
    if (!dir || dir.branchType === 'normal_execution') return decisionState;
    const intent = dir.replanningIntent;
    return this.decisionKernel.updateState(decisionState, {
      harnessRuntime: {
        ...(decisionState.harnessRuntime ?? {}),
        governance_runtime_branch_v1: {
          branchType: dir.branchType,
          sourceActivationIds: dir.sourceActivationIds,
          ...(intent
            ? {
                replanningIntent: {
                  trigger: intent.trigger,
                  requiredActions: intent.requiredActions,
                  preservedConstraints: intent.preservedConstraints,
                  forbiddenStrategies: intent.forbiddenStrategies,
                  replanningScope: intent.replanningScope,
                },
              }
            : {}),
        },
      },
    });
  }

  /**
   * 编排返回前闭合内存 Harness trace（`HARNESS_RECORD_TRACE=1`）：写入 `endedAt` / 业务终态。
   * 若 harness 已失败收口（`endedAt` 已存在），则不变更。
   */
  private finalizeHarnessTraceFromOrchestration(
    decisionState: DecisionState | undefined,
    finalStatus: HarnessTraceFinalStatus,
  ): void {
    if (!this.decisionKernel || !decisionState) return;
    this.decisionKernel.finalizeHarnessTraceIfRecorded(decisionState, finalStatus);
  }

  /**
   * Durable 恢复：由 `lastStep` 推导下一 Harness 硬阶段，并对 INTAKE 完成态跳过重复 INTAKE（直接进入 RESEARCH 准入）。
   */
  private computeResumeHarnessEntryFromLast(last?: string): HarnessStepName {
    if (!last) return HarnessStepName.INTAKE;
    if (last === HarnessStepName.INTAKE || last === 'INTAKE') {
      return HarnessStepName.RESEARCH;
    }
    const order: HarnessStepName[] = [
      HarnessStepName.INTAKE,
      HarnessStepName.RESEARCH,
      HarnessStepName.GATE_EVAL,
      HarnessStepName.PLAN_GEN,
      HarnessStepName.VERIFY,
      HarnessStepName.REPAIR,
      HarnessStepName.NARRATE,
    ];
    const idx = order.indexOf(last as HarnessStepName);
    if (idx < 0) return HarnessStepName.INTAKE;
    return order[Math.min(idx + 1, order.length - 1)]!;
  }

  /**
   * Phase 2: Kernel 原生执行 RESEARCH（KERNEL_NATIVE_EXECUTION=true 时走 ResearchExecutor）
   * Scheme B: 默认 true，Kernel Phase Executors 为主路径；设为 false 可回退到 callback
   * Scheme E: 灰度 - KERNEL_NATIVE_EXECUTION_GRAY_PERCENT=50 时仅 50% 请求走 Kernel 路径
   */
  private isKernelNativeExecution(state?: { request_id: string; user_id?: string }): boolean {
    const v = this.configService?.get<string>('KERNEL_NATIVE_EXECUTION') ?? process.env.KERNEL_NATIVE_EXECUTION ?? 'true';
    const baseEnabled = v === 'true' || v === '1';
    if (!baseEnabled) return false;

    const grayPercent = parseInt(
      this.configService?.get<string>('KERNEL_NATIVE_EXECUTION_GRAY_PERCENT') ??
        process.env.KERNEL_NATIVE_EXECUTION_GRAY_PERCENT ??
        '100',
      10,
    );
    if (grayPercent >= 100 || !state) return true;
    if (grayPercent <= 0) return false;

    return isInGrayBucket(`${state.user_id ?? ''}|${state.request_id}`, grayPercent);
  }

  /**
   * DSO 为主状态源（专利 P2）
   * true=STATE_UPDATE/FEEDBACK 使用 buildPatchFromDSOPrimary，优先 DSO 避免 O→D 覆盖
   */
  private isDsoAsPrimary(): boolean {
    const v = this.configService?.get<string>('DSO_AS_PRIMARY') ?? process.env.DSO_AS_PRIMARY ?? 'true';
    return v === 'true' || v === '1';
  }

  /**
   * Normalize decision_os_audit_report required fields for logs/metrics.
   */
  private normalizeDecisionOsAuditReport(auditReport: any): {
    audit_report: any;
    dominant_cid: string;
    session_consistency_score: number;
    delta_reason: string;
    delta_utility: number;
    intent_revision_flag: boolean;
  } {
    const normalized = normalizeDecisionOsAuditContract(auditReport);
    return {
      audit_report: normalized.audit_report,
      dominant_cid: normalized.dominant_cid,
      session_consistency_score: normalized.session_consistency_score,
      delta_reason: normalized.delta_reason,
      delta_utility: normalized.delta_utility,
      intent_revision_flag: normalized.intent_revision_flag,
    };
  }

  /**
   * 获取 LLM 提供商（支持请求参数和降级机制）
   */
  /**
   * 轻量咨询单次 HTTP 超时（默认 180s），避免 DeepSeek 等流式长文在 60s 被截断后误走占位降级。
   * 可用 `LIGHTWEIGHT_LLM_HTTP_TIMEOUT_MS` 覆盖（10000–600000）。
   */
  private resolveLightweightLlmHttpTimeoutMs(): number {
    const raw =
      this.configService?.get<string>('LIGHTWEIGHT_LLM_HTTP_TIMEOUT_MS') ??
      process.env.LIGHTWEIGHT_LLM_HTTP_TIMEOUT_MS;
    const fallback = 180_000;
    if (raw == null || !String(raw).trim()) return fallback;
    const n = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n < 10_000) return fallback;
    return Math.min(600_000, n);
  }

  private getLlmProvider(request: RouteAndRunRequestDto): LlmProvider {
    // 1. 优先使用请求参数中的 llm_provider
    const requestProvider = request.options?.llm_provider;
    if (requestProvider && requestProvider !== 'auto') {
      switch (requestProvider) {
        case 'openai':
          return LlmProvider.OPENAI;
        case 'deepseek':
          return LlmProvider.DEEPSEEK;
        case 'gemini':
          return LlmProvider.GEMINI;
        case 'anthropic':
          return LlmProvider.ANTHROPIC;
        case 'vllm':
          return LlmProvider.VLLM;
        default:
          break;
      }
    }
    
    // 2. 使用系统默认提供商
    return this.llmService.getDefaultProvider();
  }

  /**
   * 获取降级提供商列表（当主提供商失败时使用）
   * 包含 vLLM 自托管，可在无 API Key 时降级使用
   */
  private getFallbackProviders(primaryProvider: LlmProvider): LlmProvider[] {
    const fallbackOrder: LlmProvider[] = [
      LlmProvider.VLLM,       // 自托管，零 API 成本
      LlmProvider.DEEPSEEK,
      LlmProvider.OPENAI,
      LlmProvider.GEMINI,
    ];
    return fallbackOrder.filter(p => p !== primaryProvider);
  }

  /**
   * 使用 LLM 调用，支持降级机制
   * @param tokenContext 可选，用于 P0 Token 按阶段打点
   */
  private async callLlmWithFallback(
    primaryProvider: LlmProvider,
    prompt: string,
    schema: any,
    operationName: string,
    tokenContext?: { request_id: string; state_machine_step: OrchestrationStep; sub_agent: SubAgentType },
  ): Promise<string> {
    try {
      const response = await this.llmService.callLlmWithSchema(
        primaryProvider,
        prompt,
        schema,
        tokenContext,
      );
      return response;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${primaryProvider} 失败: ${error?.message}`);
      const fallbackProviders = this.getFallbackProviders(primaryProvider);
      for (const fallbackProvider of fallbackProviders) {
        try {
          this.logger.debug(`[Claude Orchestrator] ${operationName} 尝试降级到 ${fallbackProvider}...`);
          const response = await this.llmService.callLlmWithSchema(
            fallbackProvider,
            prompt,
            schema,
            tokenContext,
          );
          return response;
        } catch (fallbackError: any) {
          this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${fallbackProvider} 也失败: ${fallbackError?.message}`);
          continue;
        }
      }
      throw error;
    }
  }

  /** P0: Token 按阶段打点（估算 tokens，当 TokenStatsService 和 tokenContext 存在时） */
  private async recordTokenIfEnabled(
    prompt: string,
    response: string,
    provider: LlmProvider,
    startTime: number,
    success: boolean,
    ctx?: { request_id: string; state_machine_step: OrchestrationStep; sub_agent: SubAgentType },
  ): Promise<void> {
    if (!this.tokenStatsService || !ctx) return;
    try {
      const promptTokens = Math.ceil(prompt.length / 4);
      const completionTokens = Math.ceil(response.length / 4);
      const spanId = `claude-${ctx.state_machine_step}-${Date.now()}`;
      await this.tokenStatsService.recordTokenUsage({
        request_id: ctx.request_id,
        trace_id: ctx.request_id,
        span_id: spanId,
        sub_agent: ctx.sub_agent,
        state_machine_step: ctx.state_machine_step,
        task_type: ctx.state_machine_step,
        provider,
        model: provider,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        duration_ms: Date.now() - startTime,
        success,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      this.logger.debug(`[TokenStats] 记录失败: ${e?.message}`);
    }
  }

  /**
   * 轻量咨询注入行程摘要：优先 TripsService；若可选依赖未注入则回退 Prisma（避免 Optional TripsService 导致永远不加载）。
   * 默认按日类型骨架；绑定工作台或需锚定 POI 的咨询问法额外附带「草案地点速览」（Place 名/备注）。
   */
  private async resolveTripPromptSummaryForLightweightQa(
    effectiveTripId: string,
    request: RouteAndRunRequestDto,
  ): Promise<string | null> {
    const tid = effectiveTripId.trim();
    const msgLower = (request.message ?? '').trim().toLowerCase();
    const includeNamedDraftAppendix = shouldIncludeNamedDraftAppendixForLightweightConsultation({
      message: request.message ?? '',
      msgLower,
      contextType: request.conversation_context?.context_type,
    });
    if (this.tripsService) {
      try {
        const s = await this.tripsService.getTripPromptSummaryForConsultation(tid, undefined, {
          include_named_draft_appendix: includeNamedDraftAppendix,
        });
        if (s) return s;
      } catch (e: any) {
        this.logger.warn(`[LightweightQA] TripsService summary failed trip_id=${tid}: ${e?.message ?? e}`);
      }
    }
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tid },
        select: {
          name: true,
          destination: true,
          startDate: true,
          endDate: true,
          status: true,
          TripDay: {
            orderBy: { date: 'asc' as const },
            select: {
              date: true,
              ItineraryItem: {
                orderBy: { order: 'asc' as const },
                select: {
                  type: true,
                  note: true,
                  Place: { select: { nameCN: true, nameEN: true } },
                },
              },
            },
          },
        },
      });
      if (!trip) {
        this.logger.warn(
          `[LightweightQA] No Trip row for trip_id=${tid}. Client may omit trip_id on route_and_run, or UI uses another database/environment.`,
        );
        return null;
      }
      if (!this.tripsService) {
        this.logger.debug(`[LightweightQA] trip summary via Prisma fallback (TripsService not injected)`);
      }
      const { TripDay: tripDays, ...tripMeta } = trip as typeof trip & {
        TripDay?: Array<{
          date: Date;
          ItineraryItem: Array<{
            type: string;
            note: string | null;
            Place: { nameCN: string | null; nameEN: string | null } | null;
          }>;
        }>;
      };
      const base = formatTripPromptSummaryForConsultation(tid, tripMeta);
      const skeleton = formatConsultationTripDaySkeletonLines(tripDays ?? []);
      let body = `${base}\n\n【按日骨架（仅日程项类型与数量，不含景点库名称/坐标）】\n${skeleton}${CONSULTATION_DAY_SKELETON_FOOTER_ZH}`;
      if (includeNamedDraftAppendix) {
        const brief = buildBriefItineraryLinesFromTripDays(tripDays ?? []).join('\n');
        body += `\n\n【草案地点速览（Place 登记名或备注；供你对照用户所述路段）】\n${brief}${CONSULTATION_NAMED_DRAFT_APPENDIX_FOOTER_ZH}`;
      }
      return body;
    } catch (e: any) {
      this.logger.warn(`[LightweightQA] Prisma trip summary failed trip_id=${tid}: ${e?.message ?? e}`);
      return null;
    }
  }

  /** 行前/装备/清单类咨询：合并 practical + risks 集合检索（可选 ChunkRetrievalService）。 */
  private isPreparationGearTravelQuery(msg: string): boolean {
    const m = msg.trim();
    if (!m) return false;
    return (
      /准备|行前|装备|清单|穿搭|冰爪|要带|打包|衣物|注意事项|睡袋|冲锋衣|洋葱式|层叠穿法|登山鞋|雨靴|暖宝宝|无人机|报备|转换插头|欧标|电话卡|e\s*[Ss]im|无人机报备|电源转换/i.test(m) ||
      /checklist|packing|crampon|tips|建议.*带|注意.*安全/i.test(m) ||
      /\b(layer(?:ing)?|hiking\s+boots|rain\s+gear|windproof|sim\s+card|esim)\b/i.test(m.toLowerCase())
    );
  }

  /** 从 Trip 表行构造 Readiness 用的 TripContext（与 GATE_EVAL 的 trip_plan_request 路径对齐的字段子集）。 */
  private buildTripContextFromTripRowForReadiness(
    trip: { destination: string; startDate: Date; endDate: Date },
    userMessage: string,
  ): TripContext {
    const dest = trip.destination.trim();
    const countryToken = dest.split('-')[0] || dest.split(',')[0] || 'UNKNOWN';
    const countryCode = countryToken.toUpperCase();
    const startIso = trip.startDate.toISOString().slice(0, 10);
    const endIso = trip.endDate.toISOString().slice(0, 10);
    const msg = (userMessage ?? '').trim();
    const activities: string[] = [];
    if (/徒步|登山|爬山|步道|hiking|trekking|trail/i.test(msg)) {
      activities.push('hiking');
    }
    const itinerary: ItineraryInfo = {
      countries: [countryCode],
      activities: activities.length ? activities : undefined,
      season: this.extractSeason(startIso),
    };
    return {
      traveler: {},
      trip: { startDate: startIso, endDate: endIso },
      itinerary,
    };
  }

  /** 与工作台左侧「准备度 xx/100」面板同源的分数摘录（CoverageMapService.getReadinessScore）。 */
  private formatReadinessScoreHeaderForLightweightPrompt(scoreData: ReadinessScoreResponse): string {
    const lines: string[] = [];
    const overall = scoreData.score?.overall;
    if (typeof overall === 'number') {
      lines.push(`【出发准备度（与工作台左侧面板一致）】${Math.round(overall)}/100`);
    }
    const sum = scoreData.summary;
    if (sum) {
      lines.push(
        `阻塞=${sum.blockers}，必做=${sum.must ?? sum.warnings ?? 0}，建议=${sum.should ?? sum.suggestions ?? 0}`,
      );
    }
    const bd = scoreData.score;
    if (bd) {
      lines.push(
        `维度：入境 ${Math.round(bd.entryTransit)}，保险 ${Math.round(bd.healthInsurance)}，装备 ${Math.round(bd.gearPacking)}，预订 ${Math.round(bd.bookingsCredentials)}，后勤 ${Math.round(bd.logisticsComms)}，应急 ${Math.round(bd.emergency)}`,
      );
    }
    const blockers = (scoreData.findings ?? []).filter((f) => f.type === 'blocker').slice(0, 5);
    for (const b of blockers) {
      const title = (b.message ?? b.id ?? '').toString().replace(/\s+/g, ' ').trim();
      if (title) lines.push(`- [阻塞] ${title}`.slice(0, 420));
    }
    return lines.join('\n');
  }

  /** 将 ReadinessCheckResult 压成轻量 prompt 用摘录（条数与总长封顶，避免撑爆上下文）。 */
  private formatReadinessFindingsForLightweightPrompt(result: ReadinessCheckResult): string {
    const lines: string[] = [];
    if (result.disclaimer?.message?.trim()) {
      lines.push(`【免责】${result.disclaimer.message.trim().slice(0, 600)}`);
    }
    lines.push(
      `【条数汇总】blocker=${result.summary.totalBlockers}, must=${result.summary.totalMust}, should=${result.summary.totalShould}, optional=${result.summary.totalOptional}, risks=${result.summary.totalRisks}`,
    );
    const maxLines = 72;
    let count = 0;
    const pushItems = (tier: string, items: Array<{ id: string; message: string }>) => {
      for (const it of items) {
        if (count >= maxLines) return;
        const line = `- [${tier}] ${it.id}: ${(it.message ?? '').replace(/\s+/g, ' ').trim()}`.slice(0, 420);
        lines.push(line);
        count++;
      }
    };
    for (const f of result.findings) {
      pushItems('阻塞', f.blockers as Array<{ id: string; message: string }>);
      pushItems('必做', f.must as Array<{ id: string; message: string }>);
      pushItems('建议', f.should as Array<{ id: string; message: string }>);
      pushItems('可选', f.optional as Array<{ id: string; message: string }>);
      for (const r of f.risks ?? []) {
        if (count >= maxLines) break;
        const s = (r.summary ?? '').replace(/\s+/g, ' ').trim();
        if (s) {
          lines.push(`- [风险] ${s}`.slice(0, 420));
          count++;
        }
      }
    }
    const text = lines.join('\n');
    return text.length > 14_000 ? `${text.slice(0, 14_000)}\n…(摘录已截断)` : text;
  }

  /**
   * 轻量咨询并行分支：已绑定行程且非 trivia 时拉取 Pack 准备度摘录。
   * 规划阶段（工作台 / TRIP_PLANNING / 距出发尚早）由 {@link shouldSkipAgentReadinessPackCheck} 跳过。
   */
  private async runLightweightReadinessSupplement(
    effectiveTripId: string | undefined,
    userMessage: string,
    want: boolean,
  ): Promise<string | null> {
    if (!want || !this.readinessService || !effectiveTripId?.trim()) {
      return null;
    }
    const tid = effectiveTripId.trim();
    const started = Date.now();
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tid },
        select: { destination: true, startDate: true, endDate: true },
      });
      if (!trip?.destination?.trim()) {
        return null;
      }
      const tripContext = this.buildTripContextFromTripRowForReadiness(trip, userMessage);
      const result = await this.readinessService.checkFromDestination(trip.destination.trim(), tripContext, {
        lang: 'zh',
      });
      let scoreHeader = '';
      if (this.coverageMapService) {
        try {
          const scoreData = await this.coverageMapService.getReadinessScore(tid);
          scoreHeader = this.formatReadinessScoreHeaderForLightweightPrompt(scoreData);
          this.logger.debug(
            `[LightweightQA] Readiness score trip_id=${tid} overall=${scoreData.score?.overall ?? 'n/a'}`,
          );
        } catch (scoreErr: any) {
          this.logger.warn(
            `[LightweightQA] Readiness score failed trip_id=${tid}: ${scoreErr?.message ?? scoreErr}`,
          );
        }
      }
      const packFormatted = this.formatReadinessFindingsForLightweightPrompt(result);
      const formatted = scoreHeader ? `${scoreHeader}\n\n${packFormatted}` : packFormatted;
      this.logger.debug(
        `[LightweightQA] Readiness OK trip_id=${tid} duration_ms=${Date.now() - started} findings=${result.findings?.length ?? 0}`,
      );
      return formatted;
    } catch (e: any) {
      this.logger.warn(`[LightweightQA] Readiness failed trip_id=${tid}: ${e?.message ?? e}`);
      return null;
    }
  }

  /** 行程复盘问法：注入 detail.analyzeHealth 体检摘录（时间冲突、节奏、预算等） */
  private async runLightweightTripHealthSupplement(
    effectiveTripId: string | undefined,
  ): Promise<string | null> {
    const tid = effectiveTripId?.trim();
    if (!tid || !this.skillsRegistry) return null;
    const started = Date.now();
    try {
      const skill = this.skillsRegistry.getSkill('detail.analyzeHealth') as
        | {
            execute: (input: {
              tripId: string;
              planState?: null;
            }) => Promise<{
              health?: {
                overall?: string;
                overallScore?: number;
                dimensions?: Record<
                  string,
                  { score?: number; issues?: string[]; status?: string }
                >;
              };
            }>;
          }
        | undefined;
      if (!skill) return null;
      const { health } = await skill.execute({ tripId: tid, planState: null });
      if (!health) return null;
      const formatted = this.formatTripHealthForLightweightPrompt(health);
      this.logger.debug(
        `[LightweightQA] Trip health OK trip_id=${tid} duration_ms=${Date.now() - started} score=${health.overallScore ?? 'n/a'}`,
      );
      return formatted;
    } catch (e: any) {
      this.logger.warn(`[LightweightQA] Trip health failed trip_id=${tid}: ${e?.message ?? e}`);
      return null;
    }
  }

  private formatTripHealthForLightweightPrompt(health: {
    overall?: string;
    overallScore?: number;
    dimensions?: Record<string, { score?: number; issues?: string[]; status?: string }>;
  }): string {
    const dimLabels: Record<string, string> = {
      schedule: '时间安排',
      budget: '预算',
      pace: '节奏',
      feasibility: '可达性',
    };
    const lines: string[] = [];
    if (typeof health.overallScore === 'number') {
      lines.push(`总体健康度：${Math.round(health.overallScore)}/100（${health.overall ?? 'unknown'}）`);
    }
    for (const [key, label] of Object.entries(dimLabels)) {
      const dim = health.dimensions?.[key];
      if (!dim) continue;
      const issueText =
        Array.isArray(dim.issues) && dim.issues.length
          ? dim.issues.slice(0, 5).join('；')
          : '无明显问题';
      lines.push(`- ${label}（${dim.score ?? '—'}/100，${dim.status ?? '—'}）：${issueText}`);
    }
    const text = lines.join('\n');
    return text.length > 4000 ? `${text.slice(0, 4000)}\n…(体检摘录已截断)` : text;
  }

  /** 租车/自驾类咨询：须触发 RAG（与 isTripScopedConsultationQuery 交通词对齐），否则仅「租车建议」不会命中 isDataLookupRagSupplementQuery 正文关键词 → 无摘录 */
  private isCarRentalOrDrivingTravelQuery(msg: string): boolean {
    const m = msg.trim();
    if (!m) return false;
    const lower = m.toLowerCase();
    const transportZh =
      /租车|自驾|包车|提车|还车|租车行|用车|车型|四驱|SUV|交规|碎石路|碎石险|火山灰|风沙险|车门.*风|驾照|开车|保险|SAAP|ASH|涉水|拖车|闭路|封路|加油卡|加油|充电桩|停车费|气象官网|路况官网|能开吗/i.test(
        m,
      );
    const fRoadOrNumber = /f\s*路|f-road|\bf\s*\d{2,4}\b/i.test(lower);
    const icelandRoadBrand = /\bN1\b|olis|ölis/i.test(m);
    const transportEn =
      /\b(car\s+rental|rent(?:ing)?\s+a\s+car|self[- ]drive|driving\s+in|road\s+rules|rental\s+car|gravel\s+protection|sand\s+and\s+ash|insurance|gas\s+station|charging\s+station|river\s+crossing)\b/i.test(
        lower,
      );
    const roadDotIs = /road\.is|vedur\.is|\bvedur\b/i.test(lower);
    return transportZh || fRoadOrNumber || icelandRoadBrand || transportEn || roadDotIs;
  }

  /**
   * 极地/冰岛常见：救援与实时风险、基础设施与消费痛点（与行前/租车互补）。
   * 第四类单独列出，避免仅靠泛咨询正则漏掉「112、封路」等短句。
   */
  private isPolarInfrastructureOrEmergencyQuery(msg: string): boolean {
    const m = msg.trim();
    if (!m) return false;
    const lower = m.toLowerCase();
    const rescue =
      /救援|求助|报警|警察|\b112\b|坏车|爆胎|陷车|黄警|红警|风暴预警|地震|火山|safetravel|safe\s*travel/i.test(m) ||
      /\b(safe\s*travel|emergency)\b/i.test(lower);
    const infraCost =
      /极光|kp值|kp\s*\d|极光预测|蓝冰洞|观鲸|物价|消费|刷卡|现金|退税|超市|小费|马路|无人区|营地/i.test(m) ||
      /\b(aurora|northern\s+lights|ice\s*cave|whale\s+watching|vat\s+refund|supermarket)\b/i.test(lower);
    const icelandShort =
      /\bf路\b|f-road|\bf\s*\d{2,4}\b|碎石险|火山灰|涉水|vedur|road\.is|风暴|封路|闭路/i.test(lower);
    return rescue || infraCost || icelandShort;
  }

  /** 轻量 DATA_LOOKUP 下是否附加知识库 RAG 摘录（非 System1Executor RAG，但同为向量检索） */
  private isDataLookupRagSupplementQuery(msg: string): boolean {
    if (this.isPreparationGearTravelQuery(msg)) return true;
    if (isWeatherRoadConditionFocusedQuery(msg)) return true;
    if (this.isCarRentalOrDrivingTravelQuery(msg)) return true;
    if (this.isPolarInfrastructureOrEmergencyQuery(msg)) return true;
    /** 餐饮类 DATA_LOOKUP：须走进轻量 RAG，否则「推荐餐厅」等无法命中 POI 知识库 */
    if (isDiningRecommendationQuery(msg)) return true;
    /** 超市/补给类 DATA_LOOKUP：须检索冰岛超市/物价知识块 */
    if (isPoiSupplyConsultationQuery(msg)) return true;
    /** 直升机 / 空中观光等活动预订咨询：原正则未含「直升机」，泛问路径下会完全不检索 KB */
    if (isActivityBookingRagSupplementQuery(msg)) return true;
    const m = msg.trim();
    if (!m) return false;
    const lower = m.toLowerCase();
    return (
      /适合|什么人|哪种|哪类|人群|体质|新手|亲子|老人|值不值|攻略|指南|注意|安全|签证|季节|路况|道路状况|封路|闭路/i.test(m) ||
      /极光|蓝冰洞|观鲸|物价|消费|刷卡|退税|超市|小费/i.test(m) ||
      /\b(aurora|northern\s+lights|ice\s*cave|whale\s+watching)\b/i.test(lower)
    );
  }

  private lightweightAnswerImpliesMissingTripContext(answer: string): boolean {
    return /未指定.*目的地|请提供.*目的地|未说明.*去哪|不知道.*去哪|没有.*目的地|您.*未.*告知.*目的地/i.test(answer);
  }

  /** 展示用文档名：metadata.title / 文件名 / fileId */
  private formatRagDocumentTitle(r: ChunkRetrievalResult): string {
    const m = r.metadata;
    let fromMeta = '';
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      const rec = m as Record<string, unknown>;
      const pick = (k: string) => {
        const v = rec[k];
        return typeof v === 'string' ? v.trim() : '';
      };
      fromMeta =
        pick('title') ||
        pick('documentTitle') ||
        pick('fileName') ||
        pick('sourceTitle') ||
        pick('name');
    }
    const pathLike = fromMeta || r.sourceFile || '';
    const base = pathLike.replace(/^.*[/\\]/, '').trim();
    const label = base || String(r.fileId || r.chunkId);
    return label.length > 200 ? `${label.slice(0, 197)}…` : label;
  }

  /** 「现在几点」类事实题：注入 UTC 参考并约束篇幅，避免绑定 trip 时叠行程摘要与 Dashboard JSON */
  private buildLightweightClockFactPromptLines(message: string): string[] {
    const iso = new Date().toISOString();
    const utcHm = iso.slice(11, 16);
    const utcDate = iso.slice(0, 10);
    const out: string[] = [
      '【本题类型】用户仅询问某地当前时间、标准时区或与北京的时差；不得声称「AI 无法获知时间」：须结合下文 UTC 参考写出当地大致时刻（并提醒秒级以用户设备为准）。',
      `【UTC 参考】协调世界时（UTC）：${utcDate} ${utcHm}（ISO 8601：${iso}）。`,
      '【篇幅】正文约 3～10 句即可；禁止展开行程预算、租车报价、门票、住宿、日程风险评估或长途驾驶分析；勿主动复述关联行程草案。',
      '【禁止输出】不得输出 <<<CONSULTATION_UI_JSON>>>、<<<SUGGESTED_OPS_JSON>>> 或任何「准备度/预算四卡」式模板。',
    ];
    if (/冰岛|雷克雅未克|reykjavik|iceland/i.test(message)) {
      out.splice(2, 0, '【冰岛】全年采用 UTC±0（无夏令时）；雷克雅未克本地时钟与 UTC 一致。');
    }
    return out;
  }

  /** 人口/面积/GDP 等百科事实：短文，禁止把 Dashboard 指令复述进用户可见正文 */
  private buildLightweightMacroStatFactPromptLines(): string[] {
    return [
      '【本题类型】用户询问人口、面积、GDP 等宏观统计或百科事实；与当前行程草案无直接关系。',
      '【篇幅】简短作答：给出常用口径与数量级；若年份或来源不确定，须标注「约」「大致」并提醒以官方统计为准。',
      '【禁止】用户可见正文中不得出现以下字样（含加粗/小标题）：「可视化 Dashboard」「Dashboard JSON」「CONSULTATION_UI_JSON」「SUGGESTED_OPS_JSON」「前端一键操作」——这些仅供系统解析，复述即错误。',
      '【禁止输出】不得输出 <<<CONSULTATION_UI_JSON>>>、<<<SUGGESTED_OPS_JSON>>> 或行程预算/租车/风险长篇模板。',
    ];
  }

  /**
   * 模型偶发把编排提示语（Dashboard / 建议操作块说明）当作正文小标题输出时的兜底清除。
   * 用于轻量事实题；亦用于轻量行程咨询在抽取结构化块之后对用户可见 `answer_text` 的收尾。
   */
  private stripConsultationPromptLeakageFromLightweightAnswer(text: string): string {
    if (!text?.trim()) return text;
    let t = text;
    const removals: RegExp[] = [
      /【可视化 Dashboard JSON】[^\n]*/g,
      /【前端一键操作】[^\n]*/g,
      /\*{0,2}\s*可视化\s*Dashboard\s*JSON\s*\*{0,2}/gi,
      /\*{0,2}\s*前端一键操作\s*\*{0,2}/gi,
      // 独立成行（含 Markdown 标题/列表/引用）的系统指令回声
      /^[ \t>]*#{1,6}[ \t]*可视化\s*Dashboard\s*JSON[ \t:：]*$/gim,
      /^[ \t>]*#{1,6}[ \t]*前端一键操作[ \t:：]*$/gim,
      /^[ \t>]*[-*+][ \t]+可视化\s*Dashboard\s*JSON[ \t:：]*$/gim,
      /^[ \t>]*[-*+][ \t]+前端一键操作[ \t:：]*$/gim,
      /^[ \t>]*可视化\s*Dashboard\s*JSON[ \t:：]*$/gim,
      /^[ \t>]*前端一键操作[ \t:：]*$/gim,
    ];
    for (const r of removals) t = t.replace(r, '');
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * 模型或 Mock/回退 LLM 偶发只返回 `{}` / `[]` 等无可读正文，前端会照字面展示；在此统一兜底。
   */
  private coerceLightweightKnowledgeUserVisibleAnswer(
    text: string,
    request: Pick<RouteAndRunRequestDto, 'request_id'>,
  ): string {
    let t = text.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
    if (fenced) t = fenced[1].trim();

    let looksLikeEmptyJson = false;
    if (!t) {
      looksLikeEmptyJson = true;
    } else if (t === '{}' || t === '[]') {
      looksLikeEmptyJson = true;
    } else {
      try {
        const v = JSON.parse(t) as unknown;
        if (v && typeof v === 'object') {
          if (!Array.isArray(v) && Object.keys(v as object).length === 0) looksLikeEmptyJson = true;
          if (Array.isArray(v) && v.length === 0) looksLikeEmptyJson = true;
        }
      } catch {
        // 非 JSON：视为正常正文
      }
    }

    if (!looksLikeEmptyJson) return text.trim();

    this.logger.warn({
      tag: 'lightweight_knowledge_qa.degenerate_answer',
      request_id: request.request_id,
      preview: text.trim().slice(0, 120),
    });
    return '抱歉，本轮未能生成有效文字说明（上游返回了空内容）。请稍后重试；若持续出现，可使用下方快捷操作进入行程规划。';
  }

  /** 轻量 RAG：把持久化 structured 偏好拼进检索 query，与住宿/餐饮/交通口味对齐 */
  private async resolveTripnaraStructuredRagBiasForLightweight(
    request: RouteAndRunRequestDto,
  ): Promise<string | undefined> {
    const uid = request.user_id?.trim();
    if (!this.prisma || !isValidUuidForUserProfile(uid)) return undefined;
    try {
      const row = await this.prisma.userProfile.findUnique({
        where: { userId: uid },
        select: { preferences: true },
      });
      return extractTripnaraStructuredSlicesFromPreferences(
        row?.preferences as Record<string, unknown> | null,
      ).rag_query_bias_zh;
    } catch {
      return undefined;
    }
  }

  private async buildDataLookupRagSupplement(
    message: string,
    structuredRagBiasZh?: string,
  ): Promise<{
    supplement: string | null;
    citations: Array<{
      chunk_id: string;
      file_id: string;
      document_title: string;
      source_file?: string;
      category: 'practical' | 'risks' | 'pois' | 'decision_support';
      credibility_score?: number;
    }>;
  }> {
    const empty = {
      supplement: null as string | null,
      citations: [] as Array<{
        chunk_id: string;
        file_id: string;
        document_title: string;
        source_file?: string;
        category: 'practical' | 'risks' | 'pois' | 'decision_support';
        credibility_score?: number;
      }>,
    };
    if (!this.chunkRetrieval || !this.isDataLookupRagSupplementQuery(message)) {
      return empty;
    }
    const kbRelevance = estimateLightweightKbTopicRelevanceScore(message);
    if (kbRelevance < LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD) {
      this.logger.debug(
        `[LightweightQA] RAG skipped: KB relevance ${kbRelevance.toFixed(2)} < ${LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD}`,
      );
      return empty;
    }
    const decisionContext = getBoundDecisionContext();
    const { scope } = this.ragRealityPolicyGate.resolve(decisionContext);
    const ragScope: RagSoftWorldScope = scope;
    if (ragScope === 'blocked') {
      this.logger.debug('[LightweightQA] RAG supplement skipped: rag_soft_world_blocked');
      return empty;
    }
    const mergeRagParams = (p: ChunkRetrievalParams): ChunkRetrievalParams =>
      this.ragRealityPolicyGate.mergeChunkRetrievalParams(
        { ...ragRetrievalExpansionParams(), ...p },
        ragScope,
      );
    try {
      const q = message.trim();
      const bias = (structuredRagBiasZh ?? '').trim();
      const withBias = (query: string) => (bias ? `${query} ${bias}` : query);
      const rentalExtra = this.isCarRentalOrDrivingTravelQuery(q);
      const diningExtra = isDiningRecommendationQuery(q);

      let practicalQuery = withBias(q);
      let practicalLimit = 4;
      let risksQuery = withBias(`${q} 季节 安全 路况`);
      let risksLimit = 3;
      let fetchRisks = true;
      let fetchPoisPool = diningExtra;
      let fetchDecisionSupportPool = false;
      let poisQuery =
        diningExtra && !rentalExtra ? withBias(`${q} 餐饮 用餐 餐厅 local food`) : withBias(q);

      if (rentalExtra && diningExtra) {
        fetchPoisPool = true;
        fetchDecisionSupportPool = true;
        poisQuery = withBias(`${q} 餐饮 用餐 餐厅 local food`);
      } else if (rentalExtra) {
        const phase = classifyDrivingRagIntentPhase(q) ?? 'rental_transaction';
        if (phase === 'rental_transaction') {
          practicalQuery = withBias(expandedRentalTransactionRagQuery(q));
          practicalLimit = 3;
          fetchRisks = false;
          fetchPoisPool = false;
          fetchDecisionSupportPool = false;
        } else if (phase === 'driving_safety') {
          practicalQuery = withBias(q);
          practicalLimit = 4;
          risksQuery = withBias(`${q} 季节 安全 路况`);
          risksLimit = 3;
          fetchRisks = true;
          fetchPoisPool = false;
          fetchDecisionSupportPool = false;
        } else {
          /** road_trip_planning：路线/环岛类自驾规划才扩 pois + decision-support */
          practicalQuery = withBias(q);
          practicalLimit = 4;
          fetchRisks = true;
          fetchPoisPool = true;
          fetchDecisionSupportPool = true;
          poisQuery = withBias(q);
        }
      }

      const [practical, risks, poisPool, decisionSupportPool] = await Promise.all([
        this.chunkRetrieval.retrieve(
          mergeRagParams({
            query: practicalQuery,
            limit: practicalLimit,
            category: 'practical',
            useHybridSearch: true,
            credibilityMin: 0.35,
          }),
        ),
        fetchRisks
          ? this.chunkRetrieval.retrieve(
              mergeRagParams({
                query: risksQuery,
                limit: risksLimit,
                category: 'risks',
                useHybridSearch: true,
                credibilityMin: 0.35,
              }),
            )
          : Promise.resolve([] as ChunkRetrievalResult[]),
        fetchPoisPool
          ? this.chunkRetrieval.retrieve(
              mergeRagParams({
                query: poisQuery,
                limit: 4,
                category: 'pois',
                useHybridSearch: true,
                credibilityMin: 0.35,
              }),
            )
          : Promise.resolve([] as ChunkRetrievalResult[]),
        fetchDecisionSupportPool
          ? this.chunkRetrieval.retrieve(
              mergeRagParams({
                query: withBias(q),
                limit: 3,
                category: 'decision-support',
                useHybridSearch: true,
                credibilityMin: 0.35,
              }),
            )
          : Promise.resolve([] as ChunkRetrievalResult[]),
      ]);
      const blocks: string[] = [];
      const byChunk = new Map<
        string,
        {
          chunk_id: string;
          file_id: string;
          document_title: string;
          source_file?: string;
          category: 'practical' | 'risks' | 'pois' | 'decision_support';
          credibility_score?: number;
        }
      >();
      const pack = (
        poolLabel: string,
        cat: 'practical' | 'risks' | 'pois' | 'decision_support',
        rows: ChunkRetrievalResult[],
      ) => {
        if (!rows?.length) return;
        const slice = rows.slice(0, 4);
        const lines = slice.map((r, i) => {
          const docTitle = this.formatRagDocumentTitle(r);
          if (!byChunk.has(r.chunkId)) {
            const row: {
              chunk_id: string;
              file_id: string;
              document_title: string;
              source_file?: string;
              category: 'practical' | 'risks' | 'pois' | 'decision_support';
              credibility_score?: number;
            } = {
              chunk_id: r.chunkId,
              file_id: r.fileId,
              document_title: docTitle,
              category: cat,
            };
            if (r.sourceFile) row.source_file = r.sourceFile;
            if (typeof r.credibilityScore === 'number') row.credibility_score = r.credibilityScore;
            byChunk.set(r.chunkId, row);
          }
          return `[${poolLabel}${i + 1}｜《${docTitle}》] ${String(r.content).slice(0, 900)}`;
        });
        blocks.push(lines.join('\n'));
      };
      pack('实操/practical', 'practical', practical);
      pack('风险/risks', 'risks', risks);
      if (fetchPoisPool && poisPool.length) {
        pack(diningExtra ? '餐饮POI/pois' : '租车POI/pois', 'pois', poisPool);
      }
      if (fetchDecisionSupportPool && decisionSupportPool.length) {
        pack('决策/decision-support', 'decision_support', decisionSupportPool);
      }
      if (blocks.length === 0) return empty;
      const citations = Array.from(byChunk.values());
      return {
        supplement: `以下为知识库检索摘录（供核对与补充；须与上文行程摘要一致，勿与摘要矛盾）。每条前缀《》内为文档名称：\n${blocks.join('\n\n')}`,
        citations,
      };
    } catch (e: any) {
      this.logger.warn(`[LightweightQA] RAG supplement failed: ${e?.message ?? e}`);
      return empty;
    }
  }

  private static readonly LIVE_TOOL_WEATHER_MS = 2500;
  /** Amadeus Flight Offers：网络 + token；略宽裕避免轻量路径裁掉 inventory */
  private static readonly LIVE_TOOL_FLIGHT_MS = 22000;
  /** Airbnb/聚合检索常 >4.5s；过短会导致 Promise.race 先超时，房源列表在日志里「晚到」却无法注入 prompt */
  private static readonly LIVE_TOOL_HOTEL_MS = 18000;
  /** Booking.com 租车：地点解析 + 上游检索常需数秒 */
  private static readonly LIVE_TOOL_CAR_RENTAL_MS = 20000;
  /** 多日行程按「每晚上一间」采样检索时的最大分段次数（并行 MCP） */
  private static readonly MAX_HOTEL_NIGHT_SAMPLE_SEGMENTS = 5;
  /** 整段多日重规划：逐晚住宿 MCP 上限（6 天行程约 5 间夜） */
  private static readonly MAX_FULL_TRIP_REPLAN_HOTEL_NIGHTS = 6;
  /** 仅检索一间夜时展示更多候选；多段并行时略少以免卡片过多 */
  private static readonly HOTEL_MCP_MAX_LISTINGS_SINGLE_NIGHT_SEGMENT = 3;
  private static readonly HOTEL_MCP_MAX_LISTINGS_PER_MULTI_SEGMENT = 2;

  private static readonly HOTEL_UI_LAYOUT_HINT_ZH =
    '建议界面：顶部用 1～2 段简短策略文字；紧接着按 accommodation_night_groups（每晚一块）渲染卡片与占位，勿与正文大块清单重复。免责说明放在列表末尾。';

  /** 将扁平 accommodations 按 nightIndex 展开为每晚一组（含未采样晚），供前端与正文同屏整合 */
  private async buildAccommodationNightGroupsForPayload(
    accommodations: RouteAndRunAccommodationCard[],
    tripId: string,
    tripFirstCheckInYmd: string,
    totalNights: number,
    opts?: { includeOnlyNightIndices?: number[] },
  ): Promise<AccommodationNightGroup[]> {
    const out: AccommodationNightGroup[] = [];
    const nightsToIterate =
      opts?.includeOnlyNightIndices && opts.includeOnlyNightIndices.length > 0
        ? [...new Set(opts.includeOnlyNightIndices)].filter((n) => n >= 1 && n <= totalNights).sort((a, b) => a - b)
        : Array.from({ length: totalNights }, (_, i) => i + 1);
    for (const night of nightsToIterate) {
      const checkIn = addDaysYmd(tripFirstCheckInYmd, night - 1);
      const checkOut = addDaysYmd(tripFirstCheckInYmd, night);
      const cards = accommodations.filter((c) => c.nightIndex === night);
      const hasMcpSample = cards.length > 0;
      const anchorLabelZh = hasMcpSample
        ? (cards[0].itineraryHintZh ??
          (await this.buildStaySegmentLabelZh(tripId, checkIn, night, totalNights)))
        : await this.buildStaySegmentLabelZh(tripId, checkIn, night, totalNights);
      out.push({
        night_index: night,
        check_in: checkIn,
        check_out: checkOut,
        anchor_label_zh: anchorLabelZh,
        stay_label_zh: formatStayLabelZh(checkIn, checkOut),
        has_mcp_sample: hasMcpSample,
        ...(!hasMcpSample
          ? {
              placeholder_zh: '该晚暂无采样房源，可稍后针对当日锚点再次检索或手动浏览预订平台。',
            }
          : {}),
        cards,
      });
    }
    return out;
  }

  /** Phase1：只读天气 MCP；需 options.enable_live_tools 含 weather，或 intent_flags.live_facts + 天气类用语，或「天气+路况/目的地近期」话术 */
  private shouldAttemptLiveWeatherSensor(request: RouteAndRunRequestDto, context: AgentContext): boolean {
    if (!this.mcpToolDispatcher) return false;
    return shouldEnableLiveWeatherMcpForLightweightRoute(
      context.routingTaskType,
      request.message,
      request.options,
    );
  }

  /**
   * Phase1：只读酒店检索 MCP。
   * - 显式开启：`enable_live_tools` 含 `hotel`。
   * - 自动开启：轻量路由（DATA_LOOKUP / GENERIC_QA / RAG_QA）且消息含住宿检索意图（无需 live_facts）。
   * 仍需 Trip 起止日或 structured_travel_input 日期，否则 resolveHotelSearchParamsForMcp 返回 null 并跳过调用。
   */
  private shouldAttemptHotelSensor(request: RouteAndRunRequestDto, context: AgentContext): boolean {
    if (!this.mcpToolDispatcher) return false;
    const rt = context.routingTaskType;
    if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
    const tools = normalizeLiveTools(request.options?.enable_live_tools);
    const msg = request.message ?? '';
    if (tools.includes('hotel')) return true;
    /** 可执行航班库存 intent：勿自动旁路到住宿（除非用户显式 enable_live_tools hotel） */
    if (
      !tools.includes('hotel') &&
      (this.amadeusDirect?.isAvailable || this.flightMcp?.isAvailable) &&
      isExecutableFlightInventoryQuery(msg)
    ) {
      return false;
    }
    if (
      /酒店|旅馆|宾馆|旅店|住宿|民宿|青旅|空房|房源|含早|可订房源|可订酒店|可订房|可订住宿|预订住宿|订房|找.*房|推荐.*酒店|换.*酒店|\bhotel\b|\bairbnb\b|\bhostel\b|\blodging\b/i.test(
        msg,
      )
    )
      return true;
    return false;
  }

  /** Phase1：Amadeus 或 Flight MCP（inventory）；显式 `flight` 或开放程/实时航班组合话术 */
  private shouldAttemptFlightSensor(request: RouteAndRunRequestDto, context: AgentContext): boolean {
    if (!this.amadeusDirect?.isAvailable && !this.flightMcp?.isAvailable) return false;
    const rt = context.routingTaskType;
    if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
    const tools = normalizeLiveTools(request.options?.enable_live_tools);
    const msg = request.message ?? '';
    if (tools.includes('flight')) return true;
    return isExecutableFlightInventoryQuery(msg);
  }

  /**
   * Booking.com 租车 MCP（轻量路径）。
   * - 显式：`enable_live_tools` 含 `car_rental`。
   * - 自动：话术含租车/推荐租车等（与咨询路由「交通」语义对齐）。
   * 需能解析取还日期（绑定行程起止日或 structured 日期），否则跳过。
   */
  private shouldAttemptCarRentalSensor(request: RouteAndRunRequestDto, context: AgentContext): boolean {
    if (!this.mcpToolDispatcher) return false;
    const rt = context.routingTaskType;
    if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
    const tools = normalizeLiveTools(request.options?.enable_live_tools);
    const msg = request.message ?? '';
    if (tools.includes('car_rental')) return true;
    if (
      /我要租车|想租车|需要租车|租车|推荐租车|租一辆车|查询租车|车型|报价|取车|还车|车行|SUV|四驱|包车|自驾租车|\bcar\s+rental\b|\brent\s+a\s+car\b/i.test(
        msg,
      )
    ) {
      return true;
    }
    return false;
  }

  /** 从绑定行程解析 Booking.com 租车检索参数；无日期则 null */
  private async resolveCarRentalSearchParamsForMcp(
    request: RouteAndRunRequestDto,
    effectiveTripId?: string,
  ): Promise<Record<string, unknown> | null> {
    const st = request.structured_travel_input;
    let pickUpDate: string | undefined;
    let dropOffDate: string | undefined;
    let pickupQuery = 'Reykjavik';

    if (st?.start_date && st?.end_date) {
      pickUpDate = st.start_date.slice(0, 10);
      dropOffDate = st.end_date.slice(0, 10);
    } else if (effectiveTripId) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: effectiveTripId },
          select: { destination: true, startDate: true, endDate: true },
        });
        if (trip?.startDate && trip?.endDate) {
          pickUpDate = trip.startDate.toISOString().slice(0, 10);
          dropOffDate = trip.endDate.toISOString().slice(0, 10);
        }
        const d = trip?.destination?.trim() ?? '';
        const du = d.toUpperCase();
        if (du === 'IS' || /冰岛|冰島/i.test(d) || /^iceland$/i.test(d)) {
          pickupQuery = 'Reykjavik Iceland';
        } else if (d.length === 2 && /^[A-Z]{2}$/i.test(d)) {
          pickupQuery = d;
        } else if (d.length > 1) {
          pickupQuery = d;
        }
      } catch {
        return null;
      }
    }

    if (!pickUpDate || !dropOffDate) return null;

    return {
      pickupQuery,
      pick_up_date: pickUpDate,
      drop_off_date: dropOffDate,
      pick_up_time: '10:00',
      drop_off_time: '10:00',
      driver_age: 30,
      currency_code: 'USD',
      location: 'US',
    };
  }

  /**
   * 用户明确要问租车但 Trip / structured 尚无起止日时：用「今日起 +14 天取车、+21 天还车」的示例窗口触达 Booking.com，
   * 以便仍返回 MCP 列表与前端卡片（正文须提示价格为示意、用户可在工作台补日期后再查）。
   */
  private async buildFallbackCarRentalSearchParams(
    request: RouteAndRunRequestDto,
    effectiveTripId?: string,
  ): Promise<Record<string, unknown> | null> {
    let pickupQuery = 'Reykjavik Iceland';
    if (effectiveTripId) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: effectiveTripId },
          select: { destination: true },
        });
        const d = trip?.destination?.trim() ?? '';
        const du = d.toUpperCase();
        if (du === 'IS' || /冰岛|冰島/i.test(d) || /^iceland$/i.test(d)) {
          pickupQuery = 'Reykjavik Iceland';
        } else if (d.length === 2 && /^[A-Z]{2}$/i.test(d)) {
          pickupQuery = d;
        } else if (d.length > 1) {
          pickupQuery = d;
        }
      } catch {
        return null;
      }
    }
    const now = new Date();
    const pickUp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
    const dropOff = new Date(Date.UTC(pickUp.getUTCFullYear(), pickUp.getUTCMonth(), pickUp.getUTCDate() + 7));
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    return {
      pickupQuery,
      pick_up_date: ymd(pickUp),
      drop_off_date: ymd(dropOff),
      pick_up_time: '10:00',
      drop_off_time: '10:00',
      driver_age: 30,
      currency_code: 'USD',
      location: 'US',
    };
  }

  private formatLiveCarRentalSensorBlock(
    data: unknown,
    opts?: { fallbackDatesUsed?: boolean },
  ): string {
    const d = data as { data?: unknown[] };
    const rows = Array.isArray(d?.data) ? d.data : [];
    if (rows.length === 0) {
      return `【实时租车检索 MCP】供应商返回列表为空（可能无库存或日期无报价）。`;
    }
    const prefix =
      opts?.fallbackDatesUsed === true
        ? '【说明】当前行程未携带可取用的起止日，已使用系统示例取还日期窗口检索；报价仅供示意，请以预订页实时为准。\n'
        : '';
    const lines = rows.slice(0, 6).map((x, i) => {
      const row = x as Record<string, unknown>;
      const company = String(row.company ?? row.supplier ?? row.name ?? '供应商');
      const vehicle = String(row.vehicle_type ?? row.vehicleType ?? row.car_class ?? '');
      const priceObj = row.price as Record<string, unknown> | undefined;
      const price =
        priceObj && typeof priceObj === 'object'
          ? `${priceObj.currency ?? ''} ${priceObj.amount ?? ''}`.trim()
          : '';
      return `[${i + 1}] ${company}${vehicle ? ` · ${vehicle}` : ''}${price ? ` · ${price}` : ''}`;
    });
    return [
      prefix + '【实时租车检索 MCP】以下为 Booking.com 摘录（可订性与价格以平台实时为准）：',
      ...lines,
    ].join('\n');
  }

  private async runLiveCarRentalSensorBranch(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    effectiveTripId?: string,
  ): Promise<{
    audits: LiveSensorAuditRow[];
    block: string | null;
    carRentals?: unknown[];
    carRentalSearchMeta?: {
      fallback_dates_used?: boolean;
      pick_up_date?: string;
      drop_off_date?: string;
      pickup_query?: string;
      captured_at_iso?: string;
    };
  }> {
    const audits: LiveSensorAuditRow[] = [];
    if (!this.shouldAttemptCarRentalSensor(request, context)) {
      return { audits, block: null };
    }
    let params = await this.resolveCarRentalSearchParamsForMcp(request, effectiveTripId);
    let fallbackDatesUsed = false;
    if (!params) {
      params = await this.buildFallbackCarRentalSearchParams(request, effectiveTripId);
      fallbackDatesUsed = Boolean(params);
      if (!params) {
        this.logger.debug(
          `[LiveTool] car_rental skipped_no_dates request_id=${request.request_id}（无 Trip 起止日且无法构造默认窗口）`,
        );
        return { audits, block: null };
      }
      this.logger.debug(
        `[LiveTool] car_rental using_fallback_dates request_id=${request.request_id} pick=${params.pick_up_date} drop=${params.drop_off_date}`,
      );
    }
    const pickUpYmd = typeof params.pick_up_date === 'string' ? params.pick_up_date : undefined;
    const dropYmd = typeof params.drop_off_date === 'string' ? params.drop_off_date : undefined;
    const pickupQ = typeof params.pickupQuery === 'string' ? params.pickupQuery : undefined;
    const started = Date.now();
    try {
      const data = await this.runLiveToolWithTimeout(
        () => this.mcpToolDispatcher!.executeTool('car_rental', 'car_rental.search', params),
        ClaudeOrchestratorService.LIVE_TOOL_CAR_RENTAL_MS,
      );
      const latency_ms = Date.now() - started;
      audits.push({ tool_id: 'live_tool.mcp.car_rental', ok: true, latency_ms });
      this.logger.log({
        tag: 'live_tool.mcp.car_rental',
        request_id: request.request_id,
        ok: true,
        latency_ms,
      });
      const rows = Array.isArray((data as { data?: unknown[] })?.data)
        ? (data as { data: unknown[] }).data
        : [];
      const capturedIso = new Date().toISOString();
      const carRentalSearchMeta = fallbackDatesUsed
        ? {
            fallback_dates_used: true as const,
            pick_up_date: pickUpYmd,
            drop_off_date: dropYmd,
            pickup_query: pickupQ,
            captured_at_iso: capturedIso,
          }
        : pickUpYmd || dropYmd || pickupQ
          ? {
              fallback_dates_used: false as const,
              pick_up_date: pickUpYmd,
              drop_off_date: dropYmd,
              pickup_query: pickupQ,
              captured_at_iso: capturedIso,
            }
          : { captured_at_iso: capturedIso };
      return {
        audits,
        block: this.formatLiveCarRentalSensorBlock(data, { fallbackDatesUsed }),
        carRentals: rows,
        carRentalSearchMeta,
      };
    } catch (e: any) {
      const latency_ms = Date.now() - started;
      const err = e?.message ? String(e.message) : String(e);
      audits.push({
        tool_id: 'live_tool.mcp.car_rental',
        ok: false,
        latency_ms,
        error: err,
        orchestrator_robustness: classifyOrchestratorFailure(e, {
          orchestrator_step: 'INTAKE',
          tool_id: 'live_tool.mcp.car_rental',
        }),
      });
      this.logger.warn({
        tag: 'live_tool.mcp.car_rental',
        request_id: request.request_id,
        ok: false,
        latency_ms,
        error: err,
      });
      return { audits, block: null };
    }
  }

  private async runIcelandRentalGuidanceLightweightBranch(
    request: RouteAndRunRequestDto,
    tripCtxJoined: string,
  ): Promise<{
    audits: LiveSensorAuditRow[];
    guidance: IcelandRentalGuidanceOutput | null;
    promptLines: string[];
    footnotesZh: string[];
  }> {
    const audits: LiveSensorAuditRow[] = [];
    if (!this.icelandRentalGuidanceSkill) {
      return { audits, guidance: null, promptLines: [], footnotesZh: [] };
    }
    if (!shouldInjectIcelandRentalGuidanceForLightweight(request.message ?? '', tripCtxJoined)) {
      return { audits, guidance: null, promptLines: [], footnotesZh: [] };
    }
    const t0 = Date.now();
    try {
      const guidance = await this.icelandRentalGuidanceSkill.execute({
        user_query: request.message ?? '',
      });
      const latency_ms = Date.now() - t0;
      audits.push({ tool_id: 'skill.iceland.rentalGuidance', ok: true, latency_ms });
      return {
        audits,
        guidance,
        promptLines: buildIcelandRentalGuidancePromptLines(guidance),
        footnotesZh: buildCarRentalGuidanceFootnotesZh(guidance),
      };
    } catch (e: any) {
      const latency_ms = Date.now() - t0;
      const err = e?.message ? String(e.message) : String(e);
      audits.push({
        tool_id: 'skill.iceland.rentalGuidance',
        ok: false,
        latency_ms,
        error: err,
        orchestrator_robustness: classifyOrchestratorFailure(e, {
          orchestrator_step: 'INTAKE',
          tool_id: 'skill.iceland.rentalGuidance',
        }),
      });
      this.logger.warn({
        tag: 'skill.iceland.rentalGuidance',
        request_id: request.request_id,
        ok: false,
        latency_ms,
        error: err,
      });
      return { audits, guidance: null, promptLines: [], footnotesZh: [] };
    }
  }

  private stampHotelInventoryCapturedAt(payload: HotelRouteRunUiPayload): void {
    const iso = new Date().toISOString();
    const prev = payload.hotel_search_meta;
    if (!prev) {
      payload.hotel_search_meta = { strategy: 'single_stay', captured_at_iso: iso };
      return;
    }
    payload.hotel_search_meta = { ...prev, captured_at_iso: iso };
  }

  private formatFlightOfferLineForSensorBlock(offer: AmadeusDirectFlightOffer, idx: number): string {
    const price = offer.price;
    const total = price?.grandTotal ?? price?.total;
    const cur = price?.currency ?? '';
    const it0 = offer.itineraries?.[0];
    const dur = it0?.duration ?? '';
    const segs = it0?.segments ?? [];
    const flightNums = segs
      .map((s) => [s.carrierCode, s.number].filter(Boolean).join(''))
      .filter(Boolean)
      .slice(0, 4)
      .join('/');
    return `[${idx}] ${cur} ${total ?? '?'} · ${dur || '?'} · ${flightNums || '—'}`;
  }

  /**
   * 选择航班库存数据源：默认优先 Amadeus；仅 Amadeus 未配置时可仅用 Flight MCP。
   * FLIGHT_INVENTORY_PROVIDER=mcp|amadeus|auto（默认 auto）
   * FLIGHT_INVENTORY_PREFER=mcp|amadeus（二者皆可用时，默认 amadeus）
   */
  private shouldUseFlightMcpProvider(): boolean {
    const mcpOk = !!this.flightMcp?.isAvailable;
    const amadeusOk = !!this.amadeusDirect?.isAvailable;
    const mode = (process.env.FLIGHT_INVENTORY_PROVIDER || 'auto').toLowerCase();
    if (mode === 'mcp') return mcpOk;
    if (mode === 'amadeus') return false;
    const prefer = (process.env.FLIGHT_INVENTORY_PREFER || 'amadeus').toLowerCase();
    if (!mcpOk && !amadeusOk) return false;
    if (!amadeusOk && mcpOk) return true;
    if (!mcpOk && amadeusOk) return false;
    return prefer === 'mcp';
  }

  private async runLiveFlightSensorBranch(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    effectiveTripId?: string,
  ): Promise<{
    audits: LiveSensorAuditRow[];
    block: string | null;
    flight_inventory_snapshot?: {
      legs: Array<Record<string, unknown>>;
      disclaimer_zh?: string;
      captured_at_iso?: string;
    };
  }> {
    const audits: LiveSensorAuditRow[] = [];
    if (!this.shouldAttemptFlightSensor(request, context)) {
      return { audits, block: null };
    }
    let tripStart: string | undefined;
    let tripEnd: string | undefined;
    if (effectiveTripId) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: effectiveTripId },
          select: { startDate: true, endDate: true },
        });
        if (trip?.startDate && trip?.endDate) {
          tripStart = trip.startDate.toISOString().slice(0, 10);
          tripEnd = trip.endDate.toISOString().slice(0, 10);
        }
      } catch {
        /* ignore */
      }
    }
    const legs = resolveFlightInventoryLegs(request.message ?? '', {
      tripStartYmd: tripStart,
      tripEndYmd: tripEnd,
    });
    if (!legs?.length) {
      this.logger.debug(`[LiveTool] flight skipped_no_legs request_id=${request.request_id}`);
      return { audits, block: null };
    }

    const useMcp = this.shouldUseFlightMcpProvider();
    if (useMcp && !this.flightMcp?.isAvailable) {
      this.logger.debug(`[LiveTool] flight skipped_mcp_unavailable request_id=${request.request_id}`);
      return { audits, block: null };
    }
    if (!useMcp && !this.amadeusDirect?.isAvailable) {
      this.logger.debug(`[LiveTool] flight skipped_amadeus_unavailable request_id=${request.request_id}`);
      return { audits, block: null };
    }
    const flightProviderMode = (process.env.FLIGHT_INVENTORY_PROVIDER || 'auto').toLowerCase();
    if (flightProviderMode === 'mcp' && !useMcp) {
      this.logger.debug(`[LiveTool] flight skipped_mcp_required request_id=${request.request_id}`);
      return { audits, block: null };
    }

    const started = Date.now();
    const snapshotLegs: Array<Record<string, unknown>> = [];
    const headerZh = useMcp
      ? '【实时航班检索 Flight MCP】以下为报价摘录（非生成文案；聚合数据源，以预订时为准）：'
      : '【实时航班库存 Amadeus Flight Offers】以下为报价摘录（非生成文案；舱位与价格以预订时为准）：';
    const disclaimerZh = useMcp
      ? '报价来自 Flight MCP（Smithery/Kiwi 等）；出发枢纽未写明时使用默认城市（见各腿 label）；以预订页实时为准。'
      : '报价来自 Amadeus Flight Offers；出发枢纽未写明时使用默认城市（见各腿 label）；以预订页实时为准。';
    const okToolId = useMcp ? 'live_tool.flight_mcp.search_flights' : 'live_tool.amadeus.flight_offers';
    const blockLines: string[] = [headerZh];

    try {
      for (const leg of legs) {
        const legStarted = Date.now();
        if (useMcp && this.flightMcp) {
          const out = await this.runLiveToolWithTimeout<{
            raw: unknown;
            lines: string[];
          }>(
            () =>
              this.flightMcp!.searchFlightsOneWay({
                origin: leg.origin,
                destination: leg.destination,
                departDate: leg.departureDate,
              }),
            ClaudeOrchestratorService.LIVE_TOOL_FLIGHT_MS,
          );
          const { lines, raw } = out;
          const displayLinesMcp = lines.length ? lines : ['（无报价或未返回数据）'];
          const mcpFailed = isFlightMcpToolResultFailure(raw, displayLinesMcp);
          const mcpLinesForUi = mcpFailed ? sanitizeFlightInventoryLinesForUi(displayLinesMcp) : displayLinesMcp;
          const latencyMcp = Date.now() - legStarted;
          if (mcpFailed) {
            this.flightMcp.invalidateConnectionCacheFromRaw(raw);
          }
          audits.push({
            tool_id: okToolId,
            ok: !mcpFailed,
            latency_ms: latencyMcp,
            ...(mcpFailed ? { error: 'mcp_tool_error' } : {}),
          });

          const allowAmadeusFallback =
            mcpFailed &&
            this.amadeusDirect?.isAvailable &&
            process.env.FLIGHT_MCP_FALLBACK_AMADEUS !== 'false';

          if (allowAmadeusFallback) {
            this.logger.warn({
              tag: 'live_tool.flight_mcp.fallback_amadeus',
              request_id: request.request_id,
              leg: `${leg.origin}->${leg.destination}`,
              date: leg.departureDate,
            });
            const legStartedAmadeus = Date.now();
            try {
              const result = await this.runLiveToolWithTimeout(
                () =>
                  this.amadeusDirect!.searchFlightOffers({
                    originLocationCode: leg.origin,
                    destinationLocationCode: leg.destination,
                    departureDate: leg.departureDate,
                    adults: 1,
                    max: 5,
                    currencyCode: 'EUR',
                  }),
                ClaudeOrchestratorService.LIVE_TOOL_FLIGHT_MS,
              );
              const latencyAmadeus = Date.now() - legStartedAmadeus;
              audits.push({ tool_id: 'live_tool.amadeus.flight_offers', ok: true, latency_ms: latencyAmadeus });
              const offers = Array.isArray(result?.data) ? result.data : [];
              const sample = offers
                .slice(0, 3)
                .map((o, i) => this.formatFlightOfferLineForSensorBlock(o, i + 1));
              const displayLines = sample.length ? sample : ['（Amadeus 本轮亦无报价）'];
              const structuredAmadeus = mapAmadeusOffersToSampleCards(offers, 5);
              const sample_offers = enrichSampleOffersFromLines(structuredAmadeus, displayLines, 5);
              blockLines.push(`— ${leg.leg_label_zh} (${leg.origin}→${leg.destination} ${leg.departureDate}) —`);
              blockLines.push(...displayLines);
              snapshotLegs.push({
                provider: 'amadeus',
                fallback_from: 'flight_mcp',
                origin_iata: leg.origin,
                destination_iata: leg.destination,
                departure_date: leg.departureDate,
                label_zh: leg.leg_label_zh,
                raw_offer_count: offers.length,
                sample_lines: displayLines,
                sample_offers,
              });
            } catch (fallbackErr: any) {
              const msg = fallbackErr?.message ? String(fallbackErr.message) : String(fallbackErr);
              this.logger.warn({
                tag: 'live_tool.flight_mcp.fallback_amadeus_failed',
                request_id: request.request_id,
                error: msg,
              });
              blockLines.push(`— ${leg.leg_label_zh} (${leg.origin}→${leg.destination} ${leg.departureDate}) —`);
              blockLines.push(...mcpLinesForUi);
              const structuredMcp = parseFlightMcpToolResultToSampleOffers(raw, 5);
              const sample_offers = enrichSampleOffersFromLines(structuredMcp, mcpLinesForUi, 5);
              snapshotLegs.push({
                provider: 'flight_mcp',
                origin_iata: leg.origin,
                destination_iata: leg.destination,
                departure_date: leg.departureDate,
                label_zh: leg.leg_label_zh,
                sample_lines: mcpLinesForUi,
                sample_offers,
              });
            }
          } else {
            blockLines.push(`— ${leg.leg_label_zh} (${leg.origin}→${leg.destination} ${leg.departureDate}) —`);
            blockLines.push(...mcpLinesForUi);
            const structuredMcp = parseFlightMcpToolResultToSampleOffers(raw, 5);
            const sample_offers = enrichSampleOffersFromLines(structuredMcp, mcpLinesForUi, 5);
            snapshotLegs.push({
              provider: 'flight_mcp',
              origin_iata: leg.origin,
              destination_iata: leg.destination,
              departure_date: leg.departureDate,
              label_zh: leg.leg_label_zh,
              sample_lines: mcpLinesForUi,
              sample_offers,
            });
          }
        } else {
          const result = await this.runLiveToolWithTimeout(
            () =>
              this.amadeusDirect!.searchFlightOffers({
                originLocationCode: leg.origin,
                destinationLocationCode: leg.destination,
                departureDate: leg.departureDate,
                adults: 1,
                max: 5,
                currencyCode: 'EUR',
              }),
            ClaudeOrchestratorService.LIVE_TOOL_FLIGHT_MS,
          );
          const latency_ms = Date.now() - legStarted;
          audits.push({ tool_id: okToolId, ok: true, latency_ms });
          const offers = Array.isArray(result?.data) ? result.data : [];
          const sample = offers
            .slice(0, 3)
            .map((o, i) => this.formatFlightOfferLineForSensorBlock(o, i + 1));
          const displayLines = sample.length ? sample : ['（无报价或未返回数据）'];
          const structuredAmadeus = mapAmadeusOffersToSampleCards(offers, 5);
          const sample_offers = enrichSampleOffersFromLines(structuredAmadeus, displayLines, 5);
          blockLines.push(`— ${leg.leg_label_zh} (${leg.origin}→${leg.destination} ${leg.departureDate}) —`);
          blockLines.push(...displayLines);
          snapshotLegs.push({
            provider: 'amadeus',
            origin_iata: leg.origin,
            destination_iata: leg.destination,
            departure_date: leg.departureDate,
            label_zh: leg.leg_label_zh,
            raw_offer_count: offers.length,
            sample_lines: displayLines,
            sample_offers,
          });
        }
      }
      const auditAllOk = audits.every((a) => a.ok === true);
      this.logger.log({
        tag: useMcp ? 'live_tool.flight_mcp.flight' : 'live_tool.amadeus.flight',
        request_id: request.request_id,
        ok: auditAllOk,
        latency_ms: Date.now() - started,
        leg_count: legs.length,
      });
      const capturedIso = new Date().toISOString();
      return {
        audits,
        block: blockLines.join('\n'),
        flight_inventory_snapshot: {
          legs: snapshotLegs,
          disclaimer_zh: disclaimerZh,
          captured_at_iso: capturedIso,
        },
      };
    } catch (e: any) {
      const latency_ms = Date.now() - started;
      const err = e?.message ? String(e.message) : String(e);
      audits.push({
        tool_id: okToolId,
        ok: false,
        latency_ms,
        error: err,
        orchestrator_robustness: classifyOrchestratorFailure(e, {
          orchestrator_step: 'INTAKE',
          tool_id: okToolId,
        }),
      });
      this.logger.warn({
        tag: useMcp ? 'live_tool.flight_mcp.flight' : 'live_tool.amadeus.flight',
        request_id: request.request_id,
        ok: false,
        latency_ms,
        error: err,
      });
      return { audits, block: null };
    }
  }

  private async resolveLiveWeatherLocationForMcp(
    request: RouteAndRunRequestDto,
    effectiveTripId?: string,
  ): Promise<LiveWeatherLocationResolve | null> {
    const msg = request.message ?? '';
    const fromMsg = resolveLiveWeatherLocationFromMessage(msg);
    if (fromMsg) return fromMsg;

    if (effectiveTripId) {
      const fromTrip = await resolveLiveWeatherLocationFromAnchoredTrip(this.prisma, effectiveTripId);
      if (fromTrip) return fromTrip;

      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: effectiveTripId },
          select: { destination: true },
        });
        const code = trip?.destination?.trim().toUpperCase();
        if (code === 'IS') return { location: 'Iceland', countryCode: 'IS' };
        if (code && /^[A-Z]{2}$/.test(code)) return { location: code, countryCode: code };
      } catch {
        /* ignore */
      }
    }

    return resolveLiveWeatherLocationFromMessage(msg);
  }

  private formatLiveWeatherSensorBlock(
    data: Record<string, unknown>,
    opts?: { anchorLabel?: string },
  ): string {
    const cur = data?.current as Record<string, unknown> | undefined;
    if (!cur) {
      return `【实时天气传感器 MCP】原始响应（截断）：${JSON.stringify(data).slice(0, 1200)}`;
    }
    const city = data.city ?? '?';
    const country = data.country ?? '';
    return [
      '【实时天气传感器 MCP】以下为 Open-Meteo 当前观测读数（非生成文案）：',
      `- 查询地: ${city} (${country})`,
      ...(opts?.anchorLabel ? [`- 行程锚点: ${opts.anchorLabel}`] : []),
      `- 观测时间: ${cur.time}`,
      `- 气温: ${cur.temperature}°C（体感 ${cur.apparent_temperature}°C）`,
      `- 状况: ${cur.weather_description}`,
      `- 风速: ${cur.wind_speed} m/s`,
      '以上事实须与用户问题中的地点/行程摘要一致引用；若地名不一致，以行程摘要或用户明确提到的地名为准。',
    ].join('\n');
  }

  private async runLiveToolWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    return await Promise.race([
      fn(),
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('LIVE_TOOL_TIMEOUT')), ms)),
    ]);
  }

  private formatLiveHotelSensorBlock(data: unknown): string {
    const d = data as Record<string, unknown>;
    const listings =
      (Array.isArray(d?.listings) && d.listings) ||
      (Array.isArray(d?.results) && d.results) ||
      (Array.isArray(d?.hotels) && d.hotels) ||
      (Array.isArray(d) ? d : null);
    if (listings && Array.isArray(listings)) {
      const lines = listings.slice(0, 5).map((x: unknown, i: number) => {
        const name = extractHotelListingDisplayName(x);
        const priceHint = extractHotelListingPriceHint(x);
        return `[${i + 1}] ${name}${priceHint ? ` · ${priceHint}` : ''}`;
      });
      return [
        '【实时住宿检索 MCP】以下为供应商检索摘录（非生成文案；可订性与价格以供应商实时为准）：',
        ...lines,
      ].join('\n');
    }
    return `【实时住宿检索 MCP】响应摘录（截断）：${JSON.stringify(data).slice(0, 2200)}`;
  }

  /**
   * 住宿 MCP 参数：默认从 Trip 表读目的地与整段行程日期；若用户在结构化字段里提交了入住窗口（日期选择器），则优先用该窗口。
   * 无 trip_id 时：仅当 structured_travel_input 同时给出 start_date、end_date（及可选 destination）才可检索。
   */
  private async resolveHotelSearchParamsForMcp(
    request: RouteAndRunRequestDto,
    effectiveTripId?: string,
  ): Promise<Record<string, unknown> | null> {
    const st = request.structured_travel_input;
    let trip: { destination: string; startDate: Date; endDate: Date } | null = null;
    if (effectiveTripId) {
      try {
        trip = await this.prisma.trip.findUnique({
          where: { id: effectiveTripId },
          select: { destination: true, startDate: true, endDate: true },
        });
      } catch {
        trip = null;
      }
    }

    let checkIn: string | undefined;
    let checkOut: string | undefined;
    const tripStartYmd = trip?.startDate ? trip.startDate.toISOString().slice(0, 10) : undefined;
    const tripEndYmd = trip?.endDate ? trip.endDate.toISOString().slice(0, 10) : undefined;
    if (st?.start_date && st?.end_date) {
      checkIn = st.start_date;
      checkOut = st.end_date;
    } else if (trip?.startDate && trip?.endDate) {
      checkIn = tripStartYmd;
      checkOut = tripEndYmd;
    } else {
      const msgOnly = parseExplicitStayWindowFromUserMessage(request.message ?? '', {});
      if (msgOnly) {
        checkIn = msgOnly.checkIn;
        checkOut = msgOnly.checkOut;
      } else {
        return null;
      }
    }

    /** 正文明确日历窗时收窄 MCP 检索窗（含：结构化日期与 Trip 表一致时仍读取正文「6 月 5–7 日」）。 */
    const narrowed = narrowHotelStayWindowWithNlMessage({
      baseCheckIn: checkIn!,
      baseCheckOut: checkOut!,
      message: request.message ?? '',
      tripStartYmd,
      tripEndYmd,
    });
    checkIn = narrowed.checkIn;
    checkOut = narrowed.checkOut;

    const destFromStructured = st?.destination?.trim();
    const destFromTrip = trip?.destination?.trim() ?? '';
    const code = (destFromStructured || destFromTrip).toUpperCase();
    const destination =
      code === 'IS' ? 'Iceland' : destFromStructured || destFromTrip || 'Iceland';
    const countryCode =
      code.length === 2 && /^[A-Z]{2}$/.test(code)
        ? code
        : destFromTrip.length === 2 && /^[A-Z]{2}$/i.test(destFromTrip)
          ? destFromTrip.toUpperCase()
          : undefined;

    const params: Record<string, unknown> = {
      checkIn,
      checkOut,
      destination,
      language: 'zh',
      ...(countryCode ? { countryCode } : {}),
    };
    if (effectiveTripId) params.tripId = effectiveTripId;
    if (tripStartYmd) params._resolvedTripStartYmd = tripStartYmd;
    if (tripEndYmd) params._resolvedTripEndYmd = tripEndYmd;
    return params;
  }

  /** 轻量住宿检索：根据入住日当天最后一项行程锚点生成中文标签（第几晚 / 地点） */
  private async buildStaySegmentLabelZh(
    tripId: string,
    checkInYmd: string,
    nightOneBased: number,
    totalNights: number,
  ): Promise<string> {
    try {
      const row = await this.prisma.$queryRaw<Array<{ nameCN: string; nameEN: string | null }>>`
        SELECT p."nameCN", p."nameEN"
        FROM "ItineraryItem" ii
        JOIN "TripDay" td ON ii."tripDayId" = td.id
        JOIN "Place" p ON ii."placeId" = p.id
        WHERE td."tripId" = ${tripId}
          AND td.date::date = ${checkInYmd}::date
        ORDER BY ii."order" DESC NULLS LAST, ii."startTime" DESC NULLS LAST
        LIMIT 1
      `;
      const place = row?.[0];
      const anchor = (place?.nameCN?.trim() || place?.nameEN?.trim() || '').trim();
      if (anchor) return `第${nightOneBased}/${totalNights}晚 · ${anchor}周边`;
    } catch {
      /* ignore */
    }
    const md = `${checkInYmd.slice(5, 7)}/${checkInYmd.slice(8, 10)}`;
    return `第${nightOneBased}/${totalNights}晚 · ${md} 入住`;
  }

  /** 与 buildStaySegmentLabelZh 同一锚点：指定日行程 POI（需含 geometry） */
  private async getStayAnchorGeoForTripDay(
    tripId: string,
    dayYmd: string,
    prefer: 'first' | 'last' = 'last',
  ): Promise<{ lat: number; lng: number; nameZh: string } | null> {
    if (!this.prisma) return null;
    const orderDir = prefer === 'first' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const timeDir = prefer === 'first' ? Prisma.sql`ASC NULLS LAST` : Prisma.sql`DESC NULLS LAST`;
    try {
      const row = await this.prisma.$queryRaw<
        Array<{ nameCN: string; nameEN: string | null; lat: unknown; lng: unknown }>
      >`
        SELECT p."nameCN", p."nameEN",
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng
        FROM "ItineraryItem" ii
        JOIN "TripDay" td ON ii."tripDayId" = td.id
        JOIN "Place" p ON ii."placeId" = p.id
        WHERE td."tripId" = ${tripId}
          AND td.date::date = ${dayYmd}::date
          AND p.location IS NOT NULL
        ORDER BY ii."order" ${orderDir} NULLS LAST, ii."startTime" ${timeDir}
        LIMIT 1
      `;
      const place = row?.[0];
      const nameZh = (place?.nameCN?.trim() || place?.nameEN?.trim() || '').trim();
      const lat = place?.lat != null ? Number(place.lat) : NaN;
      const lng = place?.lng != null ? Number(place.lng) : NaN;
      if (!nameZh || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, nameZh };
    } catch {
      return null;
    }
  }

  /** 入住当日最后一项行程 POI（需含 geometry） */
  private async getStayAnchorGeoForNight(
    tripId: string,
    checkInYmd: string,
  ): Promise<{ lat: number; lng: number; nameZh: string } | null> {
    return this.getStayAnchorGeoForTripDay(tripId, checkInYmd, 'last');
  }

  /** 为 MCP 住宿卡片写入相对当日锚点的直线距离（km），供前端与传感器摘要展示 */
  private async enrichHotelRouteRunUiPayloadWithAnchorDistances(
    payload: HotelRouteRunUiPayload,
    tripId: string,
    tripFirstCheckInYmd: string,
    userMessage?: string,
  ): Promise<void> {
    if (!payload.accommodations?.length) return;
    const proximityDay = userMessage ? parseHotelProximityAnchorDayNumber(userMessage) : undefined;
    const proximityYmd =
      proximityDay != null && proximityDay >= 1
        ? addDaysYmd(tripFirstCheckInYmd, proximityDay - 1)
        : undefined;
    const proximityAnchor =
      proximityYmd != null
        ? await this.getStayAnchorGeoForTripDay(tripId, proximityYmd, 'first')
        : null;

    const nights = new Set(payload.accommodations.map((c) => c.nightIndex ?? 1));
    const anchorByNight = new Map<number, { lat: number; lng: number; nameZh: string } | null>();
    for (const n of nights) {
      if (proximityAnchor) {
        anchorByNight.set(n, proximityAnchor);
        continue;
      }
      const checkInYmd = addDaysYmd(tripFirstCheckInYmd, n - 1);
      anchorByNight.set(n, await this.getStayAnchorGeoForNight(tripId, checkInYmd));
    }
    payload.accommodations = attachDistanceToAnchorForCards(payload.accommodations, anchorByNight);
  }

  /** preference_profile + Trip.budgetConfig.travelers + UserProfile 结构化偏好 → 决策文案上下文 */
  private async resolveHotelDecisionContext(
    request: RouteAndRunRequestDto,
    tripId?: string | null,
  ): Promise<HotelPartyAndPreferenceContext> {
    const pp = request.preference_profile;
    const ctx: HotelPartyAndPreferenceContext = {
      cost_sensitivity: pp?.cost_sensitivity,
      effort_sensitivity: pp?.effort_sensitivity,
      time_sensitivity: pp?.time_sensitivity,
    };

    const mergeRoutePartyOverlay = (base: HotelPartyAndPreferenceContext): HotelPartyAndPreferenceContext => {
      const routeSnap = resolveRouteRunPartyProfileSnapshot(request);
      if (!routeSnap) return base;
      const next = { ...base };
      if (routeSnap.has_children === true) next.has_children = true;
      if (routeSnap.has_elderly === true) next.has_elderly = true;
      if (routeSnap.party_total != null && routeSnap.party_total >= 1) {
        if (next.party_total == null || next.party_total <= 0) {
          next.party_total = routeSnap.party_total;
        }
      }
      return next;
    };

    const uid = request.user_id?.trim();
    if (this.prisma && uid && isValidUuidForUserProfile(uid)) {
      try {
        const prof = await this.prisma.userProfile.findUnique({
          where: { userId: uid },
          select: { preferences: true },
        });
        const slices = extractTripnaraStructuredSlicesFromPreferences(
          prof?.preferences as Record<string, unknown> | null,
        );
        if (slices.standing_hotel_avoid_terms_lower?.length) {
          ctx.standing_hotel_avoid_terms_lower = slices.standing_hotel_avoid_terms_lower;
        }
        if (slices.standing_hotel_style_digest_zh) {
          ctx.standing_hotel_style_digest_zh = slices.standing_hotel_style_digest_zh;
        }
      } catch {
        // 保持仅 preference_profile
      }
    }

    if (!tripId || !this.prisma) return mergeRoutePartyOverlay(ctx);
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { budgetConfig: true },
      });
      const bc = trip?.budgetConfig as Record<string, unknown> | null | undefined;
      const travelers = bc?.travelers;
      if (!Array.isArray(travelers) || travelers.length === 0) return mergeRoutePartyOverlay(ctx);
      let adults = 0;
      let children = 0;
      let elderly = 0;
      for (const t of travelers) {
        const tr = t as Record<string, unknown>;
        const ty = String(tr?.type ?? '').toUpperCase();
        if (ty === 'CHILD') children += 1;
        else if (ty === 'ELDERLY') elderly += 1;
        else adults += 1;
      }
      const total = adults + children + elderly;
      const bits: string[] = [];
      if (adults) bits.push(`${adults} 位成人`);
      if (children) bits.push(`${children} 位儿童`);
      if (elderly) bits.push(`${elderly} 位长者`);
      return mergeRoutePartyOverlay({
        ...ctx,
        party_total: total > 0 ? total : undefined,
        has_children: children > 0,
        has_elderly: elderly > 0,
        party_summary_zh: bits.length ? bits.join('、') : undefined,
      });
    } catch {
      return mergeRoutePartyOverlay(ctx);
    }
  }

  /**
   * 住宿管家 L2 可选「环境/行程语境」——仅陈述库内事实（目的地字段等），禁止推测实时天气。
   */
  private async resolveHotelDecisionWorldHintZh(tripId?: string | null): Promise<string | undefined> {
    const tid = typeof tripId === 'string' ? tripId.trim() : '';
    if (!tid || !this.prisma) return undefined;
    if (
      process.env.DISABLE_HOTEL_DECISION_WORLD_HINT === '1' ||
      process.env.DISABLE_HOTEL_DECISION_WORLD_HINT === 'true'
    ) {
      return undefined;
    }
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tid },
        select: { destination: true, name: true, metadata: true },
      });
      if (!trip?.destination) return undefined;
      const parts: string[] = [`目的地字段：${trip.destination}`];
      if (trip.name?.trim()) parts.push(`行程名称：${trip.name.trim()}`);
      const md = trip.metadata as Record<string, unknown> | null | undefined;
      const regionZh =
        typeof md?.region_label_zh === 'string' ? md.region_label_zh.trim() : '';
      if (regionZh) parts.push(`区域说明：${regionZh}`);
      return parts.join('；').slice(0, 220);
    } catch {
      return undefined;
    }
  }

  /**
   * 从 UserProfile.preferences.decision_dna 提取短句（事实性，非实时行为预测），供管家 L2 与 Persona 拼接。
   * 与 PreferenceEvolutionService 写入端同源；未同步或匿名用户则跳过。
   */
  private async resolveHotelDecisionDnaHintZh(
    request: RouteAndRunRequestDto,
  ): Promise<string | undefined> {
    const uid = request.user_id?.trim();
    if (!uid || uid === 'anonymous' || !this.prisma) return undefined;
    if (
      process.env.DISABLE_HOTEL_DECISION_DNA_HINT === '1' ||
      process.env.DISABLE_HOTEL_DECISION_DNA_HINT === 'true'
    ) {
      return undefined;
    }
    try {
      const row = await this.prisma.userProfile.findUnique({
        where: { userId: uid },
        select: { preferences: true },
      });
      const prefs = row?.preferences as Record<string, unknown> | null | undefined;
      const dna = prefs?.decision_dna as Partial<DecisionDnaDto> | undefined;
      if (!dna || dna.version !== 1) return undefined;
      const conf = typeof dna.confidence_score === 'number' && Number.isFinite(dna.confidence_score) ? dna.confidence_score : 0;
      if (conf < 0.35) return undefined;
      const lines: string[] = [];
      if (dna.traits?.time_sensitivity === 'HIGH') {
        lines.push('协商历史倾向：对延误/改期类备选较敏感');
      }
      if (dna.traits?.cost_sensitivity === 'HIGH') {
        lines.push('协商历史倾向：对加价升级类备选较敏感');
      }
      const dom = dna.dominant_alternative != null ? String(dna.dominant_alternative).trim() : '';
      if (dom === 'POSTPONE_SCHEDULE' && conf >= 0.45) {
        lines.push('近期多次拒绝「延期日程」方向');
      }
      if (lines.length === 0 && dom && conf >= 0.5) {
        lines.push(`近期协商中高频备选代号：${dom}（仅作偏好线索）`);
      }
      return lines.length ? lines.slice(0, 2).join('；').slice(0, 200) : undefined;
    } catch {
      return undefined;
    }
  }

  private async enrichHotelRouteRunUiPayloadWithDecisionSupport(
    payload: HotelRouteRunUiPayload,
    request: RouteAndRunRequestDto,
    tripId?: string | null,
  ): Promise<void> {
    if (!payload.accommodations?.length) return;
    const ctx = await this.resolveHotelDecisionContext(request, tripId);
    const worldHintZh = await this.resolveHotelDecisionWorldHintZh(tripId);
    const rawList = Array.isArray(payload.airbnbListings) ? payload.airbnbListings : [];

    const disableLlm =
      process.env.DISABLE_HOTEL_DECISION_LLM === '1' || process.env.DISABLE_HOTEL_DECISION_LLM === 'true';
    const forceLlm =
      process.env.HOTEL_DECISION_LLM === 'always' || process.env.HOTEL_DECISION_LLM === '1';
    /** 默认 false：列表内卡片尽量都走管家 LLM（仍受 HOTEL_DECISION_LLM_MAX_CARDS 截断）；设为 1 则退回窄触发 shouldInvokeStewardNarrator */
    const strictStewardNarrator =
      process.env.HOTEL_DECISION_LLM_STRICT === '1' || process.env.HOTEL_DECISION_LLM_STRICT === 'true';

    const prep = payload.accommodations.map((card, i) => {
      const raw = card.source === 'airbnb' && i < rawList.length ? rawList[i] : undefined;
      const layers = extractHotelDecisionLayers(card, raw, ctx);
      const templateZh = buildTemplateHotelDecisionSupportZh(card, raw, ctx);
      return { raw, layers, templateZh };
    });

    const narratorCandidates: Array<{
      index: number;
      listing_id: string;
      facts: (typeof prep)[0]['layers']['facts'];
      signals: (typeof prep)[0]['layers']['signals'];
      conflicts: (typeof prep)[0]['layers']['conflicts'];
    }> = [];

    for (let i = 0; i < prep.length; i++) {
      const { layers } = prep[i];
      const wantNarrator =
        !disableLlm &&
        !!this.hotelDecisionNarrator &&
        (forceLlm ||
          !strictStewardNarrator ||
          shouldInvokeStewardNarrator(layers.conflicts, layers.signals, layers.facts));
      if (!wantNarrator) continue;
      narratorCandidates.push({
        index: i,
        listing_id: layers.facts.listing_id,
        facts: layers.facts,
        signals: layers.signals,
        conflicts: layers.conflicts,
      });
    }

    const BATCH = 5;
    const maxCardsRaw = parseInt(process.env.HOTEL_DECISION_LLM_MAX_CARDS ?? '', 10);
    const capped =
      Number.isFinite(maxCardsRaw) && maxCardsRaw > 0
        ? narratorCandidates.slice(0, maxCardsRaw)
        : narratorCandidates;

    const narrated = new Map<string, string>();
    if (capped.length && this.hotelDecisionNarrator) {
      const dnaHint = await this.resolveHotelDecisionDnaHintZh(request);
      const personaCombined = [inferPersonaDnaZh(ctx), dnaHint].filter(Boolean).join(' ');
      for (let off = 0; off < capped.length; off += BATCH) {
        const chunk = capped.slice(off, off + BATCH);
        const batchMap = await this.hotelDecisionNarrator.narrateBatch({
          request_id: request.request_id ?? 'route-run-hotel',
          items: chunk.map(({ listing_id, facts, signals, conflicts }) => ({
            listing_id,
            facts,
            signals,
            conflicts,
          })),
          persona_dna_zh: personaCombined,
          ...(worldHintZh ? { optional_world_hint_zh: worldHintZh } : {}),
        });
        for (const [k, v] of batchMap) narrated.set(k, v);
      }
    }

    payload.accommodations = payload.accommodations.map((card, i) => {
      const p = prep[i];
      const usedNarrator = capped.some((n) => n.index === i);
      let decision_support_zh: string | undefined;
      if (usedNarrator) {
        decision_support_zh = narrated.get(card.id) ?? p.templateZh;
      } else {
        decision_support_zh = p.templateZh;
      }
      return decision_support_zh ? { ...card, decision_support_zh } : card;
    });
  }

  private async runLiveWeatherSensorBranch(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    effectiveTripId?: string,
  ): Promise<{
    audits: LiveSensorAuditRow[];
    block: string | null;
    /** 天气 MCP 快照完成时间（与 inventory_snapshots_meta 对齐） */
    snapshotCapturedAtIso?: string;
  }> {
    const audits: LiveSensorAuditRow[] = [];
    if (!this.shouldAttemptLiveWeatherSensor(request, context)) {
      return { audits, block: null };
    }
    const loc = await this.resolveLiveWeatherLocationForMcp(request, effectiveTripId);
    if (!loc) {
      this.logger.debug(`[LiveTool] weather skipped_no_location request_id=${request.request_id}`);
      return { audits, block: null };
    }
    const wmStarted = Date.now();
    try {
      const data = (await this.runLiveToolWithTimeout(
        () =>
          this.mcpToolDispatcher!.executeTool('weather', 'weather.getCurrentWeather', {
            location: loc.location,
            countryCode: loc.countryCode,
          }),
        ClaudeOrchestratorService.LIVE_TOOL_WEATHER_MS,
      )) as Record<string, unknown>;
      const latency_ms = Date.now() - wmStarted;
      audits.push({ tool_id: 'live_tool.mcp.weather', ok: true, latency_ms });
      this.logger.log({
        tag: 'live_tool.mcp.weather',
        request_id: request.request_id,
        ok: true,
        latency_ms,
        location: loc.location,
      });
      return {
        audits,
        block: this.formatLiveWeatherSensorBlock(data, { anchorLabel: loc.anchorLabel }),
        snapshotCapturedAtIso: new Date().toISOString(),
      };
    } catch (e: any) {
      const latency_ms = Date.now() - wmStarted;
      const err = e?.message ? String(e.message) : String(e);
      audits.push({
        tool_id: 'live_tool.mcp.weather',
        ok: false,
        latency_ms,
        error: err,
        orchestrator_robustness: classifyOrchestratorFailure(e, {
          orchestrator_step: 'INTAKE',
          tool_id: 'live_tool.mcp.weather',
        }),
      });
      this.logger.warn({
        tag: 'live_tool.mcp.weather',
        request_id: request.request_id,
        ok: false,
        latency_ms,
        error: err,
      });
      return { audits, block: null };
    }
  }

  private async runLiveHotelSensorBranch(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    effectiveTripId?: string,
    opts?: { fullTripReplan?: boolean },
  ): Promise<{
    audits: LiveSensorAuditRow[];
    block: string | null;
    /** 供前端渲染住宿卡片（与 Planning Assistant routing.target=hotel 对齐） */
    hotelRouteRunUi?: HotelRouteRunUiPayload;
  }> {
    const audits: LiveSensorAuditRow[] = [];
    if (!opts?.fullTripReplan && !this.shouldAttemptHotelSensor(request, context)) {
      return { audits, block: null };
    }
    if (opts?.fullTripReplan && !this.mcpToolDispatcher) {
      return { audits, block: null };
    }
    const baseParams = await this.resolveHotelSearchParamsForMcp(request, effectiveTripId);
    if (!baseParams) {
      this.logger.debug(
        `[LiveTool] hotel skipped_no_stay_dates request_id=${request.request_id}（需要 Trip 起止日或 structured_travel_input.start_date/end_date）`,
      );
      return { audits, block: null };
    }

    const {
      _resolvedTripStartYmd,
      _resolvedTripEndYmd,
      ...hotelSearchParams
    } = baseParams as Record<string, unknown>;
    const tripWinStart =
      typeof _resolvedTripStartYmd === 'string' ? _resolvedTripStartYmd.slice(0, 10) : undefined;
    const tripWinEnd =
      typeof _resolvedTripEndYmd === 'string' ? _resolvedTripEndYmd.slice(0, 10) : undefined;
    const tripSpanNightsWhole =
      tripWinStart && tripWinEnd ? countStayNightsBetweenInclusive(tripWinStart, tripWinEnd) : undefined;

    const ci = String(hotelSearchParams.checkIn);
    const co = String(hotelSearchParams.checkOut);
    const tripId =
      typeof hotelSearchParams.tripId === 'string' ? hotelSearchParams.tripId : effectiveTripId;
    const totalNights = countStayNightsBetweenInclusive(ci, co);
    const msgForHotel = request.message ?? '';
    const explicitNightScope = parseExplicitHotelNightScopeIndices(msgForHotel, totalNights);
    const inferredNightIndex0 =
      explicitNightScope === null
        ? inferNightIndex0FromExplicitStayInTripWindow(msgForHotel, ci, totalNights, co)
        : null;
    const userLimitedNightIntent = explicitNightScope !== null || inferredNightIndex0 !== null;

    const hmStarted = Date.now();

    /** 仅 1 晚或与行程无关的单窗口：一次检索（兼容旧行为） */
    const useSingleWindow = !tripId || totalNights <= 1;

    try {
      if (useSingleWindow) {
        const data = await this.runLiveToolWithTimeout(
          () => this.mcpToolDispatcher!.executeTool('hotel', 'hotel.search', hotelSearchParams),
          ClaudeOrchestratorService.LIVE_TOOL_HOTEL_MS,
        );
        const latency_ms = Date.now() - hmStarted;
        audits.push({ tool_id: 'live_tool.mcp.hotel', ok: true, latency_ms });
        const segmentCi = ci.slice(0, 10);
        const tripNightDisp =
          tripWinStart && tripSpanNightsWhole
            ? diffCalendarDaysYmd(tripWinStart, segmentCi) + 1
            : 1;
        const wrapped = wrapSingleHotelPayload(data, {
          checkIn: ci,
          checkOut: co,
          ...(tripSpanNightsWhole != null ? { itineraryTotalNights: tripSpanNightsWhole } : {}),
          ...(tripId
            ? {
                hintZh: await this.buildStaySegmentLabelZh(
                  tripId,
                  segmentCi,
                  tripNightDisp,
                  tripSpanNightsWhole ?? Math.max(1, totalNights),
                ),
              }
            : {}),
          ...(!tripId && totalNights > 1 ? { wideWindowWithoutTrip: true } : {}),
        });
        const hotelRouteRunUi = wrapped ?? undefined;
        if (hotelRouteRunUi) {
          if (tripId) {
            await this.enrichHotelRouteRunUiPayloadWithAnchorDistances(
              hotelRouteRunUi,
              tripId,
              ci,
              request.message,
            );
          }
          await this.enrichHotelRouteRunUiPayloadWithDecisionSupport(hotelRouteRunUi, request, tripId);
          if (tripId) {
            hotelRouteRunUi.night_groups = await this.buildAccommodationNightGroupsForPayload(
              hotelRouteRunUi.accommodations,
              tripId,
              ci,
              Math.max(1, totalNights),
              userLimitedNightIntent &&
                (explicitNightScope?.length || inferredNightIndex0 !== null)
                ? {
                    includeOnlyNightIndices:
                      explicitNightScope?.length
                        ? explicitNightScope.map((i) => i + 1)
                        : [inferredNightIndex0! + 1],
                  }
                : undefined,
            );
            if (hotelRouteRunUi.night_groups?.length && hotelRouteRunUi.hotel_search_meta) {
              hotelRouteRunUi.hotel_search_meta.ui_layout_hint_zh =
                ClaudeOrchestratorService.HOTEL_UI_LAYOUT_HINT_ZH;
            }
          }
          if (hotelRouteRunUi) {
            this.stampHotelInventoryCapturedAt(hotelRouteRunUi);
          }
        }
        this.logger.log({
          tag: 'live_tool.mcp.hotel',
          request_id: request.request_id,
          ok: true,
          latency_ms,
          tripId: hotelSearchParams.tripId,
          mode: 'single_window',
        });
        return {
          audits,
          block: hotelRouteRunUi
            ? buildHotelSensorPromptBlockFromPayload(hotelRouteRunUi)
            : this.formatLiveHotelSensorBlock(data),
          ...(hotelRouteRunUi ? { hotelRouteRunUi } : {}),
        };
      }

      /** 多晚：按「每晚上一间」拆分检索；用户明确「第 N 晚」或正文写出具体单晚入住窗时只检索对应间夜，否则均匀采样（采样会跳过部分晚） */
      let indices: number[];
      if (explicitNightScope?.length) {
        indices = explicitNightScope;
      } else if (inferredNightIndex0 !== null) {
        indices = [inferredNightIndex0];
      } else if (opts?.fullTripReplan) {
        indices = pickFullTripReplanNightIndices(
          totalNights,
          ClaudeOrchestratorService.MAX_FULL_TRIP_REPLAN_HOTEL_NIGHTS,
        );
      } else {
        indices = pickSpreadNightIndices(totalNights, ClaudeOrchestratorService.MAX_HOTEL_NIGHT_SAMPLE_SEGMENTS);
      }
      if (indices.length > ClaudeOrchestratorService.MAX_HOTEL_NIGHT_SAMPLE_SEGMENTS) {
        indices = indices.slice(0, ClaudeOrchestratorService.MAX_HOTEL_NIGHT_SAMPLE_SEGMENTS);
      }
      const segments = await Promise.all(
        indices.map(async (nightIdx0) => {
          const segCheckIn = addDaysYmd(ci, nightIdx0);
          const segCheckOut = addDaysYmd(ci, nightIdx0 + 1);
          const windowNightOneBased = nightIdx0 + 1;
          const tripNightOneBased =
            tripWinStart && tripSpanNightsWhole
              ? diffCalendarDaysYmd(tripWinStart, segCheckIn) + 1
              : windowNightOneBased;
          const labelZh = await this.buildStaySegmentLabelZh(
            tripId!,
            segCheckIn,
            tripNightOneBased,
            tripSpanNightsWhole ?? totalNights,
          );
          return {
            checkIn: segCheckIn,
            checkOut: segCheckOut,
            nightIndex: windowNightOneBased,
            labelZh,
          };
        }),
      );

      const segmentRuns = await Promise.allSettled(
        segments.map(async (seg) => {
          const data = await this.runLiveToolWithTimeout(
            () =>
              this.mcpToolDispatcher!.executeTool('hotel', 'hotel.search', {
                ...hotelSearchParams,
                checkIn: seg.checkIn,
                checkOut: seg.checkOut,
              }),
            ClaudeOrchestratorService.LIVE_TOOL_HOTEL_MS,
          );
          return { data, segment: seg };
        }),
      );

      const parts: Array<{
        data: unknown;
        segment: (typeof segments)[0];
        maxListings?: number;
      }> = [];
      const maxListingsPerSegment =
        segments.length === 1
          ? ClaudeOrchestratorService.HOTEL_MCP_MAX_LISTINGS_SINGLE_NIGHT_SEGMENT
          : ClaudeOrchestratorService.HOTEL_MCP_MAX_LISTINGS_PER_MULTI_SEGMENT;
      for (const r of segmentRuns) {
        if (r.status === 'fulfilled') {
          parts.push({ data: r.value.data, segment: r.value.segment, maxListings: maxListingsPerSegment });
        }
      }

      const latency_ms = Date.now() - hmStarted;
      const merged =
        parts.length > 0
          ? mergeSegmentHotelSearchResults(parts, {
              stayWindowNightCount: totalNights,
              itineraryTotalNights: tripSpanNightsWhole,
              sampledNightIndices: segments.map((s) => s.nightIndex),
              userLimitedNightIntent,
              fullTripReplan: opts?.fullTripReplan === true,
            })
          : null;

      audits.push({
        tool_id: 'live_tool.mcp.hotel',
        ok: !!merged?.accommodations?.length,
        latency_ms,
        ...(!merged?.accommodations?.length
          ? {
              error: 'NO_HOTEL_RESULTS',
              orchestrator_robustness: classifyOrchestratorFailure(new Error('NO_HOTEL_RESULTS'), {
                orchestrator_step: 'INTAKE',
                tool_id: 'live_tool.mcp.hotel',
              }),
            }
          : {}),
      });

      this.logger.log({
        tag: 'live_tool.mcp.hotel',
        request_id: request.request_id,
        ok: !!merged?.accommodations?.length,
        latency_ms,
        tripId: hotelSearchParams.tripId,
        mode: opts?.fullTripReplan ? 'per_night_full_trip_replan' : 'per_night_sample',
        segments: segments.length,
        merged_cards: merged?.accommodations?.length ?? 0,
      });

      if (!merged) {
        return { audits, block: null };
      }

      await this.enrichHotelRouteRunUiPayloadWithAnchorDistances(
        merged,
        tripId!,
        ci,
        request.message,
      );

      await this.enrichHotelRouteRunUiPayloadWithDecisionSupport(merged, request, tripId);

      merged.night_groups = await this.buildAccommodationNightGroupsForPayload(
        merged.accommodations,
        tripId!,
        ci,
        totalNights,
        userLimitedNightIntent &&
          (explicitNightScope?.length || inferredNightIndex0 !== null)
          ? {
              includeOnlyNightIndices:
                explicitNightScope?.length ? explicitNightScope.map((i) => i + 1) : [inferredNightIndex0! + 1],
            }
          : undefined,
      );
      if (merged.hotel_search_meta) {
        merged.hotel_search_meta.ui_layout_hint_zh = ClaudeOrchestratorService.HOTEL_UI_LAYOUT_HINT_ZH;
      }
      this.stampHotelInventoryCapturedAt(merged);

      return {
        audits,
        block: buildHotelSensorPromptBlockFromPayload(merged),
        hotelRouteRunUi: merged,
      };
    } catch (e: any) {
      const latency_ms = Date.now() - hmStarted;
      const err = e?.message ? String(e.message) : String(e);
      audits.push({
        tool_id: 'live_tool.mcp.hotel',
        ok: false,
        latency_ms,
        error: err,
        orchestrator_robustness: classifyOrchestratorFailure(e, {
          orchestrator_step: 'INTAKE',
          tool_id: 'live_tool.mcp.hotel',
        }),
      });
      this.logger.warn({
        tag: 'live_tool.mcp.hotel',
        request_id: request.request_id,
        ok: false,
        latency_ms,
        error: err,
      });
      return { audits, block: null };
    }
  }

  /**
   * 为轻量咨询构造最小 DecisionContext，使 `RAG_REALITY_POLICY_ENFORCE` 开启时 `getBoundDecisionContext()` 非空，
   * 避免 `buildDataLookupRagSupplement` 被 `rag_soft_world_blocked` 短路。
   */
  private async buildLightweightDecisionContextForRealityGate(
    request: RouteAndRunRequestDto,
    effectiveTripId: string | undefined,
  ): Promise<DecisionContextV0> {
    const generated_at = new Date().toISOString();
    const rid = String(request.request_id ?? 'no_req').slice(0, 120);
    const tid = effectiveTripId?.trim() || undefined;
    let startYmd: string | undefined;
    let endYmd: string | undefined;
    let tripIdForSnap = tid;
    let region = 'consultation';

    if (tid) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tid },
        select: { destination: true, startDate: true, endDate: true },
      });
      if (trip) {
        const d = trip.destination.trim().toUpperCase();
        if (d === 'IS' || d.startsWith('IS-') || d.includes('ICELAND')) {
          region = 'iceland';
        } else {
          region = d.slice(0, 64) || 'consultation';
        }
        startYmd = trip.startDate.toISOString().slice(0, 10);
        endYmd = trip.endDate.toISOString().slice(0, 10);
      } else {
        tripIdForSnap = undefined;
      }
    }

    if (!startYmd || !endYmd) {
      const cc = this.extractCountryCodeFromMessage(request.message ?? '');
      if (cc) {
        region = cc.toLowerCase();
      }
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      startYmd = start.toISOString().slice(0, 10);
      endYmd = end.toISOString().slice(0, 10);
    }

    const planning_horizon = {
      start_at: `${startYmd}T00:00:00.000Z`,
      end_at: `${endYmd}T23:59:59.999Z`,
    };

    const consistency: RealityConsistencyV0 = { max_staleness_sec: 0, degraded: false };
    const snapshot: RealitySnapshotV0 = {
      schema: REALITY_SNAPSHOT_SCHEMA_V0,
      snapshot_id: computeRealitySnapshotId(generated_at, tripIdForSnap, rid),
      valid_at: generated_at,
      generated_at,
      domain: { region },
      layers: {} as RealitySnapshotLayersV0,
      consistency,
      validity: buildSnapshotValidityV0(consistency),
      provenance: {
        generated_by: 'claude_orchestrator.lightweight_knowledge_qa',
        source_versions: { bound: '1' },
      },
    };
    return buildDecisionContextV0(snapshot, planning_horizon);
  }

  /**
   * 团队结构化讨论：禁止落入 QA_LIGHT 住宿长文；与 `tryBuildTeamStructuredDiscussionFastPath` 对齐。
   */
  private async orchestrateTeamStructuredDiscussionBypass(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    message: string,
    startTime: number,
  ): Promise<OrchestrationResult> {
    const tripId = (context.tripId || request.trip_id || '').trim();
    const userId = (context.userId || request.user_id || '').trim();
    let memberCount = 1;
    let hint: ProcessFairnessOrchestrationHint = {
      triggered: false,
      status: 'SCAFFOLD',
      decisionNode: primaryDecisionNodeFromMessage(message),
      roundId: null,
      round: null,
      agentIntroZh: null,
      clientNavigation: null,
      skippedReason: !userId ? 'missing_user_id' : !this.preferenceRoundOrchestrator ? 'orchestrator_unavailable' : undefined,
    };

    if (this.preferenceRoundOrchestrator && tripId && userId) {
      try {
        memberCount = await this.preferenceRoundOrchestrator.countTripMembers(tripId);
        hint = await this.preferenceRoundOrchestrator.tryAutoStartForRequest({
          tripId,
          userId,
          message,
        });
      } catch (e: any) {
        this.logger.warn(
          `[Claude Orchestrator] team structured discussion orchestrator failed: ${e?.message ?? e}`,
        );
        hint = { ...hint, skippedReason: hint.skippedReason ?? 'orchestrator_error' };
      }
    }

    let tripName: string | null = null;
    if (tripId) {
      try {
        const row = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { name: true },
        });
        tripName = row?.name ?? null;
      } catch {
        tripName = null;
      }
    }

    const answerText = buildTeamStructuredDiscussionAnswer({
      message,
      tripName,
      memberCount,
      hint,
    });
    const suggestedOperations = buildProcessFairnessSuggestedOperations(hint);
    const doneAt = Date.now();

    return {
      success: true,
      answerText,
      result: {
        routingDecision: {
          route: 'SYSTEM2_REASONING',
          confidence: 0.92,
          reasoning: 'team_structured_discussion_bypass',
          budget: { max_seconds: 8, max_steps: 0, max_browser_steps: 0 },
          requiredCapabilities: ['process_fairness'],
          consentRequired: false,
          selected_path: 'TEAM_STRUCTURED_DISCUSSION',
        },
        trip_id: tripId,
        ui_surface: 'consultation' as const,
        process_fairness: hint,
        ...(suggestedOperations.length ? { suggested_operations: suggestedOperations } : {}),
        teamStructuredDiscussionBypass: true,
        routingTaskType: context.routingTaskType,
      },
      stepsExecuted: [],
      totalDuration: doneAt - startTime,
      decisionLog: [
        {
          request_id: request.request_id,
          step: 'GATE_EVAL',
          actor: 'Orchestrator',
          inputs_summary: 'team_structured_discussion QA_LIGHT bypass',
          outputs_summary: hint.triggered
            ? `process_fairness round_id=${hint.roundId}`
            : `process_fairness skipped=${hint.skippedReason ?? 'n/a'}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: hint.triggered
              ? 'PROCESS_FAIRNESS_ROUND_STARTED'
              : 'PROCESS_FAIRNESS_DISCUSSION_SCAFFOLD',
            decision_node: hint.decisionNode,
            round_id: hint.roundId,
            client_navigation: hint.clientNavigation,
          },
        },
      ],
    };
  }

  /**
   * 轻量知识问答：与路由层 DATA_LOOKUP / GENERIC_QA / RAG_QA 对齐，跳过 Skill 选择与 itinerary 类缺参校验。
   */
  private async orchestrateLightweightKnowledgeQuery(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline: { remainingMs: () => number } | undefined,
    llmProvider: LlmProvider,
    startTime: number,
  ): Promise<OrchestrationResult> {
    const effectiveTripId = (context.tripId || request.trip_id)?.trim() || undefined;
    const clockFactOnly = isLocalClockOrTimezoneFactQuery(request.message ?? '');
    const macroStatFactOnly = isFactualMacroStatQuery(request.message ?? '');
    /** 当地时间 / 人口面积等「短事实」：勿注入行程摘要、勿要求 Dashboard JSON（避免模型把指令标题复述进正文） */
    const lightweightTriviaFact = clockFactOnly || macroStatFactOnly;

    const executeLightweightKnowledgeBody = async (): Promise<OrchestrationResult> => {
      let tripContextLines: string[] = [];
      let wishlistInjectedForTrip = false;
      if (effectiveTripId && !lightweightTriviaFact) {
      const summary = await this.resolveTripPromptSummaryForLightweightQa(effectiveTripId, request);
      if (summary) {
        tripContextLines = [
          '以下为本系统中该关联行程的已知信息（请据此回答季节、时长与目的地相关建议；勿声称无法读取日期或行程概况；未列出的活动/住宿等细节仍勿编造）：',
          summary,
        ];
      }
      try {
        const wishBlock = await loadWishlistPromptInjectionForAgent(
          this.prisma,
          effectiveTripId,
          request.user_id?.trim(),
        );
        if (wishBlock) {
          wishlistInjectedForTrip = true;
          if (tripContextLines.length === 0) {
            tripContextLines = [
              '以下为本系统中该关联行程的已知信息（含愿望单；勿声称无法读取用户心愿）：',
            ];
          }
          tripContextLines.push(wishBlock);
        }
      } catch (e: any) {
        this.logger.warn(
          `[LightweightQA] wishlist inject failed trip_id=${effectiveTripId}: ${e?.message ?? e}`,
        );
      }
    }
    if (effectiveTripId && tripContextLines.length === 0 && !lightweightTriviaFact) {
      tripContextLines = [
        `关联行程 ID：${effectiveTripId}（后台未查到对应行程记录，或请求未携带 trip_id；仅可根据问题做一般性建议，勿编造具体日程）。`,
      ];
    }

    const fitnessLines = readFitnessProfileLinesForLightweightQa(request);
    if (fitnessLines && fitnessLines.length > 0 && !lightweightTriviaFact) {
      tripContextLines = tripContextLines.length > 0 ? [...tripContextLines, '', ...fitnessLines] : [...fitnessLines];
    }

    const icelandMarketPrior = readIcelandMarketPriorForLightweightQa(request);
    if (icelandMarketPrior && !lightweightTriviaFact) {
      tripContextLines =
        tripContextLines.length > 0
          ? [...tripContextLines, '', icelandMarketPrior]
          : [icelandMarketPrior];
    }

    const hasAnchoredTripFact = tripContextLines.some(
      (l) => l.includes('目的地代码:') || l.includes('开始日期:') || l.includes('行程跨度'),
    );

    const tripCtxJoined = tripContextLines.join('\n');
    const diningLookupIntent = isDiningRecommendationQuery(request.message ?? '');
    const diningAnchoredInMessage = messageHasDiningLocationAnchor(request.message ?? '');
    const itineraryDraftHasItems =
      Boolean(effectiveTripId) && tripSummaryIndicatesNonEmptyItineraryDraft(tripCtxJoined);

    const msgLower = (request.message ?? '').trim().toLowerCase();
    const ontologyHitDefs = lightweightTriviaFact
      ? []
      : collectMatchedOntologyRegionDefinitions({
          message: request.message ?? '',
          msgLower,
          tripContextText: tripCtxJoined,
        });
    let roadStatusByOntologyId: Map<string, OntologyRegionRoadStatusPayload> | undefined;
    let ontologyRoadStatusFetchMs = 0;
    if (!lightweightTriviaFact && ontologyHitDefs.length > 0 && this.ontologyRoadStatusProvider) {
      const tOnt = Date.now();
      roadStatusByOntologyId = await this.ontologyRoadStatusProvider.summarizeForOntologyNodeIds(
        ontologyHitDefs.map((d) => d.ontologyNodeId),
      );
      ontologyRoadStatusFetchMs = Math.max(0, Date.now() - tOnt);
    }
    const hardOntologyAppendixLines = lightweightTriviaFact
      ? []
      : buildLightweightHardOntologyAppendixLines({
          message: request.message ?? '',
          msgLower,
          tripContextText: tripCtxJoined,
          roadStatusByOntologyId,
        });
    const ontologyEvidenceDisplayZh = lightweightTriviaFact
      ? []
      : buildOntologyEvidenceDisplayLinesZh({ hits: ontologyHitDefs, roadStatusByOntologyId });
    const weatherRoadFocused = isWeatherRoadConditionFocusedQuery(request.message ?? '');
    const todayWeatherFocused = isTodayWeatherFactQuery(request.message ?? '');
    const westfjordsAirConsult = isWestfjordsLegTransportPreferenceConsultation(
      request.message ?? '',
      msgLower,
    );
    const tripStatusOverview =
      Boolean(effectiveTripId) &&
      isTripStatusOverviewQuery(request.message ?? '', msgLower) &&
      !weatherRoadFocused;
    const tripLodgingDiningPlan =
      Boolean(effectiveTripId) &&
      isBoundTripLodgingDiningPlanQuery(request.message ?? '', msgLower) &&
      !tripStatusOverview &&
      !weatherRoadFocused;
    let lunchStrategyPromptLines: string[] = [];
    if ((tripStatusOverview || tripLodgingDiningPlan) && effectiveTripId) {
      try {
        const tripForLunch = await this.prisma.trip.findUnique({
          where: { id: effectiveTripId },
          select: { metadata: true, pacingConfig: true, destination: true },
        });
        if (tripForLunch) {
          lunchStrategyPromptLines = buildLunchStrategyPromptLines(tripForLunch);
        }
      } catch (e: any) {
        this.logger.warn(
          `[LightweightQA] lunch strategy briefing failed trip_id=${effectiveTripId}: ${e?.message ?? e}`,
        );
      }
    }
    const needsNamedDraftAppendixForLightweight =
      shouldIncludeNamedDraftAppendixForLightweightConsultation({
        message: request.message ?? '',
        msgLower,
        contextType: request.conversation_context?.context_type,
      });
    const msgForNamedPoi = request.message ?? '';
    const prepOrHikeNamedPoiConsult =
      Boolean(effectiveTripId) &&
      needsNamedDraftAppendixForLightweight &&
      !westfjordsAirConsult &&
      !this.isCarRentalOrDrivingTravelQuery(msgForNamedPoi) &&
      (this.isPreparationGearTravelQuery(msgForNamedPoi) ||
        /徒步|登山|爬山|步道|长线|\b(hiking|trekking|trail)\b/i.test(msgForNamedPoi));
    const carRentalNamedPoiConsult =
      Boolean(effectiveTripId) &&
      needsNamedDraftAppendixForLightweight &&
      !westfjordsAirConsult &&
      !weatherRoadFocused &&
      this.isCarRentalOrDrivingTravelQuery(msgForNamedPoi);
    /** 绑定行程的轻量问：规划阶段不跑 Readiness Pack */
    const skipReadinessPack = shouldSkipAgentReadinessPackCheck(
      request,
      parseTripStartDateFromContextLines(tripContextLines),
      request.message ?? '',
    );
    const wantReadinessForLightweight =
      Boolean(effectiveTripId) &&
      !lightweightTriviaFact &&
      !!this.readinessService &&
      !skipReadinessPack;

    const shouldStPull =
      !lightweightTriviaFact &&
      shouldPullSafetravelAdvisoriesForLightweightIceland({
        message: request.message ?? '',
        tripContextJoined: tripCtxJoined,
        hasAnchoredTripFact,
        weatherRoadFocused,
      });
    const stSkill = this.safetravelGetAdvisoriesSkill;
    const stPullP =
      shouldStPull && stSkill
        ? (async () => {
            const t0 = Date.now();
            try {
              const out = await stSkill.execute({ max_items: 40 });
              return { out, ms: Math.max(0, Date.now() - t0) };
            } catch (e: any) {
              this.logger.warn(
                `[Lightweight] SafeTravel.get_advisories failed request_id=${request.request_id}: ${e?.message ?? e}`,
              );
              return { out: null as SafetravelGetAdvisoriesOutput | null, ms: 0 };
            }
          })()
        : Promise.resolve({ out: null as SafetravelGetAdvisoriesOutput | null, ms: 0 });

    const [wBranch, fBranch, hBranch, rBranch, readinessSupplement, structuredRagBiasZh, gBranch, stPack] = lightweightTriviaFact
      ? [
          { audits: [] as LiveSensorAuditRow[], block: null },
          { audits: [] as LiveSensorAuditRow[], block: null },
          { audits: [] as LiveSensorAuditRow[], block: null },
          { audits: [] as LiveSensorAuditRow[], block: null },
          null as string | null,
          undefined as string | undefined,
          {
            audits: [] as LiveSensorAuditRow[],
            guidance: null as IcelandRentalGuidanceOutput | null,
            promptLines: [] as string[],
            footnotesZh: [] as string[],
          },
          { out: null as SafetravelGetAdvisoriesOutput | null, ms: 0 },
        ]
      : await Promise.all([
          this.runLiveWeatherSensorBranch(request, context, effectiveTripId),
          this.runLiveFlightSensorBranch(request, context, effectiveTripId),
          this.runLiveHotelSensorBranch(request, context, effectiveTripId),
          this.runLiveCarRentalSensorBranch(request, context, effectiveTripId),
          this.runLightweightReadinessSupplement(effectiveTripId, request.message ?? '', wantReadinessForLightweight),
          this.resolveTripnaraStructuredRagBiasForLightweight(request),
          this.runIcelandRentalGuidanceLightweightBranch(request, tripCtxJoined),
          stPullP,
        ]);
    const tripHealthSupplement =
      (tripStatusOverview || tripLodgingDiningPlan) && effectiveTripId
        ? await this.runLightweightTripHealthSupplement(effectiveTripId)
        : null;
    const liveSensorAudit: LiveSensorAuditRow[] = [
      ...wBranch.audits,
      ...fBranch.audits,
      ...hBranch.audits,
      ...rBranch.audits,
      ...gBranch.audits,
    ];

    const anchoredIcelandTrip =
      hasAnchoredTripFact && /目的地代码:\s*IS\b|国家代码:\s*IS\b/i.test(tripCtxJoined);

    const redFf = lightweightTriviaFact
      ? null
      : evaluateIcelandLightweightRedAlertFastFail({
          message: request.message ?? '',
          tripContextJoined: tripCtxJoined,
          safetravel_alerts: stPack.out?.safetravel_alerts ?? [],
          gate_recommendation: stPack.out?.gate_recommendation,
          anchoredIcelandTrip,
        });

    const icelandFf = lightweightTriviaFact
      ? null
      : evaluateIcelandLightweightFroad2wdFastFail({
          message: request.message ?? '',
          tripContextJoined: tripCtxJoined,
          structuredStartYmd: request.structured_travel_input?.start_date,
        });

    const ragPayload = lightweightTriviaFact
      ? {
          supplement: null as string | null,
          citations: [] as Array<{
            chunk_id: string;
            file_id: string;
            document_title: string;
            source_file?: string;
            category: 'practical' | 'risks' | 'pois' | 'decision_support';
            credibility_score?: number;
          }>,
        }
      : await this.buildDataLookupRagSupplement(request.message, structuredRagBiasZh);
    const ragSupplement = ragPayload.supplement;

    const inventory_snapshots_meta = buildInventorySnapshotsMeta({
      weather: wBranch.snapshotCapturedAtIso,
      flight: fBranch.flight_inventory_snapshot?.captured_at_iso,
      hotel: hBranch.hotelRouteRunUi?.hotel_search_meta?.captured_at_iso,
      car_rental: rBranch.carRentalSearchMeta?.captured_at_iso,
    });
    const narrativeSafety = evaluateNarrativeSafety(inventory_snapshots_meta);

    const lightweightNow = new Date();
    const tripDatesForTemporal = parseTripDatesFromLightweightContext(tripCtxJoined);
    const daysUntilTripStart = computeDaysUntilTripStartYmd(
      tripDatesForTemporal.startYmd,
      lightweightNow,
    );
    const temporalGroundingLines = lightweightTriviaFact
      ? []
      : buildLightweightTemporalGroundingZhLines(lightweightNow, {
          tripStartYmd: tripDatesForTemporal.startYmd,
          tripEndYmd: tripDatesForTemporal.endYmd,
        });

    const prompt = [
      ...(clockFactOnly
        ? ['你是专业旅行顾问。', ...this.buildLightweightClockFactPromptLines(request.message ?? '')]
        : macroStatFactOnly
          ? ['你是专业旅行顾问。', ...this.buildLightweightMacroStatFactPromptLines()]
          : [
              '你是专业旅行顾问。当前请求被路由为「咨询/检索」类（非完整多日行程 JSON 生成）。',
              '请用清晰中文回答：可包含预算区间、油价/租车参考、门票大致范围；无法确定时请说明假设。',
              ...temporalGroundingLines,
            ]),
      ...(ragSupplement
        ? [
            '若下文提供「知识库检索摘录」，正文中如采用其中事实，请用摘录里《文档名》一致地标注来源（可简写为「据《…》」）。',
          ]
        : []),
      ...(hasAnchoredTripFact
        ? [
            '检测到当前处于已绑定行程的会话：上文摘要含目的地代码与出行区间。即使用户未在问题中复述地名，也必须仅基于该目的地与时间区间作答。',
            '上文若已列出目的地代码与行程日期，你必须以此为准作答；禁止声称「用户未指定目的地/季节/行程」，除非摘要块确实缺失这些字段。',
          ]
        : []),
      ...(westfjordsAirConsult
        ? [
            '【本轮主旨】用户关注雷克雅未克与冰岛西北部（西峡湾）之间的接驳（如不自驾、改为国内航班/小飞机、之后再租车）。若上文含「草案地点速览」，**必须在正文中点名**与用户所述路段相关的具体地点/日期（可说明哪些天要改接驳、哪些活动可保留）；同时用「按日骨架」对齐活动密度。若速览中某点明显不在首都圈—西北部主线或明显陈旧，须如实提示并建议工作台核对。另请覆盖岛内/支线航班、订票与行李、落地租车与路况核验。',
          ]
        : []),
      ...(weatherRoadFocused
        ? [
            '【本轮主旨】用户主要关心目的地**近期天气要点**与**道路/风况/封路或官方出行提示**，请结合上文行程的**日期与经过区域**组织回答。',
            '优先使用下文「实时天气传感器」摘录（若有）、准备度与知识库中与气象、大风开门、封路或行车相关的条目；若无可靠实时摘录，须说明时效与信息来源限制，并给出官方核验渠道示例（如 vedur.is、road.is、SafeTravel）。',
            '说明「当前无法拿到某类实时数据」时，必须以【UTC 参考 / 当前时刻】与【相对行程】中的日期计算距出发天数；禁止编造「当前是某年某月」或与 UTC 参考不一致的年月。',
            '**不要**套用「行程进度/概览」式结构去展开住宿、餐饮、亮点盘点或长篇租车攻略；除非用户同时明确要求评估行程总体准备度。',
          ]
        : []),
      ...(todayWeatherFocused && !weatherRoadFocused
        ? [
            '【本轮主旨】用户问的是**今日/当前实况天气**。若下文有「实时天气传感器 MCP」摘录，**首段须直接给出**观测地、气温、天气状况与风速；禁止用季节气候常识或「超出预报窗口」话术替代已有实况读数。',
            '若无传感器摘录，须明确说明拉取失败，并给出 vedur.is 等官方核验入口；勿编造具体温度或降水。',
          ]
        : []),
      ...(prepOrHikeNamedPoiConsult
        ? [
            '【本轮主旨】用户关心行前装备、衣物、清单或徒步相关准备。若上文含「草案地点速览」，请在正文中按日或按活动点名与建议相关的具体地点或徒步段（可与「按日骨架」中的类型与数量对照）；勿编造速览中未出现的 POI；若骨架显示无徒步或户外类日程项，须明确说明并仅给目的地与季节级泛化建议。',
          ]
        : []),
      ...(carRentalNamedPoiConsult
        ? [
            '【本轮主旨】用户关心租车、自驾、路况或用车。若上文含「草案地点速览」与「按日骨架」，正文须结合**草案中的 Place 名或备注**与**各日日程项类型**，说明取还车城镇是否与过夜地/活动衔接合理、哪些日可能长距驾驶或涉及碎石路/F 路等（勿编造速览未出现的地点）；若骨架未体现用车需求，须如实说明并给目的地级建议。',
          ]
        : []),
      ...(tripStatusOverview
        ? skipReadinessPack
          ? buildPlanningPhaseTripOverviewPromptLines()
          : [
            '【行程进度/概览问法】用户关心的是当前草稿的整体状态（准备度、吃住是否有着落、有无明显不合理），而非仅复述时间轴或罗列景点卡片。',
            '请按以下结构组织回答（小标题可用 `-` 或加粗，保持简洁）：',
            '- **当前摘要**：一句话说明行程覆盖的核心区域/城市或路线主轴。',
            '- **住宿**：基于上文摘要与日程草案判断——是否已体现酒店/民宿预订或过夜城镇；若仅有日间景点而无住宿线索，须明确写「当前摘要未显示住宿预订，建议补充」或等价表述；勿编造预订记录。',
            '- **餐饮**：草案或摘要中是否安排了午餐/晚餐或留出用餐时段；若仅有景点时段而无餐饮安排，须点名缺口并建议（例如在哪些城镇预留正餐时间）；勿编造具体餐厅名除非摘录或日程已给出。午餐时间窗是体力回血与情绪复位的隐形安全线——须结合下方【午餐时间窗策略】说明为何重要及如何改。',
            ...(lunchStrategyPromptLines.length > 0 ? lunchStrategyPromptLines : []),
            '- **亮点介绍**：1–2 点最吸引人的安排（基于上文摘要与已知日程事实，勿编造未出现的 POI）。',
            '- **不合理与风险（须直接可执行）**：若存在过密、绕路、衔接过紧、季节/路况或体力不匹配等问题，请**直接给出改法**；若无明显问题，写「未发现明显硬伤」。',
            '- **行程健康度（analyzeHealth）**：须引用下方「行程健康度体检」摘录；**仅衡量时间轴结构**（冲突/节奏/预算），100 分不代表可出发。',
            '- **出发准备度（Readiness Pack）**：须引用下方「出发准备度」摘录中的 **xx/100 分数与阻塞项**；与工作台左侧准备度面板口径一致，**禁止用健康度分数替代准备度**。',
            '- **准备度小结**：基于准备度分数给出档位（高/中/低）并列出 2～4 条最关键的待办（证件、保险、装备、预订缺口等）。',
            '【Dashboard 强约束】此类问法且已绑定行程时：`<<<CONSULTATION_UI_JSON>>>` 块**禁止省略**；`summary_cards` 至少 4 张，语义分别覆盖：**预算区间与口径**、**驾驶或日程强度/松紧**、**核心游览区域或主轴**、**最大风险或优先优化点**（标题可用简短中文；value/hint 与正文一致）。',
          ]
        : []),
      ...(tripLodgingDiningPlan
        ? [
            '【住宿+餐饮方案问法】用户要的是**按晚/按日**的住宿与用餐策略（结合当前草稿路线），而非整段重规划或仅复述 Abu 门控结论。',
            '请按以下结构组织回答（小标题可用 `-` 或加粗，保持简洁）：',
            '- **路线与分晚主轴**：结合上文摘要说明覆盖区域（如黄金圈→南岸→冰河湖）及各晚建议过夜城镇/锚点。',
            '- **逐晚住宿建议**：按第 1 晚、第 2 晚…列出推荐城镇与选店思路（预算档、距次日首站距离、是否需提前订）；若下文有「实时住宿 MCP」摘录，须引用其中的区域/价格线索，勿编造未出现的房源名。',
            '- **每日用餐策略**：按日说明早餐/午餐/晚餐安排思路（城镇正餐 vs 沿途简餐、预订窗口、午餐时间窗与体力）；须结合下方【午餐时间窗策略】（若有）。',
            '- **与当前草稿对齐**：对照「当前已入库日程草案」与「按日骨架」，点名哪些天已有/缺少住宿、餐饮时段或 **TRANSIT/交通** 衔接；若仅 1 个景点或缺交通段，须明确写为缺口并建议补全。',
            '- **出发准备度 vs 行程健康度**：须分别引用下方摘录——**准备度 xx/100 + 阻塞项**（与工作台左侧面板一致）与 **健康度 analyzeHealth**（仅结构冲突/节奏）；健康度 100 时若准备度低，须明确写「结构无冲突但尚不可出发」。',
            '- **优先行动**：列出 2～4 条可执行下一步（订哪几晚、在哪天补交通、哪顿需预约等）。',
            '【Dashboard 强约束】已绑定行程时：`<<<CONSULTATION_UI_JSON>>>` 块**禁止省略**；`summary_cards` 至少 4 张，语义分别覆盖：**住宿预算与分晚城镇**、**餐饮/午餐策略要点**、**路线主轴或核心区域**、**最大缺口或风险**（与正文一致）。',
          ]
        : []),
      ...tripContextLines,
      ...(hardOntologyAppendixLines.length > 0 ? hardOntologyAppendixLines : []),
      ...(readinessSupplement
        ? [
            '【出发准备度摘录（Readiness Pack + 工作台 /score 同源）】衡量能否出发（证据覆盖、交通确定性、阻塞项等）。正文「准备度小结」须引用此处 **xx/100** 与阻塞清单；**禁止**用下方 analyzeHealth 分数替代。',
            readinessSupplement,
          ]
        : []),
      ...(tripHealthSupplement
        ? [
            '【行程健康度体检（detail.analyzeHealth）】仅衡量当前时间轴的结构合理性（时间冲突、节奏、预算维度）；100/100 表示无日程冲突，**不代表**住宿/交通/证件已齐。勿将此分数当作「出发准备度」。',
            tripHealthSupplement,
          ]
        : []),
      ...(effectiveTripId &&
      diningLookupIntent &&
      !diningAnchoredInMessage &&
      itineraryDraftHasItems
        ? [
            '【餐饮推荐锚点】用户正在询问用餐/餐厅/美食推荐；上文「当前已入库日程草案」中已有日程项。',
            '请先基于草案逐日列出与用户问题相关的候选站点或活动附近的用餐场景（引用草案中的日期与地点名称，勿编造未列出的 POI），再请用户明确其一（例如回复「第几天」或「在××附近」）。在用户选定锚点之前，勿代替用户选定某一天或某一站点并展开长篇餐厅清单；可概括该区域餐饮类型与预订注意事项。',
            '若用户已在问题中写明具体区域、地标或哪一天（例如黄金圈、间歇泉、第一天），则跳过上述追问，直接围绕该锚点作答。',
          ]
        : []),
      ...(effectiveTripId &&
      diningLookupIntent &&
      !diningAnchoredInMessage &&
      !itineraryDraftHasItems
        ? [
            '【餐饮推荐】用户询问用餐/餐厅推荐，但当前库内日程草案为空或无日程项：请先简要说明无法绑定具体日程站点，再给目的地通用用餐思路（类型、价位带、预订提示）；可邀请用户在工作台补充日程后再问「某一天或某一站附近吃什么」。',
          ]
        : []),
      ...(effectiveTripId &&
      wishlistInjectedForTrip &&
      isActivityRecommendationQuery(request.message ?? '')
        ? [
            '【活动推荐 · 愿望单优先】用户正在索取活动/体验推荐；上文「行程愿望单」含其私密或团队心愿（含其他成员已匿名私密条目）。',
            '正文须**优先**对照愿望单中的活动类条目给出 2～4 条可执行建议，并说明与当前草案日程/驾驶强度的衔接；勿只给泛化目的地攻略而忽略愿望单。',
            '对其他成员私密愿望：可纳入统筹建议，但**勿透露或猜测**具体是谁写的。',
            '可补充未列入愿望单但顺路的备选；若愿望与季节/路程冲突，须如实说明并给改期或替代方案。',
          ]
        : []),
      ...(wBranch.block ? [wBranch.block] : []),
      ...(fBranch.block
        ? [
            '若上文含「Amadeus Flight Offers」或「Flight MCP」航班摘录，正文须区分各航段（进岛/离境），并说明默认出发枢纽可改；不得将航班报价与住宿清单混为一谈；**禁止**在已提供摘录时仍声称「系统无法检索实时航班」或「暂时拿不到报价」。',
            fBranch.block,
          ]
        : []),
      ...(hBranch.block ? [hBranch.block] : []),
      ...(rBranch.block
        ? [
            '若上文含「实时租车检索 MCP」摘录，正文可概括车型档位与价格区间，并注明以预订平台实时报价为准。',
            rBranch.block,
          ]
        : []),
      ...(redFf?.hit ? ['', ...redFf.promptLines] : []),
      ...(gBranch.promptLines.length ? ['', ...gBranch.promptLines] : []),
      ...(icelandFf?.hit ? ['', ...icelandFf.promptLines] : []),
      ...(hBranch.hotelRouteRunUi?.hotel_search_meta?.strategy === 'per_night_sample'
        ? [
            '上文住宿数据已按行程拆成「每晚上一间」的采样（卡片含中文锚点），请勿建议用户用同一房源覆盖全程所有夜晚；环岛/多地线路应在不同城镇分段预订。',
          ]
        : []),
      ...(hBranch.hotelRouteRunUi?.accommodations?.length
        ? [
            '【界面与正文分工】结果载荷已包含结构化房源与 accommodation_night_groups（按晚分组）。正文请勿使用「住宿推荐方案」等标题逐晚罗列房源英文名、价格或星级，勿复制卡片清单。',
            '正文仅保留较短策略：环岛/分段住宿思路、预订顺序与注意事项。未采样到的夜晚用一两句话说明可后续补充查询即可。',
          ]
        : []),
      ...buildNarrativeSafetyPromptLines(narrativeSafety),
      ...(ragSupplement ? [ragSupplement] : []),
      ...(effectiveTripId && !lightweightTriviaFact
        ? [
            '【系统块 CONSULTATION_UI】在正文之后、`<<<SUGGESTED_OPS_JSON>>>` **之前**，输出一段机器可读的单行 JSON 对象（**禁止**在用户可见正文里写「Dashboard」「Dashboard JSON」或与本指令同级的标题行）。用标记包裹：',
            `第一行仅写：${'<<<CONSULTATION_UI_JSON>>>'}`,
            '第二行至结束标记前：单行合法 JSON 对象，字段示例（version 固定为 1）：headline（Hero 一句话结论）、subheadline；score_dimensions[{id,label,level(low|medium|high|extreme|unknown),short_note}]；summary_cards[{id,title,value,hint,tone(neutral|positive|warning|danger)}]（建议 4 张：预算/驾驶或强度/亮点区域/最大风险）；risks[{id,level(low|medium|high),title,detail,suggestions}]；daily_plan[{day_index,title,segments[{time,label,detail,risk_badge}]}]（简版时间轴）；budget{currency,total_range_label,breakdown[]}；booking_deadlines[{id,title,urgency(now|soon|flexible),note}]；map{nodes[{label,kind}],path_coordinates[[lng,lat],...]}（无可靠坐标则省略 path_coordinates）。',
            '内容须与正文一致；不得编造未出现的地名或预订记录；无法结构化时可整块省略。',
            `最后一行仅写：${'<<<END_CONSULTATION_UI_JSON>>>'}`,
            '【系统块 SUGGESTED_OPS】在向用户展示正文与 CONSULTATION_UI 块之后，必须额外输出一段机器可读 JSON（**禁止**在用户可见正文里写「一键操作」类标题或复述该 JSON）。格式严格如下（各占一行）：',
            `第一行仅写：${'<<<SUGGESTED_OPS_JSON>>>'}`,
            '第二行起至结束标记前：单行合法 JSON 数组，元素字段：id（英文短键）、label（按钮文案≤18字）、kind（仅 route_and_run_message 或 client_navigation）、payload（对象）。',
            '—— route_and_run_message：payload.message 为完整中文指令，用户点击后作为新一轮对话发给助手（用于「按建议改行程」）；须贴合你在正文「风险与优化」里的具体结论。',
            '—— client_navigation：payload.route 只能为 timeline / replay / planning / itinerary / decision_cockpit 之一；并须在 payload 中带 trip_id（值等于当前关联行程）。',
            '数组长度 2～4；至少包含 1 条 route_and_run_message。',
            `最后一行仅写：${'<<<END_SUGGESTED_OPS_JSON>>>'}`,
          ]
        : []),
      '',
      `用户问题：${request.message}`,
    ]
      .filter(Boolean)
      .join('\n');

    let answerText: string;
    let repairStartedAt = 0;
    let narrativeIntegrityReport: NarrativeIntegrityReport | undefined;
    let llmNetworkFallback: { provider: LlmProvider; error_message: string } | undefined;
    const lightweightHttpTimeoutMs = this.resolveLightweightLlmHttpTimeoutMs();
    const lightweightLlmTokenBase: Pick<
      LlmTokenContext,
      'http_timeout_ms' | 'on_llm_network_fallback'
    > = {
      http_timeout_ms: lightweightHttpTimeoutMs,
      on_llm_network_fallback: (info) => {
        llmNetworkFallback = info;
      },
    };

    try {
      answerText = await this.llmService.callLlmWithSchema(
        llmProvider,
        prompt,
        undefined,
        {
          request_id: request.request_id,
          state_machine_step: 'INTAKE' as OrchestrationStep,
          sub_agent: 'Orchestrator' as SubAgentType,
          ...lightweightLlmTokenBase,
        },
      );

      const anchoredForRepair =
        hasAnchoredTripFact && tripContextLines.some((l) => l.includes('事实签名'));
      if (anchoredForRepair && this.lightweightAnswerImpliesMissingTripContext(answerText)) {
        repairStartedAt = Date.now();
        const repairPrompt =
          prompt +
          '\n\n【系统纠正】摘要已锁定目的地与日期（见上文「事实签名」）。请重写回答：删除索要目的地或声称「未告知目的地/未指定地点」的语句，直接给出针对该目的地与出行区间的建议。' +
          (effectiveTripId && !lightweightTriviaFact
            ? `\n\n【输出完整性】若上文要求输出 ${'<<<CONSULTATION_UI_JSON>>>'} … ${'<<<END_CONSULTATION_UI_JSON>>>'} 以及 ${'<<<SUGGESTED_OPS_JSON>>>'} … ${'<<<END_SUGGESTED_OPS_JSON>>>'}，重写后仍须在文末按顺序保留更新后的两块（先 Dashboard 单行对象，再建议操作单行数组）。`
            : '');
        answerText = await this.llmService.callLlmWithSchema(llmProvider, repairPrompt, undefined, {
          request_id: request.request_id,
          state_machine_step: 'INTAKE' as OrchestrationStep,
          sub_agent: 'Orchestrator' as SubAgentType,
          ...lightweightLlmTokenBase,
        });
      }

      if (
        !lightweightTriviaFact &&
        temporalGroundingLines.length > 0 &&
        shouldRepairLightweightTemporalHallucination(answerText, lightweightNow, {
          daysUntilTripStart,
        })
      ) {
        repairStartedAt = repairStartedAt || Date.now();
        const temporalRepairPrompt =
          prompt +
          buildLightweightTemporalRepairSuffix(lightweightNow, {
            tripStartYmd: tripDatesForTemporal.startYmd,
            tripEndYmd: tripDatesForTemporal.endYmd,
          }) +
          (effectiveTripId && !lightweightTriviaFact
            ? `\n\n【输出完整性】若上文要求输出 ${'<<<CONSULTATION_UI_JSON>>>'} … ${'<<<END_CONSULTATION_UI_JSON>>>'} 以及 ${'<<<SUGGESTED_OPS_JSON>>>'} … ${'<<<END_SUGGESTED_OPS_JSON>>>'}，重写后仍须在文末按顺序保留更新后的两块。`
            : '');
        answerText = await this.llmService.callLlmWithSchema(
          llmProvider,
          temporalRepairPrompt,
          undefined,
          {
            request_id: request.request_id,
            state_machine_step: 'INTAKE' as OrchestrationStep,
            sub_agent: 'Orchestrator' as SubAgentType,
            ...lightweightLlmTokenBase,
          },
        );
        this.logger.warn(
          `[Lightweight] temporal hallucination repair request_id=${request.request_id} utc=${lightweightNow.toISOString()}`,
        );
      }

      const integrityOutcome = await enforceNarrativeIntegrityPipeline({
        answerText,
        safety: narrativeSafety,
        basePrompt: prompt,
        callLlm: (retryPrompt) =>
          this.llmService.callLlmWithSchema(llmProvider, retryPrompt, undefined, {
            request_id: request.request_id,
            state_machine_step: 'INTAKE' as OrchestrationStep,
            sub_agent: 'Orchestrator' as SubAgentType,
            ...lightweightLlmTokenBase,
          }),
      });
      answerText = integrityOutcome.answerText;
      narrativeIntegrityReport = integrityOutcome.report;
      if (lightweightTriviaFact) {
        answerText = this.stripConsultationPromptLeakageFromLightweightAnswer(answerText);
      }
    } catch (e: any) {
      const robust = classifyOrchestratorFailure(e, { orchestrator_step: 'INTAKE' });
      return {
        success: false,
        answerText: e?.message ? String(e.message) : '生成回答失败',
        result: {
          needsUserConfirmation: false,
          errorType: ErrorType.UNKNOWN_ERROR,
          orchestrator_robustness: robust,
        },
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [
          {
            request_id: request.request_id,
            step: 'INTAKE' as OrchestrationStep,
            actor: 'Orchestrator' as SubAgentType,
            inputs_summary: request.message.substring(0, 240),
            outputs_summary: robust.message_preview ?? 'LLM 调用失败',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: { orchestrator_robustness: robust },
          },
        ],
      };
    }

    let workingText = answerText.trim();
    const dashboardExtract = extractConsultationDashboardFromAnswer(workingText);
    workingText = dashboardExtract.cleanText.trim();

    let finalAnswerText = workingText;
    let suggestedOperationsMerged: TripConsultationSuggestedOperation[] | undefined;
    if (effectiveTripId) {
      const extracted = extractSuggestedOperationsFromAnswer(workingText, effectiveTripId);
      finalAnswerText = extracted.cleanText.trim();
      const diningAnchorOps =
        diningLookupIntent &&
        !diningAnchoredInMessage &&
        itineraryDraftHasItems
          ? buildDiningAnchorSuggestedOperations(effectiveTripId, tripCtxJoined)
          : [];
      suggestedOperationsMerged = mergeSuggestedOperations(
        [...diningAnchorOps, ...extracted.operations],
        buildDefaultTripConsultationSuggestedOperations(effectiveTripId, {
          planning_handoff_message: request.message ?? '',
        }),
      );
    }

    // 抽取 <<<CONSULTATION_UI_JSON>>> / <<<SUGGESTED_OPS_JSON>>> 后，去掉模型误粘贴的块标题行（用户不应看到）
    finalAnswerText = this.stripConsultationPromptLeakageFromLightweightAnswer(finalAnswerText);
    finalAnswerText = this.coerceLightweightKnowledgeUserVisibleAnswer(finalAnswerText, request);

    const rd: RoutingDecision = {
      route: 'SYSTEM2_REASONING',
      confidence: 0.88,
      reasoning: 'lightweight_knowledge_qa(routingTaskType)',
      budget: {
        max_seconds: Math.max(5, Math.ceil((deadline?.remainingMs() ?? 60_000) / 1000)),
        max_steps: 1,
        max_browser_steps: 0,
      },
      requiredCapabilities: ['qa'],
      consentRequired: false,
      selected_path: 'QA_LIGHT',
    };

    const doneAt = Date.now();
    const firstPhaseEnd = repairStartedAt || doneAt;

    const evidenceRefs: string[] = [];
    if (liveSensorAudit.some((a) => a.tool_id.includes('weather'))) {
      evidenceRefs.push(`live_tool:mcp:weather:${request.request_id}`);
    }
    if (liveSensorAudit.some((a) => a.tool_id.includes('hotel'))) {
      evidenceRefs.push(`live_tool:mcp:hotel:${request.request_id}`);
    }
    if (liveSensorAudit.some((a) => a.tool_id.includes('car_rental'))) {
      evidenceRefs.push(`live_tool:mcp:car_rental:${request.request_id}`);
    }
    if (gBranch.guidance) {
      evidenceRefs.push(`skill:iceland.rentalGuidance:${request.request_id}`);
    }
    if (stPack.out) {
      evidenceRefs.push(`skill:safetravel.get_advisories:${request.request_id}`);
    }
    if (redFf?.hit) {
      for (const rid of redFf.refIds) {
        evidenceRefs.push(rid);
      }
      evidenceRefs.push(`skill:iceland.lightweight_red_alert_fast_fail:${request.request_id}`);
    }
    if (icelandFf?.hit) {
      for (const rid of icelandFf.refIds) {
        evidenceRefs.push(rid);
      }
      evidenceRefs.push(`skill:iceland.lightweight_fast_fail:${request.request_id}`);
    }
    if (liveSensorAudit.some((a) => a.tool_id.includes('amadeus'))) {
      evidenceRefs.push(`live_tool:amadeus:flight_offers:${request.request_id}`);
    }
    if (liveSensorAudit.some((a) => a.tool_id.includes('flight_mcp'))) {
      evidenceRefs.push(`live_tool:flight_mcp:search_flights:${request.request_id}`);
    }
    for (const c of ragPayload.citations) {
      evidenceRefs.push(`rag_chunk:${c.chunk_id}:${c.file_id}`);
    }
    const readinessEvidenceDisplayZh: string[] = [];
    const readinessTechnicalEvidenceRefs: string[] = [];
    if (readinessSupplement && effectiveTripId) {
      readinessTechnicalEvidenceRefs.push(`readiness_pack_check:${effectiveTripId}`);
      readinessEvidenceDisplayZh.push(
        '「准备度检查」：已结合您当前绑定的行程与目的地，自动运行规则引擎（Readiness Pack），摘录已注入上文。内部技术关联 ID 默认仅在「技术详情」或悬停中展示，用于后台排查或工单关联。',
      );
    }
    if (ontologyHitDefs.length > 0) {
      evidenceRefs.push(
        `ontology_hard_anchor:${ontologyHitDefs.map((d) => d.ontologyNodeId).join('|')}`,
      );
      if (roadStatusByOntologyId && roadStatusByOntologyId.size > 0) {
        for (const [nodeId, payload] of roadStatusByOntologyId) {
          evidenceRefs.push(
            `ontology_road_status:${nodeId}:aggregate=${payload.aggregateAccessState}`,
          );
        }
      }
    }

    return {
      success: true,
      answerText: finalAnswerText,
      result: {
        routingDecision: rd,
        intentAnalysis: {
          intentType: 'simple_query',
          complexity: 'simple',
          requiredCapabilities: ['qa'],
          confidence: 0.9,
          reasoning: 'lightweight_knowledge_qa',
        },
        lightweightKnowledgeQa: true,
        routingTaskType: context.routingTaskType,
        ...(llmNetworkFallback
          ? {
              llm_upstream_network_fallback: {
                occurred: true as const,
                provider: String(llmNetworkFallback.provider),
                error_message: llmNetworkFallback.error_message.slice(0, 2000),
                http_timeout_ms_applied: lightweightHttpTimeoutMs,
              },
            }
          : {}),
        ...(dashboardExtract.dashboard ? { consultation_dashboard: dashboardExtract.dashboard } : {}),
        ...(suggestedOperationsMerged?.length
          ? { suggested_operations: suggestedOperationsMerged }
          : {}),
        ...(liveSensorAudit.length ? { live_sensor_audit: liveSensorAudit } : {}),
        ...(ragPayload.citations.length
          ? {
              data_lookup_rag_citations: ragPayload.citations,
              /** 与 `data_lookup_rag_citations.length` 相同；轻量问答不下发 `consultation_dashboard` 时便于前端直接绑「知识库来源」角标 */
              kb_rag_citation_count: ragPayload.citations.length,
            }
          : {}),
        ...(readinessSupplement ? { lightweight_readiness_injected: true as const } : {}),
        ...(readinessEvidenceDisplayZh.length
          ? { readiness_evidence_display_zh: readinessEvidenceDisplayZh }
          : {}),
        ...(readinessTechnicalEvidenceRefs.length
          ? { readiness_technical_evidence_refs: readinessTechnicalEvidenceRefs }
          : {}),
        ...(ontologyEvidenceDisplayZh.length
          ? { ontology_evidence_display_zh: ontologyEvidenceDisplayZh }
          : {}),
        ...(ontologyHitDefs.length > 0
          ? {
              ontology_hard_anchor: {
                matched_node_ids: ontologyHitDefs.map((d) => d.ontologyNodeId),
                labels_zh: ontologyHitDefs.map((d) => d.labelZh),
                road_status_by_node:
                  roadStatusByOntologyId && roadStatusByOntologyId.size > 0
                    ? Object.fromEntries(
                        [...roadStatusByOntologyId.entries()].map(([k, v]) => [
                          k,
                          {
                            aggregateAccessState: v.aggregateAccessState,
                            segments: v.segments.map((s) => ({
                              roadQueryKey: s.roadQueryKey,
                              spatialSegmentId: s.spatialSegmentId,
                              source: s.source,
                              accessState: s.accessState,
                              condition: s.condition,
                            })),
                          },
                        ]),
                      )
                    : undefined,
              },
            }
          : {}),
        ...(typeof rBranch.carRentals !== 'undefined'
          ? {
              car_rentals: rBranch.carRentals,
              ...(rBranch.carRentalSearchMeta
                ? { car_rental_search_meta: rBranch.carRentalSearchMeta }
                : {}),
            }
          : {}),
        ...(gBranch.guidance ? { iceland_rental_guidance: gBranch.guidance } : {}),
        ...(stPack.out
          ? {
              lightweight_research_data: {
                safetravel_alerts: stPack.out.safetravel_alerts,
                safetravel_gate_recommendation: stPack.out.gate_recommendation,
                safetravel_rss_last_updated: stPack.out.lastUpdated,
                safetravel_rss_summary: stPack.out.summary,
              },
            }
          : {}),
        ...(redFf?.hit
          ? {
              iceland_lightweight_red_alert_fast_fail: {
                strat_ids: redFf.stratIds,
                ref_ids: redFf.refIds,
                duration_ms: redFf.durationMs,
              },
            }
          : {}),
        ...(icelandFf?.hit
          ? {
              iceland_lightweight_vehicle_terrain_fast_fail: {
                strat_ids: icelandFf.stratIds,
                ref_ids: icelandFf.refIds,
                duration_ms: icelandFf.durationMs,
              },
            }
          : {}),
        ...(gBranch.footnotesZh.length ? { car_rental_guidance_footnotes_zh: gBranch.footnotesZh } : {}),
        ...(fBranch.flight_inventory_snapshot
          ? { flight_inventory_snapshot: fBranch.flight_inventory_snapshot }
          : {}),
        ...(hBranch.hotelRouteRunUi
          ? {
              accommodations: hBranch.hotelRouteRunUi.accommodations,
              airbnbListings: hBranch.hotelRouteRunUi.airbnbListings,
              routing: hBranch.hotelRouteRunUi.routing,
              ...(hBranch.hotelRouteRunUi.night_groups?.length
                ? { accommodation_night_groups: hBranch.hotelRouteRunUi.night_groups }
                : {}),
              ...(hBranch.hotelRouteRunUi.hotel_search_meta
                ? { hotel_search_meta: hBranch.hotelRouteRunUi.hotel_search_meta }
                : {}),
            }
          : {}),
        ...(inventory_snapshots_meta ? { inventory_snapshots_meta } : {}),
        narrative_safety: narrativeSafety,
        narrative_integrity_report:
          narrativeIntegrityReport ?? {
            validator_version: NARRATIVE_INTEGRITY_VALIDATOR_VERSION,
            violations: [],
            enforcement_action: 'pass',
          },
      },
      stepsExecuted: [
        ...liveSensorAudit.map((a) => ({
          stepId: a.tool_id.replace(/\./g, '_'),
          skillName: a.tool_id.includes('iceland.rentalGuidance') ? 'iceland.rentalGuidance' : 'mcp_dispatch',
          success: a.ok,
          duration: Math.max(0, a.latency_ms),
          ...(a.error ? { error: a.error } : {}),
        })),
        ...(readinessSupplement
          ? [
              {
                stepId: 'readiness_pack_check',
                skillName: 'readiness',
                success: true,
                duration: 0,
              },
            ]
          : []),
        ...(ontologyHitDefs.length > 0
          ? [
              {
                stepId: 'ontology_hard_anchor_appendix',
                skillName: 'ontology_road',
                success: true,
                duration: 0,
              },
              ...(roadStatusByOntologyId && roadStatusByOntologyId.size > 0
                ? [
                    {
                      stepId: 'ontology_road_status_provider',
                      skillName: 'road_is',
                      success: true,
                      duration: ontologyRoadStatusFetchMs,
                    },
                  ]
                : []),
            ]
          : []),
        ...(stPack.out
          ? [
              {
                stepId: 'lightweight_safetravel_advisories',
                skillName: 'safetravel.get_advisories',
                success: true,
                duration: stPack.ms,
                result: {
                  gate_recommendation: stPack.out.gate_recommendation,
                  rss_alert_count: stPack.out.alerts?.length ?? 0,
                  route_alert_count: stPack.out.safetravel_alerts?.length ?? 0,
                },
              },
            ]
          : []),
        ...(redFf?.hit
          ? [
              {
                stepId: 'iceland_lightweight_red_alert_fast_fail',
                skillName: 'iceland.lightweight_red_alert_fast_fail',
                success: true,
                duration: redFf.durationMs,
                result: { issues: redFf.rawIssues },
              },
            ]
          : []),
        ...(icelandFf?.hit
          ? [
              {
                stepId: 'iceland_lightweight_froad_2wd_fast_fail',
                skillName: 'iceland.lightweight_fast_fail',
                success: true,
                duration: icelandFf.durationMs,
                result: { issues: icelandFf.rawIssues },
              },
            ]
          : []),
        {
          stepId: 'lightweight_llm_answer',
          skillName: 'direct_llm',
          success: true,
          duration: Math.max(0, firstPhaseEnd - startTime),
        },
        ...(repairStartedAt
          ? [
              {
                stepId: 'lightweight_llm_context_repair',
                skillName: 'direct_llm',
                success: true,
                duration: Math.max(0, doneAt - repairStartedAt),
              },
            ]
          : []),
        ...(narrativeIntegrityReport?.regeneration_attempted
          ? [
              {
                stepId: 'narrative_integrity_regenerate',
                skillName: 'narrative_integrity',
                success: true,
                duration: Math.max(0, narrativeIntegrityReport.regenerate_duration_ms ?? 0),
              },
            ]
          : []),
      ],
      totalDuration: doneAt - startTime,
      decisionLog: [
        {
          request_id: request.request_id,
          step: 'DONE' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: request.message.substring(0, 240),
          outputs_summary:
            (liveSensorAudit.some((a) => a.tool_id.includes('weather')) ? '含实时天气 MCP；' : '') +
            (liveSensorAudit.some((a) => a.tool_id.includes('amadeus'))
              ? '含航班报价 Amadeus；'
              : '') +
            (liveSensorAudit.some((a) => a.tool_id.includes('flight_mcp')) ? '含航班检索 Flight MCP；' : '') +
            (liveSensorAudit.some((a) => a.tool_id.includes('hotel')) ? '含住宿检索 MCP；' : '') +
            (liveSensorAudit.some((a) => a.tool_id.includes('car_rental')) ? '含租车检索 MCP；' : '') +
            (gBranch.guidance ? '含冰岛租车决策 iceland.rentalGuidance；' : '') +
            (stPack.out ? '含 SafeTravel RSS（轻量拉取）；' : '') +
            (redFf?.hit ? '含冰岛红警生命红线闸（STRAT_ICE_000）；' : '') +
            (icelandFf?.hit ? '含冰岛 F-road/2WD 极速安全闸（非完整 verify）；' : '') +
            (ragPayload.citations.length ? `知识库 RAG ${ragPayload.citations.length} 条；` : '') +
            (readinessSupplement ? '含准备度 Readiness（Pack）；' : '') +
            (ontologyHitDefs.length > 0
              ? `含区域本体硬锚（${ontologyHitDefs.map((d) => d.labelZh).join('、')}）；` +
                  (roadStatusByOntologyId && roadStatusByOntologyId.size > 0
                    ? '含路段 accessState 真值（OntologyRoadStatusProvider）；'
                    : '本体路况：静态路网锚点（未拉取或未注入动态真值）；')
              : '') +
            (repairStartedAt ? 'LLM + 行程锚点纠正重试，无 Skill DAG' : '单次 LLM，无 Skill DAG'),
          evidence_refs: evidenceRefs,
          timestamp: new Date().toISOString(),
          ...(ontologyEvidenceDisplayZh.length
            ? { ontology_evidence_display_zh: ontologyEvidenceDisplayZh }
            : {}),
          ...(readinessEvidenceDisplayZh.length
            ? { readiness_evidence_display_zh: readinessEvidenceDisplayZh }
            : {}),
          ...(readinessTechnicalEvidenceRefs.length
            ? { readiness_technical_evidence_refs: readinessTechnicalEvidenceRefs }
            : {}),
        },
      ],
    };
    };

    if (!isRagRealityPolicyGateActive()) {
      return await executeLightweightKnowledgeBody();
    }
    const decisionCtx = await this.buildLightweightDecisionContextForRealityGate(request, effectiveTripId);
    return await runWithDecisionContextAsync(decisionCtx, executeLightweightKnowledgeBody);
  }

  /**
   * 绑定 Trip：工作台 UI 占位欢迎语 → 秒回引导，不跑 RESEARCH/POI_SELECTION。
   */
  async orchestrateWorkbenchAssistantPlaceholder(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    startTime: number,
  ): Promise<OrchestrationResult> {
    const tripId = (request.trip_id || context.tripId || '').trim();
    let destination = '当前';
    let dateRange: { start_date?: string; end_date?: string } | undefined;
    if (tripId && this.tripsService) {
      try {
        const trip = (await this.tripsService.findOne(tripId, request.user_id)) as {
          destination?: string | null;
          startDate?: Date | string | null;
          endDate?: Date | string | null;
        };
        if (trip?.destination) destination = String(trip.destination);
        if (trip?.startDate && trip?.endDate) {
          dateRange = {
            start_date:
              trip.startDate instanceof Date
                ? trip.startDate.toISOString().slice(0, 10)
                : String(trip.startDate).slice(0, 10),
            end_date:
              trip.endDate instanceof Date
                ? trip.endDate.toISOString().slice(0, 10)
                : String(trip.endDate).slice(0, 10),
          };
        }
      } catch (e: unknown) {
        this.logger.debug(
          `[Claude Orchestrator] workbench placeholder trip load skipped: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const answerText = buildWorkbenchPlaceholderWelcomeText({
      trip_plan_request: { destination, date_range: dateRange },
    } as OrchestratorState);
    return {
      success: true,
      answerText,
      result: {
        routingTaskType: 'TRIP_PLANNING',
        workbench_assistant_placeholder: true as const,
        needsUserConfirmation: false,
        intentAnalysis: {
          intentType: 'simple_query',
          complexity: 'simple',
          requiredCapabilities: ['qa'],
          confidence: 0.95,
          reasoning: 'workbench_assistant_placeholder',
        },
      },
      stepsExecuted: [
        {
          stepId: 'workbench_placeholder',
          skillName: 'workbench.placeholder',
          success: true,
          duration: Date.now() - startTime,
        },
      ],
      totalDuration: Date.now() - startTime,
      decisionLog: [
        {
          request_id: request.request_id,
          step: 'INTAKE' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: '规划工作台助手占位欢迎语',
          outputs_summary: answerText,
          evidence_refs: tripId ? [`trip:${tripId}`] : [],
          timestamp: new Date().toISOString(),
          metadata: { system_action: 'WORKBENCH_ASSISTANT_PLACEHOLDER_SHORT_CIRCUIT' },
        },
      ],
    };
  }

  /**
   * 绑定 Trip：「查看第 N 天行程」→ 读库摘要，跳过规划状态机与目的地澄清。
   */
  private async orchestrateItineraryDayViewQuery(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    startTime: number,
  ): Promise<OrchestrationResult> {
    const tripId = (request.trip_id || context.tripId || '').trim();
    const message = request.message ?? '';
    const spec = parseItineraryDayViewSpec(message);
    if (!tripId || !spec) {
      return {
        success: false,
        answerText: '未能理解要查看哪一天，请说明「第几天」或具体日期。',
        result: {
          routingTaskType: 'DATA_LOOKUP',
          lightweightKnowledgeQa: true,
        },
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [],
      };
    }

    if (!this.tripsService) {
      return {
        success: false,
        answerText: '暂时无法读取行程，请稍后重试。',
        result: { routingTaskType: 'DATA_LOOKUP', lightweightKnowledgeQa: true },
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [],
      };
    }

    let trip: {
      destination?: string | null;
      startDate?: Date | string | null;
      endDate?: Date | string | null;
      TripDay?: Array<{
        id?: string;
        date?: Date | string | null;
        ItineraryItem?: Array<Record<string, unknown>>;
      }>;
    };
    try {
      trip = (await this.tripsService.findOne(tripId, request.user_id)) as typeof trip;
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] day view trip load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        success: false,
        answerText: '未找到关联行程，请确认工作台已打开正确 Trip。',
        result: { routingTaskType: 'DATA_LOOKUP', lightweightKnowledgeQa: true },
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [],
      };
    }

    const days = trip.TripDay ?? [];
    const dateRange =
      trip.startDate && trip.endDate
        ? {
            start_date:
              trip.startDate instanceof Date
                ? trip.startDate.toISOString().slice(0, 10)
                : String(trip.startDate).slice(0, 10),
            end_date:
              trip.endDate instanceof Date
                ? trip.endDate.toISOString().slice(0, 10)
                : String(trip.endDate).slice(0, 10),
          }
        : undefined;
    const resolvedSpec = parseItineraryDayViewSpec(message, dateRange) ?? spec;
    const dayIdx = resolveTripDayIndexFromViewSpec(days, resolvedSpec);
    if (dayIdx == null || !days[dayIdx]) {
      const n = resolvedSpec.dayNumber;
      return {
        success: false,
        answerText:
          n != null
            ? `当前行程共 ${days.length} 天，没有第 ${n} 天。请核对天数或指定具体日期。`
            : '未能定位到指定日期，请说明第几天或 YYYY-MM-DD。',
        result: { routingTaskType: 'DATA_LOOKUP', lightweightKnowledgeQa: true },
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [],
      };
    }

    const day = days[dayIdx];
    const dateIso =
      day.date instanceof Date
        ? day.date.toISOString().slice(0, 10)
        : String(day.date ?? '').slice(0, 10);
    const answerText = buildItineraryDayViewAnswerText({
      dayNumber: dayIdx + 1,
      dateIso: dateIso || undefined,
      items: (day.ItineraryItem ?? []) as never[],
      tripTitle: trip.destination ?? undefined,
    });

    return {
      success: true,
      answerText,
      result: {
        routingTaskType: 'DATA_LOOKUP',
        lightweightKnowledgeQa: true,
        itinerary_day_view_intake: true as const,
        intentAnalysis: {
          intentType: 'simple_query',
          complexity: 'simple',
          requiredCapabilities: ['qa'],
          confidence: 0.95,
          reasoning: 'itinerary_day_view_read',
        },
        suggested_operations: [
          {
            id: 'view_timeline',
            label: '查看行程时间轴',
            action: 'OPEN_TRIP_TIMELINE',
          },
        ],
      },
      stepsExecuted: [
        {
          stepId: 'itinerary_day_view',
          skillName: 'trip.readDay',
          success: true,
          duration: Date.now() - startTime,
        },
      ],
      totalDuration: Date.now() - startTime,
      decisionLog: [
        {
          request_id: request.request_id,
          step: 'INTAKE' as OrchestrationStep,
          actor: 'LocalInsight' as SubAgentType,
          inputs_summary: message,
          outputs_summary: `ITINERARY_DAY_VIEW day=${dayIdx + 1} items=${day.ItineraryItem?.length ?? 0}`,
          evidence_refs: [`trip:${tripId}:day:${dayIdx + 1}`],
          timestamp: new Date().toISOString(),
          metadata: { system_action: 'ITINERARY_DAY_VIEW_READ' },
        },
      ],
    };
  }

  /**
   * 智能编排主入口（CLAUDE_DYNAMIC 等）。
   *
   * **Harness 内存 trace**：本方法内大量 early `return` 与 `executePlan` 出口**不**经过 `buildSuccessResult` / `buildErrorResult`，
   * 因而**不**调用 `finalizeHarnessTraceFromOrchestration`。通常此路径也未初始化 DSO，无 `HARNESS_RECORD_TRACE` 下可闭合的 trace；
   * 新建行程且能解析 `countryCode` 时会委派 **`orchestrateWithStateMachine`**，其出口经 `build*` 并收口（见 `docs/Harness Runtime.md` §10.1）。
   */
  async orchestrate(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline?: { remainingMs: () => number; clamp: (ms: number, minMs?: number) => number },
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    this.logger.log(`[Claude Orchestrator] 开始编排: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
    this.logger.debug(`[Claude Orchestrator] SkillsRegistry: ${!!this.skillsRegistry}, ActionRegistry: ${!!this.actionRegistry}`);

    // 获取 LLM 提供商（支持请求参数和降级）
    const llmProvider = this.getLlmProvider(request);
    this.logger.debug(`[Claude Orchestrator] 使用 LLM 提供商: ${llmProvider}`);

    try {
      const boundTripIdEarly = (request.trip_id || context.tripId || '').trim();
      if (boundTripIdEarly && detectItineraryDayViewIntent(request.message ?? '')) {
        this.logger.log(
          `[Claude Orchestrator] 查看指定日行程 → 读库短路 request_id=${request.request_id}`,
        );
        setLlmTraceRoutePath('LIGHTWEIGHT');
        return await this.orchestrateItineraryDayViewQuery(request, context, startTime);
      }

      if (boundTripIdEarly && isWorkbenchAssistantPlaceholderMessage(request.message)) {
        this.logger.log(
          `[Claude Orchestrator] 工作台助手占位欢迎语 → 短路 request_id=${request.request_id}`,
        );
        setLlmTraceRoutePath('LIGHTWEIGHT');
        return await this.orchestrateWorkbenchAssistantPlaceholder(request, context, startTime);
      }

      const rt = context.routingTaskType;
      const teamDiscussMsg = resolveRouteAndRunUserMessage(request);
      if (isTeamStructuredDiscussionQuery(teamDiscussMsg)) {
        this.logger.warn(
          `[Claude Orchestrator] TEAM_STRUCTURED_DISCUSSION bypass QA_LIGHT request_id=${request.request_id}`,
        );
        return await this.orchestrateTeamStructuredDiscussionBypass(
          request,
          context,
          teamDiscussMsg,
          startTime,
        );
      }
      const msgLowerEarly = (request.message ?? '').trim().toLowerCase();
      const boundTripLightConsult =
        !!boundTripIdEarly &&
        isBoundTripLightConsultQuery(request.message ?? '', msgLowerEarly);
      const boundTripItineraryAdjust =
        !!boundTripIdEarly &&
        !boundTripLightConsult &&
        (detectItineraryAdjustIntent(request.message ?? '') ||
          detectFullTripReplanIntent(request.message ?? ''));
      if (
        boundTripItineraryAdjust &&
        (rt === 'DATA_LOOKUP' || rt === 'GENERIC_QA' || rt === 'RAG_QA')
      ) {
        this.logger.log(
          `[Claude Orchestrator] bound trip 行程改排/整段重规划命中，routingTaskType=${rt} → 改走状态机 request_id=${request.request_id}`,
        );
        setLlmTraceRoutePath('STATE_MACHINE');
        const smDeadline = deadline ?? createDeadline(120_000);
        const smResult = await this.orchestrateWithStateMachine(request, context, smDeadline, undefined);
        smResult.totalDuration = Date.now() - startTime;
        return smResult;
      }
      if (rt === 'DATA_LOOKUP' || rt === 'GENERIC_QA' || rt === 'RAG_QA') {
        this.logger.log(
          `[Claude Orchestrator] routingTaskType=${rt}，走轻量知识问答路径（跳过 Skill 选择与 itinerary 类校验）`,
        );
        setLlmTraceRoutePath('LIGHTWEIGHT');
        return await this.orchestrateLightweightKnowledgeQuery(request, context, deadline, llmProvider, startTime);
      }

      /** 已绑定行程的 TRIP_PLANNING：动态 Skill DAG 不会在 INTAKE 注入 planState/itinerary，校验必报缺 planState/request/itinerary → 统一走状态机 */
      const boundTripId = (request.trip_id || context.tripId || '').trim();
      if (boundTripId && rt === 'TRIP_PLANNING') {
        this.logger.log(
          `[Claude Orchestrator] 已绑定 trip_id 且 TRIP_PLANNING → 状态机编排（避免 CLAUDE_DYNAMIC Skills 缺参）request_id=${request.request_id}`,
        );
        setLlmTraceRoutePath('STATE_MACHINE');
        const smDeadline = deadline ?? createDeadline(120_000);
        const smResult = await this.orchestrateWithStateMachine(request, context, smDeadline, undefined);
        smResult.totalDuration = Date.now() - startTime;
        return smResult;
      }

      // 0. 提前检查：创建新行程场景（在 LLM 调用之前，避免超时）
      // 如果用户请求规划新行程但缺少必要信息，提前返回错误
      const isCreatingNewTrip = !request.trip_id || request.trip_id === '';
      const messageLower = request.message.toLowerCase();
      const isPlanningIntent = messageLower.includes('规划') ||
                                messageLower.includes('计划') ||
                                messageLower.includes('行程') ||
                                messageLower.includes('安排') ||
                                messageLower.includes('itinerary') ||
                                messageLower.includes('trip') ||
                                messageLower.includes('plan');
      
      // 新建行程规划：按专利要求走状态机流程（INTAKE→STATE_UPDATE→RESEARCH→GATE_EVAL→...）
      // 不再使用 Fast Path，确保 DSO、STATE_UPDATE、三人格等专利要素完整执行
      if (isCreatingNewTrip && isPlanningIntent) {
        const countryCode = this.extractCountryCodeFromMessage(request.message);
        if (countryCode) {
          this.logger.log(`[Claude Orchestrator] 新建行程规划，countryCode=${countryCode}，走专利状态机流程`);
          setLlmTraceRoutePath('STATE_MACHINE');
          const smDeadline = deadline ?? createDeadline(60_000);
          const smResult = await this.orchestrateWithStateMachine(request, context, smDeadline, undefined);
          smResult.totalDuration = Date.now() - startTime;
          return smResult;
        } else {
          // 缺少countryCode，提前返回错误
          this.logger.warn(`[Claude Orchestrator] 创建新行程需要目的地信息，但无法从消息中提取 countryCode`);
          return {
            success: false,
            result: {
              needsUserConfirmation: true,
              clarificationMessage: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
              errorType: 'MISSING_REQUIRED_PARAM' as any,
              missingParams: ['countryCode'],
              solutions: [
                '在消息中明确指定目的地国家或地区（如：日本、东京、Japan）',
                '提供已保存的行程 ID，系统将自动获取国家代码',
              ],
            },
            answerText: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
            stepsExecuted: [],
            totalDuration: Date.now() - startTime,
            decisionLog: [
              {
                request_id: request.request_id,
                step: 'INTAKE' as OrchestrationStep,
                actor: 'Orchestrator' as SubAgentType,
                inputs_summary: `用户请求: ${request.message}`,
                outputs_summary: `提前验证失败: 缺少目的地信息`,
                evidence_refs: [],
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
      }

      setLlmTraceRoutePath('CLAUDE_DYNAMIC');

      let intentAnalysis: IntentAnalysis | undefined;
      let routingDecision: RoutingDecision | undefined;
      let skillsPlan: SkillsPlan | undefined;

      if (isOrchestrationTriageEnabled()) {
        this.logger.debug(`[Claude Orchestrator] 步骤 1–4/6: 编排分流（Intent+Route+Skills 合并）...`);
        const triage = await this.runOrchestrationTriage(
          request,
          context,
          llmProvider,
          request.emergency_constraints,
        );
        if (triage) {
          intentAnalysis = triage.intentAnalysis;
          routingDecision = triage.routingDecision;
          skillsPlan = triage.skillsPlan;
          this.logger.log(
            `[Claude Orchestrator] ✅ Triage: ${intentAnalysis.intentType} → ${routingDecision.route}, skills=${skillsPlan.selectedSkills.length}`,
          );
        } else {
          this.logger.warn('[Claude Orchestrator] Triage 失败，回退分步 Intent→Route→Skills');
        }
      }

      if (!intentAnalysis) {
        this.logger.debug(`[Claude Orchestrator] 步骤 1/6: 分析用户意图...`);
        intentAnalysis = await this.analyzeIntent(request, context, llmProvider);
        this.logger.log(
          `[Claude Orchestrator] ✅ 意图分析完成: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`,
        );
      }

      if (!routingDecision) {
        this.logger.debug(`[Claude Orchestrator] 步骤 2/6: 选择路由策略...`);
        routingDecision = await this.decideRouting(intentAnalysis, llmProvider, request.request_id);
        this.logger.log(
          `[Claude Orchestrator] ✅ 路由决策完成: ${routingDecision.route}, 置信度: ${routingDecision.confidence}`,
        );
      }

      // 3. 根据路由决策选择执行路径
      if (routingDecision.route?.startsWith('SYSTEM1')) {
        // System 1 快速路径：直接返回，由 AgentService 处理
        return {
          success: true,
          result: {
            route: routingDecision.route,
            routingDecision,
            intentAnalysis,
          },
          answerText: '正在处理您的请求...',
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [
            {
              request_id: request.request_id,
              step: 'INTAKE' as OrchestrationStep,
              actor: 'Orchestrator' as SubAgentType,
              inputs_summary: `用户请求: ${request.message}`,
              outputs_summary: `意图类型: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
            },
            {
              request_id: request.request_id,
              step: 'INTAKE' as OrchestrationStep,
              actor: 'Orchestrator' as SubAgentType,
              inputs_summary: `意图分析结果: ${intentAnalysis.intentType}`,
              outputs_summary: `路由决策: ${routingDecision.route}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }


      // 4. System 2 路径：使用 LLM 选择 Skills
      if (!skillsPlan) {
        this.logger.debug(`[Claude Orchestrator] 步骤 4/6: 选择 Skills...`);
        skillsPlan = await this.selectSkills(
          intentAnalysis,
          routingDecision,
          context,
          llmProvider,
          request.request_id,
          request.emergency_constraints,
        );
      } else {
        this.logger.debug(
          `[Claude Orchestrator] 步骤 4/6: Skills 已由 Triage 预选 (${skillsPlan.selectedSkills.length})`,
        );
      }
      this.logger.log(`[Claude Orchestrator] ✅ Skills 选择完成: ${skillsPlan.selectedSkills.length} 个 Skills`);
      if (skillsPlan.selectedSkills.length > 0) {
        this.logger.debug(`[Claude Orchestrator] 选择的 Skills: ${skillsPlan.selectedSkills.map(s => s.skillName).join(', ')}`);
      }

      // 4.5. 提前验证 Skills 输入参数（在 plan 编排之前，节省 LLM 成本）
      this.logger.debug(`[Claude Orchestrator] 步骤 4.5/6: 提前验证 Skills 输入参数...`);
      
      // 特殊处理：创建新行程场景（trip_id 为 null）
      // 如果选择了需要 world/tripId 的 skills，应该先构建 world 上下文
      if (isCreatingNewTrip) {
        const needsWorldOrTripId = skillsPlan.selectedSkills.some(skill => {
          if (!skill.skillName) return false;
          const skillMeta = this.skillsRegistry?.getSkill(skill.skillName)?.metadata;
          if (!skillMeta?.inputSchema) return false;
          
          // 检查是否需要 world 或 tripId
          const schema = skillMeta.inputSchema;
          const needsWorld = schema.dependencies?.some(dep => 
            dep.param === 'world' || dep.alternatives?.includes('world')
          );
          const needsTripId = schema.dependencies?.some(dep => 
            dep.param === 'tripId' || dep.alternatives?.includes('tripId')
          );
          
          return needsWorld || needsTripId;
        });
        
        if (needsWorldOrTripId) {
          // 检查是否可以从消息中提取 countryCode（用于构建 world）
          const countryCode = this.extractCountryCodeFromMessage(request.message);
          if (!countryCode) {
            this.logger.warn(`[Claude Orchestrator] 创建新行程需要 world 上下文，但无法从消息中提取 countryCode`);
            return {
              success: false,
              result: {
                needsUserConfirmation: true,
                clarificationMessage: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
                errorType: 'MISSING_REQUIRED_PARAM' as any,
                missingParams: ['countryCode'],
                solutions: [
                  '在消息中明确指定目的地国家或地区（如：日本、东京、Japan）',
                  '提供已保存的行程 ID，系统将自动获取国家代码',
                ],
              },
              answerText: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
              stepsExecuted: [],
              totalDuration: Date.now() - startTime,
              decisionLog: [],
            };
          }
          
          // 如果可以从消息中提取 countryCode，自动添加 world.buildContext 到 skillsPlan
          // 确保后续步骤能够获取 world 上下文
          const hasWorldBuildContext = skillsPlan.selectedSkills.some(s => s.skillName === 'world.buildContext');
          if (!hasWorldBuildContext) {
            this.logger.debug(`[Claude Orchestrator] 创建新行程场景：自动添加 world.buildContext 到 skillsPlan，countryCode: ${countryCode}`);
            skillsPlan.selectedSkills.unshift({
              skillName: 'world.buildContext',
              reason: '创建新行程需要构建 world 上下文',
              priority: 1,
              input: {
                countryCode: countryCode,
              },
              dependencies: [],
            });
            // 更新 executionOrder
            if (!skillsPlan.executionOrder.includes('world.buildContext')) {
              skillsPlan.executionOrder.unshift('world.buildContext');
            }
          }
        }
      }

      // 4.4 仅选 web.browse 且未带 url 时，用用户问题构造搜索页 URL，避免 4.5 校验卡死
      this.injectWebBrowseUrlIfMissing(skillsPlan, request);

      // 4.45 itinerary.verify + repair.apply → itinerary.smart_update（单闭环，降低多轮调度）
      normalizeSkillsPlanCoalesceVerifyRepair(skillsPlan);
      this.logger.debug(
        `[Claude Orchestrator] smart_update 归一化后 Skills: ${skillsPlan.selectedSkills.map((s) => s.skillName).join(', ')}`,
      );
      
      const earlyValidationResult = await this.validateSkillsInputs(skillsPlan, context, request);
      if (!earlyValidationResult.valid) {
        const clarificationMessage =
          earlyValidationResult.clarificationMessage ||
          this.buildMissingParamClarificationMessage({
            message: `缺少必需参数: ${(earlyValidationResult.missingParams ?? []).join(', ') || 'unknown'}`,
            missingParams: earlyValidationResult.missingParams ?? [],
          });
        this.logger.warn(
          `[Claude Orchestrator] Skills 验证失败: ${earlyValidationResult.missingParams?.join(', ')}`,
        );
        return {
          success: false,
          result: {
            needsUserConfirmation: true,
            clarificationMessage,
            errorType: 'MISSING_REQUIRED_PARAM' as any,
            missingParams: earlyValidationResult.missingParams,
            solutions: earlyValidationResult.solutions || [],
          },
          answerText: clarificationMessage,
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [],
        };
      }

      // 5. 使用 LLM 编排执行计划
      this.logger.debug(`[Claude Orchestrator] 步骤 5/6: 编排执行计划...`);
      const executionPlan = await this.planExecution(skillsPlan, routingDecision, llmProvider, request.request_id);
      normalizeExecutionPlanCoalesceVerifyRepair(executionPlan);
      this.logger.log(`[Claude Orchestrator] ✅ 执行计划完成: ${executionPlan.steps.length} 个步骤`);

      // 5.5. 再次验证计划输入参数（处理 plan 编排时可能添加的参数依赖）
      this.logger.debug(`[Claude Orchestrator] 步骤 5.5/6: 验证计划输入参数...`);
      const validationResult = await this.validatePlanInputs(executionPlan, context, request);
      if (!validationResult.valid) {
        const clarificationMessage =
          validationResult.clarificationMessage ||
          this.buildMissingParamClarificationMessage({
            message: `缺少必需参数: ${(validationResult.missingParams ?? []).join(', ') || 'unknown'}`,
            missingParams: validationResult.missingParams ?? [],
          });
        this.logger.warn(`[Claude Orchestrator] 计划验证失败: ${validationResult.missingParams?.join(', ')}`);
        return {
          success: false,
          result: {
            needsUserConfirmation: true,
            clarificationMessage,
            errorType: 'MISSING_REQUIRED_PARAM' as any,
            missingParams: validationResult.missingParams,
            solutions: validationResult.solutions || [],
          },
          answerText: clarificationMessage,
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [],
        };
      }

      // 6. 执行计划
      this.logger.debug(`[Claude Orchestrator] 步骤 6/6: 执行计划...`);
      const intentSnapshot = this.buildSkillInputIntentSnapshot(request, context);
      const result = await this.executePlan(executionPlan, context, request, intentSnapshot);
      this.logger.log(`[Claude Orchestrator] ✅ 执行完成: success=${result.success}, 成功步骤: ${result.stepsExecuted.filter(s => s.success).length}/${result.stepsExecuted.length}`);

      return result;
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] ❌ 编排失败: ${error?.message || String(error)}`, error?.stack);
      
      // 检查是否是超时错误
      const isTimeoutError = error?.code === 'ECONNABORTED' || 
                            error?.message?.includes('timeout') || 
                            error?.message?.includes('超时') ||
                            error?.message?.startsWith('TIMEOUT:');
      
      if (isTimeoutError) {
        this.logger.error(`[Claude Orchestrator] 请求超时，返回超时错误信息`);
        return {
          success: false,
          result: {
            // 超时不应该设置 needsUserConfirmation，应该直接返回 TIMEOUT 状态
            needsUserConfirmation: false,
            clarificationMessage: '请求超时，请缩小范围或稍后重试。',
            errorType: ErrorType.TIMEOUT_ERROR,
            missingParams: [],
            solutions: [
              '请稍后重试',
              '简化您的请求内容',
              '减少请求的复杂度',
            ],
          },
          answerText: '请求超时，请缩小范围或稍后重试。',
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [],
        };
      }
      
      // 记录详细的错误信息
      const errorInfo = {
        message: error?.message || '未知错误',
        stack: error?.stack,
        skillsRegistryAvailable: !!this.skillsRegistry,
        actionRegistryAvailable: !!this.actionRegistry,
      };
      this.logger.error(`[Claude Orchestrator] 错误详情: ${JSON.stringify(errorInfo, null, 2)}`);
      
      return {
        success: false,
        result: {
          errors: error?.message || '未知错误',
        },
        answerText: `抱歉，处理您的请求时出现错误：${error?.message || '未知错误'}`,
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [
          {
            request_id: request.request_id,
            step: 'FAILED' as OrchestrationStep,
            actor: 'Orchestrator' as SubAgentType,
            inputs_summary: `用户请求: ${request.message}`,
            outputs_summary: `处理失败: ${error?.message || '未知错误'}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              error: error?.message || '未知错误',
              skillsRegistryAvailable: !!this.skillsRegistry,
              actionRegistryAvailable: !!this.actionRegistry,
            },
          },
        ],
      };
    }
  }

  /**
   * 合并 Intent + Route + Skills 单次 LLM（ORCHESTRATION_TRIAGE_LLM=1，默认开启）
   */
  private async runOrchestrationTriage(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    provider: LlmProvider,
    emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'],
  ): Promise<{
    intentAnalysis: IntentAnalysis;
    routingDecision: RoutingDecision;
    skillsPlan: SkillsPlan;
  } | null> {
    const availableSkills = this.getAvailableSkills(emergencyConstraints);
    const destinationSupplement = buildDestinationSupplementForTriage(
      request.message ?? '',
      request.trip_id ?? undefined,
    );
    const prompt = buildOrchestrationTriagePrompt({
      userMessage: request.message ?? '',
      userId: context.userId,
      tripId: context.tripId ?? undefined,
      conversationHistory: context.conversationHistory,
      availableSkills,
      destinationSupplement,
    });
    const tokenContext = request.request_id
      ? {
          request_id: request.request_id,
          state_machine_step: 'INTAKE' as OrchestrationStep,
          sub_agent: 'Orchestrator' as SubAgentType,
        }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        ORCHESTRATION_TRIAGE_JSON_SCHEMA as unknown as Record<string, unknown>,
        '编排分流',
        tokenContext,
      );
      const parsed = this.extractJSONFromResponse(response);
      return normalizeOrchestrationTriageResult(parsed);
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] runOrchestrationTriage 失败: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * 分析用户意图（使用指定的 LLM 提供商，支持降级）
   */
  private async analyzeIntent(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    provider: LlmProvider,
  ): Promise<IntentAnalysis> {
    const prompt = this.buildIntentAnalysisPrompt(request, context);
    
    const tokenContext = request?.request_id
      ? { request_id: request.request_id, state_machine_step: 'INTAKE' as OrchestrationStep, sub_agent: 'Planner' as SubAgentType }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            intentType: {
              type: 'string',
              enum: ['simple_query', 'complex_planning', 'analysis', 'decision', 'mixed'],
            },
            complexity: {
              type: 'string',
              enum: ['simple', 'medium', 'complex'],
            },
            requiredCapabilities: {
              type: 'array',
              items: { type: 'string' },
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
            keywords: {
              type: 'array',
              items: { type: 'string' },
            },
            entities: { type: 'object' },
          },
          required: ['intentType', 'complexity', 'requiredCapabilities', 'confidence', 'reasoning'],
        },
        '意图分析',
        tokenContext,
      );

      const parsed = this.extractJSONFromResponse(response);
      return parsed as IntentAnalysis;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] 意图分析失败，使用默认值: ${error?.message}`);
      // 降级：返回默认意图分析
      return {
        intentType: 'simple_query',
        complexity: 'simple',
        requiredCapabilities: ['data_query'],
        confidence: 0.5,
        reasoning: '意图分析失败，使用默认值',
      };
    }
  }

  /**
   * 从 LLM 响应中提取 JSON（处理可能包含 markdown 代码块或解释性文本的情况）
   */
  private extractJSONFromResponse(response: string): any {
    if (!response || typeof response !== 'string') {
      throw new Error('响应为空或格式不正确');
    }

    let cleaned = response.trim();
    
    // 移除 markdown 代码块标记（更严格的匹配，支持多行）
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试提取 JSON 对象（如果响应中包含其他文本）
    // 使用更宽松的匹配，包括可能的多行 JSON
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // 再次清理可能的空白字符
    cleaned = cleaned.trim();
    
    try {
      return JSON.parse(cleaned);
    } catch (parseError: any) {
      this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
      this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
      throw parseError;
    }
  }

  private readonly routingDecisionRoutes: RoutingDecision['route'][] = [
    'SYSTEM1_API',
    'SYSTEM1_RAG',
    'SYSTEM2_REASONING',
    'SYSTEM2_ANALYSIS',
    'SYSTEM2_WEBBROWSE',
  ];

  private getDefaultRoutingDecision(reasoning: string): RoutingDecision {
    return {
      route: 'SYSTEM2_REASONING',
      confidence: 0.5,
      reasoning,
      budget: {
        max_seconds: 60,
        max_steps: 8,
        max_browser_steps: 0,
      },
    };
  }

  /** LLM/mock 可能返回 {} 或缺字段；必须与 RoutingDecision 对齐，否则下游 .route.startsWith 会崩 */
  private normalizeRoutingDecision(parsed: unknown): RoutingDecision | null {
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    const route = p.route;
    if (typeof route !== 'string' || !this.routingDecisionRoutes.includes(route as RoutingDecision['route'])) {
      return null;
    }
    const confidenceRaw = p.confidence;
    const confidence =
      typeof confidenceRaw === 'number' && !Number.isNaN(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw))
        : 0.5;
    const reasoning =
      typeof p.reasoning === 'string' && p.reasoning.trim().length > 0
        ? p.reasoning
        : '模型未返回 reasoning';
    const b = p.budget;
    let budget: RoutingDecision['budget'] = {
      max_seconds: 60,
      max_steps: 8,
      max_browser_steps: 0,
    };
    if (b && typeof b === 'object') {
      const bb = b as Record<string, unknown>;
      budget = {
        max_seconds: typeof bb.max_seconds === 'number' ? bb.max_seconds : 60,
        max_steps: typeof bb.max_steps === 'number' ? bb.max_steps : 8,
        max_browser_steps:
          typeof bb.max_browser_steps === 'number' ? bb.max_browser_steps : 0,
      };
    }
    const out: RoutingDecision = {
      route: route as RoutingDecision['route'],
      confidence,
      reasoning,
      budget,
    };
    if (Array.isArray(p.requiredCapabilities)) {
      out.requiredCapabilities = p.requiredCapabilities.filter((x) => typeof x === 'string') as string[];
    }
    if (typeof p.consentRequired === 'boolean') out.consentRequired = p.consentRequired;
    if (typeof p.selected_path === 'string') out.selected_path = p.selected_path;
    return out;
  }

  /**
   * 路由决策（使用指定的 LLM 提供商，支持降级）
   */
  private async decideRouting(
    intentAnalysis: IntentAnalysis,
    provider: LlmProvider,
    requestId?: string,
  ): Promise<RoutingDecision> {
    const prompt = this.buildRoutingPrompt(intentAnalysis);
    const tokenContext = requestId
      ? { request_id: requestId, state_machine_step: 'INTAKE' as OrchestrationStep, sub_agent: 'Orchestrator' as SubAgentType }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            route: {
              type: 'string',
              enum: ['SYSTEM1_API', 'SYSTEM1_RAG', 'SYSTEM2_REASONING', 'SYSTEM2_ANALYSIS', 'SYSTEM2_WEBBROWSE'],
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
            budget: {
              type: 'object',
              properties: {
                max_seconds: { type: 'number' },
                max_steps: { type: 'number' },
                max_browser_steps: { type: 'number' },
              },
              required: ['max_seconds', 'max_steps', 'max_browser_steps'],
            },
            requiredCapabilities: {
              type: 'array',
              items: { type: 'string' },
            },
            consentRequired: { type: 'boolean' },
            selected_path: {
              type: 'string',
              enum: ['FAST', 'DEEP'],
              description: 'Optional UX label: FAST≈System1 shallow path, DEEP≈System2 reasoning',
            },
          },
          required: ['route', 'confidence', 'reasoning', 'budget'],
        },
        '路由决策',
        tokenContext,
      );

      const parsed = this.extractJSONFromResponse(response);
      const normalized = this.normalizeRoutingDecision(parsed);
      if (normalized) return normalized;
      this.logger.warn(
        `[Claude Orchestrator] 路由决策 JSON 无效或缺 route（常见于 LLM 超时后 mock 返回空对象），使用默认 System2`,
      );
      return this.getDefaultRoutingDecision('路由决策返回无效或空，使用默认值');
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] 路由决策失败，使用默认值: ${error?.message}`);
      return this.getDefaultRoutingDecision('路由决策失败，使用默认值');
    }
  }

  /**
   * 选择 Skills（使用指定的 LLM 提供商）
   */
  private async selectSkills(
    intentAnalysis: IntentAnalysis,
    routingDecision: RoutingDecision,
    context: AgentContext,
    provider: LlmProvider,
    requestId?: string,
    emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'],
  ): Promise<SkillsPlan> {
    // 获取所有可用的 Skills
    const availableSkills = this.getAvailableSkills(emergencyConstraints);
    
    if (availableSkills.length === 0) {
      this.logger.warn('[Claude Orchestrator] 没有可用的 Skills');
      return {
        selectedSkills: [],
        executionOrder: [],
        dependencies: {},
      };
    }

    const prompt = this.buildSkillsSelectionPrompt(
      intentAnalysis,
      routingDecision,
      availableSkills,
    );
    const tokenContext = requestId
      ? { request_id: requestId, state_machine_step: 'RESEARCH' as OrchestrationStep, sub_agent: 'Planner' as SubAgentType }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            selectedSkills: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  skillName: { type: 'string' },
                  reason: { type: 'string' },
                  priority: { type: 'number' },
                  input: { type: 'object' },
                  dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                required: ['skillName', 'reason', 'priority', 'input'],
              },
            },
            executionOrder: {
              type: 'array',
              items: { type: 'string' },
            },
            dependencies: { type: 'object' },
          },
          required: ['selectedSkills', 'executionOrder', 'dependencies'],
        },
        'Skills 选择',
        tokenContext,
      );

      const parsed = this.extractJSONFromResponse(response);
      return parsed as SkillsPlan;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] Skills 选择失败: ${error?.message}`);
      return {
        selectedSkills: [],
        executionOrder: [],
        dependencies: {},
      };
    }
  }

  /**
   * 编排执行计划（使用指定的 LLM 提供商）
   */
  private async planExecution(
    skillsPlan: SkillsPlan,
    routingDecision: RoutingDecision,
    provider: LlmProvider,
    requestId?: string,
  ): Promise<ExecutionPlan> {
    if (skillsPlan.selectedSkills.length === 0) {
      return {
        steps: [],
        parallelGroups: [],
        fallbackStrategy: {
          onError: 'continue',
          retryCount: 1,
        },
      };
    }

    const prompt = this.buildExecutionPlanningPrompt(skillsPlan, routingDecision);
    const tokenContext = requestId
      ? { request_id: requestId, state_machine_step: 'RESEARCH' as OrchestrationStep, sub_agent: 'Planner' as SubAgentType }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['skill', 'action', 'parallel_group'],
                  },
                  skillName: { type: 'string' },
                  actionName: { type: 'string' },
                  dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  parallel: { type: 'boolean' },
                  input: { type: 'object' },
                  fallback: {
                    type: 'object',
                    properties: {
                      onError: {
                        type: 'string',
                        enum: ['continue', 'stop', 'retry'],
                      },
                      retryCount: { type: 'number' },
                    },
                  },
                },
                required: ['id', 'type', 'dependencies', 'parallel'],
              },
            },
            parallelGroups: {
              type: 'array',
              items: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            fallbackStrategy: {
              type: 'object',
              properties: {
                onError: {
                  type: 'string',
                  enum: ['continue', 'stop'],
                },
                retryCount: { type: 'number' },
              },
              required: ['onError', 'retryCount'],
            },
            estimatedDuration: { type: 'number' },
            estimatedCost: { type: 'number' },
          },
          required: ['steps', 'parallelGroups', 'fallbackStrategy'],
        },
        '执行计划编排',
        tokenContext,
      );

      const parsed = this.extractJSONFromResponse(response);
      return parsed as ExecutionPlan;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] 执行计划编排失败: ${error?.message}`);
      // 降级：生成简单的顺序执行计划
      return this.generateFallbackPlan(skillsPlan);
    }
  }

  /**
   * 验证计划输入参数（提前识别缺失参数）
   * 
   * 使用配置化的验证规则，支持从 skill metadata 读取（如果已定义）
   */
  /**
   * 验证执行计划的输入参数
   * 
   * 在 plan 编排之后再次验证，确保所有参数都已准备
   * 
   * 优先使用 SkillInputValidatorService（统一验证服务）
   * 如果没有注入，降级到原有的验证逻辑（向后兼容）
   */
  private async validatePlanInputs(
    plan: ExecutionPlan,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): Promise<{
    valid: boolean;
    missingParams?: string[];
    clarificationMessage?: string;
    solutions?: string[];
  }> {
    const intentSnapshot = this.buildSkillInputIntentSnapshot(request, context);
    // 优先使用统一验证服务
    if (this.skillInputValidator) {
      const missingParams: string[] = [];
      const results: Record<string, any> = {};

      for (const step of plan.steps) {
        if (step.type === 'skill' && step.skillName) {
          // 准备输入参数（模拟执行前的准备）
          const input = this.prepareSkillInput(step, results, context, request, intentSnapshot);
          
          // 获取 skill 的 metadata
          const skill = this.skillsRegistry?.getSkill(step.skillName);
          const metadata = skill?.metadata;
          
          // 使用统一验证服务
          const validationResult = this.skillInputValidator.validate(
            step.skillName,
            input,
            metadata,
            {
              context,
              request,
              stepResults: results,
              planSteps: plan.steps.map(s => ({ id: s.id, skillName: s.skillName })),
            },
          );
          
          if (!validationResult.valid && validationResult.missingParams.length > 0) {
            missingParams.push(...validationResult.missingParams);
          }
        }
      }

      if (missingParams.length > 0) {
        const uniqueMissingParams = [...new Set(missingParams)];
        return {
          valid: false,
          missingParams: uniqueMissingParams,
          clarificationMessage: this.buildMissingParamClarificationMessage({
            message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
            missingParams: uniqueMissingParams,
          }),
          solutions: this.extractSolutionsFromError({
            message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
          }),
        };
      }

      return { valid: true };
    }
    
    // 降级到原有验证逻辑（向后兼容）
    const missingParams: string[] = [];
    const results: Record<string, any> = {};

    for (const step of plan.steps) {
      if (step.type === 'skill' && step.skillName) {
        const input = this.prepareSkillInput(step, results, context, request, intentSnapshot);
        const validationRule = SKILL_VALIDATION_RULES[step.skillName];
        
        if (validationRule) {
          const validationResult = this.validateSkillInputWithRule(
            step.skillName,
            input,
            validationRule,
            context,
            request,
          );
          
          if (validationResult.missingParams.length > 0) {
            missingParams.push(...validationResult.missingParams);
          }
        } else {
          this.logger.debug(`[Claude Orchestrator] Skill ${step.skillName} 没有配置验证规则，跳过验证`);
        }
      }
    }

    if (missingParams.length > 0) {
      const uniqueMissingParams = [...new Set(missingParams)];
      const clarificationMessage = this.buildMissingParamClarificationMessage({
        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
        missingParams: uniqueMissingParams,
      });
      
      const solutions = this.extractSolutionsFromError({
        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
      });

      return {
        valid: false,
        missingParams: uniqueMissingParams,
        clarificationMessage,
        solutions,
      };
    }

    return { valid: true };
  }

  /**
   * 当 Skills 仅包含 web.browse 且未提供 url 时，用用户 message 拼 DuckDuckGo 搜索 URL（并补 query），
   * 使 4.5 校验与后续执行能拿到合法入参。避免「穿搭清单」类问题无链接仍走 WEBBROWSE 路径时报缺 url。
   */
  private injectWebBrowseUrlIfMissing(
    skillsPlan: SkillsPlan,
    request: RouteAndRunRequestDto,
  ): void {
    const hasBrowse = skillsPlan.selectedSkills.some((s) => s.skillName === 'web.browse');
    if (!hasBrowse) return;
    const msg = request.message?.trim();
    if (!msg) return;
    const q = msg.length > 400 ? `${msg.slice(0, 400)}…` : msg;
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
    for (const sel of skillsPlan.selectedSkills) {
      if (sel.skillName !== 'web.browse') continue;
      if (!sel.input) sel.input = {} as Record<string, unknown>;
      const url = (sel.input as { url?: unknown }).url;
      if (typeof url !== 'string' || !url.trim()) {
        (sel.input as { url: string; query?: string }).url = searchUrl;
        if (!(sel.input as { query?: string }).query) {
          (sel.input as { query: string }).query = msg;
        }
        this.logger.debug(
          `[Claude Orchestrator] web.browse 缺 url，已注入 DuckDuckGo 搜索 URL`,
        );
      }
    }
  }

  /**
   * 验证 Skills 输入参数（在 plan 编排之前）
   * 
   * 提前验证，避免浪费 LLM 调用成本
   * 
   * 优先使用 SkillInputValidatorService（统一验证服务）
   * 如果没有注入，降级到原有的验证逻辑（向后兼容）
   */
  private async validateSkillsInputs(
    skillsPlan: SkillsPlan,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): Promise<{
    valid: boolean;
    missingParams?: string[];
    clarificationMessage?: string;
    solutions?: string[];
  }> {
    // 优先使用统一验证服务
    if (this.skillInputValidator) {
      const missingParams: string[] = [];
      
      for (const skillSelection of skillsPlan.selectedSkills) {
        if (skillSelection.skillName) {
          // 获取 skill 的 metadata
          const skill = this.skillsRegistry?.getSkill(skillSelection.skillName);
          const metadata = skill?.metadata;
          
          // 使用统一验证服务
          const input = skillSelection.input || {};
          const validationResult = this.skillInputValidator.validate(
            skillSelection.skillName,
            input,
            metadata,
            {
              context,
              request,
              // Skills 选择阶段还没有步骤结果
              stepResults: {},
            },
          );
          
          if (!validationResult.valid && validationResult.missingParams.length > 0) {
            missingParams.push(...validationResult.missingParams);
          }
        }
      }
      
      if (missingParams.length > 0) {
        const uniqueMissingParams = [...new Set(missingParams)];
        return {
          valid: false,
          missingParams: uniqueMissingParams,
          clarificationMessage: this.buildMissingParamClarificationMessage({
            message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
            missingParams: uniqueMissingParams,
          }),
          solutions: this.extractSolutionsFromError({
            message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
          }),
        };
      }
      
      return { valid: true };
    }
    
    // 降级到原有验证逻辑（向后兼容）
    const missingParams: string[] = [];
    
    for (const skillSelection of skillsPlan.selectedSkills) {
      if (skillSelection.skillName) {
        const validationRule = SKILL_VALIDATION_RULES[skillSelection.skillName];
        
        if (validationRule) {
          const input = skillSelection.input || {};
          const validationResult = this.validateSkillInputWithRule(
            skillSelection.skillName,
            input,
            validationRule,
            context,
            request,
          );
          
          if (validationResult.missingParams.length > 0) {
            missingParams.push(...validationResult.missingParams);
          }
        }
      }
    }
    
    if (missingParams.length > 0) {
      const uniqueMissingParams = [...new Set(missingParams)];
      const clarificationMessage = this.buildMissingParamClarificationMessage({
        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
        missingParams: uniqueMissingParams,
      });
      
      const solutions = this.extractSolutionsFromError({
        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
      });

      return {
        valid: false,
        missingParams: uniqueMissingParams,
        clarificationMessage,
        solutions,
      };
    }

    return { valid: true };
  }

  /**
   * 使用验证规则验证 skill 输入参数
   */
  private validateSkillInputWithRule(
    skillName: string,
    input: any,
    rule: typeof SKILL_VALIDATION_RULES[string],
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): {
    missingParams: string[];
  } {
    const missingParams: string[] = [];
    
    // 1. 使用提取器填充参数
    if (rule.extractors) {
      for (const [param, extractor] of Object.entries(rule.extractors)) {
        if (!this.hasValue(input[param])) {
          // 特殊处理：countryCode 提取器需要注入 extractCountryCodeFromMessage
          if (param === 'countryCode') {
            const countryCode = this.extractCountryCodeFromMessage(request.message);
            if (countryCode) {
              input[param] = countryCode;
            } else {
              // 如果提取器也没有返回值，尝试调用提取器
              const extracted = extractor(context, request);
              if (extracted) {
                input[param] = extracted;
              }
            }
          } else {
            const extracted = extractor(context, request);
            if (extracted) {
              input[param] = extracted;
            }
          }
        }
      }
    }
    
    // 2. 检查依赖关系
    if (rule.dependencies) {
      for (const dep of rule.dependencies) {
        const hasParam = this.hasValue(input[dep.param]);
        const hasAlternatives = dep.alternatives?.some(alt => 
          this.hasValue(input[alt]) || 
          (alt === 'tripId' && (context.tripId || request.trip_id))
        );
        
        if (!hasParam && !hasAlternatives) {
          if (dep.alternatives && dep.alternatives.length > 0) {
            missingParams.push(`${dep.param} 或 ${dep.alternatives.join('、')}`);
          } else {
            missingParams.push(dep.param);
          }
        }
      }
    }
    
    return { missingParams };
  }

  /**
   * 检查参数是否有值
   */
  private hasValue(value: any): boolean {
    return value !== undefined && value !== null && value !== '';
  }

  /** 与 SKILL_VALIDATION_RULES 对齐：哪些 skill 的校验依赖 planState */
  private skillValidationRequiresPlanState(skillName?: string): boolean {
    if (!skillName) return false;
    const rule = SKILL_VALIDATION_RULES[skillName];
    return !!rule?.dependencies?.some((d) => d.param === 'planState');
  }

  /** 从已执行步骤结果中提取最近一次出现的 planState（供编排链传递） */
  private extractPlanStateFromStepResults(results: Record<string, any>): PlanState | undefined {
    const keys = Object.keys(results);
    for (let i = keys.length - 1; i >= 0; i--) {
      const r = results[keys[i]];
      if (r && typeof r === 'object' && 'planState' in r && this.hasValue((r as any).planState)) {
        return (r as any).planState as PlanState;
      }
    }
    return undefined;
  }

  /**
   * 从用户消息中提取天数（轻量规则，与 INTAKE 解析一致思路；用于编排缺省 PlanState）
   */
  private extractDaysFromMessageForPlanBootstrap(message: string): number | undefined {
    if (!message) return undefined;
    const patterns = [/(\d+)\s*天/, /(\d+)\s*日/, /(\d+)\s*days?/i];
    for (const pattern of patterns) {
      const m = message.match(pattern);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n <= 60) return n;
      }
    }
    const zh: Array<[RegExp, number]> = [
      [/七日|七天/, 7],
      [/六日|六天/, 6],
      [/五日|五天/, 5],
      [/四日|四天/, 4],
      [/三日|三天/, 3],
      [/两日|两天|二日|二天/, 2],
      [/一日|一天/, 1],
    ];
    for (const [re, val] of zh) {
      if (re.test(message)) return val;
    }
    return undefined;
  }

  /**
   * 编排层引导 PlanState：与 PlanningWorkbench `createInitialPlanState` 对齐的精简版，
   * 用于 LLM 编排了 plan.* / gate.* 但未注入 planState、且前两步结果不带 planState 时的兜底。
   */
  /**
   * 若 skill 未在返回值中带回 planState，将本次输入中的 planState 透传，供后续 plan.* 步骤使用。
   */
  private mergeSkillOutputWithPlanStateInput(
    input: { planState?: PlanState } | null | undefined,
    result: any,
  ): any {
    if (
      input?.planState &&
      result &&
      typeof result === 'object' &&
      !Array.isArray(result) &&
      !('planState' in result)
    ) {
      return { ...result, planState: input.planState };
    }
    return result;
  }

  /**
   * 将先前步骤中 SafeTravel RSS（`safetravel_alerts` / `rss_refined`）并入 `research_data`，供 itinerary.verify 封路段对齐。
   */
  /**
   * 将 plan 中 world.buildContext 结果并入 research_data（worldModelMeta → DSO 优化门控）
   */
  private mergePriorWorldBuildIntoResearchData(
    existing: Record<string, any> | undefined,
    results: Record<string, any>,
  ): Record<string, any> {
    const out: Record<string, any> = { ...(existing ?? {}) };
    for (const stepResult of Object.values(results)) {
      if (
        stepResult &&
        typeof stepResult === 'object' &&
        !Array.isArray(stepResult) &&
        (stepResult as any).world &&
        (stepResult as any).missingPieces !== undefined
      ) {
        mergeWorldBuildIntoResearchData(out, stepResult as any);
      }
    }
    return out;
  }

  private mergePriorSafetravelIntoResearchData(
    existing: Record<string, any> | undefined,
    results: Record<string, any>,
  ): Record<string, any> {
    const out: Record<string, any> = { ...(existing ?? {}) };
    const collected: any[] = [];
    for (const stepResult of Object.values(results)) {
      if (!stepResult || typeof stepResult !== 'object' || Array.isArray(stepResult)) continue;
      if ('safetravel_alerts' in stepResult && Array.isArray((stepResult as any).safetravel_alerts)) {
        const pre = (stepResult as any).safetravel_alerts as unknown[];
        if (pre.length > 0) collected.push(...pre);
        continue;
      }
      const rss = (stepResult as any).rss_refined;
      if (Array.isArray(rss) && rss.length > 0) {
        collected.push(...rssRefinedItemsToSafetravelRouteAlerts(rss));
      }
    }
    const prior = Array.isArray(out.safetravel_alerts) ? out.safetravel_alerts : [];
    const merged = [...prior, ...collected];
    const byId = new Map<string, any>();
    for (const a of merged) {
      const id = typeof a?.id === 'string' && a.id.length > 0 ? a.id : JSON.stringify(a).slice(0, 120);
      byId.set(id, a);
    }
    out.safetravel_alerts = [...byId.values()];
    return out;
  }

  private buildBootstrapPlanState(context: AgentContext, request: RouteAndRunRequestDto): PlanState {
    const tripId = context.tripId || request.trip_id || undefined;
    const days =
      this.extractDaysFromMessageForPlanBootstrap(request.message || '') ??
      (/行程|路线|规划|出行|itinerary|route/i.test(request.message || '') ? 7 : 5);
    const countryHint = this.extractCountryCodeFromMessage(request.message || '');
    return {
      plan_id: `plan_${Date.now()}`,
      plan_version: 1,
      constraints: {
        time: { days },
        budget: {},
        fitness: {},
      },
      itinerary: {
        tripId: tripId || `trip_${Date.now()}`,
        routeDirectionId: `route_${Date.now()}`,
        segments: [],
      },
      mobility: { transferSegments: [] },
      budget: {},
      pace: {},
      gate: {
        status: 'NEED_CONFIRM',
        reasons: ['编排引导初始状态'],
        missingEvidence: [],
      },
      evidence_refs: [],
      decision_log_refs: [],
      status: 'DRAFT',
      metadata: {
        ...(countryHint ? { destination: { country: countryHint } } : {}),
        orchestratorBootstrap: true,
      },
    };
  }

  /**
   * 执行计划
   */
  private async executePlan(
    plan: ExecutionPlan,
    context: AgentContext,
    request: RouteAndRunRequestDto,
    intentSnapshot?: SkillInputIntentSnapshot,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const stepsExecuted: OrchestrationResult['stepsExecuted'] = [];
    const results: Record<string, any> = {};
    const decisionLog: OrchestrationResult['decisionLog'] = [];

    try {
      // 按计划顺序执行步骤
      for (const step of plan.steps) {
        const stepStartTime = Date.now();
        
        try {
          if (step.type === 'skill') {
            if (!this.skillsRegistry) {
              throw new Error(`SkillsRegistry 未注入，无法执行 Skill: ${step.skillName}`);
            }
            
            const skill = this.skillsRegistry.getSkill(step.skillName!);
            if (!skill) {
              const availableSkills = this.skillsRegistry.getAllSkills().map(s => s.metadata.name);
              this.logger.error(`[Claude Orchestrator] Skill 不存在: ${step.skillName}, 可用 Skills: ${availableSkills.join(', ')}`);
              throw new Error(`Skill not found: ${step.skillName}. Available: ${availableSkills.slice(0, 5).join(', ')}...`);
            }

            // 准备输入（可以使用前面步骤的结果）
            const input = this.prepareSkillInput(step, results, context, request, intentSnapshot);
            
            // 执行 Skill
            this.logger.debug(`[Claude Orchestrator] 执行 Skill: ${step.skillName}`);
            const result = await skill.execute(input);
            const mergedSkillResult = this.mergeSkillOutputWithPlanStateInput(input, result);
            results[step.id] = this.sanitizeOrchestrationHandoff(request, mergedSkillResult);
            
            stepsExecuted.push({
              stepId: step.id,
              skillName: step.skillName,
              success: true,
              result: mergedSkillResult,
              duration: Date.now() - stepStartTime,
            });
          } else if (step.type === 'action' && this.actionRegistry) {
            const action = this.actionRegistry.get(step.actionName!);
            if (!action) {
              throw new Error(`Action not found: ${step.actionName}`);
            }

            const input = this.prepareActionInput(step, results, context, request);
            // Action.execute 需要 input 和 state 两个参数
            const state = {
              requestId: context.requestId,
              userId: context.userId,
              tripId: context.tripId,
              results,
            };
            const result = await action.execute(input, state);
            results[step.id] = this.sanitizeOrchestrationHandoff(request, result);
            
            stepsExecuted.push({
              stepId: step.id,
              actionName: step.actionName,
              success: true,
              result,
              duration: Date.now() - stepStartTime,
            });
          }
        } catch (error: any) {
          this.logger.error(`[Claude Orchestrator] 步骤执行失败: ${step.id}, ${error?.message}`);
          
          // 检查是否是关键依赖缺失错误
          if (error?.isCriticalDependencyMissing) {
            this.logger.warn(`[Claude Orchestrator] 检测到关键依赖缺失: ${step.skillName || step.actionName}`);
            // 抛出特殊错误，让外层捕获并转换为用户澄清消息
            const criticalError = new Error(error.message);
            (criticalError as any).isCriticalDependencyMissing = true;
            (criticalError as any).missingServices = error.missingServices || [];
            (criticalError as any).solutions = error.solutions || [];
            (criticalError as any).stepId = step.id;
            (criticalError as any).skillName = step.skillName || step.actionName;
            throw criticalError;
          }
          
          // 根据 fallback 策略处理错误
          if (step.fallback?.onError === 'continue') {
            stepsExecuted.push({
              stepId: step.id,
              skillName: step.skillName,
              actionName: step.actionName,
              success: false,
              error: error?.message || '未知错误',
              duration: Date.now() - stepStartTime,
            });
            continue;
          } else if (step.fallback?.onError === 'stop') {
            throw error;
          } else if (step.fallback?.onError === 'retry' && step.fallback.retryCount) {
            // 重试逻辑
            const maxRetries = step.fallback.retryCount;
            let retries = 0;
            let lastError = error;
            
            while (retries < maxRetries) {
              retries++;
              this.logger.warn(`[Claude Orchestrator] 重试步骤: ${step.id}, 第 ${retries}/${maxRetries} 次`);
              
              // 等待后重试（指数退避）
              const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000);
              await new Promise(resolve => setTimeout(resolve, delay));
              
              try {
                // 重新执行步骤
                if (step.type === 'skill') {
                  const skill = this.skillsRegistry?.getSkill(step.skillName!);
                  if (!skill) {
                    throw new Error(`Skill not found: ${step.skillName}`);
                  }
                  const input = this.prepareSkillInput(step, results, context, request, intentSnapshot);
                  const result = await skill.execute(input);
                  const merged = this.mergeSkillOutputWithPlanStateInput(input, result);
                  results[step.id] = this.sanitizeOrchestrationHandoff(request, merged);
                  
                  stepsExecuted.push({
                    stepId: step.id,
                    skillName: step.skillName,
                    success: true,
                    result: merged,
                    duration: Date.now() - stepStartTime,
                  });
                  
                  // 重试成功，跳出循环
                  break;
                } else if (step.type === 'action' && this.actionRegistry) {
                  const action = this.actionRegistry.get(step.actionName!);
                  if (!action) {
                    throw new Error(`Action not found: ${step.actionName}`);
                  }
                  const input = this.prepareActionInput(step, results, context, request);
                  const state = {
                    requestId: context.requestId,
                    userId: context.userId,
                    tripId: context.tripId,
                    results,
                  };
                  const result = await action.execute(input, state);
                  results[step.id] = this.sanitizeOrchestrationHandoff(request, result);
                  
                  stepsExecuted.push({
                    stepId: step.id,
                    actionName: step.actionName,
                    success: true,
                    result,
                    duration: Date.now() - stepStartTime,
                  });
                  
                  // 重试成功，跳出循环
                  break;
                }
              } catch (retryError: any) {
                lastError = retryError;
                if (retries >= maxRetries) {
                  // 重试次数用完，记录失败
                  this.logger.error(`[Claude Orchestrator] 步骤 ${step.id} 重试 ${maxRetries} 次后仍失败`);
                  stepsExecuted.push({
                    stepId: step.id,
                    skillName: step.skillName,
                    actionName: step.actionName,
                    success: false,
                    error: lastError?.message || '未知错误',
                    duration: Date.now() - stepStartTime,
                  });
                  // 根据 fallback 策略决定是否继续
                  if (plan.fallbackStrategy.onError === 'stop') {
                    throw lastError;
                  }
                  // continue: 继续执行下一个步骤
                  break;
                }
              }
            }
          } else {
            throw error;
          }
        }
      }

      // 整合结果
      const answerText = this.generateAnswerText(results, stepsExecuted);
      
      // 计算总成本（简化估算）
      const totalCost = stepsExecuted.reduce((sum, step) => {
        // 每个 Skill/Action 调用估算成本（简化）
        return sum + (step.success ? 0.001 : 0); // $0.001 per successful step
      }, 0);
      
      return {
        success: true,
        result: results,
        answerText,
        stepsExecuted,
        totalDuration: Date.now() - startTime,
        totalCost,
        decisionLog,
      };
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] 执行计划失败: ${error?.message}`);
      
      // 使用错误类型枚举推断错误类型
      const errorType = inferErrorType(error);
      const strategy = getErrorHandlingStrategy(errorType);
      
      this.logger.warn(`[Claude Orchestrator] 检测到错误: type=${errorType}, shouldShowClarification=${strategy.shouldShowClarification}`);
      
      // 如果需要显示澄清消息，构建用户友好的澄清消息
      if (strategy.shouldShowClarification) {
        let clarificationMessage: string;
        
        if (errorType === ErrorType.CRITICAL_DEPENDENCY_MISSING) {
          clarificationMessage = this.buildClarificationMessage(error);
        } else if (errorType === ErrorType.MISSING_REQUIRED_PARAM) {
          clarificationMessage = this.buildMissingParamClarificationMessage(error);
        } else {
          // 使用策略中的消息模板
          clarificationMessage = strategy.messageTemplate
            .replace('{errorMessage}', error?.message || '未知错误')
            .replace('{skillName}', error?.skillName || '未知服务');
        }
        
        return {
          success: false,
          result: {
            ...results,
            // 澄清消息字段统一放在 result 中（与 OrchestrationResult 接口保持一致）
            needsUserConfirmation: strategy.requiresUserConfirmation,
            clarificationMessage,
            missingServices: error.missingServices || [],
            solutions: strategy.suggestedSolutions.length > 0 
              ? strategy.suggestedSolutions 
              : this.extractSolutionsFromError(error),
            errorType, // 新增：错误类型
          },
          answerText: clarificationMessage,
          stepsExecuted,
          totalDuration: Date.now() - startTime,
          decisionLog,
        };
      }
      
      // 普通错误处理
      return {
        success: false,
        result: results,
        answerText: `执行过程中出现错误：${error?.message || '未知错误'}`,
        stepsExecuted,
        totalDuration: Date.now() - startTime,
        decisionLog,
      };
    }
  }
  
  /**
   * 构建用户友好的澄清消息（优化版：去除技术术语）
   */
  private buildClarificationMessage(error: any): string {
    const skillName = this.translateSkillName(error.skillName || '未知服务');
    const missingServices = error.missingServices || [];
    const solutions = error.solutions || [];
    
    const message = [
      `抱歉，暂时无法完成行程规划。`,
      '',
      '原因：',
      `- ${skillName}暂时不可用`,
      ...(missingServices.length > 0 ? [
        '',
        '受影响的功能：',
        ...missingServices.map((service: string) => `- ${this.translateServiceName(service)}`)
      ] : []),
      '',
      '您可以：',
      ...solutions.map((solution: string, index: number) => `${index + 1}. ${solution}`),
      '',
      '如果问题持续存在，请联系客服或稍后重试。',
    ].join('\n');
    
    return message;
  }

  /**
   * 🆕 翻译技能名称（去除技术术语）
   */
  private translateSkillName(skillName: string): string {
    const translations: Record<string, string> = {
      'transport.search': '交通查询服务',
      'poi.search': '地点搜索服务',
      'dem.get_profile': '地形分析服务',
      'opening_hours.get': '开放时间查询服务',
      'geo.check.hazard.zones': '安全风险评估服务',
    };
    return translations[skillName] || skillName;
  }

  /**
   * 🆕 翻译服务名称（去除技术术语）
   */
  private translateServiceName(service: string): string {
    const translations: Record<string, string> = {
      'transport': '交通信息查询',
      'poi': '地点信息查询',
      'dem': '地形数据分析',
      'opening_hours': '开放时间查询',
      'hazard_zones': '安全风险评估',
    };
    return translations[service] || service;
  }

  /**
   * 构建缺少必需参数的澄清消息（优化版：使用用户语言）
   */
  private buildMissingParamClarificationMessage(error: any): string {
    const errorMessage = error?.message || '缺少必需参数';
    
    // 尝试从错误消息或 error.missingParams 中提取缺失的参数名
    let missingParams: string[] = [];
    if (error?.missingParams && Array.isArray(error.missingParams)) {
      missingParams = error.missingParams.map((p: string) => this.translateParamName(p));
    } else {
      // 从错误消息中提取
      if (errorMessage.includes('countryCode')) {
        missingParams.push('目的地国家');
      }
      if (errorMessage.includes('tripId')) {
        missingParams.push('行程ID');
      }
      if (errorMessage.includes('world')) {
        missingParams.push('行程上下文信息');
      }
      if (missingParams.length === 0) {
        // 尝试从错误消息中提取参数名
        const match = errorMessage.match(/(\w+)\s*是必需的/);
        if (match) {
          missingParams.push(this.translateParamName(match[1]));
        } else {
          // 尝试匹配 "缺少必需参数: xxx, yyy" 格式
          const paramMatch = errorMessage.match(/缺少必需参数:\s*(.+)/);
          if (paramMatch) {
            missingParams = paramMatch[1].split(',').map((p: string) => this.translateParamName(p.trim()));
          } else {
            missingParams.push('必需信息');
          }
        }
      }
    }
    
    const missingParam = missingParams.join('、');
    
    const solutions = this.extractSolutionsFromError(error);
    
    const message = [
      `需要补充一些信息才能完成行程规划。`,
      '',
      `缺少的信息：`,
      `- ${missingParam || '必需信息'}`,
      '',
      `您可以：`,
      ...solutions.map((solution: string, index: number) => `${index + 1}. ${solution}`),
      '',
      `提供这些信息后，我们将继续为您规划行程。`,
    ].join('\n');
    
    return message;
  }

  /**
   * 🆕 翻译参数名称（去除技术术语）
   */
  private translateParamName(paramName: string): string {
    const translations: Record<string, string> = {
      'countryCode': '目的地国家',
      'tripId': '行程ID',
      'world': '行程上下文信息',
      'destination': '目的地',
      'origin': '出发地',
      'date_range': '日期范围',
      'start_date': '开始日期',
      'days': '行程天数',
      'mode': '交通方式',
      'party': '同行人员信息',
      'constraints': '约束条件',
      'preferences': '偏好设置',
      planState: '行程规划状态',
      request: '行程请求上下文',
      itinerary: '当前日程结构',
    };
    return translations[paramName] || paramName;
  }

  /**
   * 从错误消息中提取解决方案
   */
  private extractSolutionsFromError(error: any): string[] {
    const errorMessage = error?.message || '';
    const solutions: string[] = [];
    
    // 如果错误消息中包含提示信息（如"可通过 tripId 或直接传入"）
    if (errorMessage.includes('可通过')) {
      const match = errorMessage.match(/可通过\s*([^或]+)(?:\s*或\s*([^）]+))?/);
      if (match) {
        if (match[1]) {
          solutions.push(`通过 ${match[1].trim()} 提供信息`);
        }
        if (match[2]) {
          solutions.push(`或直接 ${match[2].trim()}`);
        }
      }
    }
    
    // 根据错误类型添加通用解决方案
    if (errorMessage.includes('countryCode')) {
      if (!solutions.length) {
        solutions.push('在请求中提供国家代码（如 "CN"、"IS"）');
        solutions.push('或提供已保存的行程 ID，系统将自动获取国家代码');
        solutions.push('或在消息中明确提及目的地国家（如 "中国"、"冰岛"）');
      }
    } else if (errorMessage.includes('tripId')) {
      if (!solutions.length) {
        solutions.push('提供已保存的行程 ID');
        solutions.push('或直接提供行程相关的详细信息（目的地、日期等）');
      }
    } else {
      if (!solutions.length) {
        solutions.push('检查请求参数是否完整');
        solutions.push('提供更多上下文信息');
      }
    }
    
    return solutions.length > 0 ? solutions : ['请提供完整的请求信息'];
  }

  // ==================== 辅助方法 ====================

  /**
   * 构建意图分析提示词
   */
  private buildIntentAnalysisPrompt(
    request: RouteAndRunRequestDto,
    context: AgentContext,
  ): string {
    const destSupplement = resolveDestinationLlmPromptSupplement({
      userMessage: request.message,
      destinationHint: request.message,
    });
    const destBlock = destSupplement ? `\n[目的地特化规则]\n${destSupplement}\n` : '';
    return `
${INTENT_ANALYSIS_PROMPT}

[用户请求]
${request.message}

[上下文信息]
- 用户 ID: ${context.userId}
- 行程 ID: ${context.tripId || '无'}
- 对话历史: ${context.conversationHistory?.join('\n') || '无'}
${destBlock}
请分析用户意图。
`.trim();
  }

  /**
   * 构建路由决策提示词
   */
  private buildRoutingPrompt(intentAnalysis: IntentAnalysis): string {
    return `
${ROUTING_DECISION_PROMPT}

[意图分析结果]
${JSON.stringify(intentAnalysis, null, 2)}

请根据意图分析结果，决定路由策略。
`.trim();
  }

  /**
   * 构建 Skills 选择提示词
   */
  private buildSkillsSelectionPrompt(
    intentAnalysis: IntentAnalysis,
    routingDecision: RoutingDecision,
    availableSkills: Array<{ name: string; description: string }>,
  ): string {
    const skillsList = availableSkills.map(skill => 
      `- ${skill.name}: ${skill.description}`
    ).join('\n');

    return `
${SKILLS_SELECTION_PROMPT}

[意图分析结果]
${JSON.stringify(intentAnalysis, null, 2)}

[路由决策]
${JSON.stringify(routingDecision, null, 2)}

[可用 Skills]
${skillsList}

请选择最合适的 Skills。
`.trim();
  }

  /**
   * 构建执行计划编排提示词
   */
  private buildExecutionPlanningPrompt(
    skillsPlan: SkillsPlan,
    routingDecision: RoutingDecision,
  ): string {
    return `
${EXECUTION_PLANNING_PROMPT}

[Skills 选择结果]
${JSON.stringify(skillsPlan, null, 2)}

[路由决策]
${JSON.stringify(routingDecision, null, 2)}

请编排最优的执行计划。
`.trim();
  }

  /**
   * 获取可用的 Skills
   */
  private getAvailableSkills(
    emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'],
  ): Array<{ name: string; description: string }> {
    if (!this.skillsRegistry) {
      this.logger.warn('[Claude Orchestrator] SkillsRegistry 未注入，返回空列表');
      return [];
    }

    try {
      // 获取所有注册的 Skills
      const allSkills =
        typeof (this.skillsRegistry as any).getAllSkillsForEmergencyConstraints === 'function'
          ? (this.skillsRegistry as any).getAllSkillsForEmergencyConstraints(emergencyConstraints)
          : this.skillsRegistry.getAllSkills();
      this.logger.debug(`[Claude Orchestrator] 获取到 ${allSkills.length} 个可用 Skills`);
      
      return allSkills.map((skill: any) => ({
        name: skill?.metadata?.name || 'unknown',
        description: skill?.metadata?.description || 'No description',
      }));
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] 获取 Skills 失败: ${error?.message}`, error?.stack);
      return [];
    }
  }

  /**
   * 裁剪版「意图快照」：为动态计划中的 verify / smart_update 自动补水，无需塞入整条 OrchestratorState。
   */
  /**
   * 裁剪版「意图快照」：为动态计划中的 verify / smart_update 自动补水，无需塞入整条 OrchestratorState。
   */
  private buildSkillInputIntentSnapshot(
    request: RouteAndRunRequestDto,
    context: AgentContext,
  ): SkillInputIntentSnapshot | undefined {
    const hints: IcelandVehicleIntentHints = {};
    const reqAny = request as unknown as Record<string, unknown>;
    const optAny = (request.options ?? {}) as Record<string, unknown>;
    const tpReq = optAny.trip_plan_request as { constraints?: { vehicle_type?: string } } | undefined;
    const vtRaw =
      (reqAny.constraints as { vehicle_type?: string } | undefined)?.vehicle_type ?? tpReq?.constraints?.vehicle_type;
    if (vtRaw === '2WD' || vtRaw === '4WD') {
      hints.constraints_vehicle_type = vtRaw;
    }

    const up = context.userPreferences as Record<string, unknown> | undefined;
    if (up) {
      const flatTp =
        typeof up.transport_preferences === 'string' ? String(up.transport_preferences).trim() : '';
      const nested =
        up.preferences && typeof up.preferences === 'object'
          ? String((up.preferences as Record<string, unknown>).transport_preferences ?? '').trim()
          : '';
      const prefText = nested || flatTp;
      if (prefText) {
        hints.preference_text = prefText;
        if (!hints.transport_preferences) hints.transport_preferences = prefText;
      }
    }

    if (Object.keys(hints).length === 0) return undefined;
    return { intent_hints: hints };
  }

  /**
   * 准备 Skill 输入
   */
  private prepareSkillInput(
    step: ExecutionStep,
    results: Record<string, any>,
    context: AgentContext,
    request: RouteAndRunRequestDto,
    intentSnapshot?: SkillInputIntentSnapshot,
  ): any {
    // 使用步骤中定义的输入，或从前面步骤的结果中提取
    let input: any = {};
    
    if (step.input) {
      // 替换结果引用（例如：${step1.result}）
      const inputStr = JSON.stringify(step.input);
      const processedInput = inputStr.replace(/\$\{(\w+)\}/g, (match, key) => {
        return results[key] ? JSON.stringify(results[key]) : match;
      });
      input = JSON.parse(processedInput);
    }
    
    // 从上下文和请求中提取实际值，替换占位符
    const actualTripId = context.tripId || request.trip_id;
    const actualUserId = context.userId || request.user_id;
    
    // 递归替换占位符
    input = this.replacePlaceholders(input, {
      tripId: actualTripId,
      trip_id: actualTripId,
      userId: actualUserId,
      user_id: actualUserId,
      requestId: context.requestId || request.request_id,
    });
    
    // 如果 input 中没有 tripId，但 context 中有，自动添加
    if (actualTripId && !input.tripId && !input.trip_id) {
      input.tripId = actualTripId;
    }
    
    // 为特定 Skills 提供智能默认值
    if (step.skillName === 'routeDirection.pickForIntent') {
      const optAny = (request.options ?? {}) as Record<string, unknown>;
      // 确保 userIntentTags 是数组
      if (!Array.isArray(input.userIntentTags)) {
        input.userIntentTags = input.userIntentTags ? [input.userIntentTags] : [];
      }
      
      // 如果没有 countryCode，尝试从请求中提取
      if (!input.countryCode && request.message) {
        const countryCode = this.extractCountryCodeFromMessage(request.message);
        if (countryCode) {
          input.countryCode = countryCode;
        }
      }
      
      // 如果没有 season，尝试从消息中提取日期，或使用当前月份作为默认值
      if (!input.season || typeof input.season !== 'number') {
        const extractedMonth = this.extractMonthFromMessage(request.message);
        if (extractedMonth) {
          input.season = extractedMonth;
        } else {
          // 使用当前月份作为默认值
          input.season = new Date().getMonth() + 1;
        }
      }

      const tpReq = optAny.trip_plan_request as TripPlanRequest | undefined;
      if (tpReq) {
        input.tripPlanRequest = tpReq;
      }
    }
    
    // 为 world.buildContext 提供智能默认值
    if (step.skillName === 'world.buildContext') {
      // 尝试从前面步骤的结果中提取 countryCode
      if (!input.countryCode || input.countryCode === 'none') {
        // 查找 routeDirection.pickForIntent 的结果
        for (const [stepId, stepResult] of Object.entries(results)) {
          if (stepResult && typeof stepResult === 'object') {
            // 方法1: 如果前面步骤返回了 routeDirectionId，可以从中提取国家代码
            if (stepResult.routeDirectionId && typeof stepResult.routeDirectionId === 'string') {
              // routeDirectionId 可能是 "default-IS-1" 这样的格式
              const match = stepResult.routeDirectionId.match(/default-([A-Z]{2})-\d+/);
              if (match) {
                input.countryCode = match[1];
                this.logger.debug(`从前面步骤 ${stepId} 的 routeDirectionId 提取 countryCode: ${input.countryCode}`);
                break;
              }
            }
            
            // 方法2: 如果前面步骤直接返回了 countryCode
            if (stepResult.countryCode && typeof stepResult.countryCode === 'string') {
              input.countryCode = stepResult.countryCode;
              this.logger.debug(`从前面步骤 ${stepId} 直接获取 countryCode: ${input.countryCode}`);
              break;
            }
          }
        }
      }
      
      // 如果还是没有 countryCode，尝试从用户消息中提取
      if ((!input.countryCode || input.countryCode === 'none') && request.message) {
        const countryCode = this.extractCountryCodeFromMessage(request.message);
        if (countryCode) {
          input.countryCode = countryCode;
          this.logger.debug(`从用户消息提取 countryCode: ${input.countryCode}`);
        }
      }
      
      // 清理无效值
      if (input.countryCode === 'none' || input.countryCode === 'undefined' || input.countryCode === 'null') {
        delete input.countryCode;
      }

      // Emergency constraint injection (auto-heal): pass through to world.buildContext so physical.roadStates can be overlaid.
      if ((request as any).emergency_constraints && !(input as any).emergency_constraints) {
        (input as any).emergency_constraints = (request as any).emergency_constraints;
      }
    }
    
    // 为 decision.runThreeGuardians 提供智能默认值
    if (step.skillName === 'decision.runThreeGuardians') {
      // 如果没有 world 和 tripId，尝试从前面步骤的结果中提取
      if (!input.world && !input.tripId) {
        // 查找 world.buildContext 的结果
        for (const [stepId, stepResult] of Object.entries(results)) {
          if (stepResult && typeof stepResult === 'object') {
            // 如果前面步骤返回了 world 字段
            if (stepResult.world) {
              input.world = stepResult.world;
              this.logger.debug(`从前面步骤 ${stepId} 提取 world 对象`);
              break;
            }
          }
        }
      }
      
      // 如果还是没有 world，但 context 中有 tripId，使用 tripId
      if (!input.world && !input.tripId && actualTripId) {
        input.tripId = actualTripId;
        this.logger.debug(`使用 context 中的 tripId: ${input.tripId}`);
      }
      
      // 注意：如果没有 world 和 tripId，不自动构建，让 skill 抛出错误，系统会统一返回澄清问题
      // 这样用户可以明确知道缺少什么信息
    }

    // PlanState 链：校验阶段 results 为空时也必须能通过 SKILL_VALIDATION_RULES；运行时从上一步合并（见 executePlan）
    if (step.skillName && this.skillValidationRequiresPlanState(step.skillName) && !this.hasValue(input.planState)) {
      const fromPrior = this.extractPlanStateFromStepResults(results);
      if (fromPrior) {
        input.planState = fromPrior;
      } else {
        input.planState = this.buildBootstrapPlanState(context, request);
      }
    }

    // plan.budget.estimateBaseline 还需要 destination；避免仅因缺省参数卡住校验
    if (step.skillName === 'plan.budget.estimateBaseline') {
      const dest = input.destination;
      const destEmpty =
        !dest ||
        (typeof dest === 'object' &&
          !this.hasValue(dest.country) &&
          !this.hasValue(dest.city) &&
          !this.hasValue((dest as any).region));
      if (destEmpty) {
        const cc = this.extractCountryCodeFromMessage(request.message || '');
        input.destination = {
          country: cc || undefined,
        };
      }
    }

    if (step.skillName === 'itinerary.smart_update') {
      if (!this.hasValue(input.itinerary)) {
        for (const stepResult of Object.values(results)) {
          if (
            stepResult &&
            typeof stepResult === 'object' &&
            !Array.isArray(stepResult) &&
            Array.isArray((stepResult as any).days) &&
            typeof (stepResult as any).request_id === 'string'
          ) {
            input.itinerary = stepResult as any;
            this.logger.debug('[Claude Orchestrator] smart_update: 从先前步骤结果注入 itinerary');
            break;
          }
        }
      }
      if (!input.user_change_intent && typeof request.message === 'string' && request.message.trim()) {
        input.user_change_intent = request.message.trim();
      }
    }

    if (step.skillName === 'itinerary.smart_update' || step.skillName === 'repair.apply') {
      const fromPrior = collectRepairAlternativesFromStepResults(results as Record<string, unknown>);
      const nPoi = fromPrior.alternative_pois.length;
      const nRt = fromPrior.alternative_routes.length;
      input.alternatives = mergeRepairAlternativesBundles(input.alternatives, fromPrior);
      if (nPoi > 0 || nRt > 0) {
        this.logger.debug(
          `[Claude Orchestrator] ${step.skillName}: merged prior-step alternatives (pois=${nPoi}, routes=${nRt})`,
        );
      }
    }

    if (
      step.skillName === 'itinerary.smart_update' ||
      step.skillName === 'itinerary.verify' ||
      step.skillName === 'itinerary.generate'
    ) {
      input.research_data = this.mergePriorSafetravelIntoResearchData(input.research_data, results);
      input.research_data = this.mergePriorWorldBuildIntoResearchData(input.research_data, results);
    }

    if (step.skillName === 'world.buildContext' && input.countryCode === 'NO' && !input.subregion) {
      const poiNames: string[] = [];
      for (const stepResult of Object.values(results)) {
        if (stepResult && typeof stepResult === 'object') {
          const names = (stepResult as any).poi_names ?? (stepResult as any).poiNames;
          if (Array.isArray(names)) poiNames.push(...names.map(String));
        }
      }
      const resolved = resolveNorwaySubregionForWorldBuild({
        countryCode: input.countryCode,
        userMessage: request.message,
        poiNames,
      });
      if (resolved) {
        input.subregion = resolved;
        this.logger.debug(`[Claude Orchestrator] world.buildContext: NO → subregion=${resolved} (keyword/explicit)`);
      }
    }

    if (step.skillName === 'worldState.summarize') {
      if (!input.world) {
        for (const stepResult of Object.values(results)) {
          if (stepResult && typeof stepResult === 'object' && (stepResult as any).world) {
            input.world = (stepResult as any).world;
            this.logger.debug('[Claude Orchestrator] worldState.summarize: 注入先前步骤的 world');
            break;
          }
        }
      }
    }

    if (step.skillName === 'policy.resolve') {
      for (const stepResult of Object.values(results)) {
        if (!stepResult || typeof stepResult !== 'object') continue;
        const sr = stepResult as Record<string, unknown>;
        if (!input.operationalWorldState && sr.operationalWorldState) {
          input.operationalWorldState = sr.operationalWorldState;
          this.logger.debug('[Claude Orchestrator] policy.resolve: 注入 operationalWorldState');
        }
        if (!input.operationalArbitration && sr.operationalArbitration) {
          input.operationalArbitration = sr.operationalArbitration;
          this.logger.debug('[Claude Orchestrator] policy.resolve: 注入 operationalArbitration');
        }
        if (input.operationalWorldState && input.operationalArbitration) {
          break;
        }
      }
    }

    if (step.skillName === 'itinerary.generate') {
      if (!input.executionPolicyHook) {
        for (const stepResult of Object.values(results)) {
          if (!stepResult || typeof stepResult !== 'object') continue;
          const sr = stepResult as Record<string, unknown>;
          if (sr.executionPolicyHook) {
            input.executionPolicyHook = sr.executionPolicyHook;
            this.logger.debug('[Claude Orchestrator] itinerary.generate: 注入 executionPolicyHook');
            break;
          }
        }
      }
    }

    // P0: Skills 内 LLM 打点 - 注入 tokenContext（skillName → state_machine_step 映射）
    const requestId = context.requestId || request.request_id;
    if (requestId && step.skillName) {
      const stateStep = this.mapSkillNameToStep(step.skillName);
      input.tokenContext = {
        request_id: requestId,
        state_machine_step: stateStep,
        sub_agent: this.mapSkillNameToSubAgent(step.skillName),
      };
    }

    if (intentSnapshot?.intent_hints && (step.skillName === 'itinerary.verify' || step.skillName === 'itinerary.smart_update')) {
      input.intent_hints = { ...intentSnapshot.intent_hints, ...(input.intent_hints ?? {}) };
    }

    return this.sanitizeOrchestrationHandoff(request, input);
  }

  private sanitizeOrchestrationHandoff(request: RouteAndRunRequestDto, value: unknown): unknown {
    return sanitizeOrchestrationHandoffForRequest(
      request as RouteAndRunSubagentSandboxCarrier,
      value,
    );
  }

  /** skillName → OrchestrationStep（用于 Token 按阶段打点） */
  private mapSkillNameToStep(skillName?: string): import('../../agent/interfaces/trip-plan.interface').OrchestrationStep {
    if (!skillName) return 'INTAKE';
    if (skillName === 'policy.resolve' || skillName === 'worldState.summarize' || skillName === 'readiness.assess') {
      return 'GATE_EVAL';
    }
    if (skillName.includes('gate') || skillName.includes('runThreeGuardians') || skillName.includes('precheck')) {
      return 'GATE_EVAL';
    }
    if (skillName.includes('itinerary.generate') || skillName.includes('plan.') || skillName.includes('architect') || skillName.includes('transit') || skillName.includes('budget') || skillName.includes('pace') || skillName.includes('constraints')) return 'PLAN_GEN';
    if (skillName === 'itinerary.smart_update') return 'REPAIR';
    if (skillName.includes('verify')) return 'VERIFY';
    if (skillName.includes('repair') || skillName.includes('alternatives')) return 'REPAIR';
    if (skillName.includes('narrate') || skillName.includes('explain')) return 'NARRATE';
    return 'RESEARCH'; // 默认
  }

  private mapSkillNameToSubAgent(skillName?: string): import('../../agent/interfaces/trip-plan.interface').SubAgentType {
    if (!skillName) return 'Planner';
    if (skillName.includes('gate')) return 'Gatekeeper';
    if (skillName === 'itinerary.smart_update') return 'LocalInsight';
    if (skillName.includes('narrate') || skillName.includes('explain')) return 'Narrator';
    return 'Planner';
  }
  
  /**
   * 从消息中提取国家代码（简单规则）
   * 支持国家名和城市名映射
   */
  private extractCountryCodeFromMessage(message: string): string | undefined {
    const countryMap: Record<string, string> = {
      // 国家名
      '冰岛': 'IS',
      'Iceland': 'IS',
      'iceland': 'IS',
      '中国': 'CN',
      'China': 'CN',
      'china': 'CN',
      '日本': 'JP',
      'Japan': 'JP',
      'japan': 'JP',
      '美国': 'US',
      'United States': 'US',
      'USA': 'US',
      '新西兰': 'NZ',
      'New Zealand': 'NZ',
      'new zealand': 'NZ',
      'NZ': 'NZ',
      '大溪地': 'PF',
      'Tahiti': 'PF',
      'tahiti': 'PF',
      '法属波利尼西亚': 'PF',
      'French Polynesia': 'PF',
      '泰国': 'TH',
      'Thailand': 'TH',
      'thailand': 'TH',
      '新加坡': 'SG',
      'Singapore': 'SG',
      'singapore': 'SG',
      '韩国': 'KR',
      'Korea': 'KR',
      'korea': 'KR',
      '马来西亚': 'MY',
      'Malaysia': 'MY',
      'malaysia': 'MY',
      '越南': 'VN',
      'Vietnam': 'VN',
      'vietnam': 'VN',
      '格陵兰': 'GL',
      'Greenland': 'GL',
      'greenland': 'GL',
      'GL': 'GL',
      '斯瓦尔巴': 'SJ',
      'Svalbard': 'SJ',
      'svalbard': 'SJ',
      'SJ': 'SJ',
      '阿根廷': 'AR',
      'Argentina': 'AR',
      'argentina': 'AR',
      'AR': 'AR',
      // 阿尔卑斯（跨越多国）
      '阿尔卑斯': 'AL',
      '阿尔卑斯山': 'AL',
      'Alps': 'AL',
      'alps': 'AL',
      'AL': 'AL',
      // 城市名映射到国家
      '东京': 'JP',
      'Tokyo': 'JP',
      'tokyo': 'JP',
      '大阪': 'JP',
      'Osaka': 'JP',
      '京都': 'JP',
      'Kyoto': 'JP',
      '北京': 'CN',
      'Beijing': 'CN',
      '上海': 'CN',
      'Shanghai': 'CN',
      'shanghai': 'CN',
      '雷克雅未克': 'IS',
      'Reykjavik': 'IS',
      'reykjavik': 'IS',
      'us': 'US',
    };
    
    const lowerMessage = message.toLowerCase();
    for (const [key, code] of Object.entries(countryMap)) {
      if (lowerMessage.includes(key.toLowerCase())) {
        return code;
      }
    }
    
    return undefined;
  }
  
  /**
   * 从消息中提取月份（1-12）
   */
  private extractMonthFromMessage(message: string): number | undefined {
    if (!message) {
      return undefined;
    }
    
    // 尝试匹配月份关键词
    const monthKeywords: Record<string, number> = {
      '一月': 1, '1月': 1, 'january': 1, 'jan': 1,
      '二月': 2, '2月': 2, 'february': 2, 'feb': 2,
      '三月': 3, '3月': 3, 'march': 3, 'mar': 3,
      '四月': 4, '4月': 4, 'april': 4, 'apr': 4,
      '五月': 5, '5月': 5, 'may': 5,
      '六月': 6, '6月': 6, 'june': 6, 'jun': 6,
      '七月': 7, '7月': 7, 'july': 7, 'jul': 7,
      '八月': 8, '8月': 8, 'august': 8, 'aug': 8,
      '九月': 9, '9月': 9, 'september': 9, 'sep': 9, 'sept': 9,
      '十月': 10, '10月': 10, 'october': 10, 'oct': 10,
      '十一月': 11, '11月': 11, 'november': 11, 'nov': 11,
      '十二月': 12, '12月': 12, 'december': 12, 'dec': 12,
    };
    
    const lowerMessage = message.toLowerCase();
    for (const [key, month] of Object.entries(monthKeywords)) {
      if (lowerMessage.includes(key.toLowerCase())) {
        return month;
      }
    }
    
    // 尝试匹配日期格式（YYYY-MM-DD 或类似格式）
    const datePattern = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
    const dateMatch = message.match(datePattern);
    if (dateMatch) {
      const month = parseInt(dateMatch[2], 10);
      if (month >= 1 && month <= 12) {
        return month;
      }
    }
    
    return undefined;
  }
  
  /**
   * 替换输入中的占位符文本
   */
  private replacePlaceholders(input: any, replacements: Record<string, any>): any {
    if (typeof input === 'string') {
      // 替换常见的占位符文本
      const placeholderPatterns = [
        /需要从用户请求中提取/gi,
        /none/gi,
        /undefined/gi,
        /null/gi,
      ];
      
      let result = input;
      for (const pattern of placeholderPatterns) {
        if (pattern.test(result)) {
          // 如果包含占位符，尝试从 replacements 中获取值
          if (result.toLowerCase().includes('trip') && replacements.tripId) {
            result = replacements.tripId;
          } else if (result.toLowerCase().includes('user') && replacements.userId) {
            result = replacements.userId;
          } else if (result.toLowerCase().includes('request') && replacements.requestId) {
            result = replacements.requestId;
          }
        }
      }
      
      return result;
    } else if (Array.isArray(input)) {
      return input.map(item => this.replacePlaceholders(item, replacements));
    } else if (input && typeof input === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(input)) {
        // 特殊处理 tripId 相关字段
        if ((key === 'tripId' || key === 'trip_id') && 
            (typeof value === 'string' && 
             (value === 'none' || value === 'undefined' || value === 'null' || 
              value.includes('需要从用户请求中提取')))) {
          result[key] = replacements.tripId || replacements.trip_id;
        } else if ((key === 'userId' || key === 'user_id') && 
                   (typeof value === 'string' && 
                    (value === 'none' || value === 'undefined' || value === 'null'))) {
          result[key] = replacements.userId || replacements.user_id;
        } else {
          result[key] = this.replacePlaceholders(value, replacements);
        }
      }
      return result;
    }
    
    return input;
  }

  /**
   * 准备 Action 输入
   */
  private prepareActionInput(
    step: ExecutionStep,
    results: Record<string, any>,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): any {
    return this.prepareSkillInput(step, results, context, request, undefined);
  }

  /**
   * 生成答案文本
   */
  private generateAnswerText(
    results: Record<string, any>,
    stepsExecuted: OrchestrationResult['stepsExecuted'],
  ): string {
    // 尝试从多个步骤的结果中提取文本
    const successfulSteps = stepsExecuted.filter(step => step.success);
    
    if (successfulSteps.length === 0) {
      return '处理完成，但所有步骤都失败了。';
    }
    
    // 优先使用最后一个成功步骤的结果
    const lastStep = successfulSteps[successfulSteps.length - 1];
    if (lastStep?.result) {
      // 尝试多种格式
      if (typeof lastStep.result === 'string') {
        return lastStep.result;
      }
      if (lastStep.result.answerText) {
        return lastStep.result.answerText;
      }
      if (lastStep.result.message) {
        return lastStep.result.message;
      }
      if (lastStep.result.explanation) {
        return lastStep.result.explanation;
      }
      if (lastStep.result.summary) {
        return lastStep.result.summary;
      }
      // 如果是对象，尝试提取关键信息
      if (typeof lastStep.result === 'object') {
        // 尝试提取 timeline、candidates 等信息
        if (lastStep.result.timeline && Array.isArray(lastStep.result.timeline)) {
          return `已生成 ${lastStep.result.timeline.length} 天的行程安排。`;
        }
        if (lastStep.result.candidates && Array.isArray(lastStep.result.candidates)) {
          return `找到 ${lastStep.result.candidates.length} 个候选结果。`;
        }
        // 如果有关键字段，尝试生成摘要
        const keys = Object.keys(lastStep.result);
        if (keys.length > 0) {
          return `处理完成。结果包含：${keys.slice(0, 3).join('、')}${keys.length > 3 ? '等' : ''}。`;
        }
      }
    }
    
    // 如果所有步骤都成功但没有明确的结果文本，生成汇总
    if (successfulSteps.length > 0) {
      const skillNames = successfulSteps
        .map(step => step.skillName || step.actionName)
        .filter(Boolean)
        .join('、');
      return `已成功执行 ${successfulSteps.length} 个步骤${skillNames ? `（${skillNames}）` : ''}。`;
    }
    
    return '处理完成';
  }

  /**
   * 生成降级执行计划
   */
  private generateFallbackPlan(skillsPlan: SkillsPlan): ExecutionPlan {
    const steps: ExecutionStep[] = skillsPlan.selectedSkills.map((skill, index) => ({
      id: `step${index + 1}`,
      type: 'skill',
      skillName: skill.skillName,
      dependencies: skill.dependencies || [],
      parallel: false,
      input: skill.input,
      fallback: {
        onError: 'continue',
        retryCount: 1,
      },
    }));

    return {
      steps,
      parallelGroups: [],
      fallbackStrategy: {
        onError: 'continue',
        retryCount: 1,
      },
    };
  }

  // ==================== 状态机流程（基于 claude.md）====================

  /**
   * 状态机编排主入口（基于 claude.md 架构）
   *
   * Phase 2.3 流程：INTAKE → STATE_UPDATE → RESEARCH → GATE_EVAL → CONTEXT_BUILD → PLAN_GEN → OPTIMIZE → VERIFY → REPAIR → NARRATE → DONE
   *
   * 强制顺序：Gate 在 Plan 之前执行
   */
  async orchestrateWithStateMachine(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline?: { remainingMs: () => number; clamp: (ms: number, minMs?: number) => number },
    resume?: { decision_state: DecisionState; checkpoint_loaded?: boolean },
  ): Promise<OrchestrationResult> {
    applyTripPlanningStateMachineOptionDefaults(request);
    setLlmTraceRoutePath('STATE_MACHINE');
    const startTime = Date.now();
    const boundTripIdEarly = (request.trip_id || context.tripId || '').trim();
    if (boundTripIdEarly && isWorkbenchAssistantPlaceholderMessage(request.message)) {
      this.logger.log(
        `[Claude Orchestrator] 状态机入口：工作台占位欢迎语 → 短路 request_id=${request.request_id}`,
      );
      setLlmTraceRoutePath('LIGHTWEIGHT');
      return await this.orchestrateWorkbenchAssistantPlaceholder(request, context, startTime);
    }
    this.logger.log(`[Claude Orchestrator] 开始状态机编排: request_id=${request.request_id}`);
    this.logger.log(`[Claude Orchestrator] Deadline: ${deadline?.remainingMs() || 'N/A'}ms`);

    // 获取 LLM 提供商
    const llmProvider = this.getLlmProvider(request);
    this.logger.log(`[Claude Orchestrator] LLM Provider: ${llmProvider}`);

    // 初始化状态（replan：plan_version = previous_plan_version + 1，见 resolveOrchestratorPlanVersionAfterReplan）
    const initialPlanVersion = resolveOrchestratorPlanVersionAfterReplan(request.options);
    const state: OrchestratorState = {
      request_id: request.request_id,
      // P0 改进：PlanState 版本化
      plan_id: request.trip_id ? `plan-${request.trip_id}` : `plan-${request.request_id}`,
      plan_version: initialPlanVersion,
      current_step: 'INTAKE',
      evidence_registry: new Map(),
      decision_log: [],
      decision_steps: [], // Decision Steps（业务层决策，来自 Decision-First Engine）
      errors: [],
      metadata: mergeReplanLineageIntoTripRunMetadata(
        {
          started_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
          // Context Orchestrator：打通 userId/tripId 供 buildContextForNode / UserTravelProfile 使用
          userId: request.user_id ?? undefined,
          tripId: request.trip_id ?? undefined,
          /** 真实 TripRun（trip_runs.id）；优先 AgentService 注入，其次 options 断点续跑 id */
          tripRunId:
            context.tripRunId ??
            request.options?.durable_trip_run_id?.trim() ??
            undefined,
          fallback_strategy_hint: request.options?.fallback_strategy,
          fallback_debug_scores: request.options?.show_debug_scores,
          show_commute_matrix: request.options?.show_commute_matrix === true,
          require_poi_data: request.options?.require_poi_data === true,
          allow_partial: request.options?.allow_partial === true,
          poi_policy: request.options?.poi_policy,
          poi_source_hint: request.options?.poi_source,
          show_poi_trace: request.options?.show_poi_trace === true,
          // Persist emergency constraints on OrchestratorState for DSO projection (Sentinel hard mask).
          emergency_constraints: (request as any).emergency_constraints ?? undefined,
        },
        request.options,
      ) as OrchestratorState['metadata'],
    };
    state.metadata = mergeEmotionalClientSignalsFromRouteAndRunRequest(state.metadata, request);

    // Phase 2.1: 初始化 DecisionState (DSO)，与 OrchestratorState 并行维护
    // Phase 2.4: DECISION_KERNEL_ENABLED=false 可回滚到无 Kernel 路径
    // P1: DECISION_KERNEL_AB_PERCENT 设置时按 hash 分流（如 10 表示 10% 实验组）
    let decisionState: DecisionState | undefined;
    let resumeSkipIntake = false;
    if (resume?.decision_state && this.decisionKernel && this.isKernelEnabledForRequest(request)) {
      decisionState = resume.decision_state;
      const requestId = request.request_id;
      const nextHarness = this.computeResumeHarnessEntryFromLast(decisionState.systemState?.lastStep);
      let step = nextHarness;
      let admission = await this.decisionKernel.validateStepAdmission(decisionState, step, { requestId });
      let depth = 0;
      while (!admission.passed && admission.suggested_fallback_step && depth < 8) {
        depth += 1;
        step = admission.suggested_fallback_step;
        admission = await this.decisionKernel.validateStepAdmission(decisionState, step, { requestId });
      }
      if (!admission.passed) {
        this.logger.warn(
          `[Claude Orchestrator] Durable resume: 准入失败，回退全新 DSO。末次尝试 step=${String(step)} codes=${admission.validation_results
            .filter((r) => !r.passed)
            .map((r) => r.code)
            .join(',') ?? 'n/a'}`,
        );
        decisionState = this.decisionKernel.createInitialState(requestId, this.kernelCreateInitialOpts(request, state));
        resumeSkipIntake = false;
      } else {
        const ls = decisionState.systemState?.lastStep;
        resumeSkipIntake = ls === HarnessStepName.INTAKE || ls === 'INTAKE';
        decisionState = this.decisionKernel.updateState(decisionState, {
          harnessRuntime: {
            ...(decisionState.harnessRuntime ?? {}),
            resume_admission_step: step,
            resume_admission_passed: true,
          },
        });
        const graphEntry =
          suggestGraphEntryFromHarnessAdmission(admission) ??
          computeResumeGraphEntryFromLast(decisionState.systemState?.lastStep);
        (state.metadata as Record<string, unknown>).graph_resume_entry = graphEntry;
        (state.metadata as Record<string, unknown>).harness_resume_admission_step = step;
        this.logger.debug(
          `[Claude Orchestrator] Durable resume: DSO 已加载 admission_step=${String(step)} graph_entry=${graphEntry} skip_intake=${resumeSkipIntake}`,
        );
      }
    } else if (this.decisionKernel && this.isKernelEnabledForRequest(request)) {
      decisionState = this.decisionKernel.createInitialState(
        request.request_id,
        this.kernelCreateInitialOpts(request, state),
      );
      this.logger.debug(`[Claude Orchestrator] DSO 已初始化: requestId=${request.request_id}`);
    }

    decisionState = this.mergeGovernanceRuntimeBranchDirective(request, decisionState);

    try {
      const prePlanOutcome = await runPrePlanUntilContextBuild(this.asPrePlanGraphHost(), {
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        deadline,
        resumeSkipIntake,
        entry: resume?.decision_state
          ? computeResumeGraphEntryFromLast(decisionState?.systemState?.lastStep)
          : undefined,
      });
      decisionState = prePlanOutcome.decisionState ?? decisionState;
      if (prePlanOutcome.kind === "terminal") {
        return prePlanOutcome.result;
      }

      const planGenOut = await this.runPlanGenWithEmptyDraftGuard({
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
      });
      decisionState = planGenOut.decisionState;
      if (planGenOut.terminal) {
        return planGenOut.terminal;
      }

      await this.runTravelCompilePhaseIfEnabled(state, request);

      let planVerifyOutcome = await runPlanVerifyOptimizeRepairLoop(this.asPlanVerifyLoopHost(), {
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
      });
      decisionState = planVerifyOutcome.decisionState;
      const verifyRetry = await runVerifyReturnToResearchRetryLoop({
        state,
        planVerifyOutcome,
        decisionState,
        onRetryStarted: (retryIndex, maxRetries) => {
          this.logger.warn(
            `[Claude Orchestrator] VERIFY RETURN_TO_RESEARCH: retry=${retryIndex}/${maxRetries} → pre_plan from research`,
          );
        },
        onRetry: async ({ decisionState: dsFromVerify }) => {
          const rePrePlan = await runPrePlanUntilContextBuild(this.asPrePlanGraphHost(), {
            request,
            context,
            state,
            decisionState: dsFromVerify,
            llmProvider,
            startTime,
            deadline,
            resumeSkipIntake: true,
            entry: 'research',
          });
          if (rePrePlan.kind === 'terminal') {
            return {
              planVerifyOutcome,
              decisionState: rePrePlan.decisionState,
              prePlanTerminal: rePrePlan.result,
            };
          }
          let ds = rePrePlan.decisionState ?? dsFromVerify;
          const regen = await this.runPlanGenWithEmptyDraftGuard({
            request,
            context,
            state,
            decisionState: ds,
            llmProvider,
            startTime,
          });
          ds = regen.decisionState ?? ds;
          if (regen.terminal) {
            return { planVerifyOutcome, decisionState: ds, planGenTerminal: regen.terminal };
          }
          await this.runTravelCompilePhaseIfEnabled(state, request);
          const reVerify = await runPlanVerifyOptimizeRepairLoop(this.asPlanVerifyLoopHost(), {
            request,
            context,
            state,
            decisionState: ds,
            llmProvider,
            startTime,
          });
          return {
            planVerifyOutcome: reVerify,
            decisionState: reVerify.decisionState ?? ds,
          };
        },
      });
      if (verifyRetry.terminal) {
        return verifyRetry.terminal;
      }
      planVerifyOutcome = verifyRetry.planVerifyOutcome;
      decisionState = verifyRetry.decisionState;
      if (planVerifyOutcome.kind === 'terminal') {
        return planVerifyOutcome.result;
      }

      await runGraphEffectivePlanMaterializePhase({
        state,
        request,
        materializer: this.graphEffectivePlanMaterializer,
        configService: this.configService,
      });

      const postPlanOutcome = await runPostPlanGraph(this.asPostPlanGraphHost(), {
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        deadline,
      });
      if (postPlanOutcome.kind === 'terminal') {
        // post_plan 子图在 HALLUCINATION 节点以 terminal 出口并内嵌 buildSuccessResult；
        // 须在此仍走整段重规划住宿 enrich，否则会跳过 FULL_TRIP_REPLAN_HOTEL_SENSOR。
        return await this.enrichOrchestrationResultWithFullTripReplanHotel(
          request,
          context,
          state,
          postPlanOutcome.result,
        );
      }
      await this.maybeAutoApplyItineraryAdjustCorridor(state);
      const baseResult = this.buildSuccessResult(
        state,
        startTime,
        postPlanOutcome.decisionState,
        context,
      );
      return await this.enrichOrchestrationResultWithFullTripReplanHotel(
        request,
        context,
        state,
        baseResult,
      );
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] 状态机编排失败: ${error?.message}`, error?.stack);

      const failingStep = state.current_step;

      // 🆕 检查是否是超时错误
      const isTimeout =
        error?.message?.startsWith('TIMEOUT:') ||
        error?.code === 'ECONNABORTED' ||
        (deadline?.remainingMs?.() ?? Number.POSITIVE_INFINITY) <= 0;

      let robust = classifyOrchestratorFailure(error, { orchestrator_step: failingStep });
      if (isTimeout) robust = coerceOrchestratorFailureForWallClockTimeout(robust);

      if (isTimeout) {
        this.logger.warn(
          `[Claude Orchestrator] 状态机执行超时，当前步骤: ${failingStep}, 已执行步骤数: ${state.decision_log.length}`,
        );
        state.current_step = 'TIMEOUT';
        state.errors.push({
          step: state.current_step,
          error_code: 'TIMEOUT',
          message: `执行超时，已执行到步骤: ${failingStep}`,
          timestamp: new Date().toISOString(),
        });

        // 🆕 记录超时时的决策日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'TIMEOUT' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `状态机执行超时`,
          outputs_summary: `已执行步骤: ${state.decision_log.map((log) => log.step).join(' → ')}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - startTime,
            timeout: true,
            executed_steps: state.decision_log.map((log) => log.step),
            orchestrator_robustness: robust,
          },
        });
        this.maybeSnapshot(state, 'CHECKPOINT');
      } else {
        state.current_step = 'FAILED';
        state.errors.push({
          step: state.current_step,
          error_code: 'ORCHESTRATION_ERROR',
          message: error?.message || '未知错误',
          timestamp: new Date().toISOString(),
        });
        state.decision_log.push({
          request_id: state.request_id,
          step: 'FAILED' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `编排异常 @ ${failingStep}`,
          outputs_summary: truncateOrchestratorFailurePreview(String(error?.message || '未知错误'), 400),
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - startTime,
            orchestrator_robustness: robust,
          },
        });
        this.maybeSnapshot(state, 'CHECKPOINT');
      }

      return this.buildErrorResult(state, error, startTime, decisionState, failingStep, robust, context);
    }
  }

  /** Layer1 行程槽位：先选哪一天，再进入 SKU 错峰场次 */
  private shouldReturnClarificationForItinerarySlotPlacementIntake(state: OrchestratorState): boolean {
    return (
      (state.metadata as { itinerary_slot_placement_intake_short_circuit?: boolean })
        ?.itinerary_slot_placement_intake_short_circuit === true &&
      Array.isArray(state.clarification_questions) &&
      state.clarification_questions.length > 0
    );
  }

  /** 旺季极昼错峰：INTAKE 确认卡（体验优化，非合规硬拦） */
  private shouldReturnClarificationForPeakSeasonTimeShiftIntake(state: OrchestratorState): boolean {
    return (
      (state.metadata as { peak_season_time_shift_intake_short_circuit?: boolean })
        ?.peak_season_time_shift_intake_short_circuit === true &&
      Array.isArray(state.clarification_questions) &&
      state.clarification_questions.length > 0
    );
  }

  /** F-road + 2WD：INTAKE 结构化合规澄清（优先于马拉松） */
  private shouldReturnClarificationForFroad2wdIntake(state: OrchestratorState): boolean {
    return (
      (state.metadata as { froad_2wd_intake_clarification_short_circuit?: boolean })
        ?.froad_2wd_intake_clarification_short_circuit === true &&
      Array.isArray(state.clarification_questions) &&
      state.clarification_questions.length > 0
    );
  }

  /** 极昼马拉松 SOFT 下界：INTAKE 返回结构化澄清，禁止进入 RESEARCH/辩论 Raw 泄露 */
  private shouldReturnClarificationForMarathonIntake(state: OrchestratorState): boolean {
    return (
      (state.metadata as { marathon_intake_clarification_short_circuit?: boolean })
        ?.marathon_intake_clarification_short_circuit === true &&
      Array.isArray(state.clarification_questions) &&
      state.clarification_questions.length > 0
    );
  }

  /** INTAKE 已标 HARD 缺口并生成澄清问题时，不得进入 RESEARCH（避免关键技能在占位目的地上报错） */
  private shouldReturnClarificationForHardGaps(state: OrchestratorState): boolean {
    const allowPartial = state.metadata?.allow_partial === true;
    if (allowPartial) {
      // 意图编译错误必须始终阻止下游阶段执行（即使设置了 allow_partial 也不例外）。
      const hasCompileError =
        state.gaps?.some((g) => g.severity === 'HARD' && (g.type === 'INTENT_COMPILE_ERROR' || g.type === 'SPEC_TYPE_ERROR')) ??
        false;
      if (
        hasCompileError &&
        state.clarification_questions &&
        state.clarification_questions.length > 0
      ) {
        return true;
      }
      const hasHardDestinationGap =
        state.gaps?.some((g) => g.severity === 'HARD' && g.type === 'MISSING_DESTINATION') ??
        false;
      return !!(
        hasHardDestinationGap &&
        state.clarification_questions &&
        state.clarification_questions.length > 0
      );
    }
    const hasHardGaps = state.gaps?.some((g) => g.severity === 'HARD');
    return !!(
      hasHardGaps &&
      state.clarification_questions &&
      state.clarification_questions.length > 0
    );
  }

  private djb2Fingerprint(value: unknown): string {
    const stable = JSON.stringify(value, (_k, v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.keys(v as any)
          .sort()
          .reduce((acc: any, key) => {
            acc[key] = (v as any)[key];
            return acc;
          }, {});
      }
      return v;
    });
    let h = 5381;
    for (let i = 0; i < stable.length; i++) h = (h * 33) ^ stable.charCodeAt(i);
    return `djb2:${(h >>> 0).toString(16)}`;
  }

  /**
   * 将 RouteAndRunRequestDto 转换为 TripPlanRequest
   */
  private convertToTripPlanRequest(
    request: RouteAndRunRequestDto,
    _state: OrchestratorState,
  ): TripPlanRequest {
    // 提取目的地（扩展规则匹配）
    let destination: string | { lat: number; lng: number } | undefined;

    const structIn = request.structured_travel_input;
    const structDest =
      typeof structIn?.destination === 'string' ? structIn.destination.trim() : '';
    const structOrigin =
      typeof structIn?.origin === 'string' ? structIn.origin.trim() : '';
    // message 有时仅为「继续/规划」而日期在上一轮或仅通过 structured 提交；全角数字归一后便于正则命中
    const recentSlice = this.contextSlidingWindow.slice(
      'orchestrator_claude',
      request.conversation_context?.recent_messages,
    );
    const rawIntakeBundle = [request.message, ...recentSlice].filter(Boolean).join('\n');
    const textForIntake = String(rawIntakeBundle).replace(
      /[０-９]/g,
      (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    );
    const vehicle_type = extractVehicleTypeFromCurrentUserMessage(request.message);

    // 国内常见城市（先于国家级关键词，便于「上海美食2天」等短句命中目的地）
    const domesticCityPatterns: Array<{ pattern: RegExp; value: string }> = [
      { pattern: /上海/, value: '上海' },
      { pattern: /北京/, value: '北京' },
      { pattern: /广州/, value: '广州' },
      { pattern: /深圳/, value: '深圳' },
      { pattern: /杭州/, value: '杭州' },
      { pattern: /成都/, value: '成都' },
      { pattern: /重庆/, value: '重庆' },
      { pattern: /西安/, value: '西安' },
      { pattern: /南京/, value: '南京' },
      { pattern: /苏州/, value: '苏州' },
      { pattern: /武汉/, value: '武汉' },
      { pattern: /厦门/, value: '厦门' },
      { pattern: /青岛/, value: '青岛' },
      { pattern: /天津/, value: '天津' },
      { pattern: /香港|hong\s*kong/i, value: '香港' },
      { pattern: /澳门|macau/i, value: '澳门' },
      { pattern: /台北|台湾|taiwan/i, value: '台北' },
      { pattern: /东京|tokyo/i, value: '东京' },
      { pattern: /大阪|osaka/i, value: '大阪' },
      { pattern: /京都|kyoto/i, value: '京都' },
      { pattern: /首尔|seoul/i, value: '首尔' },
    ];
    for (const { pattern, value } of domesticCityPatterns) {
      if (pattern.test(textForIntake)) {
        destination = value;
        break;
      }
    }

    const destinationPatterns = [
      { pattern: /冰岛|iceland/i, value: '冰岛' },
      { pattern: /尼泊尔|nepal/i, value: '尼泊尔' },
      { pattern: /瑞士|switzerland/i, value: '瑞士' },
      { pattern: /日本|japan/i, value: '日本' },
      { pattern: /韩国|korea|south korea/i, value: '韩国' },
      { pattern: /泰国|thailand/i, value: '泰国' },
      { pattern: /新加坡|singapore/i, value: '新加坡' },
      { pattern: /马来西亚|malaysia/i, value: '马来西亚' },
      { pattern: /印度尼西亚|indonesia/i, value: '印度尼西亚' },
      { pattern: /菲律宾|philippines/i, value: '菲律宾' },
      { pattern: /越南|vietnam/i, value: '越南' },
    ];
    if (!destination) {
      for (const { pattern, value } of destinationPatterns) {
        if (pattern.test(textForIntake)) {
          destination = value;
          break;
        }
      }
    }

    const tripIdBound = Boolean(request.trip_id?.trim());
    const nlDates = parseIntakeNlDatesAndDays(textForIntake, {
      refYear: new Date().getFullYear(),
      tripIdBound,
    });
    let start_date = nlDates.start_date;
    let date_range = nlDates.date_range;
    let days = nlDates.duration_days;

    // 提取人数（简单规则）
    let partyCount = 1;
    const countPatterns = [
      /(\d+)\s*人/,
      /(\d+)\s*位/,
      /(\d+)\s*个/,
      /(\d+)\s*persons?/i,
      /(\d+)\s*people/i,
    ];
    for (const pattern of countPatterns) {
      const countMatch = textForIntake.match(pattern);
      if (countMatch) {
        const extractedCount = parseInt(countMatch[1], 10);
        if (extractedCount > 0 && extractedCount <= 20) {
          partyCount = extractedCount;
          break;
        }
      }
    }

    // 提取交通模式（如果有明确指定）
    let mode: 'walk' | 'drive' | 'transit' | 'mixed' = 'mixed';
    if (/步行|走路|walk/i.test(textForIntake)) {
      mode = 'walk';
    } else if (/开车|自驾|drive|car/i.test(textForIntake)) {
      mode = 'drive';
    } else if (/公交|地铁|transit|public transport/i.test(textForIntake)) {
      mode = 'transit';
    }

    // 未命中关键词表时：从「在X的…行程」抽取 X（覆盖 Reykjavik、雷克雅未克市区等）
    if (
      !destination ||
      (typeof destination === 'string' && (destination === '未指定' || !destination.trim()))
    ) {
      const geo = textForIntake.match(/在\s*([^，。！？\n]{1,60}?)\s*的/);
      if (geo) {
        const raw = geo[1].trim().replace(/\s+/g, ' ');
        if (
          raw.length >= 2 &&
          raw.length <= 56 &&
          !/^(这里|那里|这边|那边|本地)$/u.test(raw)
        ) {
          destination = raw;
        }
      }
    }

    // 结构化输入最后覆盖 NL，保证澄清回合显式目的地生效
    if (structDest.length >= 2) {
      destination = structDest;
    }

    // 结构化日期（与澄清 UI / 日期选择器对齐）：不依赖 message 中是否带 YYYY-MM-DD
    const stStart = typeof structIn?.start_date === 'string' ? structIn.start_date.trim() : '';
    const stEnd = typeof structIn?.end_date === 'string' ? structIn.end_date.trim() : '';
    if (stStart && /^\d{4}-\d{2}-\d{2}$/.test(stStart)) {
      start_date = stStart;
    }
    if (stStart && stEnd && /^\d{4}-\d{2}-\d{2}$/.test(stEnd)) {
      const a = new Date(`${stStart}T12:00:00.000Z`);
      const b = new Date(`${stEnd}T12:00:00.000Z`);
      if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b.getTime() >= a.getTime()) {
        date_range = { start_date: stStart, end_date: stEnd };
        start_date = stStart;
      }
    } else if (!date_range && stEnd && /^\d{4}-\d{2}-\d{2}$/.test(stEnd) && start_date) {
      const a = new Date(`${start_date}T12:00:00.000Z`);
      const b = new Date(`${stEnd}T12:00:00.000Z`);
      if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b.getTime() >= a.getTime()) {
        date_range = { start_date, end_date: stEnd };
      }
    }

    const routeParty = resolveRouteRunPartyProfileSnapshot(request);
    const partyCountEffective =
      routeParty?.party_total != null && routeParty.party_total >= 1 ? routeParty.party_total : partyCount;
    const party: TripPlanRequest['party'] = {
      count: partyCountEffective,
      ...(routeParty?.has_children !== undefined ? { has_children: routeParty.has_children } : {}),
      ...(routeParty?.has_elderly !== undefined ? { has_elderly: routeParty.has_elderly } : {}),
      ...(routeParty?.fitness_level ? { fitness_level: routeParty.fitness_level } : {}),
    };
    const party_profile: TripPlanRequest['party_profile'] | undefined =
      routeParty && (routeParty.risk_tolerance != null || routeParty.fitness_level != null)
        ? {
            ...(routeParty.risk_tolerance ? { risk_tolerance: routeParty.risk_tolerance } : {}),
            ...(routeParty.fitness_level ? { fitness: routeParty.fitness_level } : {}),
          }
        : undefined;
    const party_profile_clean =
      party_profile && Object.keys(party_profile).length > 0 ? party_profile : undefined;

    return {
      request_id: request.request_id,
      // Carry raw NL message forward for deterministic intake compile & predictive simulation.
      // This is intentionally duplicated from the API request and treated as non-authoritative hint.
      message: request.message,
      origin: structOrigin.length >= 1 ? structOrigin : '起点', // 默认值，实际应该从 message 或上下文提取
      destination: destination || '未指定',
      date_range,
      start_date,
      days,
      mode,
      party,
      ...(party_profile_clean ? { party_profile: party_profile_clean } : {}),
      ...(routeParty?.mobility_note_zh ? { party_mobility_note_zh: routeParty.mobility_note_zh } : {}),
      ...(vehicle_type ? { constraints: { vehicle_type } } : {}),
      ...(request.options?.persona_hint ? { persona_hint: request.options.persona_hint as TripPlanRequest['persona_hint'] } : {}),
    };
  }

  /** INTAKE 回填所需的最小 Trip 字段（与 {@link TripsService.findOne} 校验语义对齐） */
  private async loadTripCoreForIntakeHydration(
    tripId: string,
    userId: string | undefined,
  ): Promise<
    | {
        ok: true;
        trip: {
          destination: string | null;
          startDate: Date | null;
          endDate: Date | null;
          budgetConfig?: unknown;
          pacingConfig?: unknown;
          metadata?: unknown;
        };
        source: 'trips_service' | 'prisma_fallback';
      }
    | { ok: false; error_message: string }
  > {
    const tid = tripId.trim();

    if (this.tripsService) {
      try {
        const full = await this.tripsService.findOne(tid, userId);
        const destRaw = full.destination;
        const destNorm =
          destRaw == null ? '' : typeof destRaw === 'string' ? destRaw.trim() : String(destRaw).trim();
        return {
          ok: true,
          trip: {
            destination: destNorm || null,
            startDate: full.startDate ?? null,
            endDate: full.endDate ?? null,
            budgetConfig: (full as { budgetConfig?: unknown }).budgetConfig,
            pacingConfig: (full as { pacingConfig?: unknown }).pacingConfig,
            metadata: (full as { metadata?: unknown }).metadata,
          },
          source: 'trips_service',
        };
      } catch (e: unknown) {
        return { ok: false, error_message: (e as Error)?.message ?? String(e) };
      }
    }

    const uid = userId?.trim();
    if (uid) {
      const collaborator = await this.prisma.tripCollaborator.findUnique({
        where: { tripId_userId: { tripId: tid, userId: uid } },
      });
      if (!collaborator) {
        return {
          ok: false,
          error_message: `行程 ID ${tid} 不存在或您没有权限访问`,
        };
      }
    }

    const row = await this.prisma.trip.findUnique({
      where: { id: tid },
      select: {
        destination: true,
        startDate: true,
        endDate: true,
        budgetConfig: true,
        pacingConfig: true,
        metadata: true,
      },
    });
    if (!row) {
      return { ok: false, error_message: `行程 ID ${tid} 不存在` };
    }
    return { ok: true, trip: row, source: 'prisma_fallback' };
  }

  /** INTAKE Layer1：按日草案快照，用于北部观鲸等槽位候选 */
  private async loadTripDaySnapshotsForSlotPlacement(
    tripId: string,
    userId?: string,
  ): Promise<TripDaySnapshotForPlacement[]> {
    const tid = tripId.trim();
    if (!tid) return [];

    const uid = userId?.trim();
    if (uid) {
      const collaborator = await this.prisma.tripCollaborator.findUnique({
        where: { tripId_userId: { tripId: tid, userId: uid } },
      });
      if (!collaborator) return [];
    }

    const row = await this.prisma.trip.findUnique({
      where: { id: tid },
      select: {
        TripDay: {
          orderBy: { date: 'asc' as const },
          select: {
            date: true,
            ItineraryItem: {
              orderBy: { order: 'asc' as const },
              select: {
                type: true,
                note: true,
                Place: { select: { nameCN: true, nameEN: true } },
              },
            },
          },
        },
      },
    });
    if (!row?.TripDay?.length) return [];
    return mapTripDaysToPlacementSnapshots(row.TripDay);
  }

  /**
   * ITINERARY_ADJUST：从绑定 Trip 的行程项 Place 登记种子化 poi_evidence，避免国家级目的地冷检索过稀。
   */
  private async loadTripPlacePoiEvidenceForAdjust(
    tripId: string,
    userId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const tid = tripId.trim();
    if (!tid) return [];

    const uid = userId?.trim();
    if (uid) {
      const collaborator = await this.prisma.tripCollaborator.findUnique({
        where: { tripId_userId: { tripId: tid, userId: uid } },
      });
      if (!collaborator) return [];
    }

    const placeIds = await this.prisma.itineraryItem.findMany({
      where: {
        placeId: { not: null },
        TripDay: { tripId: tid },
      },
      select: { placeId: true },
      distinct: ['placeId'],
    });
    const ids = placeIds
      .map((r) => r.placeId)
      .filter((id): id is number => typeof id === 'number' && id > 0);
    if (!ids.length) return [];

    const places = await this.prisma.place.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
        address: true,
      },
    });

    const coordRows = await this.prisma.$queryRaw<
      Array<{ id: number; lat: number | null; lng: number | null }>
    >`
      SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
      FROM "Place"
      WHERE id IN (${Prisma.join(ids)})
        AND location IS NOT NULL
    `;
    const coordById = new Map(coordRows.map((r) => [r.id, r]));

    const rows: TripPlaceRowForPoiEvidence[] = places.map((p) => {
      const c = coordById.get(p.id);
      return {
        id: p.id,
        nameCN: p.nameCN,
        nameEN: p.nameEN,
        category: String(p.category),
        address: p.address,
        lat: c?.lat != null ? Number(c.lat) : null,
        lng: c?.lng != null ? Number(c.lng) : null,
      };
    });
    return mapTripPlacesToPoiEvidence(rows);
  }

  /** ITINERARY_ADJUST：邻日锚点 + 走廊空间约束（D(N-1) 尾 → D(N+1) 头） */
  private async resolveItineraryAdjustNeighborContextForHost(
    tripId: string,
    targetDateIso: string,
    userId?: string,
  ) {
    if (!this.prisma) return null;
    const dest =
      (
        await this.prisma.trip.findUnique({
          where: { id: tripId.trim() },
          select: { destination: true },
        })
      )?.destination ?? '';
    const maxDetourKm = /冰岛|iceland/i.test(String(dest)) ? 50 : 35;
    const ctx = await resolveItineraryAdjustNeighborContext(
      this.prisma,
      tripId,
      targetDateIso,
      userId,
      maxDetourKm,
    );
    if (!ctx) return null;
    return { anchors: ctx.anchors, spatial: ctx.spatial, dayRows: ctx.dayRows };
  }

  /** ITINERARY_ADJUST：走廊候选稀疏时沿邻日中点 poi.search 补检 */
  private async supplementItineraryAdjustCorridorPoisForHost(params: {
    destinationRaw: string;
    anchors: NeighborAnchorContext;
    spatial: ItineraryAdjustSpatialConstraints;
  }): Promise<{ pois: unknown[]; query?: string; count: number }> {
    const poiSkill = this.skillsRegistry?.getSkill('poi.search');
    if (!poiSkill) return { pois: [], count: 0 };
    const corridorPlan = buildItineraryAdjustCorridorPoiSearchPlan({
      destinationRaw: params.destinationRaw,
      anchors: params.anchors,
      poiSearchCtx: { destination: params.destinationRaw.trim() || 'Iceland', pacing: 'relaxed' },
    });
    const query = corridorPlan.contextualizedQuery;
    const { lat, lng } = corridorSearchLatLng(params.spatial);
    try {
      const result = (await poiSkill.execute({
        query,
        queryRewriteResult: corridorPlan.rewrite,
        multiRouteSearch: true,
        limit: 14,
        lat,
        lng,
        category: 'ATTRACTION',
      })) as { pois?: unknown[] } | unknown[];
      const pois = Array.isArray(result)
        ? result
        : Array.isArray(result?.pois)
          ? result.pois
          : [];
      return { pois, query, count: pois.length };
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary adjust corridor poi.search failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { pois: [], query, count: 0 };
    }
  }

  /**
   * ITINERARY_ADJUST 双闸门：强修改意图 + 走廊高置信 → trip.applyEdit 落库目标日。
   */
  private async maybeAutoApplyItineraryAdjustCorridor(state: OrchestratorState): Promise<void> {
    const routeIntent = (state.metadata as Record<string, unknown>)?.route_and_run_intent as
      | RouteAndRunIntentAnalysis
      | undefined;
    if (routeIntent?.primary !== 'ITINERARY_ADJUST') return;
    if (state.clarification_questions?.length) return;
    if (!state.itinerary?.days?.length) return;

    const md = state.metadata as Record<string, unknown>;
    if (md.itinerary_day_replan_intake === true) return;

    const intakeMsg =
      (typeof md.intake_user_message === 'string' ? md.intake_user_message : '') ||
      state.trip_plan_request?.message ||
      '';
    const subIntent = classifyItineraryAdjustSubIntent(intakeMsg);
    md.itinerary_adjust_sub_intent = subIntent;

    if (subIntent === 'poi_slot_fill') {
      await this.maybeAutoApplyPoiSlotFill(state, md, intakeMsg, subIntent);
      return;
    }

    const confidence = evaluateItineraryAdjustConfidenceGate(md);
    md.itinerary_adjust_confidence_gate = confidence;

    const executionMode = resolveItineraryAdjustExecutionMode({
      subIntent,
      highConfidence: confidence.highConfidence,
    });
    md.itinerary_adjust_execution_mode = executionMode;

    const targetDateIso =
      (typeof md.itinerary_adjust_target_date_iso === 'string'
        ? md.itinerary_adjust_target_date_iso
        : undefined) ??
      extractItineraryAdjustTargetDateFromMessage(
        intakeMsg,
        state.trip_plan_request?.date_range,
      );

    const dayNumber =
      typeof md.itinerary_adjust_neighbor_anchors === 'object' &&
      md.itinerary_adjust_neighbor_anchors != null &&
      'targetDayNumber' in (md.itinerary_adjust_neighbor_anchors as object)
        ? Number((md.itinerary_adjust_neighbor_anchors as { targetDayNumber?: number }).targetDayNumber)
        : undefined;

    if (executionMode !== 'AUTO' || !targetDateIso) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: executionMode !== 'AUTO' ? 'execution_mode_advice_only' : 'missing_target_date',
        subIntent,
        confidence,
        executionMode,
      };
      recordItineraryAdjustFunnel(this.promMetrics, {
        stage: 'draft_created',
        outcome: 'success',
        sub_intent: subIntent,
        execution_mode: executionMode,
        reason:
          executionMode !== 'AUTO' ? 'execution_mode_advice_only' : 'missing_target_date',
        request_id: state.request_id,
      });
      return;
    }

    const tripId =
      state.trip_plan_request?.trip_id?.trim() ??
      state.trip_plan_request?.ontology_context?.trip_id?.trim();
    const userId = (state.metadata as { userId?: string })?.userId;
    if (!tripId || !this.tripsService) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: !tripId ? 'missing_trip_id' : 'trips_service_unavailable',
        executionMode,
      };
      return;
    }

    const targetDay = pickTargetDayFromItinerary(state.itinerary, targetDateIso.slice(0, 10));
    if (!targetDay?.items?.length) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'empty_target_day_itinerary',
        executionMode,
      };
      return;
    }

    let trip: TripLikeForDelete;
    try {
      trip = (await this.tripsService.findOne(tripId, userId)) as TripLikeForDelete;
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary adjust auto-apply trip load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      md.itinerary_adjust_auto_apply = { applied: false, reason: 'trip_load_failed', executionMode };
      return;
    }

    const placeIdCache = new Map<string, number>();
    const resolvePlaceId = (item: ItineraryItem): number | undefined => {
      const fromRef = parseNumericPlaceId(item.location_ref?.place_id);
      if (fromRef != null) return fromRef;
      const key = String(item.location_ref?.place_id ?? item.location_ref?.name ?? item.id);
      if (placeIdCache.has(key)) return placeIdCache.get(key);
      const resolved = this.resolvePlaceIdForItineraryAdjustApply(item, state);
      if (resolved != null) placeIdCache.set(key, resolved);
      return resolved;
    };

    const { edits, deleteIds, addCount, unresolvedItems } = buildCorridorDayApplyEdits({
      trip,
      targetDateIso: targetDateIso.slice(0, 10),
      targetDay,
      resolvePlaceId,
    });

    if (addCount === 0 || unresolvedItems.length > 0) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'unresolved_places',
        executionMode,
        unresolvedItems,
        deleteIds,
        addCount,
      };
      md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
      return;
    }

    const skill = this.skillsRegistry?.getSkill('trip.applyEdit');
    if (!skill) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        executionMode,
      };
      return;
    }

    try {
      const out = (await skill.execute({
        mode: 'db',
        tripId: tripId.trim(),
        edits: edits as TripUserEdit[],
      })) as { success?: boolean };
      if (out?.success) {
        md.itinerary_adjust_auto_apply = {
          applied: true,
          executionMode: 'AUTO',
          subIntent,
          confidence,
          targetDateIso: targetDateIso.slice(0, 10),
          deletedCount: deleteIds.length,
          addedCount: addCount,
          skillsHit: ['trip.applyEdit'],
        };
        recordItineraryAdjustFunnel(this.promMetrics, {
          stage: 'auto_apply',
          outcome: 'success',
          sub_intent: subIntent,
          execution_mode: 'AUTO',
          request_id: state.request_id,
          added_count: addCount,
        });
        const lead = buildItineraryAdjustAutoApplyLeadMessage({
          applied: true,
          executionMode: 'AUTO',
          targetDateIso: targetDateIso.slice(0, 10),
          dayNumber: Number.isFinite(dayNumber) ? dayNumber : undefined,
        });
        if (lead) {
          const prior = state.narration;
          state.narration = {
            user_friendly_summary: lead,
            day_by_day_narrative: prior?.day_by_day_narrative ?? [],
            highlights: prior?.highlights ?? [],
            tips: prior?.tips ?? [],
            day_by_day_text_zh: prior?.day_by_day_text_zh,
            warnings: prior?.warnings,
            research_ui_hints: prior?.research_ui_hints,
            voice_tone_modifier: prior?.voice_tone_modifier,
            visual_hint: prior?.visual_hint,
            audio_prosody: prior?.audio_prosody,
          };
        }
        state.decision_log.push({
          request_id: state.request_id,
          step: 'REPAIR',
          actor: 'Planner',
          inputs_summary: `ITINERARY_ADJUST 走廊自动落库 ${targetDateIso.slice(0, 10)}`,
          outputs_summary: `已落库：删除 ${deleteIds.length} 项，新增 ${addCount} 项（trip.applyEdit）`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'ITINERARY_ADJUST_AUTO_APPLIED',
            skills_hit: ['trip.applyEdit'],
            fallback_level: confidence.fallbackLevel,
          },
        });
        return;
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary adjust auto-apply failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: 'apply_failed',
      executionMode: 'ADVICE_ONLY',
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
  }

  /** POI_SLOT_FILL：向稀疏日追加推荐景点（只增不删，place_id 齐备时 SEMI_AUTO 落库） */
  private async maybeAutoApplyPoiSlotFill(
    state: OrchestratorState,
    md: Record<string, unknown>,
    intakeMsg: string,
    subIntent: 'poi_slot_fill',
  ): Promise<void> {
    md.itinerary_adjust_poi_slot_fill = true;
    if (!state.itinerary?.days?.length) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'empty_itinerary_draft',
        subIntent,
        executionMode: 'ADVICE_ONLY',
      };
      md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
      return;
    }

    const tripId =
      state.trip_plan_request?.trip_id?.trim() ??
      state.trip_plan_request?.ontology_context?.trip_id?.trim();
    const userId = (state.metadata as { userId?: string })?.userId;
    if (!tripId || !this.tripsService) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: !tripId ? 'missing_trip_id' : 'trips_service_unavailable',
        subIntent,
        executionMode: 'ADVICE_ONLY',
      };
      md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
      return;
    }

    let trip: TripLikeForDelete;
    try {
      trip = (await this.tripsService.findOne(tripId, userId)) as TripLikeForDelete;
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] poi slot fill trip load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'trip_load_failed',
        subIntent,
        executionMode: 'ADVICE_ONLY',
      };
      md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
      return;
    }

    const sparseTargets = collectSparseTripDayTargets(trip);
    md.itinerary_adjust_poi_slot_fill_targets = sparseTargets;
    if (!sparseTargets.length) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'no_sparse_days',
        subIntent,
        executionMode: 'ADVICE_ONLY',
      };
      md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
      return;
    }

    const merged = mergePoiSlotFillOrchestratorItinerary({
      orchestrator: state.itinerary,
      trip,
      sparseTargets,
    });
    if (merged?.days?.length) {
      state.itinerary = merged;
    }

    const researchPools = collectResearchPools(
      state.research_data as Record<string, unknown> | undefined,
    );
    const boundCount = enrichItineraryWithPlaceIdsFromResearch(state.itinerary, researchPools);
    md.itinerary_adjust_place_id_bound_count = boundCount;

    const poiSlotFillReady = allNewPoiItemsHavePlaceIds(
      state.itinerary.days ?? [],
      sparseTargets,
      trip,
    );
    const executionMode = resolveItineraryAdjustExecutionMode({
      subIntent,
      highConfidence: false,
      poiSlotFillReady,
    });
    md.itinerary_adjust_execution_mode = executionMode;

    const primaryTarget = sparseTargets[0];
    if (!md.itinerary_adjust_target_date_iso) {
      md.itinerary_adjust_target_date_iso = primaryTarget.dateIso;
      md.itinerary_adjust_target_day_number = primaryTarget.dayNumber;
    }

    if (executionMode !== 'SEMI_AUTO') {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: poiSlotFillReady ? 'execution_mode_advice_only' : 'unresolved_places',
        subIntent,
        executionMode,
        sparseDayCount: sparseTargets.length,
        placeIdBoundCount: boundCount,
      };
      recordItineraryAdjustFunnel(this.promMetrics, {
        stage: 'draft_created',
        outcome: 'success',
        sub_intent: subIntent,
        execution_mode: executionMode,
        reason: poiSlotFillReady ? 'execution_mode_advice_only' : 'unresolved_places',
        request_id: state.request_id,
      });
      return;
    }

    const placeIdCache = new Map<string, number>();
    const resolvePlaceId = (item: ItineraryItem): number | undefined => {
      const fromRef = parseNumericPlaceId(item.location_ref?.place_id);
      if (fromRef != null) return fromRef;
      const key = String(item.location_ref?.place_id ?? item.location_ref?.name ?? item.id);
      if (placeIdCache.has(key)) return placeIdCache.get(key);
      const resolved = this.resolvePlaceIdForItineraryAdjustApply(item, state);
      if (resolved != null) placeIdCache.set(key, resolved);
      return resolved;
    };

    const { edits, addCount, unresolvedItems, appliedDays } = buildPoiSlotFillAppendEdits({
      trip,
      sparseTargets,
      draftDays: state.itinerary.days ?? [],
      resolvePlaceId,
    });

    if (addCount === 0 || unresolvedItems.length > 0) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: addCount === 0 ? 'no_new_pois' : 'unresolved_places',
        subIntent,
        executionMode: 'ADVICE_ONLY',
        unresolvedItems,
        addCount,
        sparseDayCount: sparseTargets.length,
      };
      md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
      return;
    }

    const skill = this.skillsRegistry?.getSkill('trip.applyEdit');
    if (!skill) {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        subIntent,
        executionMode,
      };
      return;
    }

    try {
      const out = (await skill.execute({
        mode: 'db',
        tripId: tripId.trim(),
        edits: edits as TripUserEdit[],
      })) as { success?: boolean };
      if (out?.success) {
        md.itinerary_adjust_auto_apply = {
          applied: true,
          executionMode: 'SEMI_AUTO',
          subIntent,
          addedCount: addCount,
          appliedDays,
          sparseDayCount: sparseTargets.length,
          skillsHit: ['trip.applyEdit'],
        };
        recordItineraryAdjustFunnel(this.promMetrics, {
          stage: 'auto_apply',
          outcome: 'success',
          sub_intent: subIntent,
          execution_mode: 'SEMI_AUTO',
          request_id: state.request_id,
          added_count: addCount,
          applied_days: appliedDays.length,
        });
        const lead = buildItineraryAdjustAutoApplyLeadMessage({
          applied: true,
          executionMode: 'SEMI_AUTO',
          targetDateIso: primaryTarget.dateIso,
          dayNumber: primaryTarget.dayNumber,
        });
        if (lead) {
          const prior = state.narration;
          state.narration = {
            user_friendly_summary: lead,
            day_by_day_narrative: prior?.day_by_day_narrative ?? [],
            highlights: prior?.highlights ?? [],
            tips: prior?.tips ?? [],
            day_by_day_text_zh: prior?.day_by_day_text_zh,
            warnings: prior?.warnings,
            research_ui_hints: prior?.research_ui_hints,
            voice_tone_modifier: prior?.voice_tone_modifier,
            visual_hint: prior?.visual_hint,
            audio_prosody: prior?.audio_prosody,
          };
        }
        state.decision_log.push({
          request_id: state.request_id,
          step: 'REPAIR',
          actor: 'Planner',
          inputs_summary: `POI_SLOT_FILL 追加落库 ${appliedDays.join(', ')}`,
          outputs_summary: `已落库：向 ${appliedDays.length} 个稀疏日新增 ${addCount} 个景点（trip.applyEdit append-only）`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'POI_SLOT_FILL_AUTO_APPLIED',
            skills_hit: ['trip.applyEdit'],
            applied_days: appliedDays,
          },
        });
        return;
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] poi slot fill auto-apply failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: 'apply_failed',
      subIntent,
      executionMode: 'ADVICE_ONLY',
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
  }

  private resolvePlaceIdForItineraryAdjustApply(
    item: ItineraryItem,
    state: OrchestratorState,
  ): number | undefined {
    const rawId = item.location_ref?.place_id;
    const numeric = parseNumericPlaceId(rawId);
    if (numeric != null) return numeric;

    const name = String(item.location_ref?.name ?? '').trim();
    if (!name) return undefined;

    const research = state.research_data as { poi_evidence?: { pois?: unknown[] }; pois?: unknown[] } | undefined;
    const pools: unknown[][] = [];
    if (Array.isArray(research?.poi_evidence?.pois)) pools.push(research.poi_evidence.pois);
    if (Array.isArray(research?.pois)) pools.push(research.pois);

    for (const pool of pools) {
      for (const row of pool) {
        const p = row as Record<string, unknown>;
        const label = String(p.name ?? p.nameCN ?? p.nameEN ?? '');
        if (!label || (!label.includes(name) && !name.includes(label))) continue;
        const id = parseNumericPlaceId(p.id ?? p.poi_id ?? p.place_id);
        if (id != null) return id;
      }
    }
    return undefined;
  }

  /** PA Layer1：完整 TripContext（含 items 时间窗，供 ContextAnalyzer 缺口检测） */
  private async loadTripContextForPaSlotPlacement(
    tripId: string,
    userId?: string,
  ): Promise<ReturnType<typeof buildTripContextFromPrismaRow> | null> {
    const tid = tripId.trim();
    if (!tid) return null;

    const uid = userId?.trim();
    if (uid) {
      const collaborator = await this.prisma.tripCollaborator.findUnique({
        where: { tripId_userId: { tripId: tid, userId: uid } },
      });
      if (!collaborator) return null;
    }

    const row = (await this.prisma.trip.findUnique({
      where: { id: tid },
      select: {
        id: true,
        destination: true,
        startDate: true,
        endDate: true,
        status: true,
        budgetConfig: true,
        pacingConfig: true,
        metadata: true,
        TripDay: {
          orderBy: { date: 'asc' as const },
          select: {
            id: true,
            date: true,
            ItineraryItem: {
              orderBy: { order: 'asc' as const },
              select: {
                id: true,
                type: true,
                startTime: true,
                endTime: true,
                estimatedCost: true,
                travelFromPreviousDuration: true,
                note: true,
                Place: { select: { nameCN: true, nameEN: true } },
              },
            },
          },
        },
      },
    })) as PrismaTripRowForPaContext | null;

    if (!row) return null;
    return buildTripContextFromPrismaRow(row);
  }

  /**
   * Layer1 槽位候选：优先 PA ContextAnalyzer，失败则启发式 TripDay 打分。
   */
  private async resolveItinerarySlotCandidatesForIntake(
    intakeMsg: string,
    trip: TripPlanRequest | undefined | null,
    tripId: string,
    userId: string | undefined,
    tripDaySnapshots: TripDaySnapshotForPlacement[],
  ): Promise<{
    candidates: ItinerarySlotCandidate[];
    paAnalysis?: ItinerarySlotPlacementGapResult;
  }> {
    const fallback = (): ItinerarySlotCandidate[] =>
      suggestItinerarySlotCandidates(trip, tripDaySnapshots, intakeMsg);

    if (!this.contextAnalyzerService) {
      return { candidates: fallback() };
    }

    try {
      const tripCtx = await this.loadTripContextForPaSlotPlacement(tripId, userId);
      if (!tripCtx) {
        return { candidates: fallback() };
      }

      const pa = this.contextAnalyzerService.analyzeItinerarySlotPlacement(intakeMsg, tripCtx);

      if (!pa.suggestedDays?.length) {
        this.logger.debug(
          `[INTAKE] PA graph fracture (empty suggestedDays); heuristic fallback trip_id=${tripId}`,
        );
        return {
          candidates: fallback(),
          paAnalysis: { ...pa, fallbackReason: 'GRAPH_FRACTURE' },
        };
      }

      if (shouldPreferPaSlotCandidates(pa)) {
        const candidates = await paSuggestedDaysToSlotCandidatesWithPolish(pa, {
          polisher: this.itinerarySlotPolisher,
          tripId,
          tripContext: tripCtx,
          onPolishAudit: (tag) => appendPolishAuditToAnalysisPath(pa, tag),
        });
        if (!candidates.length) {
          return {
            candidates: fallback(),
            paAnalysis: { ...pa, fallbackReason: 'EMPTY_CANDIDATES' },
          };
        }
        return { candidates, paAnalysis: pa };
      }
      this.logger.debug(
        `[INTAKE] PA slot placement low confidence (${pa.confidence}); heuristic fallback trip_id=${tripId}`,
      );
      return {
        candidates: fallback(),
        paAnalysis: { ...pa, fallbackReason: 'LOW_CONFIDENCE' },
      };
    } catch (e: unknown) {
      this.logger.warn(
        `[INTAKE] PA slot placement failed, heuristic fallback: ${(e as Error)?.message ?? e}`,
      );
    }

    return { candidates: fallback() };
  }

  /**
   * 极光槽位选日 INTAKE 澄清卡：拉取 pois/practical 知识库摘录（不走 DATA_LOOKUP 轻量路径）。
   * `route_and_run` 主链默认无 TLS DecisionContext；Policy 开启时需与轻量咨询一致临时 bind。
   */
  async fetchAuroraSlotPlacementRagSupplement(
    message: string,
    opts?: { request?: RouteAndRunRequestDto; tripId?: string },
  ): Promise<{
    supplementZh: string | null;
    citationCount: number;
    relevantCount: number;
    usedStaticFallback: boolean;
  }> {
    const runRetrieval = () => this.retrieveAuroraSlotPlacementRagSupplement(message);

    if (!isRagRealityPolicyGateActive()) {
      return runRetrieval();
    }
    if (getBoundDecisionContext()) {
      return runRetrieval();
    }
    const req = opts?.request;
    if (req) {
      const effectiveTripId = opts?.tripId?.trim() || req.trip_id?.trim() || undefined;
      const decisionCtx = await this.buildLightweightDecisionContextForRealityGate(req, effectiveTripId);
      return runWithDecisionContextAsync(decisionCtx, runRetrieval);
    }
    return runRetrieval();
  }

  private async retrieveAuroraSlotPlacementRagSupplement(
    message: string,
  ): Promise<{
    supplementZh: string | null;
    citationCount: number;
    relevantCount: number;
    usedStaticFallback: boolean;
  }> {
    const empty = {
      supplementZh: null as string | null,
      citationCount: 0,
      relevantCount: 0,
      usedStaticFallback: false,
    };
    if (!this.chunkRetrieval) {
      this.logger.debug('[INTAKE] Aurora slot RAG skipped: ChunkRetrieval not injected');
      return empty;
    }
    const decisionContext = getBoundDecisionContext();
    const { scope, policy } = this.ragRealityPolicyGate.resolve(decisionContext);
    if (scope === 'blocked') {
      const codes = policy.codes?.length ? policy.codes.join(',') : 'n/a';
      this.logger.debug(`[INTAKE] Aurora slot RAG skipped: rag_soft_world_blocked codes=${codes}`);
      return empty;
    }
    const mergeRagParams = (p: ChunkRetrievalParams): ChunkRetrievalParams =>
      this.ragRealityPolicyGate.mergeChunkRetrievalParams(
        { ...ragRetrievalExpansionParams(), ...p },
        scope,
      );
    const userCtx = String(message ?? '').trim();
    const poisQuery = userCtx
      ? `${AURORA_SLOT_RAG_POIS_QUERY} ${userCtx}`.slice(0, 512)
      : AURORA_SLOT_RAG_POIS_QUERY;
    try {
      const [poisPool, practicalPool] = await Promise.all([
        this.chunkRetrieval.retrieve(
          mergeRagParams({
            query: poisQuery,
            limit: 10,
            category: 'pois',
            useHybridSearch: true,
            credibilityMin: 0.35,
          }),
        ),
        this.chunkRetrieval.retrieve(
          mergeRagParams({
            query: AURORA_SLOT_RAG_PRACTICAL_QUERY,
            limit: 8,
            category: 'practical',
            useHybridSearch: true,
            credibilityMin: 0.35,
          }),
        ),
      ]);
      const pois = (poisPool ?? []).map((r) =>
        mapChunkToAuroraSlotRagEntry(String(r.content), this.formatRagDocumentTitle(r)),
      );
      const practical = (practicalPool ?? []).map((r) =>
        mapChunkToAuroraSlotRagEntry(String(r.content), this.formatRagDocumentTitle(r)),
      );
      const ragSection = buildAuroraSlotPlacementRagSection(pois, practical);
      const citationCount = (poisPool?.length ?? 0) + (practicalPool?.length ?? 0);
      if (ragSection.supplementZh) {
        this.logger.debug(
          `[INTAKE] Aurora slot RAG attached raw=${citationCount} relevant=${ragSection.relevantCount} static=${ragSection.usedStaticFallback} msg=${userCtx.slice(0, 48)}`,
        );
      }
      return {
        supplementZh: ragSection.supplementZh,
        citationCount,
        relevantCount: ragSection.relevantCount,
        usedStaticFallback: ragSection.usedStaticFallback,
      };
    } catch (e: unknown) {
      this.logger.warn(
        `[INTAKE] Aurora slot RAG failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return empty;
    }
  }

  /**
   * 当请求携带 `trip_id` 且 NL 未抽出目的地/日期时，用数据库中的 Trip 回填 `TripPlanRequest`，
   * 否则 INTAKE 会把 destination 落在「未指定」并错误弹出澄清（见 convertToTripPlanRequest）。
   * 结果写入 `state.metadata.trip_hydration`，便于日志与 debug UI（orchestrationResult.state.metadata）。
   *
   * `TripsService` 可能因循环依赖等未注入；与轻量咨询一致，此时回退 Prisma 直连（权限校验与 findOne 对齐）。
   */
  private async hydrateTripPlanRequestFromTripRecord(
    request: RouteAndRunRequestDto,
    tripPlanRequest: TripPlanRequest,
    state: OrchestratorState,
  ): Promise<void> {
    const setHydration = (payload: Record<string, unknown>) => {
      state.metadata = {
        ...(state.metadata ?? {}),
        trip_hydration: payload,
      } as any;
    };

    const tid = request.trip_id?.trim();
    if (!tid) {
      setHydration({
        attempted: false,
        status: 'no_trip_id',
        detail: '请求未带 trip_id，跳过行程回填',
      });
      return;
    }

    const loaded = await this.loadTripCoreForIntakeHydration(tid, request.user_id);
    if (loaded.ok === false) {
      const msg = loaded.error_message;
      setHydration({
        attempted: true,
        trip_id: tid,
        user_id: request.user_id,
        status: 'load_failed',
        error_message: msg,
        detail: `读取 Trip 失败（权限/不存在）：${msg}`,
        hydration_source: this.tripsService ? 'trips_service' : 'prisma_fallback',
      });
      this.logger.warn(`[INTAKE] trip_hydration load_failed trip_id=${tid} user_id=${request.user_id}: ${msg}`);
      return;
    }

    const trip = loaded.trip;
    if (loaded.source === 'prisma_fallback') {
      this.logger.warn(
        `[INTAKE] trip_hydration: TripsService 未注入，已用 Prisma 回退回填 trip_id=${tid} user_id=${request.user_id ?? 'n/a'}`,
      );
    }

    const hydrationSource = loaded.source;

    const destUnset =
      tripPlanRequest.destination == null ||
      tripPlanRequest.destination === '未指定' ||
      (typeof tripPlanRequest.destination === 'string' && !String(tripPlanRequest.destination).trim());

    const tripDestRaw =
      trip.destination == null
        ? ''
        : typeof trip.destination === 'string'
          ? trip.destination.trim()
          : String(trip.destination).trim();
    const tripDest = this.normalizeTripRecordDestinationForPlanning(tripDestRaw);
    const tripHasDest = Boolean(tripDest);
    const tripHasDates = Boolean(trip.startDate && trip.endDate);

    const filledFields: string[] = [];

    const planDestStr =
      typeof tripPlanRequest.destination === 'string' ? tripPlanRequest.destination.trim() : '';
    if (
      tripDest &&
      (destUnset || shouldPreferTripDestinationOnHydration(planDestStr, tripDest))
    ) {
      tripPlanRequest.destination = tripDest;
      filledFields.push(destUnset ? 'destination' : 'destination_trip_authority');
    }

    const structIn = request.structured_travel_input;
    const stStart = typeof structIn?.start_date === 'string' ? structIn.start_date.trim() : '';
    const stEnd = typeof structIn?.end_date === 'string' ? structIn.end_date.trim() : '';
    const structuredHasDates =
      Boolean(stStart && stEnd && /^\d{4}-\d{2}-\d{2}$/.test(stStart) && /^\d{4}-\d{2}-\d{2}$/.test(stEnd));

    const recentSlice = this.contextSlidingWindow.slice(
      'orchestrator_claude',
      request.conversation_context?.recent_messages,
    );
    const intakeTextBundle = [request.message, ...recentSlice].filter(Boolean).join('\n');
    const textForHydration = String(intakeTextBundle).replace(
      /[０-９]/g,
      (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    );
    const nlParse = parseIntakeNlDatesAndDays(textForHydration, {
      refYear: new Date().getFullYear(),
      tripIdBound: true,
    });

    if (trip.startDate && trip.endDate) {
      const start =
        trip.startDate instanceof Date
          ? trip.startDate.toISOString().slice(0, 10)
          : String(trip.startDate).slice(0, 10);
      const end =
        trip.endDate instanceof Date
          ? trip.endDate.toISOString().slice(0, 10)
          : String(trip.endDate).slice(0, 10);

      const authority = applyBoundTripDateAuthority({
        tripStart: start,
        tripEnd: end,
        plan: {
          start_date: tripPlanRequest.start_date,
          date_range: tripPlanRequest.date_range,
          days: tripPlanRequest.days,
        },
        nlParse,
        structuredHasDates,
      });

      const hadPlanDates = Boolean(
        tripPlanRequest.start_date ||
          (tripPlanRequest.date_range?.start_date && tripPlanRequest.date_range?.end_date),
      );

      tripPlanRequest.date_range = authority.date_range;
      tripPlanRequest.start_date = authority.start_date;
      tripPlanRequest.days = authority.days;

      if (!hadPlanDates || authority.authority === 'trip_record') {
        filledFields.push('date_range', 'start_date', 'days');
      } else if (authority.authority === 'nl_override') {
        filledFields.push('date_range', 'start_date', 'days', 'nl_override');
      } else if (authority.authority === 'structured') {
        filledFields.push('date_range', 'start_date', 'days', 'structured');
      }

      if (authority.overwritten_nl_fields.length > 0) {
        filledFields.push('trip_date_authority_overwrite');
      }

      (state.metadata as Record<string, unknown>).trip_date_authority = authority.authority;
    }

    tripPlanRequest.ontology_context = {
      ...(tripPlanRequest.ontology_context ?? {}),
      trip_id: tid,
    };

    const relaxationFilled = hydrateRelaxationConstraintsFromTripRecord(tripPlanRequest, trip);
    if (relaxationFilled.length > 0) {
      filledFields.push(...relaxationFilled);
    }

    const planDatesMissing =
      !tripPlanRequest.start_date &&
      !(tripPlanRequest.date_range?.start_date && tripPlanRequest.date_range?.end_date);

    const status = filledFields.length > 0 ? 'applied' : 'noop';
    const sparseDb =
      (destUnset && !tripHasDest) || (planDatesMissing && !tripHasDates);
    const dateAuthority = (state.metadata as Record<string, unknown>)?.trip_date_authority as
      | string
      | undefined;
    const detail =
      filledFields.length > 0
        ? dateAuthority === 'trip_record' && filledFields.includes('trip_date_authority_overwrite')
          ? `已用绑定 Trip 起止日期覆盖 NL 误解析（${filledFields.join(', ')}）`
          : `已从 Trip 回填：${filledFields.join(', ')}`
        : sparseDb
          ? 'Trip 已加载，但库中缺少可回填的目的地或起止日期（且请求侧仍为占位/缺日期）'
          : 'Trip 已加载，请求侧已有目的地/日期，无需回填';

    setHydration({
      attempted: true,
      trip_id: tid,
      user_id: request.user_id,
      status,
      hydration_source: hydrationSource,
      filled_fields: filledFields,
      trip_destination_present: tripHasDest,
      trip_dates_present: tripHasDates,
      plan_destination_was_placeholder: destUnset,
      plan_dates_missing: planDatesMissing,
      ...(dateAuthority ? { trip_date_authority: dateAuthority } : {}),
      detail,
    });

    if (filledFields.length > 0) {
      this.logger.log(`[INTAKE] trip_hydration applied trip_id=${tid} filled=[${filledFields.join(', ')}]`);
    } else {
      this.logger.log(`[INTAKE] trip_hydration noop trip_id=${tid} sparse_db=${sparseDb}`);
    }
  }

  /**
   * INTAKE 步骤：解析请求 & 缺口识别（Phase 4b → intake-phase.executor）
   */
  private intakeOrchestratorNode?: IntakeOrchestratorNode;

  private getIntakeNode(): IntakeOrchestratorNode {
    if (!this.intakeOrchestratorNode) {
      this.intakeOrchestratorNode = new IntakeOrchestratorNode(this.createIntakeNodeHost());
    }
    return this.intakeOrchestratorNode;
  }

  private async tryApplyBoundTripItineraryItemDelete(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<{
    applied: boolean;
    deletedCount?: number;
    answerText?: string;
    itemIds?: string[];
    reason?: string;
    skillsHit?: string[];
  }> {
    if (!detectItineraryItemDeleteIntent(message)) {
      return { applied: false, reason: 'not_delete_intent' };
    }
    const spec = parseItineraryItemDeleteSpec(message);
    if (!spec) {
      return {
        applied: false,
        reason: 'parse_failed',
        answerText: '未能理解要删除的行程项，请说明第几天以及景点名称。',
      };
    }
    if (!this.tripsService) {
      return {
        applied: false,
        reason: 'trips_service_unavailable',
        answerText: buildItineraryItemDeleteAnswerText(spec, 0),
      };
    }

    let trip: TripLikeForDelete;
    try {
      trip = (await this.tripsService.findOne(tripId.trim(), userId)) as TripLikeForDelete;
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary delete: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        applied: false,
        reason: 'trip_load_failed',
        answerText: buildItineraryItemDeleteAnswerText(spec, 0),
      };
    }

    const resolved = resolveItemIdsForDeleteWithFallback(trip, spec);
    const itemIds = resolved.itemIds;
    if (!itemIds.length) {
      return {
        applied: false,
        reason: 'no_matching_items',
        answerText: buildItineraryItemDeleteAnswerText(spec, 0),
        itemIds: [],
      };
    }

    const skill = this.skillsRegistry?.getSkill('trip.applyEdit');
    if (!skill) {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        answerText: buildItineraryItemDeleteAnswerText(spec, 0, resolved),
        itemIds,
      };
    }

    try {
      const out = (await skill.execute({
        mode: 'db',
        tripId: tripId.trim(),
        edits: itemIds.map((itemId) => ({ type: 'delete' as const, itemId })),
      })) as { success?: boolean };
      if (out?.success) {
        return {
          applied: true,
          deletedCount: itemIds.length,
          itemIds,
          skillsHit: ['trip.applyEdit'],
          answerText: buildItineraryItemDeleteAnswerText(spec, itemIds.length, resolved),
        };
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary delete apply failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      applied: false,
      reason: 'apply_failed',
      skillsHit: ['trip.applyEdit'],
      answerText: buildItineraryItemDeleteAnswerText(spec, 0, resolved),
      itemIds,
    };
  }

  private async tryApplyBoundTripItineraryItemAdd(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<{
    applied: boolean;
    addedCount?: number;
    answerText?: string;
    itemIds?: string[];
    reason?: string;
    skillsHit?: string[];
  }> {
    if (!detectItineraryItemAddIntent(message)) {
      return { applied: false, reason: 'not_add_intent' };
    }
    if (detectItineraryAdjustIntent(message)) {
      return { applied: false, reason: 'not_add_intent' };
    }
    const spec = parseItineraryItemAddSpec(message);
    if (!spec) {
      return {
        applied: false,
        reason: 'parse_failed',
      };
    }
    if (!isPlausibleItineraryItemAddPoiQuery(spec.poiQuery)) {
      return {
        applied: false,
        reason: 'parse_failed',
      };
    }
    if (!this.tripsService) {
      return {
        applied: false,
        reason: 'trips_service_unavailable',
        answerText: buildItineraryItemAddAnswerText(spec, 0),
      };
    }

    let trip: TripLikeForDelete & {
      TripDay?: Array<{
        id?: string;
        date?: Date | string | null;
        ItineraryItem?: Array<{
          id: string;
          startTime?: Date | string | null;
          endTime?: Date | string | null;
          Place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
          place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
        }>;
      }>;
    };
    try {
      trip = (await this.tripsService.findOne(tripId.trim(), userId)) as typeof trip;
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary add: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        applied: false,
        reason: 'trip_load_failed',
        answerText: buildItineraryItemAddAnswerText(spec, 0),
      };
    }

    const dayResolved = resolveTripDayIdForAdd(trip, spec.dayNumber);
    const effectiveDay = dayResolved.dayNumber ?? spec.dayNumber;
    if (!dayResolved.tripDayId) {
      return {
        applied: false,
        reason: 'day_not_found',
        answerText: buildItineraryItemAddAnswerText(spec, 0, { dayNumber: effectiveDay }),
      };
    }

    const intentProfile = isIntentBasedPoiQuery(spec.poiQuery)
      ? resolvePoiIntentProfile(spec.poiQuery)
      : null;

    if (intentProfile) {
      if (intentAlreadySatisfiedOnDay(trip, effectiveDay ?? 1, intentProfile)) {
        return {
          applied: false,
          reason: 'already_exists',
          answerText: buildIntentAddAlreadyExistsAnswer(effectiveDay, intentProfile),
        };
      }
    } else if (itemAlreadyOnDay(trip, effectiveDay, spec.poiQuery)) {
      return {
        applied: false,
        reason: 'already_exists',
        answerText: buildItineraryItemAddAnswerText(spec, 0, {
          dayNumber: effectiveDay,
          alreadyExists: true,
        }),
      };
    }

    const externalCandidates: IntentPoiCandidate[] = [];
    let resolvedPlaceName = spec.poiQuery;
    let resolvedPlaceCategory: string | null = null;
    const skillsHit: string[] = [];
    const dayAnchor =
      intentProfile && effectiveDay ? extractDaySearchAnchor(trip, effectiveDay) : null;

    const poiSkill = this.skillsRegistry?.getSkill('poi.search');
    if (poiSkill) {
      skillsHit.push('poi.search');
      try {
        const searchOut = (await poiSkill.execute({
          query: intentProfile?.semanticQuery ?? spec.poiQuery,
          limit: intentProfile ? 12 : 8,
          lat: dayAnchor?.lat,
          lng: dayAnchor?.lng,
          keyword_only: intentProfile ? false : true,
        })) as {
          pois?: Array<{
            poi_id?: string;
            name?: string;
            nameCN?: string;
            nameEN?: string;
            category?: string;
            coordinates?: { lat: number; lng: number };
          }>;
        };
        for (const p of searchOut?.pois ?? []) {
          const id = Number(p.poi_id);
          if (!Number.isFinite(id)) continue;
          externalCandidates.push({
            id,
            nameCN: p.nameCN ?? p.name ?? null,
            nameEN: p.nameEN ?? null,
            category: p.category ?? null,
          });
        }
      } catch (e: unknown) {
        this.logger.warn(
          `[Claude Orchestrator] itinerary add poi.search failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    if (intentProfile && dayAnchor && intentProfile.geoCategories.length > 0) {
      const geoSkill = this.skillsRegistry?.getSkill('geo.findNearbyPOI');
      if (geoSkill) {
        skillsHit.push('geo.findNearbyPOI');
        try {
          const geoOut = (await geoSkill.execute({
            location: dayAnchor,
            radius: 35000,
            category: intentProfile.geoCategories,
            limit: 12,
          })) as {
            pois?: Array<{
              id?: number;
              poi_id?: string;
              name?: string;
              nameCN?: string;
              category?: string;
              distance?: number;
              distance_meters?: number;
            }>;
          };
          for (const p of geoOut?.pois ?? []) {
            const id = Number(p.id ?? p.poi_id);
            if (!Number.isFinite(id)) continue;
            externalCandidates.push({
              id,
              nameCN: p.nameCN ?? p.name ?? null,
              nameEN: null,
              category: p.category ?? null,
              distanceMeters: p.distance ?? p.distance_meters,
            });
          }
        } catch (e: unknown) {
          this.logger.warn(
            `[Claude Orchestrator] itinerary add geo.findNearbyPOI failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    const tripDestination = String((trip as { destination?: string | null }).destination ?? '');
    const countryCode = this.inferCountryFromDestination(tripDestination) ?? 'IS';

    const placeId = intentProfile
      ? resolvePlaceIdForIntentAdd(trip, effectiveDay ?? 1, externalCandidates, intentProfile)
      : resolvePlaceIdForAdd(trip, spec, externalCandidates);
    if (!placeId) {
      return {
        applied: false,
        reason: intentProfile && !dayAnchor ? 'no_day_anchor' : 'place_not_found',
        answerText: intentProfile
          ? buildSupplyGapFailureGuidance(intentProfile, {
              dayNumber: effectiveDay,
              anchorMissing: !dayAnchor,
              searchRadiusKm: 35,
              countryCode,
            })
          : buildItineraryItemAddAnswerText(spec, 0, { dayNumber: effectiveDay }),
      };
    }

    const matched =
      externalCandidates.find((c) => c.id === placeId) ??
      (() => {
        for (const day of trip.TripDay ?? []) {
          for (const item of day.ItineraryItem ?? []) {
            const place = item.Place ?? item.place;
            if (place?.id === placeId) return place;
          }
        }
        return undefined;
      })();
    if (matched?.nameCN || matched?.nameEN) {
      resolvedPlaceName = String(matched.nameCN ?? matched.nameEN);
    }
    if ((matched as { category?: string | null })?.category) {
      resolvedPlaceCategory = String((matched as { category?: string | null }).category);
    }

    let openingHoursText: string | undefined;
    const ohSkill = this.skillsRegistry?.getSkill('opening_hours.get');
    if (ohSkill) {
      skillsHit.push('opening_hours.get');
      try {
        const ohOut = (await ohSkill.execute({ poi_ids: [String(placeId)] })) as {
          opening_hours?: Array<{ opening_hours?: unknown }>;
        };
        const dayRow = (trip.TripDay ?? [])[(effectiveDay ?? 1) - 1];
        const dayDate =
          dayRow?.date instanceof Date
            ? dayRow.date
            : dayRow?.date
              ? new Date(String(dayRow.date))
              : new Date();
        openingHoursText = openingHoursEvidenceToText(
          ohOut?.opening_hours?.[0]?.opening_hours,
          dayDate,
          'Atlantic/Reykjavik',
        );
      } catch (e: unknown) {
        this.logger.debug(
          `[Claude Orchestrator] itinerary add opening_hours.get skipped: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const dayRow = (trip.TripDay ?? [])[(effectiveDay ?? 1) - 1];
    const slot = suggestActivitySlotForDayAdd({
      tripDayDate: dayRow?.date,
      items: dayRow?.ItineraryItem ?? [],
      poiQuery: spec.poiQuery,
      placeCategory: resolvedPlaceCategory,
      openingHoursText,
      timezone: 'Atlantic/Reykjavik',
    });

    const skill = this.skillsRegistry?.getSkill('trip.applyEdit');
    if (!skill) {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        answerText: buildItineraryItemAddAnswerText(spec, 0, {
          dayNumber: effectiveDay,
          placeName: resolvedPlaceName,
        }),
      };
    }

    try {
      skillsHit.push('trip.applyEdit');
      const out = (await skill.execute({
        mode: 'db',
        tripId: tripId.trim(),
        edits: [
          {
            type: 'add' as const,
            tripDayId: dayResolved.tripDayId,
            placeId,
            startTime: slot.startTime,
            endTime: slot.endTime,
          },
        ],
      })) as { success?: boolean; dbEdit?: { results?: Array<{ success?: boolean }> } };
      if (out?.success) {
        return {
          applied: true,
          addedCount: 1,
          skillsHit,
          answerText: buildItineraryItemAddAnswerText(spec, 1, {
            dayNumber: effectiveDay,
            placeName: resolvedPlaceName,
            scheduledTimeLabel: slot.localLabel,
            scheduleReasonZh: slot.reasonZh,
          }),
        };
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary add apply failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      applied: false,
      reason: 'apply_failed',
      skillsHit,
      answerText: buildItineraryItemAddAnswerText(spec, 0, {
        dayNumber: effectiveDay,
        placeName: resolvedPlaceName,
      }),
    };
  }

  private async tryApplyBoundTripItineraryAdjustDraft(
    tripId: string,
    userId: string | undefined,
    request: Pick<import('../dto/route-and-run.dto').RouteAndRunRequestDto, 'message' | 'options' | 'trip_id'>,
  ): Promise<{
    applied: boolean;
    deletedCount?: number;
    addedCount?: number;
    answerText?: string;
    targetDateIso?: string;
    reason?: string;
    skillsHit?: string[];
  }> {
    let pending =
      pendingDraftFromRequestSnapshot({
        tripId,
        snapshot: request.options?.itinerary_adjust_draft_snapshot,
      }) ?? undefined;

    const durableRunId = request.options?.durable_trip_run_id?.trim();
    if (!pending && durableRunId && this.tripRunManager) {
      const meta = await this.tripRunManager.getTripRunMetadata(durableRunId);
      pending = readPendingItineraryAdjustDraft(meta ?? undefined);
      if (pending && pending.trip_id !== tripId) pending = undefined;
    }

    if (!pending) {
      return {
        applied: false,
        reason: 'no_pending_draft',
        answerText: buildItineraryAdjustDraftApplyAnswerText({
          applied: false,
          targetDateIso: '',
          reason: 'no_pending_draft',
        }),
      };
    }

    if (!this.tripsService) {
      return {
        applied: false,
        reason: 'trips_service_unavailable',
        answerText: buildItineraryAdjustDraftApplyAnswerText({
          applied: false,
          targetDateIso: pending.target_date_iso,
          dayNumber: pending.target_day_number,
          reason: 'trips_service_unavailable',
        }),
      };
    }

    const skill = this.skillsRegistry?.getSkill('trip.applyEdit');
    if (!skill) {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        answerText: buildItineraryAdjustDraftApplyAnswerText({
          applied: false,
          targetDateIso: pending.target_date_iso,
          dayNumber: pending.target_day_number,
          reason: 'trip_apply_edit_unavailable',
        }),
      };
    }

    const tripPois = await this.loadTripPlacePoiEvidenceForAdjust(tripId, userId);
    const researchState = {
      research_data: {
        poi_evidence: { pois: tripPois },
        pois: tripPois,
      },
    } as unknown as OrchestratorState;

    const preTrip = await this.tripsService!.findOne(tripId.trim(), userId);

    const result = await executeItineraryAdjustDraftApply({
      tripId,
      userId,
      pending,
      loadTrip: async () =>
        (await this.tripsService!.findOne(tripId.trim(), userId)) as TripLikeForDelete,
      resolvePlaceId: (item) =>
        this.resolvePlaceIdForItineraryAdjustApply(item, researchState),
      researchPools: [tripPois],
      applyEditSkill: skill as {
        execute: (input: {
          mode: 'db';
          tripId: string;
          edits: TripUserEdit[];
        }) => Promise<{ success?: boolean }>;
      },
    });

    if (result.applied && durableRunId && this.tripRunManager) {
      await this.tripRunManager.updateTripRun({
        runId: durableRunId,
        metadata: { [PENDING_ITINERARY_ADJUST_DRAFT_META_KEY]: null },
      });
    }

    if (result.applied && this.itineraryVersion) {
      try {
        const postTrip = await this.tripsService!.findOne(tripId.trim(), userId);
        void this.itineraryVersion.persistUserEditRevision({
          tripId: tripId.trim(),
          userId,
          preItinerary: preTrip,
          postItinerary: postTrip,
          summary: `ITINERARY_ADJUST apply: ${result.targetDateIso ?? pending.target_date_iso}`,
          source: 'ITINERARY_ADJUST',
        });
      } catch {
        // best-effort alignment capture
      }
    }

    return result;
  }

  private async tryApplyBoundTripItineraryDayReplan(
    tripId: string,
    userId: string | undefined,
    message: string,
    dateRange?: { start_date?: string; end_date?: string },
  ): Promise<{
    applied: boolean;
    deletedCount?: number;
    addedCount?: number;
    answerText?: string;
    itemIds?: string[];
    reason?: string;
    skillsHit?: string[];
  }> {
    if (!detectGoldenCircleDayReplanIntent(message)) {
      return { applied: false, reason: 'not_day_replan_intent' };
    }
    const spec = parseGoldenCircleDayReplanSpec(message, dateRange);
    if (!spec) {
      return {
        applied: false,
        reason: 'parse_failed',
        answerText: '未能理解要重排的行程日，请说明日期与黄金圈景点。',
      };
    }
    if (!this.tripsService) {
      return {
        applied: false,
        reason: 'trips_service_unavailable',
        answerText: buildGoldenCircleDayReplanAnswerText({
          targetDateIso: spec.targetDateIso,
          placeNames: [],
          deletedCount: 0,
          addedCount: 0,
        }),
      };
    }

    let trip: TripLikeForDelete & {
      TripDay?: Array<{
        id?: string;
        date?: Date | string | null;
        ItineraryItem?: Array<{
          id: string;
          type?: string;
          Place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
          place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
        }>;
      }>;
    };
    try {
      trip = (await this.tripsService.findOne(tripId.trim(), userId)) as typeof trip;
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary day replan: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        applied: false,
        reason: 'trip_load_failed',
        answerText: buildGoldenCircleDayReplanAnswerText({
          targetDateIso: spec.targetDateIso,
          placeNames: [],
          deletedCount: 0,
          addedCount: 0,
        }),
      };
    }

    const dayResolved = resolveTripDayByDate(trip, spec.targetDateIso);
    if (!dayResolved.tripDayId) {
      return {
        applied: false,
        reason: 'day_not_found',
        answerText: buildGoldenCircleDayReplanAnswerText({
          targetDateIso: spec.targetDateIso,
          placeNames: [],
          deletedCount: 0,
          addedCount: 0,
        }),
      };
    }

    const skillsHit: string[] = [];
    const placeIds: Partial<Record<GoldenCircleAnchorSlug, number>> = resolveGoldenCirclePlaceIdsFromTrip(trip);
    const poiSkill = this.skillsRegistry?.getSkill('poi.search');
    const searchCache = new Map<GoldenCircleAnchorSlug, PoiCandidateLike[]>();

    for (const slug of spec.anchorSlugs) {
      if (placeIds[slug] != null) continue;
      if (!poiSkill) continue;
      skillsHit.push('poi.search');
      try {
        const searchOut = (await poiSkill.execute({
          query: goldenCircleSearchQueryForSlug(slug),
          limit: 10,
          keyword_only: true,
        })) as { pois?: PoiCandidateLike[] };
        const pois = searchOut?.pois ?? [];
        searchCache.set(slug, pois);
        const picked = pickGoldenCirclePlaceFromCandidates(slug, pois);
        if (picked != null) placeIds[slug] = picked;
      } catch (e: unknown) {
        this.logger.warn(
          `[Claude Orchestrator] day replan poi.search(${slug}) failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const missing = spec.anchorSlugs.filter((slug) => placeIds[slug] == null);
    if (missing.length > 0) {
      return {
        applied: false,
        reason: 'place_not_found',
        skillsHit,
        answerText: buildGoldenCircleDayReplanAnswerText({
          dayNumber: dayResolved.dayNumber,
          targetDateIso: spec.targetDateIso ?? dayResolved.dateIso,
          placeNames: spec.anchorSlugs.filter((s) => placeIds[s] != null).map((s) => s),
          deletedCount: 0,
          addedCount: 0,
        }),
      };
    }

    const placeNames: string[] = [];
    for (const slug of spec.anchorSlugs) {
      const pid = placeIds[slug]!;
      let label: string = slug;
      outer: for (const day of trip.TripDay ?? []) {
        for (const item of day.ItineraryItem ?? []) {
          const place = item.Place ?? item.place;
          if (place?.id === pid) {
            label = String(place.nameCN ?? place.nameEN ?? slug);
            break outer;
          }
        }
      }
      if (label === slug) {
        for (const pois of searchCache.values()) {
          const hit = pois.find((p) => Number(p.id ?? p.poi_id) === pid);
          if (hit) {
            label = String(hit.nameCN ?? hit.nameEN ?? hit.name ?? slug);
            break;
          }
        }
      }
      placeNames.push(label);
    }

    const dayRow = (trip.TripDay ?? []).find((d) => d.id === dayResolved.tripDayId);
    const schedule = buildGoldenCircleScheduleSlots(dayRow?.date ?? spec.targetDateIso);
    const deleteIds = collectActivityItemIdsForDayReplan(dayResolved.items);

    const skill = this.skillsRegistry?.getSkill('trip.applyEdit');
    if (!skill) {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        skillsHit,
        answerText: buildGoldenCircleDayReplanAnswerText({
          dayNumber: dayResolved.dayNumber,
          targetDateIso: spec.targetDateIso ?? dayResolved.dateIso,
          placeNames,
          deletedCount: 0,
          addedCount: 0,
        }),
      };
    }

    const edits = [
      ...deleteIds.map((itemId) => ({ type: 'delete' as const, itemId })),
      ...schedule.map((slot) => ({
        type: 'add' as const,
        tripDayId: dayResolved.tripDayId!,
        placeId: placeIds[slot.slug]!,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    ];

    try {
      skillsHit.push('trip.applyEdit');
      const out = (await skill.execute({
        mode: 'db',
        tripId: tripId.trim(),
        edits,
      })) as { success?: boolean };
      if (out?.success) {
        return {
          applied: true,
          deletedCount: deleteIds.length,
          addedCount: schedule.length,
          skillsHit,
          answerText: buildGoldenCircleDayReplanAnswerText({
            dayNumber: dayResolved.dayNumber,
            targetDateIso: spec.targetDateIso ?? dayResolved.dateIso,
            placeNames,
            deletedCount: deleteIds.length,
            addedCount: schedule.length,
          }),
        };
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary day replan apply failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      applied: false,
      reason: 'apply_failed',
      skillsHit,
      answerText: buildGoldenCircleDayReplanAnswerText({
        dayNumber: dayResolved.dayNumber,
        targetDateIso: spec.targetDateIso ?? dayResolved.dateIso,
        placeNames,
        deletedCount: 0,
        addedCount: 0,
      }),
    };
  }

  private async tryApplyBoundTripItineraryItemUpdate(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<{
    applied: boolean;
    updatedCount?: number;
    answerText?: string;
    itemIds?: string[];
    reason?: string;
    skillsHit?: string[];
  }> {
    if (!detectItineraryItemUpdateIntent(message)) {
      return { applied: false, reason: 'not_update_intent' };
    }
    const spec = parseItineraryItemUpdateSpec(message);
    if (!spec) {
      return {
        applied: false,
        reason: 'parse_failed',
        answerText: '未能理解要修改的行程时间，请说明景点名称以及开始/结束时间。',
      };
    }
    if (!this.tripsService) {
      return {
        applied: false,
        reason: 'trips_service_unavailable',
        answerText: buildItineraryItemUpdateAnswerText(spec, false),
      };
    }

    let trip: TripLikeForDelete & {
      TripDay?: Array<{
        id?: string;
        date?: Date | string | null;
        ItineraryItem?: Array<{
          id: string;
          Place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
          place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
        }>;
      }>;
    };
    try {
      trip = (await this.tripsService.findOne(tripId.trim(), userId)) as typeof trip;
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary update: trip load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        applied: false,
        reason: 'trip_load_failed',
        answerText: buildItineraryItemUpdateAnswerText(spec, false),
      };
    }

    const resolved = resolveItemForUpdateWithFallback(trip, spec);
    if (!resolved.itemId) {
      return {
        applied: false,
        reason: 'no_matching_items',
        answerText: buildItineraryItemUpdateAnswerText(spec, false, {
          dayNumber: spec.dayNumber,
        }),
      };
    }

    const effectiveSpec = applyExistingItemDurationToUpdateSpec(spec, resolved.matchedItem);
    const times = buildIsoTimesForUpdate(resolved.tripDayDate, effectiveSpec);
    const skill = this.skillsRegistry?.getSkill('trip.applyEdit');
    if (!skill) {
      return {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        answerText: buildItineraryItemUpdateAnswerText(spec, false, {
          dayNumber: resolved.matchedDayNumber,
          placeName: resolved.placeName,
          localLabel: times.localLabel,
          usedDayFallback: resolved.usedDayFallback,
        }),
        itemIds: [resolved.itemId],
      };
    }

    try {
      const out = (await skill.execute({
        mode: 'db',
        tripId: tripId.trim(),
        edits: [
          {
            type: 'update' as const,
            itemId: resolved.itemId,
            updates: {
              startTime: times.startTime,
              endTime: times.endTime,
            },
          },
        ],
      })) as { success?: boolean };
      if (out?.success) {
        return {
          applied: true,
          updatedCount: 1,
          itemIds: [resolved.itemId],
          skillsHit: ['trip.applyEdit'],
          answerText: buildItineraryItemUpdateAnswerText(spec, true, {
            dayNumber: resolved.matchedDayNumber,
            placeName: resolved.placeName,
            localLabel: times.localLabel,
            usedDayFallback: resolved.usedDayFallback,
          }),
        };
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] itinerary update apply failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      applied: false,
      reason: 'apply_failed',
      skillsHit: ['trip.applyEdit'],
      answerText: buildItineraryItemUpdateAnswerText(spec, false, {
        dayNumber: resolved.matchedDayNumber,
        placeName: resolved.placeName,
        localLabel: times.localLabel,
        usedDayFallback: resolved.usedDayFallback,
      }),
      itemIds: [resolved.itemId],
    };
  }

  private createIntakePhaseHost(): IntakePhaseHost {
    return {
      logger: this.logger,
      clarificationHandler: this.clarificationHandler,
      decisionKernel: this.decisionKernel,
      localCaseStore: this.localCaseStore,
      convertToTripPlanRequest: (req, st) => this.convertToTripPlanRequest(req, st),
      hydrateTripPlanRequestFromTripRecord: (req, tp, st) =>
        this.hydrateTripPlanRequestFromTripRecord(req, tp, st),
      isConstraintSinkHydrateEnabled: () => this.constraintSinkService?.isEnabled() ?? false,
      getActiveTripStateForConstraintSink: () =>
        this.agentMemoryContextStore?.get()?.activeTripState ?? null,
      recordConstraintSinkHydrated: (keys) =>
        this.promMetrics?.recordConstraintSinkHydrated(keys.length),
      kernelCreateInitialOpts: (req, st) => this.kernelCreateInitialOpts(req, st),
      generateDecisionStepForStep: (st, step, actor) =>
        this.generateDecisionStepForStep(st, step, actor as SubAgentType),
      applyMarathonPipelineSignals: (st, req) => this.applyMarathonPipelineSignals(st, req),
      loadTripDaySnapshotsForSlotPlacement: (tripId, userId) =>
        this.loadTripDaySnapshotsForSlotPlacement(tripId, userId),
      resolveItinerarySlotCandidatesForIntake: (msg, tp, tripId, userId, snaps) =>
        this.resolveItinerarySlotCandidatesForIntake(msg, tp, tripId, userId, snaps),
      fetchAuroraSlotPlacementRagSupplement: (msg, opts) =>
        this.fetchAuroraSlotPlacementRagSupplement(msg, opts),
      tryApplyBoundTripItineraryItemDelete: (tripId, userId, message) =>
        this.tryApplyBoundTripItineraryItemDelete(tripId, userId, message),
      tryApplyBoundTripItineraryItemAdd: (tripId, userId, message) =>
        this.tryApplyBoundTripItineraryItemAdd(tripId, userId, message),
      tryApplyBoundTripItineraryItemUpdate: (tripId, userId, message) =>
        this.tryApplyBoundTripItineraryItemUpdate(tripId, userId, message),
      tryApplyBoundTripItineraryDayReplan: (tripId, userId, message, dateRange) =>
        this.tryApplyBoundTripItineraryDayReplan(tripId, userId, message, dateRange),
      tryApplyBoundTripItineraryAdjustDraft: (tripId, userId, req) =>
        this.tryApplyBoundTripItineraryAdjustDraft(tripId, userId, req),
      recordIntakeDecisionTelemetry: this.decisionTelemetry
        ? (event) =>
            this.decisionTelemetry!.record(event).catch((err: unknown) => {
              this.logger.warn(
                `[INTAKE Telemetry] record failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            })
        : undefined,
      persistRelaxationToTrip: (tripId, userId, applied) =>
        this.relaxationTripPersist?.persistFromIntake(tripId, userId, applied) ??
        Promise.resolve(undefined),
    };
  }

  private createIntakeNodeHost(): IntakeNodeHost {
    const phaseHost = this.createIntakePhaseHost();
    return {
      logger: this.logger,
      promMetrics: this.promMetrics,
      executeIntakeStep: (req, ctx, st, llm) =>
        runIntakePhase(phaseHost, { request: req, context: ctx, state: st, llmProvider: llm }),
      maybeSnapshot: (st, trigger) => this.maybeSnapshot(st, trigger),
      buildPrePlanSuccessResult: (st, start, dso, ctx) =>
        this.buildSuccessResult(st, start, dso, ctx),
      tryApplyBoundTripItineraryItemDelete: (tripId, userId, message) =>
        this.tryApplyBoundTripItineraryItemDelete(tripId, userId, message),
      tryApplyBoundTripItineraryItemAdd: (tripId, userId, message) =>
        this.tryApplyBoundTripItineraryItemAdd(tripId, userId, message),
      tryApplyBoundTripItineraryItemUpdate: (tripId, userId, message) =>
        this.tryApplyBoundTripItineraryItemUpdate(tripId, userId, message),
      tryApplyBoundTripItineraryDayReplan: (tripId, userId, message, dateRange) =>
        this.tryApplyBoundTripItineraryDayReplan(tripId, userId, message, dateRange),
      tryApplyBoundTripItineraryAdjustDraft: (tripId, userId, req) =>
        this.tryApplyBoundTripItineraryAdjustDraft(tripId, userId, req),
      mergeCompoundDataLookupFollowup: (st, req, ctx, llm) =>
        this.mergeCompoundDataLookupFollowup(st, req, ctx, llm),
    };
  }

  /** 复合意图：CRUD 已落库后，用轻量 DATA_LOOKUP 回答同句中的咨询子句。 */
  private async mergeCompoundDataLookupFollowup(
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<void> {
    const followup = (state.metadata as Record<string, unknown>)?.compound_data_lookup_followup;
    const followupText = typeof followup === 'string' ? followup.trim() : '';
    if (!followupText) return;

    const crudAnswer = String(state.narration?.user_friendly_summary ?? '').trim();
    try {
      const lw = await this.orchestrateLightweightKnowledgeQuery(
        { ...request, message: followupText },
        context,
        undefined,
        llmProvider,
        Date.now(),
      );
      const extra = String(lw.answerText ?? '').trim();
      if (!extra) return;
      state.narration = {
        user_friendly_summary: crudAnswer ? `${crudAnswer}\n\n${extra}` : extra,
        day_by_day_narrative: state.narration?.day_by_day_narrative ?? [],
        highlights: state.narration?.highlights ?? [],
        tips: state.narration?.tips ?? [],
        day_by_day_text_zh: state.narration?.day_by_day_text_zh,
        warnings: state.narration?.warnings,
        research_ui_hints: state.narration?.research_ui_hints,
        voice_tone_modifier: state.narration?.voice_tone_modifier,
        visual_hint: state.narration?.visual_hint,
        audio_prosody: state.narration?.audio_prosody,
      };
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] compound DATA_LOOKUP followup failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private stateUpdateOrchestratorNode?: StateUpdateOrchestratorNode;

  private getStateUpdateNode(): StateUpdateOrchestratorNode {
    if (!this.stateUpdateOrchestratorNode) {
      this.stateUpdateOrchestratorNode = new StateUpdateOrchestratorNode(this.createStateUpdateNodeHost());
    }
    return this.stateUpdateOrchestratorNode;
  }

  private createStateUpdatePhaseHost(): StateUpdatePhaseHost {
    return {
      logger: this.logger,
      decisionKernel: this.decisionKernel,
      dsoLatestStateProvider: this.dsoLatestStateProvider,
      isDsoAsPrimary: () => this.isDsoAsPrimary(),
      applyPoiPlanningToPatch: (patch, dso, st) => this.applyPoiPlanningToPatch(patch, dso, st),
      extractWorldModelFromContextPackage: (dso) => this.extractWorldModelFromContextPackage(dso),
    };
  }

  private createStateUpdateNodeHost(): StateUpdateNodeHost {
    const phaseHost = this.createStateUpdatePhaseHost();
    return {
      logger: this.logger,
      executeStateUpdateStep: (st, dso) => runStateUpdatePhase(phaseHost, { state: st, decisionState: dso }),
      maybeSnapshot: (st, trigger) => this.maybeSnapshot(st, trigger),
      applyRelaxationFingerprintToDso: (st, dso) =>
        this.applyRelaxationFingerprintAfterStateUpdate(st, dso),
      maybeHaltTerminalNoSolution: (input, dso) =>
        this.maybeStateUpdateTerminalNoSolution(input, dso),
      maybeHaltHardGapsClarification: (input, dso) =>
        this.maybeStateUpdateHardGapsClarification(input, dso),
      maybeHaltStructuredIntakeClarification: (input, dso) =>
        this.maybeStateUpdateStructuredIntakeClarification(input, dso),
      applyResearchScopeInvalidationCow: (req, st) =>
        this.applyResearchScopeInvalidationCowBeforeResearch(req, st),
    };
  }

  private async applyRelaxationFingerprintAfterStateUpdate(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;
    const fp = (state.metadata as { last_relaxation_fingerprint?: string })?.last_relaxation_fingerprint;
    if (!fp) return decisionState;
    const prev = decisionState.systemState?.lastRelaxationFingerprint;
    const prevSame = decisionState.systemState?.consecutiveSameRelaxationAttempts ?? 0;
    const same = prev && prev === fp;
    const nextSame = same ? prevSame + 1 : 0;
    const prevRetry = decisionState.systemState?.planGenRetryCount ?? 0;
    return this.decisionKernel.updateState(decisionState, {
      systemState: {
        requestId: state.request_id,
        lastRelaxationFingerprint: fp,
        consecutiveSameRelaxationAttempts: nextSame,
        planGenRetryCount: prevRetry + 1,
      } as DecisionState['systemState'],
    });
  }

  private async maybeStateUpdateTerminalNoSolution(
    input: import('../orchestration/graph/nodes/base.node').StateUpdatePrePlanSegmentInput,
    decisionState: DecisionState | undefined,
  ): Promise<import('../orchestration/graph/orchestration-graph.types').GraphRunOutcome | null> {
    const terminalIntent = (input.state.metadata as { terminal_intent?: string })?.terminal_intent;
    if (terminalIntent !== 'TERMINAL_NO_SOLUTION') return null;
    this.logger.warn(`[Claude Orchestrator] TERMINAL_NO_SOLUTION confirmed by user; halting orchestration.`);
    input.state.current_step = 'DONE';
    input.state.verdict = 'REJECT';
    input.state.metadata.last_updated_at = new Date().toISOString();
    input.state.metadata.total_duration_ms = Date.now() - input.prePlan.startTime;
    this.maybeSnapshot(input.state, 'CHECKPOINT');
    return input.prePlan.prePlanTerminal(
      'terminal_no_solution',
      this.buildTerminalNoSolutionResult(
        input.state,
        input.prePlan.startTime,
        decisionState,
        input.context,
      ),
    );
  }

  private async maybeStateUpdateStructuredIntakeClarification(
    input: import('../orchestration/graph/nodes/base.node').StateUpdatePrePlanSegmentInput,
    decisionState: DecisionState | undefined,
  ): Promise<import('../orchestration/graph/orchestration-graph.types').GraphRunOutcome | null> {
  if (
    !this.shouldReturnClarificationForMarathonIntake(input.state) &&
    !this.shouldReturnClarificationForFroad2wdIntake(input.state) &&
    !this.shouldReturnClarificationForPeakSeasonTimeShiftIntake(input.state) &&
    !this.shouldReturnClarificationForItinerarySlotPlacementIntake(input.state)
  ) {
    return null;
  }

  if (
    this.shouldReturnClarificationForMarathonIntake(input.state) ||
    this.shouldReturnClarificationForFroad2wdIntake(input.state) ||
    this.shouldReturnClarificationForPeakSeasonTimeShiftIntake(input.state)
  ) {
    enrichStateForIntakeGuardianDebateShortCircuit(input.state, input.request);
  }

  input.state.decision_log.push({
    request_id: input.state.request_id,
    step: 'STATE_UPDATE',
    actor: 'Orchestrator',
    inputs_summary: 'INTAKE structured clarification → guardian debate surface',
    outputs_summary: `gate=${input.state.gate_result?.gate_result ?? 'n/a'} personas=${Boolean(input.state.gate_result?.guardian_results)}`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'INTAKE_GUARDIAN_DEBATE_SHORT_CIRCUIT',
      marathon_intake: (input.state.metadata as Record<string, unknown>)?.marathon_intake_clarification_short_circuit === true,
      debate_gate_fusion: (input.state.metadata as Record<string, unknown>)?.debate_gate_fusion,
    },
  });

  this.logger.debug(
    `[Claude Orchestrator] INTAKE 结构化澄清 + 三人格合议，跳过 RESEARCH/Gate/Plan`,
  );
  return input.prePlan.prePlanTerminal(
    'terminal_clarification',
    this.buildClarificationResult(input.state, input.prePlan.startTime, decisionState, input.context),
  );
  }

  private async maybeStateUpdateHardGapsClarification(
    input: import('../orchestration/graph/nodes/base.node').StateUpdatePrePlanSegmentInput,
    decisionState: DecisionState | undefined,
  ): Promise<import('../orchestration/graph/orchestration-graph.types').GraphRunOutcome | null> {
    if (!this.shouldReturnClarificationForHardGaps(input.state)) return null;
    const compileHard =
      input.state.gaps?.find(
        (g) =>
          g?.severity === 'HARD' &&
          (g.type === 'INTENT_COMPILE_ERROR' || g.type === 'SPEC_TYPE_ERROR'),
      ) ?? null;
    if (compileHard) {
      input.state.decision_log.push({
        request_id: input.state.request_id,
        step: 'INTAKE',
        actor: 'Orchestrator',
        inputs_summary: 'INTAKE compiler hard error → clarification',
        outputs_summary: `INTENT_COMPILE_BLOCK: ${compileHard.type}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'INTENT_COMPILE_BLOCK',
          gap_type: compileHard.type,
          detail: compileHard.detail,
          allow_partial: input.state.metadata?.allow_partial === true,
        },
      });
    }
    this.logger.debug(
      `[Claude Orchestrator] HARD 缺口且已有澄清问题，跳过 RESEARCH/Gate/Plan，直接返回澄清`,
    );
    return input.prePlan.prePlanTerminal(
      'terminal_clarification',
      this.buildClarificationResult(input.state, input.prePlan.startTime, decisionState, input.context),
    );
  }

  private async applyResearchScopeInvalidationCowBeforeResearch(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): Promise<void> {
    const optInv = request.options?.research_invalidate_scopes;
    const dosCtx = this.resolveDosExecutionContext(request);
    const invalidation = resolveResearchInvalidation(request, dosCtx);
    const nluInv = invalidation.assetScopes;
    const combinedInv = dedupeResearchScopes([
      ...(Array.isArray(optInv) ? optInv.filter(isResearchAssetScope) : []),
      ...nluInv,
    ]);
    if (combinedInv.length === 0) return;

    const scopes = combinedInv;
    let rdBase: Record<string, unknown> | undefined =
      state.research_data && typeof state.research_data === 'object'
        ? cloneResearchRecord(state.research_data as Record<string, unknown>)
        : undefined;
    if ((!rdBase || Object.keys(rdBase).length === 0) && this.researchPriorSnapshot) {
      const loaded = await this.researchPriorSnapshot.load(request);
      if (loaded && typeof loaded === 'object' && Object.keys(loaded).length > 0) {
        rdBase = cloneResearchRecord(loaded as Record<string, unknown>);
      }
    }
    if (!rdBase || Object.keys(rdBase).length === 0) return;

    const researchAtomicRollbackSnapshot = cloneResearchRecord(rdBase);
    const draftRd = cloneResearchRecord(rdBase);
    if (!draftRd) {
      this.logger.warn(`[Claude Orchestrator] research COW: draft clone failed request_id=${state.request_id}`);
      return;
    }
    const { clearedKeys } = invalidateResearchScopesInPlace(
      draftRd,
      scopes,
      'research_invalidate_scopes+nlu',
    );
    const m0 = { ...(state.metadata as Record<string, unknown>) };
    m0.research_scopes_to_recompute = scopes;
    m0.research_scope_invalidation = {
      scopes,
      cleared_keys: clearedKeys,
      at: new Date().toISOString(),
    };
    m0.pending_research_prior_for_kernel = draftRd;
    m0.research_atomic_rollback_snapshot = researchAtomicRollbackSnapshot;
    state.metadata = m0 as OrchestratorState['metadata'];
    state.decision_log.push({
      request_id: state.request_id,
      step: 'RESEARCH',
      actor: 'Orchestrator',
      inputs_summary: 'Harness：研究资产作用域局部无效化（COW 副本，主干未提交）',
      outputs_summary: `INVALIDATE_SCOPES scopes=${scopes.join(',')} cleared_key_count=${clearedKeys.length}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'RESEARCH_SCOPE_INVALIDATION',
        scopes,
        cleared_keys_sample: clearedKeys.slice(0, 32),
        nlu_scopes: nluInv.length ? nluInv : undefined,
        option_scopes: Array.isArray(optInv) ? optInv.filter(isResearchAssetScope) : undefined,
      },
    });
  }

  private async executeIntakeStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    await runIntakePhase(this.createIntakePhaseHost(), {
      request,
      context,
      state,
      llmProvider: _provider,
    });
  }

  private poiSelectionOrchestratorNode?: PoiSelectionOrchestratorNode;

  private getPoiSelectionNode(): PoiSelectionOrchestratorNode {
    if (!this.poiSelectionOrchestratorNode) {
      this.poiSelectionOrchestratorNode = new PoiSelectionOrchestratorNode(this.createPoiSelectionNodeHost());
    }
    return this.poiSelectionOrchestratorNode;
  }

  private createPoiSelectionPhaseHost(): PoiSelectionPhaseHost {
    return {
      logger: this.logger,
      llmService: this.llmService,
      resolvePoiPolicy: (explicit, require) => this.resolvePoiPolicy(explicit, require),
      inferCountryFromDestination: (dest) => this.inferCountryFromDestination(dest),
      normalizeText: (s) => this.normalizeText(s),
      dedupePois: (pois) => this.dedupePois(pois),
      loadTripPlacePoiEvidenceForAdjust: (tripId, userId) =>
        this.loadTripPlacePoiEvidenceForAdjust(tripId, userId),
      resolveItineraryAdjustNeighborContext: (tripId, targetDateIso, userId) =>
        this.resolveItineraryAdjustNeighborContextForHost(tripId, targetDateIso, userId),
      supplementItineraryAdjustCorridorPois: (params) =>
        this.supplementItineraryAdjustCorridorPoisForHost(params),
      applyPoiPlanningToResearchPois: (pois, dso, country) =>
        this.applyPoiPlanningToResearchPois(pois, dso, country),
      passesHardPoiGuards: (poi, country, dest) =>
        this.passesHardPoiGuards(poi, country, dest),
      poiLocalityScore: (poi, country, city) => this.poiLocalityScore(poi, country, city),
      selectClusteredPois: (ranked, topN, coords, dest) =>
        this.selectClusteredPois(
          ranked,
          topN,
          coords as { lat: number; lng: number },
          dest,
        ),
      buildPoiPlanningAnchorFallbackStub: (slug) => this.buildPoiPlanningAnchorFallbackStub(slug),
      tryExtractStartCoordinates: (origin) => this.tryExtractStartCoordinates(origin),
      toPoiTraceNode: (poi) => this.toPoiTraceNode(poi),
      buildPoiTraceCommuteMatrix: (nodes, mode, coords) =>
        this.buildPoiTraceCommuteMatrix(
          nodes as Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
          mode as 'walk' | 'drive' | 'transit' | 'mixed' | undefined,
          coords as { lat: number; lng: number } | undefined,
        ),
      estimateNearestTotalCommuteMinutes: (nodes, mode, coords) =>
        this.estimateNearestTotalCommuteMinutes(
          nodes as Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
          mode as 'walk' | 'drive' | 'transit' | 'mixed' | undefined,
          coords as { lat: number; lng: number } | undefined,
        ),
      countryDisplayName: (country) => this.countryDisplayName(country),
      buildPoiCountryClarificationQuestion: (dest, country) =>
        this.buildPoiCountryClarificationQuestion(dest, country),
      recordPoiPlanningOutcomeAfterSelection: (st, dso, scored, diag) =>
        this.recordPoiPlanningOutcomeAfterSelection(st, dso, scored, diag),
      generateDecisionStepForStep: (st, step, actor) =>
        this.generateDecisionStepForStep(st, step, actor as SubAgentType),
    };
  }

  private createPoiSelectionNodeHost(): PoiSelectionNodeHost {
    const phaseHost = this.createPoiSelectionPhaseHost();
    return {
      logger: this.logger,
      executePoiSelectionStep: (st, dso) => runPoiSelectionPhase(phaseHost, { state: st, decisionState: dso }),
      maybeSnapshot: (st, trigger) => this.maybeSnapshot(st, trigger),
      applyFallbackPlan: (st) => this.applyFallbackPlan(st),
      recordPoiPlanningOutcomeAfterItinerary: (st, dso) =>
        this.recordPoiPlanningOutcomeAfterItinerary(st, dso),
      buildSuccessResult: (st, start, dso, ctx) =>
        this.buildSuccessResult(st, start, dso, ctx),
      buildClarificationResult: (st, start, dso, ctx) =>
        this.buildClarificationResult(st, start, dso, ctx),
    };
  }

  private gateEvalOrchestratorNode?: GateEvalOrchestratorNode;

  private getGateEvalNode(): GateEvalOrchestratorNode {
    if (!this.gateEvalOrchestratorNode) {
      this.gateEvalOrchestratorNode = new GateEvalOrchestratorNode(this.createGateEvalNodeHost());
    }
    return this.gateEvalOrchestratorNode;
  }

  private createGateEvalPhaseHost(): GateEvalPhaseHost {
    return {
      logger: this.logger,
      isKernelNativeExecution: (c) => this.isKernelNativeExecution(c),
      decisionKernel: this.decisionKernel,
      syncOrchestratorFromDecisionState: (newState, st) => {
        const derived = decisionStateToOrchestratorState(newState, st);
        Object.assign(st, derived);
      },
      generateDecisionStepForStep: (st, step, actor) =>
        this.generateDecisionStepForStep(st, step, actor),
      executePhaseViaKernel: (dso, st, phase, run) =>
        this.executePhaseViaKernel(dso, st, phase, run),
      executeGateEvalStep: (req, ctx, st, llm) =>
        this.executeGateEvalStep(req, ctx, st, llm),
      enrichGuardianDebateTripContextAfterGateEval: (st) =>
        this.enrichGuardianDebateTripContextAfterGateEval(st),
      applyMarathonPipelineSignals: (st, req) => this.applyMarathonPipelineSignals(st, req),
      onGateEvalCompleted: (st, req) => recordGateEvalTrajectoryDraft(this.decisionTrajectoryInterlocutor, st, req),
    };
  }

  private createGateEvalNodeHost(): GateEvalNodeHost {
    const phaseHost = this.createGateEvalPhaseHost();
    return {
      logger: this.logger,
      touchAsyncTaskProgress: (step) =>
        this.touchAsyncTaskProgress(step as OrchestrationStep),
      executeGateEvalPhase: (dso, st, req, ctx, llm) =>
        runGateEvalPhase(phaseHost, {
          decisionState: dso,
          state: st,
          request: req,
          context: ctx,
          llmProvider: llm,
        }),
      relaxGateForPartialIfEligible: (st) => this.relaxGateForPartialIfEligible(st),
      applyMarathonPipelineSignals: (st, req) => this.applyMarathonPipelineSignals(st, req),
      maybeStartGuardiansDebateShadowAfterGate: (req, st) =>
        this.maybeStartGuardiansDebateShadowAfterGate(req, st),
      maybeAwaitGuardiansDebateFuseAndShortCircuit: async (req, st, dso, ctx, start, deadline) => {
        const r = await this.maybeAwaitGuardiansDebateFuseAndShortCircuit(
          req,
          st,
          dso,
          ctx,
          start,
          deadline,
        );
        return r ?? null;
      },
      maybeSnapshot: (st, trigger) => this.maybeSnapshot(st, trigger),
      recordPoiPlanningOutcomeAfterItinerary: (st, dso) =>
        this.recordPoiPlanningOutcomeAfterItinerary(st, dso),
      buildBlockedResult: (st, start, dso, ctx) =>
        this.buildBlockedResult(st, start, dso, ctx),
      isGateBlocked: (st) => st.gate_result?.gate_result === 'BLOCK',
    };
  }

  private contextBuildOrchestratorNode?: ContextBuildOrchestratorNode;

  private getContextBuildNode(): ContextBuildOrchestratorNode {
    if (!this.contextBuildOrchestratorNode) {
      this.contextBuildOrchestratorNode = new ContextBuildOrchestratorNode(
        this.createContextBuildNodeHost(),
      );
    }
    return this.contextBuildOrchestratorNode;
  }

  private createContextBuildPhaseHost(): ContextBuildPhaseHost {
    return {
      logger: this.logger,
      decisionKernel: this.decisionKernel,
      memoryPort: this.agentMemoryContextStore
        ? {
            getTravelerNationality: () =>
              this.agentMemoryContextStore!.get()?.userBasics?.nationality,
          }
        : undefined,
      extractCountryCodeFromMessage: (msg) => this.extractCountryCodeFromMessage(msg),
    };
  }

  private createContextBuildNodeHost(): ContextBuildNodeHost {
    const phaseHost = this.createContextBuildPhaseHost();
    return {
      logger: this.logger,
      executeContextBuildStep: (req, ctx, st, dso) =>
        runContextBuildPhase(phaseHost, { request: req, context: ctx, state: st, decisionState: dso }),
      maybeSnapshot: (st, trigger) => this.maybeSnapshot(st, trigger),
    };
  }

  /**
   * VERIFY 后同步 confidence 到 DSO
   * 基于验证问题数、errors 计算 [0,1]
   */
  private syncConfidenceAfterVerify(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): DecisionState | undefined {
    if (!this.decisionKernel || !decisionState) return decisionState;
    const verifyErrors = state.errors.filter((e) => e.step === 'VERIFY');
    const hasVerificationIssues = state.decision_log.some(
      (e) => e.step === 'VERIFY' && e.outputs_summary?.includes('个问题'),
    );
    let confidence = 0.9;
    if (verifyErrors.length > 0) confidence -= 0.2 * verifyErrors.length;
    if (hasVerificationIssues) confidence -= 0.1;
    return this.decisionKernel.setConfidence(decisionState, Math.max(0.1, confidence));
  }

  /**
   * RESEARCH 原子元数据清理（pending COW / rollback 句柄）
   */
  private clearResearchAtomicPendingMetadata(state: OrchestratorState): void {
    const m = { ...(state.metadata as any) };
    delete m.pending_research_prior_for_kernel;
    delete m.research_atomic_rollback_snapshot;
    delete m.research_scopes_to_recompute;
    state.metadata = m as OrchestratorState['metadata'];
  }

  private researchOrchestratorNode?: ResearchOrchestratorNode;

  private getResearchNode(): ResearchOrchestratorNode {
    if (!this.researchOrchestratorNode) {
      this.researchOrchestratorNode = new ResearchOrchestratorNode(this.createResearchNodeHost());
    }
    return this.researchOrchestratorNode;
  }

  private createResearchPhaseHost(): ResearchPhaseHost {
    return {
      logger: this.logger,
      isKernelNativeExecution: (c) => this.isKernelNativeExecution(c),
      decisionKernel: this.decisionKernel,
      researchPriorSnapshot: this.researchPriorSnapshot,
      clearResearchAtomicPendingMetadata: (s) => this.clearResearchAtomicPendingMetadata(s),
      syncOrchestratorFromDecisionState: (newState, st) => {
        const derived = decisionStateToOrchestratorState(newState, st);
        Object.assign(st, derived);
      },
      generateDecisionStepForStep: (s, step, actor) => this.generateDecisionStepForStep(s, step, actor),
      executePhaseViaKernel: (dso, st, phase, run) =>
        this.executePhaseViaKernel(dso, st, phase, async () => {
          await run();
        }),
      executeResearchStep: async (req, ctx, st, llm, dso) => {
        await this.executeResearchStep(req, ctx, st, llm, dso);
      },
    };
  }

  private createResearchNodeHost(): ResearchNodeHost {
    const phaseHost = this.createResearchPhaseHost();
    return {
      logger: this.logger,
      touchAsyncTaskProgress: (step) =>
        this.touchAsyncTaskProgress(step as OrchestrationStep),
      executeResearchPhase: (dso, st, req, ctx, llm) =>
        runResearchPhase(phaseHost, {
          decisionState: dso,
          state: st,
          request: req,
          context: ctx,
          llmProvider: llm,
        }),
      maybeSnapshot: (st, trigger) => this.maybeSnapshot(st, trigger),
      maybeInterceptDegradedTransportEvidence: (st, dso, startTime, ctx) =>
        this.maybeInterceptDegradedTransportEvidence(st, dso, startTime, ctx) ?? null,
      clearTransportClarifyReinjectFlag: (st) => {
        if ((st.metadata as Record<string, unknown>)?.transport_clarify_force_reinject) {
          st.metadata = { ...(st.metadata ?? {}), transport_clarify_force_reinject: false } as OrchestratorState['metadata'];
        }
      },
      runShadowConflictEarlyWarning: (dso, st, req) =>
        this.runShadowConflictEarlyWarningAfterResearch(dso, st, req),
      applyIntakePredictiveFailureReport: (dso, st) =>
        this.applyIntakePredictiveFailureReportAfterResearch(dso, st),
      runEarlyWarningClarificationIntercept: (input, dso) =>
        this.runEarlyWarningClarificationInterceptAfterResearch(input, dso),
    };
  }

  private async runShadowConflictEarlyWarningAfterResearch(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
  ): Promise<void> {
    if (!this.shadowConflictScanner) return;
    try {
      const ew = await this.shadowConflictScanner.scan({
        decisionKernel: this.decisionKernel,
        decisionState,
        state,
        request,
      });
      if (!ew) return;
      const early_warning_id =
        ew.early_warning_id ??
        this.djb2Fingerprint({
          request_id: state.request_id,
          risk_level: ew.risk_level,
          conflict_type: ew.conflict_type,
          evidence_summary: ew.evidence_summary,
          suggested_actions: (ew.suggested_actions ?? [])
            .map((s) => ({
              relaxation_type: s.relaxation_type,
              shadow_confidence: s.shadow_confidence,
              violations_before: s.violations_before,
              violations_after: s.violations_after,
              fixed_conflict_types: (s.fixed_conflict_types ?? []).slice().sort(),
            }))
            .sort((a, b) => a.relaxation_type.localeCompare(b.relaxation_type)),
        });
      const withId: EarlyWarning = { ...ew, early_warning_id };
      state.metadata = { ...(state.metadata ?? {}), early_warning: withId } as OrchestratorState['metadata'];
      state.decision_log.push({
        request_id: state.request_id,
        step: 'RESEARCH',
        actor: 'Orchestrator',
        inputs_summary: 'ShadowConflictScanner (post-RESEARCH)',
        outputs_summary: `EARLY_WARNING: id=${early_warning_id} risk=${ew.risk_level} type=${ew.conflict_type} suggestions=${ew.suggested_actions.length}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'EARLY_WARNING',
          early_warning: withId,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.debug(`[Claude Orchestrator] Early warning scan skipped: ${msg}`);
    }
  }

  private applyIntakePredictiveFailureReportAfterResearch(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
  ): void {
    const intakeSim = (state.metadata as Record<string, unknown>)?.intake_simulation as
      | { simulatedRepairTraces?: import('./route-feasibility.types').SimulatedRepairTrace[] }
      | undefined;
    const simTraces = intakeSim?.simulatedRepairTraces ?? [];
    if (simTraces.length === 0) return;
    const audit_text = formatPredictiveFailureReport(simTraces);
    const simDigest = digestSimulatedRepairTracesForCorrelation(simTraces as unknown[]);
    const tripDigest = digestTripPlanRequestLight(state.trip_plan_request ?? {});
    const predictiveStateHash = computePredictiveFailureStateHash({
      dsoVersion: decisionState?.systemState?.version ?? 0,
      simulatedTracesDigest: simDigest,
      tripDigest,
    });
    const predictiveCorrelationId = buildDecisionFeedbackCorrelationId({
      sessionId: state.request_id,
      phase: 'INTAKE',
      kind: 'PREDICTIVE_FAILURE',
      roundIndex: 0,
      stateHash: predictiveStateHash,
    });
    const predictive_failure_report = {
      card_type: 'PREDICTIVE_FAILURE_REPORT' as const,
      correlationId: predictiveCorrelationId,
      audit_text,
      simulated_repair_traces: simTraces,
    };
    const existingEw = (state.metadata as Record<string, unknown>)?.early_warning as EarlyWarning | undefined;
    const mergedEw: EarlyWarning = existingEw
      ? { ...existingEw, predictive_failure_report }
      : {
          early_warning_id: `pred-${state.request_id}`,
          risk_level: 'MEDIUM',
          conflict_type: 'MIXED',
          evidence_summary: 'INTAKE_PREDICTIVE_SIMULATION',
          suggested_actions: [],
          predictive_failure_report,
        };
    state.metadata = { ...(state.metadata ?? {}), early_warning: mergedEw } as OrchestratorState['metadata'];
    state.decision_log.push({
      request_id: state.request_id,
      step: 'RESEARCH',
      actor: 'Orchestrator',
      inputs_summary: 'IntakeCompilerService simulation → PREDICTIVE_FAILURE_REPORT',
      outputs_summary: `PREDICTIVE_FAILURE_REPORT: traces=${simTraces.length}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'PREDICTIVE_FAILURE_REPORT',
        correlation_id: predictiveCorrelationId,
        predictive_failure_report,
      },
    });
  }

  private async runEarlyWarningClarificationInterceptAfterResearch(
    input: import('../orchestration/graph/nodes/base.node').ResearchPrePlanSegmentInput,
    decisionState: DecisionState | undefined,
  ): Promise<import('../orchestration/graph/orchestration-graph.types').GraphRunOutcome | null> {
    const { request, context, state, prePlan } = input;
    const ewMeta = (state.metadata as Record<string, unknown>)?.early_warning as EarlyWarning | undefined;
    if (!ewMeta || (ewMeta.risk_level !== 'HIGH' && ewMeta.risk_level !== 'CRITICAL')) {
      return null;
    }
    const clarAnswers = (request as RouteAndRunRequestDto & { clarification_answers?: Array<{ questionId?: string }> })
      .clarification_answers;
    const answeredEarlyWarning = clarAnswers?.some((a) => a?.questionId === 'early_warning_relaxations');
    const earlyWarningAcknowledged =
      (state.metadata as Record<string, unknown>)?.early_warning_acknowledged === true ||
      decisionState?.systemState?.earlyWarningAcknowledged === true;
    if (answeredEarlyWarning || earlyWarningAcknowledged) {
      return null;
    }
    const ab = (() => {
      const fp = this.djb2Fingerprint({ request_id: state.request_id, exp: 'ew_l3_prompt_v1' });
      const hex = fp.includes(':') ? fp.split(':')[1] : fp;
      const n = parseInt(hex.slice(-8), 16);
      const bucket = Number.isFinite(n) ? n % 100 : 0;
      return { fingerprint: fp, bucket, treatment: bucket < 50 };
    })();
    const supported = new Set(['upgrade_vehicle_to_4wd', 'increase_days_by_1', 'drop_one_must_include_poi']);
    const dedup = new Map<string, (typeof ewMeta.suggested_actions)[number]>();
    for (const s of ewMeta.suggested_actions ?? []) {
      if (s?.relaxation_type && supported.has(s.relaxation_type) && !dedup.has(s.relaxation_type)) {
        dedup.set(s.relaxation_type, s);
      }
    }
    const list = [...dedup.values()];
    if (list.length === 0) return null;
    const anyHigh = list.some((s) => s.shadow_confidence === 'high_probability_fixed');
    this.logger.warn(
      `[Claude Orchestrator] EARLY_WARNING intercept: risk=${ewMeta.risk_level} type=${ewMeta.conflict_type} options=${list.length}`,
    );
    const risk = calculateEarlyWarningRisk(
      {
        risk_level: ewMeta.risk_level,
        conflict_type: ewMeta.conflict_type,
        suggested_actions: list,
      },
      { request_id: state.request_id },
    );
    const failure_risk_score = risk.score;
    const failure_prob_hint = (() => {
      if (!ab.treatment) return undefined;
      if (failure_risk_score >= 0.8) {
        return `【高危逻辑拦截】若保持现状继续，预计撞墙风险很高（score=${failure_risk_score.toFixed(2)}）。建议立即选择一项修复以恢复物理可行域。`;
      }
      if (failure_risk_score >= 0.4) {
        return `【运行风险提示】该配置存在较高后续回溯成本（score=${failure_risk_score.toFixed(2)}）。建议优先修复，避免反复试错。`;
      }
      return `【提示】已检测到潜在风险（score=${failure_risk_score.toFixed(2)}），建议先修复再继续。`;
    })();
    const l3Line = (() => {
      if (!ab.treatment) return undefined;
      const cid =
        ewMeta.conflict_type === 'REACHABILITY'
          ? CONSTRAINT_IDS.TERRAIN_F_ROAD_COMPATIBILITY
          : ewMeta.conflict_type === 'SCOPE'
            ? CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY
            : CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY;
      const mode = selectPersuasionMode(cid);
      const out = buildL3PersuasionLine({
        mode,
        proof: {
          cid,
          unit: 'bool',
          slack: -1,
          evidence: ewMeta.evidence_summary
            ? { source: 'SHADOW_GATE', refIds: [String(ewMeta.early_warning_id ?? 'early_warning')] }
            : { source: 'SHADOW_GATE' },
        },
      });
      return out?.line;
    })();
    const questionHeader = ab.treatment
      ? `[SYSTEM_ACTION]: EARLY_WARNING(L3) 风险=${ewMeta.risk_level}（${ewMeta.conflict_type}）。`
      : `[SYSTEM_ACTION]: EARLY_WARNING 风险=${ewMeta.risk_level}（${ewMeta.conflict_type}）。`;
    const questionBody = `${ewMeta.evidence_summary} 请在 POI 选择与排程前确认一项或多项“物理可行域”放宽（影子推演置信度已标注）。`;
    const question = `${questionHeader}${failure_prob_hint ? `\n${failure_prob_hint}\n` : ''}${l3Line ? `\n${l3Line}\n` : ''}${questionBody}`;
    const topPrecedent = Array.isArray((ewMeta as any).historical_precedents)
      ? ((ewMeta as any).historical_precedents[0] as any)
      : undefined;
    const oscillation_k = decisionState?.systemState?.consecutiveSameRelaxationAttempts ?? 0;
    const dominant_cid =
      String((decisionState as DecisionState & { constraints?: { violations?: Array<{ type?: string }> } })?.constraints?.violations?.[0]?.type ?? '').trim() ||
      (ewMeta.conflict_type === 'REACHABILITY' ? 'REACHABILITY_HARD' : ewMeta.conflict_type === 'SCOPE' ? 'SCOPE' : 'MIXED');
    const is_hard = ewMeta.conflict_type === 'REACHABILITY' || ewMeta.risk_level === 'CRITICAL';
    const scored = list
      .map((s) => {
        const id = s.relaxation_type as RelaxationActionId;
        const persuasion = this.localCaseStore?.getPersuasionRate({
          signature: SignatureBuilder.buildConversionSignature({
            conflict_type: ewMeta.conflict_type,
            primary_violation_type: dominant_cid,
            region_id: (state.trip_plan_request as any)?.region_id,
            start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
          }),
          action: id,
        });
        const breakdown = ConstraintScorer.calculateScore(id, {
          dominant_cid,
          is_hard,
          oscillation_k,
          precedent: topPrecedent,
          preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
          persuasion,
          delta: 1.5,
        });
        return { s, breakdown };
      })
      .sort((a, b) => b.breakdown.score - a.breakdown.score);
    state.clarification_questions = [
      {
        id: 'early_warning_relaxations',
        question,
        type: anyHigh ? 'single_choice' : 'multi_choice',
        required: true,
        options: [
          ...scored.map(({ s, breakdown }) => ({
            value: s.relaxation_type,
            label: `${s.relaxation_type}｜${s.impact_description}（${
              s.shadow_confidence === 'high_probability_fixed' ? 'high_probability_fixed' : 'needs_more_changes'
            }）`,
            metadata: {
              score: breakdown.score,
              weights: breakdown.weights,
              dominant_cid: breakdown.dominant_cid,
              precedent_n: breakdown.precedent_n,
              terms: breakdown.terms,
            },
          })),
          {
            value: 'proceed_at_own_risk',
            label: '[实验性] 保持现状继续规划（可能导致失败）',
            metadata: {
              score: ConstraintScorer.calculateScore('proceed_at_own_risk', {
                dominant_cid,
                is_hard,
                oscillation_k,
                precedent: topPrecedent,
                preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
              }).score,
              dominant_cid,
              precedent_n: typeof topPrecedent?.sample_count === 'number' ? topPrecedent.sample_count : 0,
            },
          },
        ] as any,
        hint: '提交后下一回合将合并写入 TripPlanRequest；再次规划时可行域已被物理修复。也可选择「自担风险继续」跳过拦截（撞南墙模式，仍可能进入 PLAN_GEN 熔断）。',
      },
    ];
    state.decision_log.push({
      request_id: state.request_id,
      step: 'RESEARCH',
      actor: 'Orchestrator',
      inputs_summary: 'EARLY_WARNING intercept → clarification',
      outputs_summary: `PREVENTIVE_RELAXATION_REQUIRED: risk=${ewMeta.risk_level}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'EARLY_WARNING_INTERCEPT',
        early_warning: ewMeta,
        options_snapshot: (state.clarification_questions?.[0] as { options?: unknown })?.options ?? [],
        ew_prompt_ab: ab,
        failure_risk_score,
        failure_risk_reason: risk.reason,
        failure_risk_confidence: risk.confidence,
        ...(l3Line ? { ew_l3_line: l3Line } : {}),
        ...(failure_prob_hint ? { failure_prob_hint } : {}),
      },
    });
    state.metadata = {
      ...(state.metadata ?? {}),
      last_updated_at: new Date().toISOString(),
      total_duration_ms: Date.now() - prePlan.startTime,
    } as OrchestratorState['metadata'];
    this.maybeSnapshot(state, 'CHECKPOINT');
    return prePlan.prePlanTerminal(
      'terminal_clarification',
      this.buildClarificationResult(state, prePlan.startTime, decisionState, context),
    );
  }

  /**
   * RESEARCH 阶段：委派 nodes/research-phase.executor（Kernel Lint/Harness 内聚）。
   */
  private async executeResearchPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    return runResearchPhase(this.createResearchPhaseHost(), {
      decisionState,
      state,
      request,
      context,
      llmProvider,
    });
  }

  /**
   * RESEARCH 产出的 POI 列表上应用 DSO.poiPlanning：先按 slug 匹配已有 POI，再排除，最后必要时 fallback 占位（冰岛）
   */
  private applyPoiPlanningToResearchPois(
    pois: any[],
    decisionState: DecisionState | undefined,
    destinationCountry: string | undefined,
  ): { pois: any[]; excludedFilteredCount: number } {
    const slice = decisionState?.poiPlanning;
    if (!slice?.poiPlan || destinationCountry !== 'IS') {
      return { pois, excludedFilteredCount: 0 };
    }
    let out = [...pois];
    let excludedFilteredCount = 0;
    for (const slug of slice.poiPlan.excludedPoiIds ?? []) {
      const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
      if (!kws?.length) continue;
      out = out.filter((p) => {
        const n = `${p?.name ?? ''} ${p?.nameCN ?? ''}`.toLowerCase();
        const drop = kws.some((k) => n.includes(k.toLowerCase()));
        if (drop) excludedFilteredCount++;
        return !drop;
      });
    }
    const matchedSlugs = new Set<string>();
    const usedPoiKeys = new Set<string>();
    const regionId = slice.routeIntent?.regionId;
    for (const slug of slice.poiPlan.requiredAnchorPoiIds ?? []) {
      const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
      if (!kws?.length) continue;
      const pool = out.filter((p) => {
        const k = poiPlanningRowIdentityKey(p);
        return k && !usedPoiKeys.has(k);
      });
      const found: any =
        pool.find(
          (p) =>
            researchPoiHasStableId(p) &&
            regionId === 'golden_circle' &&
            goldenCircleEntityStrongMatch(p, slug),
        ) ?? pool.find((p) => keywordMatchResearchPoiToSlug(p, slug));
      if (found) {
        const isRetrieved =
          researchPoiHasStableId(found) &&
          regionId === 'golden_circle' &&
          goldenCircleEntityStrongMatch(found, slug);
        found.poi_planning_anchor_slug = slug;
        found.poi_planning_anchor_source = isRetrieved ? 'retrieved' : 'matched_existing';
        found.source = found.source ?? 'poi_planning_matched_existing';
        found.poi_planning_admission_protected = true;
        found.poi_planning_score_reasons = [
          ...(found.poi_planning_score_reasons ?? []),
          POI_PLANNING_SCORE_REASON.ANCHOR_MATCHED_EXISTING,
          POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
        ];
        matchedSlugs.add(slug);
        const pk = poiPlanningRowIdentityKey(found);
        if (pk) usedPoiKeys.add(pk);
      }
    }
    const signatures = new Set(
      out.map((p) => `${p?.name ?? ''} ${p?.nameCN ?? ''}`.toLowerCase()),
    );
    for (const slug of slice.poiPlan.requiredAnchorPoiIds ?? []) {
      if (matchedSlugs.has(slug)) continue;
      const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
      if (!kws?.length) continue;
      const primary = kws[0];
      const stub = {
        name: primary,
        nameCN: primary,
        category: 'ATTRACTION',
        poi_planning_anchor_slug: slug,
        source: 'poi_planning_fallback',
        poi_planning_anchor_source: 'fallback',
        poi_planning_admission_protected: true,
        poi_planning_score_reasons: [
          POI_PLANNING_SCORE_REASON.ANCHOR_FALLBACK_PLACEHOLDER,
          POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
        ],
      };
      out.unshift(stub);
      signatures.add(primary.toLowerCase());
    }
    return { pois: out, excludedFilteredCount };
  }

  /** Phase 2.6：enforce 阶段与 merge 占位符同形，保证 passesHardPoiGuards（IS） */
  private buildPoiPlanningAnchorFallbackStub(slug: string): Record<string, unknown> {
    const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
    const primary = kws?.[0] ?? slug;
    return {
      name: primary,
      nameCN: primary,
      category: 'ATTRACTION',
      poi_planning_anchor_slug: slug,
      source: 'poi_planning_fallback',
      poi_planning_anchor_source: 'fallback',
      poi_planning_admission_protected: true,
      poi_planning_score_reasons: [
        POI_PLANNING_SCORE_REASON.ANCHOR_FALLBACK_PLACEHOLDER,
        POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
      ],
    };
  }

  /**
   * POI_SELECTION：对 RESEARCH 产出的 POI 筛选排序；消费 DSO.poiPlanning 与 score_reason。
   */
  private async executePoiSelectionStep(
    state: OrchestratorState,
    decisionState?: DecisionState,
  ): Promise<{ needsClarification: boolean; allowWithFallback: boolean }> {
    const stepStartTime = Date.now();
    state.current_step = 'POI_SELECTION';

    const rawPoiEvidence = state.research_data?.poi_evidence;
    const asArray = Array.isArray(rawPoiEvidence)
      ? rawPoiEvidence
      : Array.isArray((rawPoiEvidence as any)?.pois)
        ? (rawPoiEvidence as any).pois
        : [];

    const destinationRaw =
      typeof state.trip_plan_request?.destination === 'string'
        ? state.trip_plan_request.destination
        : '';
    const poiPolicy = this.resolvePoiPolicy(
      state.metadata?.poi_policy,
      state.metadata?.require_poi_data === true,
    );
    const requirePoiData = poiPolicy === 'strict';
    const destinationCountry = this.inferCountryFromDestination(destinationRaw);
    const destinationCity = this.normalizeText(destinationRaw);

    let deduped = this.dedupePois(asArray);
    const routeIntent = (state.metadata as Record<string, unknown>)
      ?.route_and_run_intent as RouteAndRunIntentAnalysis | undefined;
    const isItineraryAdjust = routeIntent?.primary === 'ITINERARY_ADJUST';
    let itineraryAdjustTripPoiSeedCount = 0;
    if (isItineraryAdjust) {
      const tripId =
        state.trip_plan_request?.trip_id?.trim() ??
        state.trip_plan_request?.ontology_context?.trip_id?.trim() ??
        (state.metadata as { tripId?: string })?.tripId?.trim();
      const userId = (state.metadata as { userId?: string })?.userId;
      if (tripId) {
        const tripPois = await this.loadTripPlacePoiEvidenceForAdjust(tripId, userId);
        itineraryAdjustTripPoiSeedCount = tripPois.length;
        if (tripPois.length) {
          deduped = this.dedupePois([...tripPois, ...deduped]);
          (state.metadata as Record<string, unknown>).itinerary_adjust_trip_poi_seed_count =
            tripPois.length;
        }
      }
    }
    const rejectedIds = (decisionState?.userIntent?.excludePoiIds ?? [])
      .map((x) => String(x).trim().toLowerCase())
      .filter(Boolean);
    if (rejectedIds.length) {
      deduped = filterPoisByRejectedIds(deduped as any[], rejectedIds) as any[];
    }
    const planningAug = this.applyPoiPlanningToResearchPois(
      deduped,
      decisionState,
      destinationCountry,
    );
    const withPlanning = planningAug.pois;
    if (planningAug.excludedFilteredCount > 0) {
      (state.metadata as Record<string, unknown>).poiPlanningExcludedFilteredCount =
        planningAug.excludedFilteredCount;
    }
    const sliceMeta = decisionState?.poiPlanning;
    if (sliceMeta?.budgetGateApplied) {
      (state.metadata as Record<string, unknown>).poiPlanningBudgetGateApplied = true;
      (state.metadata as Record<string, unknown>).poiPlanningFeasibility =
        sliceMeta.schedulePlan?.feasibility;
      (state.metadata as Record<string, unknown>).poiPlanningEnrichmentDisabled = true;
    }
    const poiPlanSlice = decisionState?.poiPlanning;
    let scoredRows = withPlanning
      .filter((poi: any) =>
        this.passesHardPoiGuards(poi, destinationCountry, destinationRaw),
      )
      .map((poi: any, idx: number) => {
        const riskLevel = poi?.metadata?.risk_level;
        const riskPenalty =
          riskLevel === 'HIGH' ? 2 : riskLevel === 'MEDIUM' ? 1 : 0;
        const hasOpeningHours = !!poi?.opening_hours;
        const openingHoursBonus = hasOpeningHours ? 1 : 0;
        const localityScore = this.poiLocalityScore(
          poi,
          destinationCountry,
          destinationCity,
        );
        const dataCompletenessBonus =
          poi?.address && poi?.name ? 0.5 : 0;
        let optionalBoost = 0;
        if (
          !poiPlanSlice?.budgetGateApplied &&
          poiPlanSlice?.poiPlan?.optionalCandidatePoiIds?.length &&
          destinationCountry === 'IS'
        ) {
          const hay = `${poi?.name ?? ''} ${poi?.nameCN ?? poi?.name ?? ''}`;
          for (const slug of poiPlanSlice.poiPlan.optionalCandidatePoiIds) {
            const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
            if (!kws?.length) continue;
            if (
              kws.some(
                (k) =>
                  hay.includes(k) ||
                  hay.toLowerCase().includes(k.toLowerCase()),
              )
            ) {
              optionalBoost = 2;
              poi.poi_planning_score_reasons = [
                ...(poi.poi_planning_score_reasons ?? []),
                POI_PLANNING_SCORE_REASON.OPTIONAL_BOOST,
              ];
              break;
            }
          }
        }
        const anchorBoost = poi?.poi_planning_anchor_slug ? 3 : 0;
        return {
          poi,
          idx,
          localityScore,
          openingHoursBonus,
          dataCompletenessBonus,
          riskPenalty,
          score:
            localityScore +
            openingHoursBonus +
            dataCompletenessBonus +
            optionalBoost +
            anchorBoost -
            riskPenalty -
            idx * 0.01,
        };
      });
    scoredRows = applySelectedPoiPenalty(
      scoredRows,
      extractSelectedPlaceIdsFromItinerary(state.itinerary),
    );
    scoredRows = sortPoiScoreRowsDesc(scoredRows);
    scoredRows = applyDiversityPenaltyToSortedRows(scoredRows);
    scoredRows = sortPoiScoreRowsDesc(scoredRows);
    const startCoordinates = this.tryExtractStartCoordinates(
      state.trip_plan_request?.origin,
    );
    const rankedPois = scoredRows.map((x) => x.poi);
    const requiredAnchors = poiPlanSlice?.poiPlan?.requiredAnchorPoiIds ?? [];
    const topNLimit = 8;
    const planningTextForDiversity = [
      (state.metadata as { intake_user_message?: string })?.intake_user_message,
      state.trip_plan_request?.message,
    ]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .join('\n');
    const skipGeoClusterForDiversity =
      resolveSparseRegionProfile({
        countryCode: destinationCountry,
        destinationHint: destinationRaw,
      })?.defaultDayAllocation === 'intentional_slack' ||
      (detectRhythmOrDiningPlanningIntent(planningTextForDiversity) &&
        rankedPois.length >= 3);
    const skipGeoClusterForAdjust =
      isItineraryAdjust && itineraryAdjustTripPoiSeedCount >= 2;
    let scored =
      skipGeoClusterForDiversity || skipGeoClusterForAdjust
      ? rankedPois.slice(0, topNLimit)
      : this.selectClusteredPois(
          rankedPois,
          topNLimit,
          startCoordinates,
          destinationRaw,
        );
    /** Phase 2.6：最后一跳强制锚点进入 TopN（候选来自 rankedPois；与聚类解耦） */
    if (destinationCountry === 'IS' && requiredAnchors.length > 0 && !skipGeoClusterForAdjust) {
      const beforeLen = scored.length;
      scored = enforceRequiredAnchorsTopN(
        scored,
        rankedPois,
        requiredAnchors,
        topNLimit,
        {
          createFallbackForSlug: (slug) =>
            this.buildPoiPlanningAnchorFallbackStub(slug),
        },
      );
      this.logger.debug(
        `[POI_PLANNING_ADMISSION] required=${JSON.stringify(requiredAnchors)} clustered_len=${beforeLen} final_len=${scored.length}`,
      );
    }

    const sparsePoiGate = applySparseRegionPoiGate({
      scored: scored as Record<string, unknown>[],
      destinationCountry,
      destinationHint: destinationRaw,
      dedupe: (pois) => this.dedupePois(pois),
    });
    scored = sparsePoiGate.scored;
    attachSparseRegionMetadata(state.metadata as Record<string, unknown>, sparsePoiGate);

    const sparseProfile = sparsePoiGate.sparseProfile;
    if (sparseProfile && planningTextForDiversity.trim()) {
      const existingDiscovery = (state.research_data as Record<string, unknown> | undefined)
        ?.open_world_discovery;
      const discovery =
        existingDiscovery && typeof existingDiscovery === 'object'
          ? (existingDiscovery as ReturnType<typeof runOpenWorldDiscoveryBuffer>)
          : runOpenWorldDiscoveryBuffer({
              userMessage: planningTextForDiversity,
              countryCode: destinationCountry,
              destinationHint: destinationRaw,
              regionTags: [sparseProfile.regionTag],
              existingPoiEvidence: scored as unknown[],
              existingStubIds: (sparsePoiGate.openWorldStubs ?? []).map((s) => s.stubId),
            });
      if (discovery.stubs.length > 0) {
        scored = this.dedupePois([
          ...(scored as unknown[]),
          ...openWorldStubsToPoiEvidence(discovery.stubs),
        ]);
        const meta = state.metadata as Record<string, unknown>;
        meta.open_world_discovery = discovery;
        meta.open_world_discovery_applied_at = new Date().toISOString();
        meta.open_world_stubs = [...(sparsePoiGate.openWorldStubs ?? []), ...discovery.stubs];
      }
    }

    const admissionDiag: PoiPlanningAdmissionDiagnosticsInput | undefined =
      buildPoiPlanningAdmissionDiagnostics(
        decisionState?.poiPlanning,
        withPlanning,
        rankedPois,
        scored,
      ) ?? undefined;

    annotateRetrievalTraceAfterPoiSelection(state.research_data?.retrieval_decision_trace);

    const gapBehaviorObs = buildGapBehaviorObservation({
      trace: state.research_data?.retrieval_decision_trace as RetrievalDecisionTrace | undefined,
      selectedPois: scored,
    });
    if (gapBehaviorObs) {
      (state.metadata as Record<string, unknown>).gap_behavior_observation = {
        ...gapBehaviorObs,
        ts: new Date().toISOString(),
      };
    }

    this.recordPoiPlanningOutcomeAfterSelection(state, decisionState, scored, admissionDiag);

    if (state.metadata?.show_poi_trace) {
      const selectedForTrace = scored
        .slice(0, 4)
        .map((x) => this.toPoiTraceNode(x));
      const metaObs = state.metadata as Record<string, unknown>;
      state.metadata.poi_trace = {
        ...(state.metadata.poi_trace || {}),
        policy: poiPolicy,
        sourceHint: state.metadata?.poi_source_hint,
        inputCount: asArray.length,
        selectedCount: scored.length,
        selected_region: destinationRaw || undefined,
        destination_country: destinationCountry,
        recall_raw_research: asArray.length,
        recall_after_route_augment: asArray.length,
        after_dedupe: deduped.length,
        after_hard_guards: scoredRows.length,
        selected_after_rank: scored.length,
        country_filter_applied: Boolean(destinationCountry),
        /** Phase 1.6：固定可观测块（与 docs/POI_REGION_INTENT_EVAL.md 对齐） */
        poi_planning_trace: decisionState?.poiPlanning
          ? {
              regionId: decisionState.poiPlanning.routeIntent?.regionId,
              resolution: decisionState.poiPlanning.resolution,
              feasibility: decisionState.poiPlanning.schedulePlan?.feasibility,
              budgetGateApplied: decisionState.poiPlanning.budgetGateApplied,
              appliedBackoffSteps: decisionState.poiPlanning.appliedBackoffSteps,
              narrationHint: decisionState.poiPlanning.narrationHint,
            }
          : undefined,
        poiPlanningExcludedFilteredCount: metaObs.poiPlanningExcludedFilteredCount,
        poiPlanningEnrichmentDisabled: metaObs.poiPlanningEnrichmentDisabled,
        score_reasons_top: scoredRows.slice(0, 8).map((x: any) => ({
          rank: x.idx + 1,
          reasons: x.poi?.poi_planning_score_reasons ?? [],
        })),
        debug_scores: scoredRows.slice(0, 12).map((x: any) => ({
          slot: `RANK_${x.idx + 1}`,
          desiredType: String(x.poi?.category ?? x.poi?.type ?? 'poi'),
          poiName: String(x.poi?.name ?? ''),
          typeScore: 0,
          timeScore: x.openingHoursBonus,
          ratingScore: 0,
          affordabilityScore: x.dataCompletenessBonus,
          nameHintScore: 0,
          commuteDistanceKm: undefined,
          commuteMinutes: undefined,
          commutePenalty: x.riskPenalty,
          timeWindowPenalty: 0,
          totalScore: Number((x.score ?? 0).toFixed(2)),
          score_reasons: x.poi?.poi_planning_score_reasons ?? [],
        })),
        commute_matrix:
          state.metadata?.show_commute_matrix === true
            ? this.buildPoiTraceCommuteMatrix(
                selectedForTrace,
                state.trip_plan_request?.mode as any,
                startCoordinates,
              )
            : undefined,
      };
    }

    const commuteBudgetMinutes = 240;
    const estimatedCommuteMinutes = this.estimateNearestTotalCommuteMinutes(
      scored.map((x) => this.toPoiTraceNode(x)),
      state.trip_plan_request?.mode as any,
      startCoordinates,
    );
    const skipCommuteClarifyForItineraryAdjust =
      shouldSkipPoiDestinationClarificationForItineraryAdjust(
        routeIntent?.primary,
        itineraryAdjustTripPoiSeedCount,
      );
    const existingTripRouteOrderOptimization =
      this.isExistingTripRouteOrderOptimizationRequest(state);
    if (
      estimatedCommuteMinutes > commuteBudgetMinutes &&
      !skipCommuteClarifyForItineraryAdjust &&
      !existingTripRouteOrderOptimization
    ) {
      const destinationExample = destinationRaw || '雷克雅未克';
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `估算单日通勤约 ${estimatedCommuteMinutes} 分钟，超过预算 ${commuteBudgetMinutes} 分钟，请补充更具体的城市/区域（例如：${destinationExample} 市区）`,
        } as any,
      ];
      state.clarification_questions = [
        {
          id: 'destination_scope_refine',
          question:
            '当前目的地范围过大，单日通勤过长。请选择更聚焦的区域继续规划：',
          type: 'single_choice',
          options: buildDestinationScopeClarificationOptions(destinationExample),
          required: true,
        } as any,
      ];
      if (state.metadata?.show_poi_trace) {
        state.metadata.poi_trace = {
          ...(state.metadata.poi_trace || {}),
          commute_budget_minutes: commuteBudgetMinutes,
          estimated_commute_minutes: estimatedCommuteMinutes,
          over_budget: true,
        };
      }
      return {
        needsClarification: true,
        allowWithFallback: false,
      };
    }

    const minPoiRequired = sparsePoiGate.minPoiRequired;
    const skipSparseForItineraryAdjust = shouldSkipPoiDestinationClarificationForItineraryAdjust(
      routeIntent?.primary,
      itineraryAdjustTripPoiSeedCount,
      minPoiRequired > 0 ? minPoiRequired : 2,
    );
    if (skipSparseForItineraryAdjust && scored.length < minPoiRequired) {
      scored = rankedPois.slice(0, Math.max(minPoiRequired, scored.length));
    }
    if (
      scored.length > 0 &&
      scored.length < minPoiRequired &&
      !skipSparseForItineraryAdjust &&
      !existingTripRouteOrderOptimization
    ) {
      const destinationExample = destinationRaw || '雷克雅未克';
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `当前可执行 POI 仅 ${scored.length} 个（至少需要 ${minPoiRequired} 个），请补充更具体的城市/区域（例如：${destinationExample} 市区）`,
        } as any,
      ];
      state.clarification_questions = [
        {
          id: 'destination_scope_too_sparse',
          question:
            '当前目的地范围过大或过散，候选点不足以生成可执行单日行程。请选择更聚焦区域：',
          type: 'single_choice',
          options: buildDestinationScopeClarificationOptions(destinationExample),
          required: true,
        } as any,
      ];
      if (state.metadata?.show_poi_trace) {
        state.metadata.poi_trace = {
          ...(state.metadata.poi_trace || {}),
          min_poi_required: minPoiRequired,
          selected_too_sparse: true,
        };
      }
      return {
        needsClarification: true,
        allowWithFallback: false,
      };
    }
    if (existingTripRouteOrderOptimization && (estimatedCommuteMinutes > commuteBudgetMinutes || scored.length < minPoiRequired)) {
      state.metadata = {
        ...(state.metadata ?? {}),
        poi_selection_destination_scope_clarification_bypassed: {
          reason: 'EXISTING_TRIP_ROUTE_ORDER_OPTIMIZATION',
          selected_count: scored.length,
          min_poi_required: minPoiRequired,
          estimated_commute_minutes: estimatedCommuteMinutes,
          commute_budget_minutes: commuteBudgetMinutes,
        },
      } as any;
    }

    if (destinationCountry && scored.length === 0 && !existingTripRouteOrderOptimization) {
      if (sparsePoiGate.sparseProfile) {
        (state.metadata as Record<string, unknown>).sparse_region_no_poi_fallback = true;
      } else {
      const destinationExample = destinationRaw ? `${destinationRaw} ${this.countryDisplayName(destinationCountry)}` : 'Tokyo, Japan';
      const fallbackDecision = {
        verdict: 'ALLOW_WITH_FALLBACK',
        reason: 'NO_POI_DATA',
      };
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `未找到与目的地国家(${destinationCountry})一致的 POI，请明确国家/城市（例如：${destinationExample}）`,
        } as any,
      ];
      state.clarification_questions = [
        this.buildPoiCountryClarificationQuestion(destinationRaw, destinationCountry) as any,
      ];
      state.metadata.fallback_decision = fallbackDecision;
      state.metadata.fallback_explain = {
        summary: '由于缺少POI数据，系统采用城市探索策略',
        reasoning: [
          `目的地明确（${destinationRaw || '未提供'}）`,
          '未获取到可用POI数据',
          '触发Fallback机制',
        ],
      };
      if (requirePoiData) {
        state.gaps = [
          ...(state.gaps || []),
          {
            type: 'MISSING_DESTINATION',
            severity: 'HARD',
            detail: '已启用 require_poi_data：POI 数据为空，需补充目的地或扩展检索范围',
          } as any,
        ];
        return {
          needsClarification: true,
          allowWithFallback: false,
        };
      }
      }
    }

    if (state.research_data && rawPoiEvidence) {
      if (Array.isArray(rawPoiEvidence)) {
        state.research_data.poi_evidence = scored;
      } else {
        state.research_data.poi_evidence = {
          ...(rawPoiEvidence as Record<string, unknown>),
          pois: scored,
        };
      }
    }

    state.decision_log.push({
      request_id: state.request_id,
      step: 'POI_SELECTION',
      actor: 'Planner',
      inputs_summary: formatPoiSelectionInputsZh(asArray.length),
      outputs_summary: formatPoiSelectionOutputsZh(asArray.length, scored.length),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        destination: destinationRaw || undefined,
        destination_country: destinationCountry || undefined,
        input_count: asArray.length,
        deduped_count: deduped.length,
        selected_count: scored.length,
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    await this.generateDecisionStepForStep(state, 'POI_SELECTION', 'Planner');
    const allowWithFallback = poiPolicy !== 'strict' && !!(destinationRaw && scored.length === 0);
    return {
      needsClarification: false,
      allowWithFallback,
    };
  }

  private isExistingTripRouteOrderOptimizationRequest(state: OrchestratorState): boolean {
    const tripId = state.trip_plan_request?.trip_id ?? state.metadata?.tripId;
    if (!tripId) return false;
    const message = [
      state.trip_plan_request?.message,
      state.metadata?.intake_user_message,
    ]
      .map((x) => (typeof x === 'string' ? x : ''))
      .join('\n');
    return /(?:优化|调整|重排|重新排序|reorder|optimi[sz]e).{0,24}(?:路线顺序|路线|交通时间|通勤|route\s*order|travel\s*time)|(?:路线顺序|交通时间|通勤|route\s*order|travel\s*time).{0,24}(?:优化|调整|重排|重新排序|reorder|optimi[sz]e)/i.test(message);
  }

  /** Phase 2.0：DSO slice 摘要，写入 metadata 与 observability，便于无 DSO 回放对齐 */
  private compactPoiPlanningSliceForOutcome(slice: PoiPlanningDecisionSlice | undefined):
    | {
        regionId?: string;
        feasibility?: 'ok' | 'tight' | 'failed';
        resolution?: PoiPlanningDecisionSlice['resolution'];
        appliedBackoffSteps?: string[];
        budgetGateApplied?: boolean;
      }
    | undefined {
    if (!slice) return undefined;
    return {
      regionId: slice.routeIntent?.regionId,
      feasibility: slice.schedulePlan?.feasibility,
      resolution: slice.resolution,
      appliedBackoffSteps: slice.appliedBackoffSteps,
      budgetGateApplied: slice.budgetGateApplied,
    };
  }

  /** POI_SELECTION 最终 TopN（聚类后）→ slug 与 outcome 指标 */
  private recordPoiPlanningOutcomeAfterSelection(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    scoredPois: unknown[],
    admissionDiagnostics?: PoiPlanningAdmissionDiagnosticsInput,
  ): void {
    const slugs = extractPlanningSlugsFromPois(scoredPois);
    const fb = countPoiPlanningFallbackInPois(scoredPois);
    const report = buildPoiPlanningOutcomePhaseReport(decisionState?.poiPlanning, slugs, {
      phase: 'poi_selection',
      scoredPoisForRank: scoredPois,
      fallbackAnchorCount: fb,
      admissionDiagnostics,
    });
    const meta = state.metadata as Record<string, unknown>;
    const prev = (meta.poiPlanningOutcome ?? {}) as Record<string, unknown>;
    meta.poiPlanningOutcome = {
      ...prev,
      slice: this.compactPoiPlanningSliceForOutcome(decisionState?.poiPlanning),
      poiSelection: report,
    };
  }

  /** PLAN/REPAIR 之后最终 itinerary → slug 与 outcome 指标（与 poiSelection 对照） */
  private recordPoiPlanningOutcomeAfterItinerary(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): void {
    const slugs = extractPlanningSlugsFromItinerary(state.itinerary);
    const itineraryItems: MinimalItineraryItem[] =
      state.itinerary?.days?.flatMap((d) => (d.items ?? []) as MinimalItineraryItem[]) ?? [];
    const report = buildPoiPlanningOutcomePhaseReport(decisionState?.poiPlanning, slugs, {
      phase: 'itinerary_final',
      itineraryItemsForReasons: itineraryItems,
      fallbackAnchorCount: 0,
    });
    const meta = state.metadata as Record<string, unknown>;
    const prev = (meta.poiPlanningOutcome ?? {}) as Record<string, unknown>;
    meta.poiPlanningOutcome = {
      ...prev,
      slice: this.compactPoiPlanningSliceForOutcome(decisionState?.poiPlanning),
      itineraryFinal: report,
    };
    if (state.metadata?.show_poi_trace) {
      state.metadata.poi_trace = {
        ...(state.metadata.poi_trace || {}),
        poi_planning_outcome: meta.poiPlanningOutcome,
      };
    }
  }

  private resolvePoiPolicy(
    explicitPolicy: unknown,
    requirePoiData: boolean,
  ): 'strict' | 'fallback' | 'explore' {
    if (typeof explicitPolicy === 'string') {
      const p = explicitPolicy.trim().toLowerCase();
      if (p === 'strict' || p === 'fallback' || p === 'explore') return p;
    }
    if (requirePoiData) return 'strict';
    return 'fallback';
  }

  private enrichGuardianDebateTripContextAfterGateEval(state: OrchestratorState): void {
    try {
      enrichGuardianDebateTripContextFromGateEval(state);
    } catch (e: any) {
      this.logger.warn(`[Claude Orchestrator] enrichGuardianDebateTripContext failed: ${e?.message ?? e}`);
    }
  }

  /** 极昼马拉松：回填 trip SKU、Gate SOFT 违规，避免 STATE_UPDATE 剥离后三人格误判。 */
  private applyMarathonPipelineSignals(state: OrchestratorState, request: RouteAndRunRequestDto): void {
    if (!state.trip_plan_request) return;
    const intakeMsg =
      request.message ?? (state.metadata as { intake_user_message?: string } | undefined)?.intake_user_message;
    const signals = buildMarathonIntakeSignalsFromGaps(state.gaps, state.trip_plan_request, intakeMsg);
    if (!signals) return;

    state.trip_plan_request = applyMarathonIntakeSignalsToTripPlan(
      state.trip_plan_request,
      signals,
      intakeMsg,
    );
    (state.metadata as Record<string, unknown>).marathon_intake_signals = signals;

    if (state.gate_result) {
      state.gate_result = enrichGateForMarathonDeferredLowerBound(
        state.gate_result,
        state.trip_plan_request,
        state.gaps,
        intakeMsg,
      );
    }
  }

  /**
   * Gate 最终落定（含 `allow_partial` 放宽）后尽早启动辩论 LLM shadow，与后续 PLAN 等步骤并行；
   * 由 Assembler `GuardiansDebateService.consumeShadowOrMerge` 消费。
   */
  private maybeStartGuardiansDebateShadowAfterGate(request: RouteAndRunRequestDto, state: OrchestratorState): void {
    if (!this.guardiansDebate) return;
    if (request.options?.enable_guardians_debate_llm !== true) return;
    const gate = state.gate_result;
    if (!gate) return;
    if (this.guardiansDebate.hasFatalViolation(gate)) return;
    this.guardiansDebate.startShadowIfEligible(request.request_id, gate, {
      personaHint: request.options.persona_hint as TripPlanRequest['persona_hint'],
      tripContext: state.trip_plan_request,
      llmProvider: request.options.llm_provider,
      personaClosureAudit: resolvePersonaClosureAudit({
        gateResult: gate,
        orchestratorMetadata: state.metadata as Record<string, unknown>,
      }),
    });
    if (state.metadata) {
      (state.metadata as Record<string, unknown>).debate_triggered_at = Date.now();
      (state.metadata as Record<string, unknown>).debate_shadow_started = true;
    }
  }

  /**
   * PLAN_GEN 前 await 影子辩论；Abu REJECT → `NEED_USER_CONFIRM` 并短路（不生成行程草案）。
   */
  private async maybeAwaitGuardiansDebateFuseAndShortCircuit(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    context: AgentContext,
    startTime: number,
    deadline?: { remainingMs: () => number },
  ): Promise<OrchestrationResult | undefined> {
    if (!this.guardiansDebate || request.options?.enable_guardians_debate_llm !== true) {
      return undefined;
    }
    const gateBefore = state.gate_result;
    if (!gateBefore || this.guardiansDebate.hasFatalViolation(gateBefore)) {
      return undefined;
    }

    const remaining = deadline?.remainingMs?.() ?? 90_000;
    const debateBudgetMs = computeGuardiansDebateAwaitBudgetMs(remaining);

    const stepStart = Date.now();
    let gateWithDebate: GateResult;
    let debateWaitTimedOut = false;
    try {
      const consumed = await this.guardiansDebate.consumeShadowOrMergeWithBudget(
        request.request_id,
        gateBefore,
        {
          personaHint: request.options.persona_hint as TripPlanRequest['persona_hint'],
          tripContext: state.trip_plan_request,
          llmProvider: request.options.llm_provider,
          personaClosureAudit: resolvePersonaClosureAudit({
            gateResult: gateBefore,
            orchestratorMetadata: state.metadata as Record<string, unknown>,
          }),
        },
        debateBudgetMs,
      );
      gateWithDebate = consumed.gate;
      debateWaitTimedOut = consumed.debate_wait_timed_out;
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] GuardiansDebate pre-plan await failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return undefined;
    }

    const fusion = fuseGuardianDebateVerdictIntoGate(gateWithDebate, state.trip_plan_request);
    state.gate_result = fusion.gate;
    state.metadata = {
      ...(state.metadata ?? {}),
      debate_merged_before_plan_gen: true,
      debate_await_budget_ms: debateBudgetMs,
      ...(debateWaitTimedOut ? { debate_wait_timed_out: true } : {}),
      ...(fusion.fused ? { debate_gate_fusion: fusion.reason } : {}),
    } as OrchestratorState['metadata'];

    state.decision_log.push({
      request_id: state.request_id,
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: formatGuardianDebateGateInputsZh(
        debateBudgetMs,
        extractDecisionLogTripContext({
          tripPlanRequest: state.trip_plan_request,
          metadata: state.metadata as Record<string, unknown>,
        }),
      ),
      outputs_summary: formatGuardianDebateGateOutputsZh({
        gateResult: fusion.gate.gate_result,
        fused: fusion.fused,
        fusionReason: fusion.reason,
        guardian: {
          abu: fusion.gate.guardian_results?.abu?.verdict,
          drdre: fusion.gate.guardian_results?.drdre?.verdict,
          neptune: fusion.gate.guardian_results?.neptune?.verdict,
        },
      }),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStart,
        gate_result: fusion.gate.gate_result,
        debate_source: fusion.gate.guardian_results?.source,
        debate_gate_fusion: fusion.reason,
        abu_verdict: fusion.gate.guardian_results?.abu?.verdict,
        debate_wait_timed_out: debateWaitTimedOut,
        debate_await_budget_ms: debateBudgetMs,
      },
    });

    if (!fusion.fused || fusion.gate.gate_result !== 'NEED_USER_CONFIRM') {
      return undefined;
    }

    const debateQuestions = buildGuardianDebateFusionClarificationQuestions(
      fusion.gate,
      state.trip_plan_request,
    );
    const existing = state.clarification_questions ?? [];
    const merged = [...existing];
    for (const q of debateQuestions) {
      if (!merged.some((m) => m.id === q.id)) merged.push(q);
    }
    state.clarification_questions = merged;

    this.logger.log(
      `[Claude Orchestrator] Abu REJECT → NEED_USER_CONFIRM，跳过 PLAN_GEN request_id=${request.request_id}`,
    );
    return this.buildClarificationResult(state, startTime, decisionState, context);
  }

  private relaxGateForPartialIfEligible(state: OrchestratorState): void {
    if (state.metadata?.allow_partial !== true) return;
    if (state.gate_result?.gate_result !== 'BLOCK') return;
    const violations = state.gate_result?.violations || [];
    if (!this.isDateOnlyDataMissingViolation(violations)) return;

    state.gate_result = {
      ...state.gate_result,
      gate_result: 'ADJUST_REQUIRED',
      required_adjustments: [
        ...(state.gate_result?.required_adjustments || []),
        {
          action: 'CHANGE_DATES',
          why: 'allow_partial=true：缺少日期时先生成草案，再补充日期确认',
        } as any,
      ],
    };
    state.metadata.gate_relaxed_for_partial = true;
    state.decision_log.push({
      request_id: state.request_id,
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: 'allow_partial 下日期缺口门控降级',
      outputs_summary: 'Gate 从 BLOCK 降级为 ADJUST_REQUIRED，继续生成草案',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { duration_ms: 0, downgraded: true },
    });
  }

  private isDateOnlyDataMissingViolation(
    violations: Array<{ type?: string; detail?: string; severity?: string }>,
  ): boolean {
    if (!violations.length) return false;
    return violations.every((v) => {
      if (String(v?.type) !== 'DATA_MISSING') return false;
      const d = String(v?.detail || '');
      return /日期|date_range|start_date/i.test(d);
    });
  }

  private applyFallbackPlan(state: OrchestratorState): void {
    const destination =
      typeof state.trip_plan_request?.destination === 'string'
        ? state.trip_plan_request.destination
        : '目的地';
    const query = state.decision_log.find((log) => log.step === 'INTAKE')?.inputs_summary || '';
    const strategyHint = this.normalizeFallbackStrategyHint(
      state.metadata?.fallback_strategy_hint,
    );
    const strategy = strategyHint ?? chooseFallbackStrategy(query);
    const researchPoiEvidence = state.research_data?.poi_evidence;
    const includeDebugScores = state.metadata?.fallback_debug_scores === true;
    const includeCommuteMatrix = state.metadata?.show_commute_matrix === true;
    const fallbackPlan = buildFallbackPlan(destination, strategy, {
      researchPoiEvidence,
      includeDebugScores,
      includeCommuteMatrix,
      tripPlanRequest: state.trip_plan_request,
    });
    const fallbackPlans = buildFallbackPlans(destination, {
      researchPoiEvidence,
      tripPlanRequest: state.trip_plan_request,
    });
    const mergedFallbackPlans = [
      fallbackPlan,
      ...fallbackPlans.filter((p) => p.strategy !== fallbackPlan.strategy),
    ];
    const fallbackItinerary = fallbackPlanToItinerary(
      state.request_id,
      state.trip_plan_request,
      fallbackPlan,
    );

    state.itinerary = fallbackItinerary;
    state.clarification_questions = [];
    state.gaps = [];
    state.metadata.fallback_used = true;
    state.metadata.fallback_template_version = getFallbackTemplateVersion();
    state.metadata.fallback_data_source = fallbackPlan.data_source;
    state.metadata.fallback_source_confidence = fallbackPlan.source_confidence;
    state.metadata.fallback_pacing_mode = fallbackPlan.pacing_mode;
    state.metadata.fallback_plan = fallbackPlan;
    state.metadata.fallback_plans = mergedFallbackPlans;
    state.metadata.fallback_selected_strategy = fallbackPlan.strategy;
    state.metadata.fallback_explain = {
      summary:
        fallbackPlan.explain?.summary || '由于缺少POI数据，系统采用城市探索策略',
      reasoning: [
        `目的地明确（${destination}）`,
        '未获取到可用POI数据',
        '触发Fallback机制',
        ...(fallbackPlan.explain?.reasoning || []),
      ],
      objective: fallbackPlan.explain?.objective || '最大体验密度 + 节奏合理',
      planScore: fallbackPlan.plan_score,
      dataSource: fallbackPlan.data_source,
      sourceConfidence: fallbackPlan.source_confidence,
      pacingMode: fallbackPlan.pacing_mode,
      policy: this.resolvePoiPolicy(
        state.metadata?.poi_policy,
        state.metadata?.require_poi_data === true,
      ),
    };
    if (state.metadata?.show_poi_trace) {
      state.metadata.poi_trace = {
        ...(state.metadata.poi_trace || {}),
        provider: fallbackPlan.data_source,
      };
    }
    state.decision_log.push({
      request_id: state.request_id,
      step: 'PLAN_GEN',
      actor: 'Planner',
      inputs_summary: 'POI 数据缺失，触发 fallback plan',
      outputs_summary: `生成 fallback 行程，策略=${fallbackPlan.strategy}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: 0,
        fallback: true,
        strategy: fallbackPlan.strategy,
      },
    });
  }

  private normalizeFallbackStrategyHint(input: unknown):
    | 'CITY_WALK'
    | 'CLASSIC'
    | 'HOT_SPOTS'
    | 'BALANCED'
    | undefined {
    if (typeof input !== 'string') return undefined;
    const value = input.trim().toUpperCase();
    if (value === 'CITY_WALK' || value === 'CLASSIC' || value === 'HOT_SPOTS' || value === 'BALANCED') {
      return value;
    }
    return undefined;
  }

  private normalizeText(v: string): string {
    return v.trim().toLowerCase();
  }

  /** Trip 表 destination 常为 ISO 码（如 IS），规划 NL 需可读国名以便检索与展示 */
  private normalizeTripRecordDestinationForPlanning(tripDest: string): string {
    const t = tripDest.trim();
    if (!t) return '';
    const upper = t.toUpperCase();
    if (upper === 'IS') return '冰岛';
    if (upper === 'JP') return '日本';
    if (upper === 'KR') return '韩国';
    if (upper === 'CN') return '中国';
    return t;
  }

  private inferCountryFromDestination(destination: string): string | undefined {
    const d = this.normalizeText(destination);
    if (!d) return undefined;
    if (/^gl$/i.test(d.trim()) || /格陵兰|greenland|nuuk|ilulissat|伊卢利萨特|迪斯科|disko/.test(d)) {
      return 'GL';
    }
    if (/^sj$/i.test(d.trim()) || /斯瓦尔巴|svalbard|longyearbyen|朗伊尔/.test(d)) {
      return 'SJ';
    }
    if (/东京|大阪|京都|日本|tokyo|osaka|kyoto|japan/.test(d)) return 'JP';
    if (/首尔|韩国|seoul|korea/.test(d)) return 'KR';
    if (/上海|北京|广州|深圳|杭州|成都|重庆|中国|china/.test(d)) return 'CN';
    /** 冰岛：POI_SELECTION / poiPlanning 冰岛分支依赖 ISO 国家码 IS */
    if (/^is$/i.test(d.trim()) || /冰岛|iceland|reykjav[ií]k|雷克雅未克/.test(d)) return 'IS';
    if (/^[a-z]{2}$/i.test(d.trim())) return d.trim().toUpperCase();
    return undefined;
  }

  private buildPoiCountryClarificationQuestion(destination: string, destinationCountry: string): Record<string, unknown> {
    const normalizedDestination = destination?.trim() || '该目的地';
    const countryLabel = this.countryDisplayName(destinationCountry);
    const quickOptionLabel = `${normalizedDestination} ${countryLabel}`;
    const quickOptionValue = this.toStableOptionValue(normalizedDestination, destinationCountry);

    return {
      id: 'question-poi-country',
      question: '请确认目的地国家/城市',
      type: 'single_choice',
      options: [
        { value: quickOptionValue, label: quickOptionLabel },
        { value: 'manual', label: '其他（手动输入）' },
      ],
      required: true,
      hint: '用于限制 POI 检索范围，避免匹配到同名异地',
      conditionalInputs: [
        {
          triggerValue: 'manual',
          inputType: 'text',
          label: '请输入目的地国家/城市',
          placeholder: `例如：${normalizedDestination}, ${countryLabel}`,
          required: true,
          hint: '建议格式：城市 + 国家',
          paramKey: 'destination_disambiguation',
        },
      ],
    };
  }

  private countryDisplayName(countryCode?: string): string {
    const code = String(countryCode || '').toUpperCase();
    if (!code) return '国家/地区';
    const map: Record<string, string> = {
      JP: '日本',
      KR: '韩国',
      CN: '中国',
      US: '美国',
      GB: '英国',
      FR: '法国',
      DE: '德国',
      IT: '意大利',
      ES: '西班牙',
      IS: '冰岛',
      GL: '格陵兰',
      SJ: '斯瓦尔巴',
    };
    return map[code] ?? code;
  }

  private toStableOptionValue(destination: string, countryCode: string): string {
    const normalized = this.normalizeText(destination)
      .replace(/\s+/g, '_')
      .replace(/[^\w\u4e00-\u9fa5]/g, '');
    return `${normalized || 'destination'}_${countryCode.toLowerCase()}`;
  }

  private dedupePois(pois: any[]): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const poi of pois) {
      const key = [
        String(poi?.place_id ?? poi?.id ?? ''),
        String(poi?.name ?? poi?.nameCN ?? '').trim().toLowerCase(),
        String(poi?.address ?? '').trim().toLowerCase(),
      ].join('|');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(poi);
    }
    return out;
  }

  private passesHardPoiGuards(
    poi: any,
    destinationCountry?: string,
    destinationRaw?: string,
  ): boolean {
    if (
      destinationCountry === 'IS' &&
      (poi?.poi_planning_anchor_slug ||
        poi?.source === 'poi_planning_fallback' ||
        poi?.source === 'poi_planning_matched_existing')
    ) {
      return true;
    }
    const riskLevel = String(poi?.metadata?.risk_level ?? '').toUpperCase();
    if (riskLevel === 'HIGH') return false;
    if (!poi?.name) return false;
    if (!poi?.address && !poi?.coordinates) return false;
    const category = String(poi?.category ?? poi?.type ?? '').toUpperCase();
    if (
      /(HOSPITAL|TRANSIT_HUB|GAS_STATION|CLINIC|AIRPORT_SERVICE|HOTEL|LODGING|ACCOMMODATION)/.test(
        category,
      )
    ) {
      return false;
    }
    if (!this.isPoiWithinDestinationBounds(poi, destinationRaw)) return false;
    if (!destinationCountry) return true;
    const poiCountry = String(
      poi?.countryCode ??
        poi?.country_code ??
        poi?.metadata?.countryCode ??
        '',
    ).toUpperCase();
    if (poiCountry && poiCountry !== destinationCountry) return false;
    return true;
  }

  private selectClusteredPois(
    candidates: any[],
    limit: number,
    startCoordinates?: { lat: number; lng: number },
    destinationRaw?: string,
  ): any[] {
    if (!Array.isArray(candidates) || candidates.length <= 1) {
      return Array.isArray(candidates) ? candidates.slice(0, limit) : [];
    }
    const maxLegKm = /冰岛|iceland/i.test(String(destinationRaw ?? '')) ? 60 : 35;
    const selected: any[] = [];
    const anchors: Array<{ lat: number; lng: number }> = [];
    if (startCoordinates) anchors.push(startCoordinates);
    for (const poi of candidates) {
      if (selected.length >= limit) break;
      const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
      const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        selected.push(poi);
        continue;
      }
      if (anchors.length === 0) {
        selected.push(poi);
        anchors.push({ lat, lng });
        continue;
      }
      const nearest = Math.min(
        ...anchors.map((a) => this.haversineKm(a, { lat, lng })),
      );
      if (nearest <= maxLegKm) {
        selected.push(poi);
        anchors.push({ lat, lng });
      }
    }
    if (selected.length === 0) return candidates.slice(0, limit);
    return selected.slice(0, limit);
  }

  private toPoiTraceNode(
    poi: any,
  ): { name: string; coordinates?: { lat: number; lng: number } } {
    const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
    const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
    return {
      name: String(poi?.name ?? ''),
      coordinates:
        Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
    };
  }

  private tryExtractStartCoordinates(
    origin: unknown,
  ): { lat: number; lng: number } | undefined {
    if (!origin || typeof origin !== 'object') return undefined;
    const lat = Number((origin as any)?.lat ?? NaN);
    const lng = Number((origin as any)?.lng ?? NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return { lat, lng };
  }

  private haversineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
  ): number {
    const toRadians = (v: number): number => (v * Math.PI) / 180;
    const earthRadius = 6371;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(a.lat)) *
        Math.cos(toRadians(b.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return earthRadius * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  }

  private estimateCommuteMinutesFromMode(
    km: number,
    mode?: 'walk' | 'drive' | 'transit' | 'mixed',
  ): number {
    const kmh =
      mode === 'walk' ? 4.5 : mode === 'drive' ? 24 : mode === 'transit' ? 16 : 10;
    return Math.max(5, Math.round((km / Math.max(1, kmh)) * 60));
  }

  private buildPoiTraceCommuteMatrix(
    selected: Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
    mode?: 'walk' | 'drive' | 'transit' | 'mixed',
    startCoordinates?: { lat: number; lng: number },
  ): {
    mode?: 'walk' | 'drive' | 'transit' | 'mixed';
    from_start?: boolean;
    nodes?: string[];
    minutes?: number[][];
  } | undefined {
    const valid = selected.filter((x) => !!x.coordinates);
    if (valid.length === 0) return undefined;
    const n = valid.length;
    const rows: number[][] = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => 0),
    );
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const km = this.haversineKm(valid[i].coordinates!, valid[j].coordinates!);
        rows[i][j] = this.estimateCommuteMinutesFromMode(km, mode);
      }
    }
    const nodes = valid.map((x) => x.name);
    if (!startCoordinates) {
      return { mode, from_start: false, nodes, minutes: rows };
    }
    const startRow = valid.map((x) => {
      const km = this.haversineKm(startCoordinates, x.coordinates!);
      return this.estimateCommuteMinutesFromMode(km, mode);
    });
    return {
      mode,
      from_start: true,
      nodes: ['START', ...nodes],
      minutes: [startRow, ...rows],
    };
  }

  private estimateNearestTotalCommuteMinutes(
    selected: Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
    mode?: 'walk' | 'drive' | 'transit' | 'mixed',
    startCoordinates?: { lat: number; lng: number },
  ): number {
    const valid = selected.filter((x) => !!x.coordinates);
    if (valid.length <= 1) return 0;
    const remaining = valid.map((x) => x.coordinates!) as Array<{
      lat: number;
      lng: number;
    }>;
    let current = startCoordinates ?? remaining[0];
    let total = 0;
    const visited = new Set<number>();
    while (visited.size < remaining.length) {
      let bestIdx = -1;
      let bestMinutes = Infinity;
      for (let i = 0; i < remaining.length; i += 1) {
        if (visited.has(i)) continue;
        const km = this.haversineKm(current, remaining[i]);
        const m = this.estimateCommuteMinutesFromMode(km, mode);
        if (m < bestMinutes) {
          bestMinutes = m;
          bestIdx = i;
        }
      }
      if (bestIdx < 0 || !Number.isFinite(bestMinutes)) break;
      total += bestMinutes;
      current = remaining[bestIdx];
      visited.add(bestIdx);
    }
    return total;
  }

  private isPoiWithinDestinationBounds(poi: any, destinationRaw?: string): boolean {
    const d = this.normalizeText(String(destinationRaw ?? ''));
    if (!d) return true;
    const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
    const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;

    // Iceland
    if (/冰岛|iceland/.test(d)) {
      return lat >= 63 && lat <= 67.8 && lng >= -25.5 && lng <= -13.0;
    }
    // Tokyo
    if (/东京|tokyo/.test(d)) {
      return lat >= 35.4 && lat <= 35.9 && lng >= 139.4 && lng <= 140.1;
    }
    return true;
  }

  private poiLocalityScore(
    poi: any,
    destinationCountry?: string,
    destinationCity?: string,
  ): number {
    let score = 0;
    const address = this.normalizeText(String(poi?.address ?? ''));
    const name = this.normalizeText(String(poi?.name ?? ''));
    const poiCountry = String(
      poi?.countryCode ??
        poi?.country_code ??
        poi?.metadata?.countryCode ??
        '',
    ).toUpperCase();

    if (destinationCountry && poiCountry) {
      score += poiCountry === destinationCountry ? 2 : -3;
    }

    if (destinationCity) {
      if (name.includes(destinationCity)) score += 2;
      if (address.includes(destinationCity)) score += 1.5;
    }
    return score;
  }

  /** GATE_EVAL 阶段（Phase 4b → gate-eval-phase.executor；Harness 失败 Kernel 内合成 BLOCK） */
  private async executeGateEvalPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    return runGateEvalPhase(this.createGateEvalPhaseHost(), {
      decisionState,
      state,
      request,
      context,
      llmProvider,
    });
  }

  private createPlanGenPhaseHost(): PlanGenPhaseHost {
    return {
      logger: this.logger,
      isKernelNativeExecution: (c) => this.isKernelNativeExecution(c),
      decisionKernel: this.decisionKernel,
      syncOrchestratorFromDecisionState: (newState, st) => {
        const derived = decisionStateToOrchestratorState(newState, st);
        Object.assign(st, derived);
      },
      syncPlanRoutingMetricsToTripPlan: (trip, itinerary) =>
        trip ? syncPlanRoutingMetricsToTripPlan(trip, itinerary) : trip,
      generateDecisionStepForStep: (st, step, actor) =>
        this.generateDecisionStepForStep(st, step, actor),
      onPlanGenDraftCaptured: (requestId, itinerary) =>
        recordPlanGenDraftSnapshot(this.decisionTrajectoryInterlocutor, requestId, itinerary),
      collectTrajectoryAfterPlanGen: async ({ request, state }) => {
        if (!this.trajectoryCollection || !state.itinerary || !state.gate_result) return;
        try {
          let complianceResult = state.compliance_result;
          if (!complianceResult && this.complianceAgent) {
            try {
              complianceResult = await this.complianceAgent.checkCompliance(
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
          await this.trajectoryCollection.collectTrajectory({
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
          this.logger.warn(`[Claude Orchestrator] 轨迹收集失败: ${e?.message}`);
        }
      },
      executePhaseViaKernel: (dso, st, phase, run) =>
        this.executePhaseViaKernel(dso, st, phase, run),
      executePlanGenStep: (req, ctx, st, llm) =>
        this.executePlanGenStep(req, ctx, st, llm),
      runAdaptiveReplanAfterPlanGen: (st) => this.runAdaptiveReplanAfterPlanGen(st),
    };
  }

  /** ITINERARY_ADJUST：PLAN_GEN 后用人格+环境约束精炼草案 */
  private runAdaptiveReplanAfterPlanGen(state: OrchestratorState): Promise<boolean> {
    return runAdaptiveReplanForAdjustState(state, this.skillsRegistry);
  }

  private createVerifyPhaseHost(): VerifyPhaseHost {
    return {
      logger: this.logger,
      isKernelNativeExecution: (c) => this.isKernelNativeExecution(c),
      decisionKernel: this.decisionKernel,
      syncOrchestratorFromDecisionState: (newState, st) => {
        const derived = decisionStateToOrchestratorState(newState, st);
        Object.assign(st, derived);
      },
      mergeVerificationIssuesIntoGateResult: (gate, issues) =>
        mergeVerificationIssuesIntoGateResult(gate, issues) ?? null,
      generateDecisionStepForStep: (st, step, actor) =>
        this.generateDecisionStepForStep(st, step, actor),
      executePhaseViaKernel: (dso, st, phase, run) =>
        this.executePhaseViaKernel(dso, st, phase, run),
      executeVerifyStep: (req, ctx, st, llm) =>
        this.executeVerifyStep(req, ctx, st, llm),
    };
  }

  /**
   * PLAN_GEN 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executePlanGen
   */
  private async executePlanGenPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    return runPlanGenPhase(this.createPlanGenPhaseHost(), {
      decisionState,
      state,
      request,
      context,
      llmProvider,
    });
  }

  /**
   * VERIFY 阶段：物理执行体 + 结构化 Verdict（plan-verify-loop 胶水消费）
   */
  async runVerifyPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<VerifyPhaseResult> {
    const newDecisionState = await runVerifyPhase(this.createVerifyPhaseHost(), {
      decisionState,
      state,
      request,
      context,
      llmProvider,
    });
    return {
      decisionState: newDecisionState,
      verdict: buildVerifyPhaseVerdict(state, newDecisionState),
    };
  }

  /** @deprecated 仅保留给直接 phase 调用方；子图请用 runVerifyPhase */
  private async executeVerifyPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    const result = await this.runVerifyPhase(decisionState, state, request, context, llmProvider);
    return result.decisionState;
  }

  private createOptimizePhaseHost(): OptimizePhaseHost {
    return {
      logger: this.logger,
      decisionKernel: this.decisionKernel,
      computeOptimizeFatigue: (planDraft) => this.computePlanDraftFatigue(planDraft),
    };
  }

  private createRepairPhaseHost(): RepairPhaseHost {
    return {
      logger: this.logger,
      isKernelNativeExecution: (c) => this.isKernelNativeExecution(c),
      decisionKernel: this.decisionKernel,
      syncOrchestratorFromDecisionState: (newState, st) => {
        const derived = decisionStateToOrchestratorState(newState, st);
        Object.assign(st, derived);
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
        this.generateDecisionStepForStep(st, step, actor),
      executePhaseViaKernel: (dso, st, phase, run) =>
        this.executePhaseViaKernel(dso, st, phase, run),
      executeRepairStep: (req, ctx, st, llm) =>
        this.executeRepairStep(req, ctx, st, llm),
      recordRepairObservability: (p) => this.recordRepairPhaseObservability(p),
      runTravelRecompileAfterRepair: (p) =>
        runTravelRecompileAfterRepair({
          state: p.state,
          request: p.request,
          compiler: this.travelCompiler,
          graphStore: this.travelGraphStore,
          configService: this.configService,
          itineraryBeforeRepair: p.itineraryBeforeRepair,
          repairApplied: p.repairApplied,
          verificationIssues: p.verificationIssues,
          onProgress: (view) => {
            void this.routeAndRunTaskProgress?.reportCtreCompilationProgress(view);
          },
        }),
    };
  }

  private computePlanDraftFatigue(planDraft: Itinerary | undefined): number | undefined {
    if (!planDraft?.days?.length || !this.tdfpmCalculator) return undefined;
    try {
      const contexts = this.itineraryToTdfpmDayContexts(planDraft);
      const scores = contexts.map((ctx) => this.tdfpmCalculator!.computeFatigueScore(ctx).fatigueScore);
      const maxScore = Math.max(...scores, 0);
      const fatigue = Math.min(1, maxScore / 100);
      this.logger.debug(`[Claude Orchestrator] TDFPM fatigue: maxScore=${maxScore}, fatigue=${fatigue.toFixed(2)}`);
      return fatigue;
    } catch (e: any) {
      this.logger.warn(`[Claude Orchestrator] TDFPM 计算失败: ${e?.message}`);
      return undefined;
    }
  }

  async runOptimizePhase(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    return runOptimizePhase(this.createOptimizePhaseHost(), { state, decisionState });
  }

  async runRepairPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    return runRepairPhase(this.createRepairPhaseHost(), {
      decisionState,
      state,
      request,
      context,
      llmProvider,
    });
  }

  persistHarnessTraceOnReturnToResearch(decisionState: DecisionState | undefined): void {
    persistHarnessTraceOnPlanVerifyReturnToResearch(this.decisionKernel, decisionState);
  }

  computeRepairFatigue(planDraft: Itinerary | undefined): number | undefined {
    return this.computePlanDraftFatigue(planDraft);
  }

  /** @deprecated 子图请用 runRepairPhase */
  private async executeRepairPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    return this.runRepairPhase(decisionState, state, request, context, llmProvider);
  }

  private async recordRepairPhaseObservability(params: {
    newState: DecisionState;
    state: OrchestratorState;
    request: RouteAndRunRequestDto;
  }): Promise<void> {
    const { newState, state, request } = params;
    try {
      const audit_report = AuditReportGenerator.generate(newState, state);
      const normalizedContract = normalizeDecisionOsAuditContract(audit_report);
      const normalizedAudit = this.normalizeDecisionOsAuditReport(normalizedContract.audit_report);
      if (normalizedContract.violations.length > 0) {
        for (const v of normalizedContract.violations) {
          this.promMetrics?.recordDecisionOsAuditContractViolation({
            stage: 'REPAIR',
            field: v.field,
            reason: v.reason,
          });
        }
      }
      const score = normalizedAudit.session_consistency_score;
      const domAxiom = pickDominantAxiom(
        matchAxioms(
          buildAxiomMatchContext({
            message: request?.message ?? (state as any)?.trip_plan_request?.message,
            constraints: (state as any)?.trip_plan_request?.constraints,
            trip: (state as any)?.trip_plan_request,
            tripId: (state as any)?.trip_plan_request?.trip_id,
            itinerary: (state as any)?.itinerary,
            routeAndRunIntent: (state.metadata as Record<string, unknown>)?.route_and_run_intent as any,
            clarificationAnswers: (state.metadata as Record<string, unknown>)?.clarification_answers as any,
          }),
        ),
      );
      const expectedCid = domAxiom?.axiom?.cid;
      const actualCid = normalizedAudit.dominant_cid;
      const axiomMatchSource = axiomMatchSourceForMetrics(domAxiom);
      this.promMetrics?.recordSessionConsistencyScore({
        score,
        axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
        cid: actualCid ?? expectedCid ?? 'UNKNOWN',
        terminal: false,
      });

      const hasRealTraces =
        Array.isArray((audit_report as any)?.repair_traces) && (audit_report as any).repair_traces.length > 0;
      if (hasRealTraces || typeof score === 'number') {
        const deltaReason = normalizedAudit.delta_reason;
        const deltaUtility = normalizedAudit.delta_utility;
        const delta_reason_kind =
          deltaReason === 'aligned'
            ? ('aligned' as const)
            : deltaReason
              ? ('mismatch' as const)
              : ('unknown' as const);
        const is_intent_revised = normalizedAudit.intent_revision_flag;
        const utility_drift_severity = (() => {
          if (!Number.isFinite(deltaUtility)) return 'unknown' as const;
          const a = Math.abs(deltaUtility);
          if (a <= 5) return 'low' as const;
          if (a <= 20) return 'medium' as const;
          return 'high' as const;
        })();

        try {
          if (domAxiom?.axiom_id && expectedCid && actualCid && expectedCid !== actualCid) {
            this.promMetrics?.recordAxiomDominantCidMismatch({
              axiom_id: domAxiom.axiom_id,
              expected_cid: normalizeAxiomCidForMetrics(expectedCid),
              actual_cid: normalizeAxiomCidForMetrics(actualCid),
              stage: 'REPAIR',
              match_source: axiomMatchSource,
            });
          }
          if (delta_reason_kind === 'mismatch') {
            this.promMetrics?.recordAxiomSimRealMismatch({
              axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
              expected_cid: normalizeAxiomCidForMetrics(expectedCid),
              actual_cid: normalizeAxiomCidForMetrics(actualCid),
              stage: 'REPAIR',
              match_source: axiomMatchSource,
              severity: domAxiom?.axiom?.severity ?? 'UNKNOWN',
            });
          }
        } catch {
          // best-effort only
        }

        this.logger.log(
          JSON.stringify({
            event: 'decision_os_audit_report',
            phase: 'REPAIR',
            terminal: false,
            request_id: state.request_id,
            dominant_cid: normalizedAudit.dominant_cid,
            session_consistency_score: normalizedAudit.session_consistency_score,
            delta_reason_kind,
            is_intent_revised,
            utility_drift_severity,
            audit_report: normalizedAudit.audit_report,
          }),
        );
      }
    } catch {
      // best-effort only
    }
  }

  /**
   * Phase B: Conductor 只调 Kernel - 执行阶段并原子同步
   */
  private async executePhaseViaKernel(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    phaseName: string,
    executeFn: () => Promise<void>,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) {
      await executeFn();
      return this.executeStateUpdateStep(state, decisionState) ?? decisionState;
    }
    const stepStartTime = Date.now();
    const updated = await this.decisionKernel.executePhase(decisionState, state, phaseName, executeFn);
    const derived = decisionStateToOrchestratorState(updated, state);
    Object.assign(state, derived);
    state.decision_log.push({
      request_id: state.request_id,
      step: 'STATE_UPDATE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: `步骤「${phaseName}」完成后，将内存状态写回决策存储`,
      outputs_summary: `决策状态已同步，版本号 ${updated.systemState?.version ?? '?'}。`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { duration_ms: Date.now() - stepStartTime },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    return updated;
  }

  /**
   * 从 ContextPackage 提取 WorldModelContext（P3: world.buildContext 与 DSO 打通）
   * 查找 type=WORLD_MODEL 且 data 含 physical/human/routeDirection 的 block
   */
  private extractWorldModelFromContextPackage(decisionState: DecisionState | undefined): { physical?: unknown; human?: unknown; routeDirection?: unknown } | undefined {
    const pkg = decisionState?.contextPackage;
    if (!pkg?.blocks?.length) return undefined;
    const block = pkg.blocks.find((b: any) => b.type === 'WORLD_MODEL' && b.data?.physical);
    return block?.data;
  }

  /**
   * INTAKE 后 userIntent 已合并进 patch：解析区域意图并写入 DSO.poiPlanning（命中黄金圈等则自动产出骨架）
   */
  private applyPoiPlanningToPatch(
    patch: DecisionStatePatch,
    decisionState: DecisionState,
    state: OrchestratorState,
  ): void {
    if (!this.regionAnchorPlanning) return;
    const ui = patch.userIntent ?? decisionState.userIntent;
    if (!ui) return;
    const q = (state.metadata as { intake_user_message?: string }).intake_user_message;
    const routePrimary = (state.metadata as Record<string, unknown>)?.route_and_run_intent as
      | { primary?: string }
      | undefined;
    const isItineraryAdjust = routePrimary?.primary === 'ITINERARY_ADJUST';

    if (
      isItineraryAdjust &&
      shouldSuppressTripRegionIdForItineraryAdjustPoiPlanning(typeof q === 'string' ? q : undefined, (text) => {
        const hit = this.regionAnchorPlanning!.resolveAndBuildSlice({}, text);
        return {
          regionIntent: hit?.routeIntent?.regionId
            ? { regionId: hit.routeIntent.regionId }
            : undefined,
          confidence: hit?.routeIntent?.confidence ?? 0,
        };
      })
    ) {
      const slice = buildCorridorAdjustPoiPlanningSlice({
        totalBudgetMinutes: ui.totalBudgetMinutes,
      });
      patch.poiPlanning = slice;
      const meta = state.metadata as Record<string, unknown>;
      meta.poiPlanningFeasibility = slice.schedulePlan?.feasibility;
      meta.poiPlanningBudgetGateApplied = false;
      meta.poiPlanningResolution = slice.resolution;
      this.logger.debug(
        `[STATE_UPDATE] poiPlanning corridor_adjust anchors=0 excluded=${slice.poiPlan?.excludedPoiIds?.length ?? 0}`,
      );
      return;
    }

    const userRoute: Partial<UserRouteIntent> = {
      regionId: isItineraryAdjust ? undefined : ui.regionId,
      mustIncludePoiIds: ui.mustIncludePoiIds,
      excludePoiIds: ui.excludePoiIds,
      totalBudgetMinutes: ui.totalBudgetMinutes,
      pace: ui.pace,
      styleTags: ui.styleTags,
      availableStartTime: ui.availableStartTime,
      availableEndTime: ui.availableEndTime,
    };
    const slice = this.regionAnchorPlanning.resolveAndBuildSlice(userRoute, q);
    if (slice) {
      patch.poiPlanning = slice;
      const meta = state.metadata as Record<string, unknown>;
      meta.poiPlanningFeasibility = slice.schedulePlan?.feasibility;
      meta.poiPlanningBudgetGateApplied = slice.budgetGateApplied === true;
      meta.poiPlanningResolution = slice.resolution;
      this.logger.debug(
        `[STATE_UPDATE] poiPlanning region=${slice.routeIntent?.regionId ?? 'n/a'} anchors=${slice.poiPlan?.requiredAnchorPoiIds?.join(',') ?? ''} budgetGate=${slice.budgetGateApplied}`,
      );
    }
  }

  /**
   * STATE_UPDATE 步骤（Phase 4b → state-update-phase.executor）
   */
  private async executeStateUpdateStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    return runStateUpdatePhase(this.createStateUpdatePhaseHost(), { state, decisionState });
  }

  /**
   * RESEARCH 步骤：调用 skills 获取硬数据
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * @deprecated 优先使用 Kernel.executeResearch。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executeResearchStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
    decisionState?: DecisionState,
  ): Promise<void> {
    state.current_step = 'RESEARCH';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 RESEARCH 步骤...`);

    try {
      const followupIntent = (state.metadata as any)?.transport_research_followup === true;
      if (followupIntent && this.researchPriorSnapshot) {
        const has =
          state.research_data &&
          typeof state.research_data === 'object' &&
          Object.keys(state.research_data as object).length > 0;
        if (!has) {
          const loaded = await this.researchPriorSnapshot.load(request);
          if (loaded && Object.keys(loaded).length > 0) {
            state.research_data = loaded as any;
            state.decision_log.push({
              request_id: state.request_id,
              step: 'RESEARCH',
              actor: 'Orchestrator',
              inputs_summary: 'transport_research_followup → prior research snapshot restore (fallback RESEARCH)',
              outputs_summary: `PRIOR_RESEARCH_SNAPSHOT_RESTORED keys=${Object.keys(loaded).length}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
              metadata: {
                system_action: 'PRIOR_RESEARCH_SNAPSHOT_RESTORED',
                research_mode: 'fallback_executor',
              },
            });
          }
        }
      }
      const transportResearchOnly =
        followupIntent &&
        state.research_data &&
        typeof state.research_data === 'object' &&
        Object.keys(state.research_data).length > 0;
      const researchData: Record<string, any> = transportResearchOnly
        ? (JSON.parse(JSON.stringify(state.research_data)) as Record<string, any>)
        : {};
      const evidenceRefs: string[] = [];

      // 调用 Skills 收集数据
      if (this.skillsRegistry && state.trip_plan_request) {
        const tripRequest = state.trip_plan_request;

        // 1. 交通搜索（transport.search）- CRITICAL（与 ResearchExecutor 共享回填 + 规范化）
        try {
          const transportSkill = this.skillsRegistry.getSkill('transport.search');
          const dsoForHydration =
            decisionState ??
            ({
              userIntent: {},
              tripState: {},
              environmentState: {},
              systemState: { requestId: state.request_id ?? '' },
              requestId: state.request_id,
            } as DecisionState);
          const sanitizedRecentMessages = this.contextSlidingWindow.slice(
            'orchestrator_claude',
            request.conversation_context?.recent_messages,
          );
          const hydration = hydrateTripPlanTransportEndpoints(dsoForHydration, tripRequest, {
            recentMessages: sanitizedRecentMessages,
          });
          const { trip: hydratedTrip, patchedFields } = hydration;
          if (patchedFields.length > 0) {
            researchData.transport_endpoint_hydration = {
              fields: patchedFields,
              provenance: hydration.provenance,
              ...(hydration.derived_from_history?.length
                ? {
                    derived_from_history: hydration.derived_from_history,
                    fact_signature: hydration.fact_signature,
                  }
                : {}),
              ...(hydration.geo_context_hint ? { geo_context_hint: hydration.geo_context_hint } : {}),
            };
          }
          const normalized = normalizeTransportEndpointsForSkill(hydratedTrip ?? tripRequest);
          if (transportSkill && normalized) {
            const transportResult = await transportSkill.execute({
              origin: normalized.origin,
              destination: normalized.destination,
              mode: tripRequest.mode || 'mixed',
            });
            researchData.transport_evidence = transportResult;
            if (transportResult?.evidence_id) {
              evidenceRefs.push(transportResult.evidence_id);
            }
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('transport.search', error);
          
          // 如果是依赖缺失，标记为缺失但继续执行（降级）
          if (strategy.shouldDegrade && strategy.shouldMarkMissing) {
            this.logger.warn(`[Claude Orchestrator] transport.search 降级处理: ${error?.message}`);
            const unresolvedCoords = error?.message?.includes(TRANSPORT_SEARCH_UNRESOLVED_COORDS_MARKER);
            researchData.transport_evidence = {
              missing: true,
              error: error?.message,
              degraded: true,
              degradation_reason: unresolvedCoords
                ? 'origin_destination_unresolved'
                : 'dependency_missing',
              user_guidance: TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH,
              suggested_action: TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
            };
            // 继续执行，不抛出错误
          } else if (strategy.shouldReject) {
            // 如果是执行失败，拒绝请求
            this.logger.error(`[Claude Orchestrator] ${strategy.errorMessage}`);
            throw new Error(strategy.errorMessage);
          } else if (strategy.shouldMarkMissing) {
            // 如果是重要技能失败，标记缺失但继续执行
            this.logger.warn(`[Claude Orchestrator] transport.search 失败: ${error?.message}`);
            researchData.transport_evidence = { missing: true, error: error?.message };
          }
        }

        if (!transportResearchOnly) {
        // 2. POI 搜索（poi.search）- IMPORTANT（Phase 3：golden_circle 时 query 增强 + 第二路锚点检索）
        let poiSearchCtxForTrace: ReturnType<typeof buildPoiSearchContext> | undefined;
        try {
          const poiSkill = this.skillsRegistry.getSkill('poi.search');
          if (poiSkill) {
            const destinationRaw = typeof tripRequest.destination === 'string'
              ? tripRequest.destination
              : 'destination'; // 如果是坐标，使用默认查询
            const normalizedDestination = destinationRaw.trim().toLowerCase();
            const ambiguousCityCountryMap: Record<string, string> = {
              '东京': '日本',
              tokyo: 'Japan',
              '大阪': '日本',
              osaka: 'Japan',
              '京都': '日本',
              kyoto: 'Japan',
              '首尔': '韩国',
              seoul: 'Korea',
            };
            const countryHint = ambiguousCityCountryMap[normalizedDestination];
            const destinationQueryRaw = countryHint
              ? `${destinationRaw} ${countryHint}`
              : destinationRaw;
            const lat =
              typeof tripRequest.destination === 'object' ? tripRequest.destination.lat : undefined;
            const lng =
              typeof tripRequest.destination === 'object' ? tripRequest.destination.lng : undefined;
            const intakeRaw = (state.metadata as { intake_user_message?: string })?.intake_user_message;
            const userMsgForRetrieval = [
              typeof intakeRaw === 'string' ? intakeRaw.trim() : '',
              request.message ?? '',
            ]
              .filter(Boolean)
              .join('\n');
            const destinationQuery =
              resolveResearchPoiBaseQueryHint({
                tripDestination: destinationRaw,
                userMessage: userMsgForRetrieval,
              }) ?? destinationQueryRaw;
            const plan = buildCandidateRetrievalQueryPlan(
              userMsgForRetrieval,
              destinationQuery,
              decisionState?.poiPlanning,
            );
            const poiSearchCtx = buildPoiSearchContext({
              destination: tripRequest.destination,
              decisionState,
              itinerary: state.itinerary,
              userMessage: userMsgForRetrieval,
              travelPreference: (state.metadata as Record<string, unknown> | undefined)
                ?.travel_preference_snapshot as Record<string, unknown> | undefined,
            });
            poiSearchCtxForTrace = poiSearchCtx;
            const semanticGapsForQuery = detectItineraryGapsV1({
              poiSearchCtx,
              decisionState,
              itinerary: state.itinerary,
            });
            const gapSuffix = gapRetrievalIntentQuerySuffix(semanticGapsForQuery);
            const scenicPlan = buildPoiSearchPlanFromContext({
              baseQuery: destinationQuery,
              poiSearchCtx,
              gapSuffix,
              boostTerms: plan.boostedTerms,
              variant: 'scenic',
            });
            const generalPlan = buildPoiSearchPlanFromContext({
              baseQuery: destinationQuery,
              poiSearchCtx,
              gapSuffix,
              boostTerms: plan.boostedTerms.length > 0 ? plan.boostedTerms : undefined,
              variant: 'general',
            });

            const scenicResult = await poiSkill.execute({
              query: scenicPlan.contextualizedQuery,
              queryRewriteResult: scenicPlan.rewrite,
              multiRouteSearch: true,
              limit: 12,
              lat,
              lng,
              category: 'ATTRACTION',
            } as any);
            const generalResult = await poiSkill.execute({
              query: generalPlan.contextualizedQuery,
              queryRewriteResult: generalPlan.rewrite,
              multiRouteSearch: true,
              limit: 12,
              lat,
              lng,
            } as any);
            const scenicPois = Array.isArray(scenicResult?.pois)
              ? scenicResult.pois
              : Array.isArray(scenicResult)
                ? scenicResult
                : [];
            const generalPois = Array.isArray(generalResult?.pois)
              ? generalResult.pois
              : Array.isArray(generalResult)
                ? generalResult
                : [];
            let merged = mergeResearchPoiLists(scenicPois, generalPois, 16);
            const extraSubQueries: Record<string, string> = {};
            if (poiSearchCtx.preferOffbeatAttractions) {
              const offbeatPlan = buildPoiSearchPlanFromContext({
                baseQuery: destinationQuery,
                poiSearchCtx,
                gapSuffix,
                boostTerms: plan.boostedTerms,
                variant: 'offbeat',
              });
              extraSubQueries.offbeat = offbeatPlan.contextualizedQuery;
              const offbeatResult = await poiSkill.execute({
                query: offbeatPlan.contextualizedQuery,
                queryRewriteResult: offbeatPlan.rewrite,
                multiRouteSearch: true,
                limit: 10,
                lat,
                lng,
                category: 'ATTRACTION',
              } as any);
              const offbeatPois = Array.isArray(offbeatResult?.pois)
                ? offbeatResult.pois
                : Array.isArray(offbeatResult)
                  ? offbeatResult
                  : [];
              merged = mergeResearchPoiLists(offbeatPois, merged, 20);
            }
            const regionSupplementLanes = buildSpecialRegionSupplementLanes(plan.regionTags, {
              poiSearchCtx,
              boostedTerms: plan.boostedTerms.length > 0 ? plan.boostedTerms : undefined,
              gapSuffix,
            });
            let supplementMergeCap = 22;
            for (const lane of regionSupplementLanes) {
              extraSubQueries[lane.key] = lane.plan.contextualizedQuery;
              const laneResult = await poiSkill.execute({
                query: lane.plan.contextualizedQuery,
                queryRewriteResult: lane.plan.rewrite,
                multiRouteSearch: true,
                limit: lane.limit,
                lat,
                lng,
                category: 'ATTRACTION',
              } as any);
              const lanePois = Array.isArray(laneResult?.pois)
                ? laneResult.pois
                : Array.isArray(laneResult)
                  ? laneResult
                  : [];
              merged = mergeResearchPoiLists(lanePois, merged, supplementMergeCap);
              supplementMergeCap = Math.min(34, supplementMergeCap + 4);
            }
            merged = filterPoisByRejectedIds(merged, poiSearchCtx.rejectedPoiIds);
            const countryCodeResearch =
              typeof tripRequest.destination === 'string' &&
              /^[A-Za-z]{2}$/.test(tripRequest.destination.trim())
                ? tripRequest.destination.trim().toUpperCase()
                : undefined;
            const discovery = await runOpenWorldDiscoveryPipeline(
              {
                userMessage: userMsgForRetrieval,
                countryCode: countryCodeResearch,
                destinationHint: destinationRaw,
                regionTags: plan.regionTags,
                existingPoiEvidence: merged,
              },
              { llmService: this.llmService },
            );
            if (discovery.stubs.length > 0) {
              merged = mergeDiscoveryStubsIntoPoiEvidence(merged, discovery.stubs);
              researchData.open_world_discovery = discovery;
              researchData.open_world_discovery_applied_at = new Date().toISOString();
            }
            researchData.poi_evidence = merged;
            const semanticGaps = semanticGapsForQuery;
            researchData.retrieval_decision_trace = buildPlanningRetrievalDecisionTrace({
              poiSearchCtx,
              scenicQuery: scenicPlan.contextualizedQuery,
              generalQuery: generalPlan.contextualizedQuery,
              extraSubQueries: Object.keys(extraSubQueries).length ? extraSubQueries : undefined,
              mergedPoiCount: merged.length,
              semanticGaps,
              retrievalReason: 'orchestrator:executeResearchStep(poi.search)',
            });
            merged.forEach((poi: any) => {
              if (poi?.evidence_id) evidenceRefs.push(poi.evidence_id);
            });
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('poi.search', error);
          this.logger.warn(`[Claude Orchestrator] poi.search 失败: ${error?.message}`);
          if (strategy.shouldMarkMissing) {
            researchData.poi_evidence = { missing: true, error: error?.message };
          }
          researchData.retrieval_decision_trace = buildFailedRetrievalTrace({
            kind: 'planning',
            message: `poi.search_failed:${error?.message ?? 'unknown'}`,
            poiSearchCtx: poiSearchCtxForTrace,
          });
        }

        // 3. 开放时间查询（opening_hours.get）- IMPORTANT
        try {
          const openingHoursSkill = this.skillsRegistry.getSkill('opening_hours.get');
          if (openingHoursSkill && researchData.poi_evidence && !researchData.poi_evidence.missing) {
            const poiIds = collectOpeningHoursPoiIdsForHydration(
              state.itinerary,
              researchData as Record<string, unknown>,
            );

            if (poiIds.length > 0) {
              const openingHoursResult = await openingHoursSkill.execute({
                poi_ids: poiIds,
              });
              researchData.opening_hours_evidence = openingHoursResult.opening_hours || openingHoursResult;
              
              // 提取证据引用
              if (openingHoursResult.opening_hours && Array.isArray(openingHoursResult.opening_hours)) {
                openingHoursResult.opening_hours.forEach((item: any) => {
                  if (item.evidence_id) evidenceRefs.push(item.evidence_id);
                });
              }
            }
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('opening_hours.get', error);
          this.logger.warn(`[Claude Orchestrator] opening_hours.get 失败: ${error?.message}`);
          if (strategy.shouldMarkMissing) {
            researchData.opening_hours_evidence = { missing: true, error: error?.message };
          }
        }

        // 4. DEM（Registry: dem.get_profile）- OPTIONAL
        try {
          const demSkill = this.skillsRegistry.getSkill('dem.get_profile');
          if (demSkill && tripRequest.destination) {
            const demResult = await demSkill.execute({
              destination: tripRequest.destination,
              origin: tripRequest.origin,
            });
            researchData.dem_metrics = demResult;
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('dem.get_profile', error);
          if (strategy.shouldIgnore) {
            this.logger.debug(`[Claude Orchestrator] dem.get_profile 失败（已忽略）: ${error?.message}`);
          } else {
            this.logger.warn(`[Claude Orchestrator] dem.get_profile 失败: ${error?.message}`);
          }
        }

        // 5. 风险检查（使用现有的 geo.check.hazard.zones）- OPTIONAL
        try {
          const riskSkill = this.skillsRegistry.getSkill('geo.check.hazard.zones');
          if (riskSkill && tripRequest.destination) {
            // 如果目的地是坐标
            const coords = typeof tripRequest.destination === 'object' 
              ? tripRequest.destination 
              : undefined;
            
            if (coords) {
              const riskResult = await riskSkill.execute({
                lat: coords.lat,
                lng: coords.lng,
              });
              researchData.risk_assessment = riskResult;
            }
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('geo.check.hazard.zones', error);
          if (strategy.shouldIgnore) {
            this.logger.debug(`[Claude Orchestrator] geo.check.hazard.zones 失败（已忽略）: ${error?.message}`);
          } else {
            this.logger.warn(`[Claude Orchestrator] geo.check.hazard.zones 失败: ${error?.message}`);
          }
        }

        // 6. 领域智能体——世界模型数据
        await this.collectWorldModelData(tripRequest, researchData, evidenceRefs);

        // 7. 护城河扩展：预测数据（并行获取）
        await this.collectPredictionData(tripRequest, researchData, evidenceRefs, request);
        }
      }

      state.research_data = researchData;

      if (followupIntent) {
        (state.metadata as any) = { ...(state.metadata ?? {}), transport_research_followup: false };
        if (transportResearchOnly) {
          const te = researchData.transport_evidence as Record<string, any> | undefined;
          const stillBad =
            te &&
            (te.degraded === true || te.missing === true) &&
            te.suggested_action === TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY;
          if (stillBad) {
            (state.metadata as any).transport_clarify_force_reinject = true;
            state.decision_log.push({
              request_id: state.request_id,
              step: 'RESEARCH',
              actor: 'Orchestrator',
              inputs_summary: 'transport_only (fallback) still degraded transport_evidence',
              outputs_summary: 'TRANSPORT_FOLLOWUP_STILL_DEGRADED → allow clarify reinject',
              evidence_refs: [],
              timestamp: new Date().toISOString(),
              metadata: { system_action: 'TRANSPORT_FOLLOWUP_STILL_DEGRADED' },
            });
          } else {
            (state.metadata as any).is_followup_transport_repair = true;
          }
        }
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'RESEARCH',
        actor: 'Orchestrator',
        inputs_summary: '通过技能与外部来源拉取交通、景点、开放时间与风险等硬数据',
        outputs_summary: `${formatResearchOutputsZh(Object.keys(researchData))} 证据引用 ${evidenceRefs.length} 条。`,
        evidence_refs: evidenceRefs,
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          data_types: Object.keys(researchData),
          ...(transportResearchOnly ? { system_action: 'TRANSPORT_RESEARCH_FOLLOWUP', research_mode: 'transport_only' } : {}),
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'RESEARCH', 'LocalInsight');
      await this.researchPriorSnapshot?.save(request, researchData as Record<string, unknown>);
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] RESEARCH 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * GATE_EVAL 步骤：执行 Should-Exist Gate 决策
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * 强制：Gate 在 Plan 之前执行
   * @deprecated 优先使用 Kernel.executeGateEval。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executeGateEvalStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'GATE_EVAL';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 GATE_EVAL 步骤...`);

    try {
      // ========== 1. 准备度检查（规划阶段跳过 Readiness Pack） ==========
      let readinessCheckResult: any = null;
      let readinessBlockers: any[] = [];
      let readinessMust: any[] = [];
      let rulesNeedingDecision: any[] = [];

      const gateStartStr =
        (state.trip_plan_request as { start_date?: string; date_range?: { start_date?: string } })
          ?.start_date ?? state.trip_plan_request?.date_range?.start_date;
      const gateTripStart = gateStartStr ? new Date(gateStartStr) : undefined;
      const skipReadinessPackInGate = shouldSkipAgentReadinessPackCheck(
        request,
        gateTripStart,
        request.message ?? '',
      );

      if (this.readinessService && state.trip_plan_request && !skipReadinessPackInGate) {
        try {
          const destination = typeof state.trip_plan_request.destination === 'string'
            ? state.trip_plan_request.destination
            : `${state.trip_plan_request.destination.lat},${state.trip_plan_request.destination.lng}`;

          // 构建 TripContext
          const tripContext = this.extractTripContextFromState(state);

          // 提取坐标（如果有）
          const geoLat = typeof state.trip_plan_request.destination === 'object'
            ? state.trip_plan_request.destination.lat
            : undefined;
          const geoLng = typeof state.trip_plan_request.destination === 'object'
            ? state.trip_plan_request.destination.lng
            : undefined;

          // 执行准备度检查
          readinessCheckResult = await this.readinessService.checkFromDestination(
            destination,
            tripContext,
            {
              enhanceWithGeo: !!(geoLat && geoLng),
              geoLat,
              geoLng,
              lang: 'zh', // 默认使用中文
            }
          );

          // 提取 blocker 和 must
          readinessBlockers = readinessCheckResult.findings.flatMap((f: any) => f.blockers || []);
          readinessMust = readinessCheckResult.findings.flatMap((f: any) => f.must || []);

          // 检查是否有需要用户决策的规则
          if (this.userDecisionService) {
            rulesNeedingDecision = [...readinessBlockers, ...readinessMust].filter((item: any) => {
              // 检查是否有 userDecision 且有问题列表
              return item.userDecision?.questions && item.userDecision.questions.length > 0;
            });
          }

          this.logger.debug(
            `[Claude Orchestrator] 准备度检查完成: ` +
            `blockers=${readinessBlockers.length}, ` +
            `must=${readinessMust.length}, ` +
            `需要用户决策=${rulesNeedingDecision.length}`
          );
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] 准备度检查失败: ${error?.message}`, error?.stack);
          // 准备度检查失败不影响 Gate 评估，继续执行
        }
      }

      // ========== 1.5. 护城河扩展：失败风险预测检查 ==========
      if (
        this.failureRiskPredictionService &&
        state.research_data?.failure_risk_prediction &&
        request.route_direction_id
      ) {
        try {
          const failureRiskPrediction = state.research_data.failure_risk_prediction;
          const highRiskDays = failureRiskPrediction.predictions.filter(
            (p: any) => p.riskLevel === 'HIGH',
          );

          if (highRiskDays.length > 0) {
            // 如果有高风险日期，添加到violations
            if (!readinessBlockers) {
              readinessBlockers = [];
            }
            readinessBlockers.push({
              type: 'FAILURE_RISK',
              severity: 'HARD',
              message: {
                zh: `预测到第${highRiskDays.map((d: any) => d.day).join(', ')}天存在高风险，建议调整行程日期`,
                en: `High risk predicted for days ${highRiskDays.map((d: any) => d.day).join(', ')}, consider adjusting dates`,
              },
              evidence: [
                {
                  sourceId: `failure_risk_prediction_${Date.now()}`,
                  source: 'FailureRiskPredictionService',
                },
              ],
            });

            this.logger.debug(
              `[Claude Orchestrator] 失败风险预测检查: 发现${highRiskDays.length}个高风险日期`,
            );
          }
        } catch (error: any) {
          this.logger.warn(
            `[Claude Orchestrator] 失败风险预测检查失败: ${error?.message}`,
            error?.stack,
          );
          // 失败风险预测检查失败不影响 Gate 评估，继续执行
        }
      }

      // ========== 2. 根据准备度检查结果决定 Gate 结果 ==========
      // 如果有 blocker 且不需要用户决策，直接 BLOCK
      if (readinessBlockers.length > 0 && rulesNeedingDecision.length === 0) {
        state.gate_result = {
          gate_result: 'BLOCK',
          violations: readinessBlockers.map((item: any) => ({
            type: 'SAFETY' as const,
            severity: 'HARD' as const,
            detail: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
            evidence_refs: item.evidence?.map((e: any) => e.sourceId) || [],
          })),
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: readinessBlockers.flatMap((item: any) => item.evidence?.map((e: any) => e.sourceId) || []),
        };

        // 生成准备度检查的决策日志条目（按三人格分类）
        if (this.readinessService) {
          const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(
            readinessCheckResult,
            state.request_id
          );
          state.decision_log.push(...readinessDecisionLogs);
        }

        // 添加汇总日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'GATE_EVAL',
          actor: 'Gatekeeper',
          inputs_summary: '评估行程可行性（准备度检查）',
          outputs_summary: `Gate 结果: BLOCK（准备度检查发现 ${readinessBlockers.length} 个阻塞项）`,
          evidence_refs: state.gate_result.evidence_refs || [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            readiness_blockers: readinessBlockers,
            guardian: 'ABU' as GuardianType,
          },
        });

        state.metadata.last_updated_at = new Date().toISOString();
        return;
      }

      // 如果有需要用户决策的规则，返回 NEED_USER_CONFIRM
      if (rulesNeedingDecision.length > 0) {
        state.gate_result = {
          gate_result: 'NEED_USER_CONFIRM',
          violations: [],
          required_adjustments: [],
          confidence: 0.8,
          evidence_refs: [],
          readiness_questions: rulesNeedingDecision.map((item: any) => ({
            ruleId: item.id,
            questions: item.userDecision.questions,
            category: item.category,
            severity: item.severity,
          })),
        };

        // 生成准备度检查的决策日志条目（按三人格分类）
        if (readinessCheckResult) {
          if (this.readinessService) {
            const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(
              readinessCheckResult,
              state.request_id
            );
            state.decision_log.push(...readinessDecisionLogs);
          }
        }

        // 添加用户决策汇总日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'GATE_EVAL',
          actor: 'Gatekeeper',
          inputs_summary: '评估行程可行性（准备度检查）',
          outputs_summary: `Gate 结果: NEED_USER_CONFIRM（需要用户回答 ${rulesNeedingDecision.length} 个规则的问题）`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            readiness_questions: rulesNeedingDecision.map((item: any) => ({
              ruleId: item.id,
              questionCount: item.userDecision.questions.length,
              category: item.category,
            })),
            guardian: 'ABU' as GuardianType,
          },
        });

        state.metadata.last_updated_at = new Date().toISOString();
        return;
      }

      // ========== 3. 调用 Gatekeeper Agent 执行其他 Gate 评估 ==========
      if (this.gatekeeperAgent && state.trip_plan_request) {
        const gateResult = await this.gatekeeperAgent.evaluateGate(
          state.trip_plan_request,
          state.research_data || {},
          state,
        );

        // 合并准备度检查的 must 项到 required_adjustments
        if (readinessMust.length > 0) {
          gateResult.required_adjustments = [
            ...gateResult.required_adjustments,
            ...readinessMust.map((item: any) => ({
              action: 'REPLACE_SEGMENT' as const, // 默认操作，实际应该根据规则类型调整
              why: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
              alternatives: [],
            })),
          ];

          // 如果有 must 项，确保 gate_result 是 ADJUST_REQUIRED
          if (gateResult.gate_result === 'ALLOW' && readinessMust.length > 0) {
            gateResult.gate_result = 'ADJUST_REQUIRED';
          }
        }

        state.gate_result = gateResult;
      } else {
        // 降级：使用默认 GateResult
        state.gate_result = {
          gate_result: readinessMust.length > 0 ? 'ADJUST_REQUIRED' : 'ALLOW',
          violations: [],
          required_adjustments: readinessMust.map((item: any) => ({
            action: 'REPLACE_SEGMENT' as const,
            why: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
            alternatives: [],
          })),
          confidence: 0.8,
          evidence_refs: [],
        };
      }

      // ========== 4. 记录决策日志（包含准备度检查信息） ==========
      // 生成准备度检查的决策日志条目（按三人格分类）
      if (readinessCheckResult && this.readinessService) {
        const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(
          readinessCheckResult,
          state.request_id
        );
        state.decision_log.push(...readinessDecisionLogs);
      }

      const readinessSummary = readinessCheckResult
        ? `准备度: blockers=${readinessBlockers.length}, must=${readinessMust.length}`
        : '';

      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: `评估行程可行性${readinessSummary ? `（${readinessSummary}）` : ''}`,
        outputs_summary: `Gate 结果: ${state.gate_result.gate_result}, 置信度: ${state.gate_result.confidence}, 违规数: ${state.gate_result.violations.length}`,
        evidence_refs: state.gate_result.evidence_refs || [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          violations: state.gate_result.violations,
          adjustments: state.gate_result.required_adjustments,
          guardian: 'ABU' as GuardianType, // 三人格映射（Gatekeeper → Abu）
          readiness_check: readinessCheckResult
            ? {
                totalBlockers: readinessCheckResult.summary.totalBlockers,
                totalMust: readinessCheckResult.summary.totalMust,
                totalShould: readinessCheckResult.summary.totalShould,
                totalOptional: readinessCheckResult.summary.totalOptional,
              }
            : undefined,
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'GATE_EVAL', 'Gatekeeper');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] GATE_EVAL 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * 从 OrchestratorState 提取 TripContext
   * 
   * 用于准备度检查
   */
  private extractTripContextFromState(state: OrchestratorState): TripContext {
    const request = state.trip_plan_request;
    if (!request) {
      // 返回最小化的 TripContext
      return {
        traveler: {},
        trip: {},
        itinerary: {
          countries: [],
        },
      };
    }

    // 提取目的地国家代码
    const destination = typeof request.destination === 'string'
      ? request.destination
      : 'UNKNOWN';
    
    const countryCode = destination.split('-')[0] || destination.split(',')[0] || 'UNKNOWN';

    // 构建 TravelerProfile
    const memoryNationality = this.agentMemoryContextStore?.get()?.userBasics?.nationality;
    const traveler: TravelerProfile = {
      nationality: memoryNationality,
      residencyCountry: undefined,
      tags: [],
      budgetLevel: request.constraints?.budget?.total
        ? request.constraints.budget.total > 5000
          ? 'high'
          : request.constraints.budget.total > 2000
          ? 'medium'
          : 'low'
        : undefined,
      riskTolerance: undefined,
    };

    // 构建 ItineraryInfo
    const itinerary: ItineraryInfo = {
      countries: [countryCode],
      activities: [], // 可以从 research_data 或其他地方提取
      season: request.date_range?.start_date
        ? this.extractSeason(request.date_range.start_date)
        : undefined,
    };

    // 构建 TripContext
    return {
      traveler,
      trip: {
        startDate: request.date_range?.start_date || request.start_date,
        endDate: request.date_range?.end_date,
      },
      itinerary,
    };
  }

  /**
   * 从日期提取季节
   */
  private extractSeason(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const month = date.getMonth() + 1; // 0-11 -> 1-12

      // 简化版季节判断（北半球）
      if (month >= 3 && month <= 5) return 'spring';
      if (month >= 6 && month <= 8) return 'summer';
      if (month >= 9 && month <= 11) return 'autumn';
      return 'winter';
    } catch {
      return 'all';
    }
  }

  /** CONTEXT_BUILD（Phase 4b → context-build-phase.executor） */
  private async executeContextBuildStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    return runContextBuildPhase(this.createContextBuildPhaseHost(), {
      request,
      context,
      state,
      decisionState,
    });
  }

  /**
   * P1: Itinerary → TdfpmDayContext 简化转换（至少 drivingHours）
   */
  private itineraryToTdfpmDayContexts(itinerary: Itinerary): TdfpmDayContext[] {
    const contexts: TdfpmDayContext[] = [];
    for (const day of itinerary.days || []) {
      let drivingHours = 0;
      let departureHour = 8;
      for (const item of day.items || []) {
        const mins = item.metadata?.duration_minutes;
        if (mins != null && (item.type === 'DRIVE' || item.type === 'TRANSIT')) {
          drivingHours += mins / 60;
        } else if (mins != null && item.type === 'WALK') {
          drivingHours += (mins / 60) * 0.3;
        }
        if (item.start_window) {
          const m = item.start_window.match(/(\d{1,2}):(\d{2})|T(\d{2})/);
          if (m) departureHour = parseInt(m[1] ?? m[3] ?? '8', 10);
        }
      }
      if (drivingHours === 0 && day.items?.length) {
        drivingHours = 2;
      }
      contexts.push({
        drivingHours: Math.min(drivingHours, 12),
        roadType: 'highway',
        departureHour,
      });
    }
    return contexts;
  }

  /** @deprecated 子图请用 runOptimizePhase */
  private async executeOptimizeStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    return this.runOptimizePhase(state, decisionState);
  }

  /**
   * PLAN_GEN 步骤：生成结构化行程草案
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * @deprecated 优先使用 Kernel.executePlanGen。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executePlanGenStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'PLAN_GEN';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 PLAN_GEN 步骤...`);

    try {
      // 调用 itinerary.generate Skill 生成行程
      if (this.skillsRegistry && state.trip_plan_request) {
        try {
          const itinerarySkill = this.skillsRegistry.getSkill('itinerary.generate');
          if (itinerarySkill) {
            const intakeRaw = (state.metadata as { intake_user_message?: string })?.intake_user_message;
            const intakeTrim =
              typeof intakeRaw === 'string' && intakeRaw.trim().length > 0 ? intakeRaw.trim() : undefined;
            const requestForSkill =
              intakeTrim != null
                ? ({ ...state.trip_plan_request, intake_user_message: intakeTrim } as TripPlanRequest)
                : state.trip_plan_request;
            const itineraryResult = await itinerarySkill.execute({
              request: requestForSkill,
              research_data: state.research_data,
              gate_result: state.gate_result,
            });
            // 类型转换：Skill 返回的结果需要转换为 Itinerary
            if (itineraryResult && typeof itineraryResult === 'object' && 'request_id' in itineraryResult && 'days' in itineraryResult) {
              state.itinerary = itineraryResult as Itinerary;
              if (state.trip_plan_request && state.itinerary.days?.length) {
                state.trip_plan_request = syncPlanRoutingMetricsToTripPlan(
                  state.trip_plan_request,
                  state.itinerary,
                );
              }
            } else {
              // 降级：生成空行程
              state.itinerary = {
                request_id: state.request_id,
                days: [],
              };
            }
          } else {
            // 降级：生成空行程
            state.itinerary = {
              request_id: state.request_id,
              days: [],
            };
          }
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] itinerary.generate 失败: ${error?.message}`);
          // 降级：生成空行程
          state.itinerary = {
            request_id: state.request_id,
            days: [],
          };
        }
      } else {
        // 降级：生成空行程
        state.itinerary = {
          request_id: state.request_id,
          days: [],
        };
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'PLAN_GEN',
        actor: 'Planner',
        inputs_summary: '生成行程草案',
        outputs_summary: `生成了 ${state.itinerary.days.length} 天的行程`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'PLAN_GEN', 'Planner');

      // Iterative Deployment: 收集轨迹（PLAN_GEN 完成后）
      if (this.trajectoryCollection && state.itinerary && state.gate_result) {
        try {
          const context = request as any; // 获取 context
          const tripId = context.trip_id || undefined;
          const countryCode = state.trip_plan_request?.destination 
            ? (typeof state.trip_plan_request.destination === 'string' 
                ? undefined 
                : undefined) // TODO: 从 destination 提取 countryCode
            : undefined;

          // 如果没有 compliance_result，生成一个默认的（从 gate_result 推导）
          let complianceResult = state.compliance_result;
          if (!complianceResult && this.complianceAgent && state.itinerary) {
            try {
              complianceResult = await this.complianceAgent.checkCompliance(
                state.itinerary,
                state.gate_result,
                state,
              );
            } catch (error: any) {
              this.logger.warn(`[Claude Orchestrator] Compliance 检查失败，使用默认值: ${error?.message}`);
              // 使用默认的 compliance result
              complianceResult = {
                risk_warnings: [],
                disclaimers: [],
                required_confirmations: [],
              };
            }
          } else if (!complianceResult) {
            // 如果没有 complianceAgent，使用默认值
            complianceResult = {
              risk_warnings: [],
              disclaimers: [],
              required_confirmations: [],
            };
          }

          await this.trajectoryCollection.collectTrajectory({
            requestId: state.request_id,
            tripId,
            plan: state.itinerary,
            decisionTrace: state.decision_log,
            researchData: state.research_data || {},
            gateResult: state.gate_result,
            complianceResult: complianceResult as any,
            modelVersion: 'v1.0', // TODO: 从配置或上下文获取
            countryCode,
          });
          this.logger.debug(`[Claude Orchestrator] 轨迹已收集: requestId=${state.request_id}`);
        } catch (error: any) {
          // 轨迹收集失败不应该影响主流程
          this.logger.warn(`[Claude Orchestrator] 轨迹收集失败: ${error?.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] PLAN_GEN 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * VERIFY 步骤：验证开放时间冲突/换乘 buffer/可达性/疲劳阈值
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * @deprecated 优先使用 Kernel.executeVerify。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executeVerifyStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'VERIFY';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 VERIFY 步骤...`);

    try {
      const verificationIssues: string[] = [];

      // 调用验证 Skills（itinerary.verify）
      if (this.skillsRegistry && state.itinerary) {
        try {
          const researchData =
            state.research_data && typeof state.research_data === 'object'
              ? ({ ...state.research_data } as Record<string, unknown>)
              : ({} as Record<string, unknown>);
          const ohSkill = this.skillsRegistry.getSkill('opening_hours.get');
          if (ohSkill) {
            try {
              await hydrateOpeningHoursEvidenceForItinerary({
                itinerary: state.itinerary,
                researchData,
                openingHoursSkill: ohSkill as {
                  execute: (input: { poi_ids: string[] }) => Promise<{ opening_hours?: unknown[] }>;
                },
              });
              state.research_data = researchData;
            } catch (e: unknown) {
              this.logger.warn(
                `[Claude Orchestrator] VERIFY opening_hours hydrate skipped: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }

          const verifySkill = this.skillsRegistry.getSkill('itinerary.verify');
          if (verifySkill) {
            const verifyResult = await verifySkill.execute({
              itinerary: state.itinerary,
              research_data: researchData,
              user_query: request.message,
              intent_hints: (() => {
                const vt = state.trip_plan_request?.constraints?.vehicle_type;
                if (vt === '2WD' || vt === '4WD') return { constraints_vehicle_type: vt };
                return undefined;
              })(),
            });
            
            if (verifyResult?.issues && Array.isArray(verifyResult.issues)) {
              verificationIssues.push(...verifyResult.issues);
            }
          }
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] itinerary.verify 失败: ${error?.message}`);
        }
      }

      // 记录验证结果
      if (verificationIssues.length > 0) {
        state.errors.push({
          step: 'VERIFY',
          error_code: 'VERIFICATION_ISSUES',
          message: `发现 ${verificationIssues.length} 个验证问题`,
          timestamp: new Date().toISOString(),
        });
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: '验证行程可行性',
        outputs_summary: verificationIssues.length > 0 
          ? `发现 ${verificationIssues.length} 个问题` 
          : '验证通过',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          issues: verificationIssues,
          guardian: 'DR_DRE' as GuardianType, // P1 改进：三人格映射（VERIFY → Dr.Dre，节奏与体感验证）
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'VERIFY', 'CoreDecision');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] VERIFY 步骤失败: ${error?.message}`);
      state.errors.push({
        step: 'VERIFY',
        error_code: 'VERIFICATION_ERROR',
        message: error?.message || '验证失败',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * REPAIR 步骤：替换POI/改路线/加buffer/换交通/降级
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * @deprecated 优先使用 Kernel.executeRepair。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executeRepairStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'REPAIR';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 REPAIR 步骤...`);

    try {
      let repairApplied = false;
      const repairActions: string[] = [];

      // 1. 调用 LocalInsight Agent 生成替代方案
      if (this.localInsightAgent && state.trip_plan_request && state.gate_result) {
        try {
          const alternatives = await this.localInsightAgent.suggestAlternatives(
            state.trip_plan_request,
            state.gate_result,
            state,
          );
          
          if (alternatives.alternative_pois.length > 0 || alternatives.alternative_routes.length > 0) {
            repairApplied = true;
            repairActions.push(`生成了 ${alternatives.alternative_pois.length} 个替代 POI 和 ${alternatives.alternative_routes.length} 条替代路线`);
            state.alternatives = alternatives;
          }
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] LocalInsight Agent 失败: ${error?.message}`);
        }
      }

      // 2. 调用 repair.apply Skill 应用修复
      if (this.skillsRegistry && state.itinerary && state.gate_result) {
        try {
          const repairSkill = this.skillsRegistry.getSkill('repair.apply');
          if (repairSkill && state.gate_result.required_adjustments.length > 0) {
            const repairResult = await repairSkill.execute({
              itinerary: state.itinerary,
              adjustments: state.gate_result.required_adjustments,
              alternatives: state.alternatives,
            });
            
            if (repairResult?.repaired) {
              repairApplied = true;
              repairActions.push('已应用修复方案');
              state.itinerary = repairResult.itinerary;
            }
          }
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] repair.apply 失败: ${error?.message}`);
        }
      }

      if (repairApplied && state.trip_plan_request && state.itinerary?.days?.length) {
        const postRepair = applyPostRepairRoutingMetricsSync({
          trip: state.trip_plan_request,
          itinerary: state.itinerary,
          metadata: state.metadata as Record<string, unknown>,
          message: request?.message ?? state.trip_plan_request.message,
          routeAndRunIntent: (state.metadata as Record<string, unknown>)?.route_and_run_intent as any,
          clarificationAnswers: (state.metadata as Record<string, unknown>)?.clarification_answers as any,
        });
        state.trip_plan_request = postRepair.trip;
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'REPAIR',
        actor: 'LocalInsight',
        inputs_summary: '修复行程问题',
        outputs_summary: repairApplied 
          ? repairActions.join('；') 
          : '无需修复或修复失败',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          repair_applied: repairApplied,
          guardian: 'NEPTUNE' as GuardianType, // P1 改进：三人格映射（REPAIR → Neptune，空间结构修复）
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'REPAIR', 'LocalInsight');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] REPAIR 步骤失败: ${error?.message}`);
      state.errors.push({
        step: 'REPAIR',
        error_code: 'REPAIR_ERROR',
        message: error?.message || '修复失败',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private createNarratePhaseHost(): NarratePhaseHost {
    return {
      logger: this.logger,
      decisionKernel: this.decisionKernel,
      narratorAgent: this.narratorAgent,
      resolveDosExecutionContext: (req) => {
        const ctx = this.resolveDosExecutionContext(req);
        const tripId = ctx?.tripId;
        if (!ctx || !tripId) return null;
        return { planDelta: [...ctx.planDelta], tripId };
      },
      kernelCreateInitialOpts: (req, st) => this.kernelCreateInitialOpts(req, st),
      parseResearchConflictReport: (raw) =>
        isResearchConflictNegotiationReport(raw) ? raw : undefined,
      readRealtimeRerollCount: (rd) => readRealtimeRerollCount(rd),
      memoryReplayDecisionSource: MEMORY_REPLAY_DECISION_SOURCE,
    };
  }

  private createNarrateNodeHost(): NarrateNodeHost {
    const phaseHost = this.createNarratePhaseHost();
    return {
      ...phaseHost,
      recordPoiPlanningOutcomeAfterItinerary: (st, dso) =>
        this.recordPoiPlanningOutcomeAfterItinerary(st, dso),
      touchAsyncTaskProgress: (step) =>
        this.touchAsyncTaskProgress(step as OrchestrationStep),
      maybeSnapshot: (st, trigger) =>
        this.maybeSnapshot(st, trigger as 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'),
      runNarratePhase: (params) => runNarratePhase(phaseHost, params),
    };
  }

  /**
   * NARRATE 步骤：产出用户可读解释（不得改硬字段）
   */
  private async executeNarrateStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
    decisionState?: DecisionState,
  ): Promise<void> {
    await runNarratePhase(this.createNarratePhaseHost(), {
      request,
      context,
      state,
      decisionState,
    });
    await this.routeAndRunTaskProgress?.reportOrchestrationStepWithState('NARRATE', state);
  }

  private createFeedbackPhaseHost(): FeedbackPhaseHost {
    return {
      logger: this.logger,
      decisionKernel: this.decisionKernel,
      isDsoAsPrimary: () => this.isDsoAsPrimary(),
    };
  }

  private createHallucinationPhaseHost(): HallucinationPhaseHost {
    return {
      logger: this.logger,
      hallucinationDetection: this.hallucinationDetection,
    };
  }

  private createPostPlanGraphHost(): PostPlanGraphHost {
    const narrateHost = this.createNarrateNodeHost();
    const feedbackHost = this.createFeedbackPhaseHost();
    const hallucinationHost = this.createHallucinationPhaseHost();
    return {
      ...narrateHost,
      runFeedbackPhase: (params) => runFeedbackPhase(feedbackHost, params),
      runHallucinationPhase: (params) => runHallucinationPhase(hallucinationHost, params),
      buildSuccessResult: (st, start, dso, ctx) =>
        this.buildSuccessResult(st, start, dso, ctx),
    };
  }

  /**
   * 生成 Decision Step（P0: Decision-First Engine 集成）
   * 
   * 在每个状态机步骤执行后调用，生成对应的业务层决策步骤
   */
  private async generateDecisionStepForStep(
    state: OrchestratorState,
    orchestrationStep: OrchestrationStep,
    subAgent?: SubAgentType,
  ): Promise<void> {
    if (!this.decisionDraftGenerator) {
      // DecisionDraftGenerator 未注入时静默跳过
      return;
    }

    try {
      const decisionStep = await this.decisionDraftGenerator.generateDecisionStepFromOrchestrationState(
        state,
        orchestrationStep,
        subAgent,
      );

      if (decisionStep) {
        // 初始化 decision_steps 数组（如果不存在）
        if (!state.decision_steps) {
          state.decision_steps = [];
        }
        state.decision_steps.push(decisionStep);
        this.logger.debug(`[Claude Orchestrator] 生成 Decision Step: type=${decisionStep.type}, step=${orchestrationStep}`);
      }
    } catch (error: any) {
      // Decision Step 生成失败不应阻塞主流程
      this.logger.warn(`[Claude Orchestrator] Decision Step 生成失败，跳过: ${error?.message}`);
    }
  }

  /**
   * 格式化澄清问题为简单字符串（向后兼容）
   * 
   * 将结构化澄清问题转换为简单的文本格式，用于向后兼容
   */
  private formatClarificationMessage(questions?: ClarificationQuestion[], localeRaw?: string | null): string {
    if (!questions || questions.length === 0) {
      return '';
    }

    const messages: string[] = [];
    messages.push(clarificationIntroNumberedPrefix(localeRaw));

    questions.forEach((q, index) => {
      messages.push(`${index + 1}. ${q.question}`);
      if (q.hint) {
        messages.push(`   ${q.hint}`);
      }
      if (q.options && q.options.length > 0) {
        const optionLabels = q.options.map((opt: any) =>
          typeof opt === 'string' ? opt : opt?.label || opt?.value || String(opt),
        );
        messages.push(`   选项：${optionLabels.join('、')}`);
      }
      messages.push('');
    });

    return messages.join('\n');
  }

  /** Phase 1：PLAN/VERIFY 子图宿主面（plan-verify-loop） */
  getDecisionKernel(): DecisionKernelService | undefined {
    return this.decisionKernel;
  }

  getLocalCaseStore(): LocalCaseStoreService | undefined {
    return this.localCaseStore;
  }

  private asPlanVerifyLoopHost(): PlanVerifyLoopHost {
    return this as unknown as PlanVerifyLoopHost;
  }

  private asPlanGenEmptyDraftGuardHost(): PlanGenEmptyDraftGuardHost {
    return this as unknown as PlanGenEmptyDraftGuardHost;
  }

  private asPostPlanGraphHost(): PostPlanGraphHost {
    return this.createPostPlanGraphHost();
  }


  private asPrePlanGraphHost(): PrePlanGraphHost {
    return this as unknown as PrePlanGraphHost;
  }

  async runPrePlanNode(
    nodeId: import('../orchestration/graph/orchestration-graph.types').OrchestrationNodeId,
    ctx: import('../orchestration/graph/orchestration-graph.types').SharedRunContext,
  ): Promise<import('../orchestration/graph/orchestration-graph.types').GraphNodeOutcome> {
    const params = ctx as import('../orchestration/graph/pre-plan-graph.types').PrePlanGraphRunParams;
    const entry = params.entry ?? 'intake';
    if (
      !params.forcePrePlanIntakeEntry &&
      PRE_PLAN_NODE_ORDER.indexOf(nodeId) < PRE_PLAN_NODE_ORDER.indexOf(entry)
    ) {
      return { kind: 'continue', decisionState: ctx.decisionState };
    }
    const segment = await this.runPrePlanFullChain({
      ...params,
      decisionState: ctx.decisionState,
      entry: nodeId,
      stopAfter: nodeId,
    });
    if (segment.kind === 'terminal') {
      return {
        kind: 'terminal',
        terminal: segment.terminal,
        result: segment.result,
        decisionState: segment.decisionState,
      };
    }
    return { kind: 'continue', decisionState: segment.decisionState };
  }

  private async runPrePlanFullChain(
    params: import('../orchestration/graph/pre-plan-graph.types').PrePlanGraphRunParams,
  ): Promise<import('../orchestration/graph/orchestration-graph.types').GraphRunOutcome> {
    const { request, context, state, llmProvider, startTime, resumeSkipIntake, stopAfter } = params;
    let decisionState = params.decisionState;
    const startAt = params.entry ?? 'intake';
    const shouldRun = (node: import('../orchestration/graph/orchestration-graph.types').OrchestrationNodeId) =>
      PRE_PLAN_NODE_ORDER.indexOf(node) >= PRE_PLAN_NODE_ORDER.indexOf(startAt);

    const maybeStopAfter = (
      node: import('../orchestration/graph/orchestration-graph.types').OrchestrationNodeId,
    ): import('../orchestration/graph/orchestration-graph.types').GraphRunOutcome | null => {
      if (stopAfter && stopAfter === node) {
        return { kind: 'completed', lastNode: node, decisionState };
      }
      return null;
    };

    const prePlanTerminal = (
      terminal: import('../orchestration/graph/orchestration-graph.types').OrchestrationTerminalId,
      result: OrchestrationResult,
    ): import('../orchestration/graph/orchestration-graph.types').GraphRunOutcome => ({
      kind: 'terminal',
      terminal,
      result,
      decisionState,
    });

    if (shouldRun('intake')) {
      const intakeSegment = await this.getIntakeNode().runPrePlanSegment({
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        resumeSkipIntake,
        systemRequestId: state.request_id,
        logger: this.logger,
        prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
      });
      if (intakeSegment.kind !== 'continue') {
        return intakeSegment;
      }
      decisionState = intakeSegment.decisionState;
    }

    if (shouldRun('state_update')) {
      const stateUpdateSegment = await this.getStateUpdateNode().runPrePlanSegment({
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        systemRequestId: state.request_id,
        logger: this.logger,
        prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
      });
      if (stateUpdateSegment.kind !== 'continue') {
        return stateUpdateSegment;
      }
      decisionState = stateUpdateSegment.decisionState;
    }

    if (shouldRun('research')) {
      const researchSegment = await this.getResearchNode().runPrePlanSegment({
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        systemRequestId: state.request_id,
        logger: this.logger,
        prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
      });
      if (researchSegment.kind !== 'continue') {
        return researchSegment;
      }
      decisionState = researchSegment.decisionState;
    }

    if (shouldRun('poi_selection')) {
      const poiSegment = await this.getPoiSelectionNode().runPrePlanSegment({
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        systemRequestId: state.request_id,
        logger: this.logger,
        prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
      });
      if (poiSegment.kind !== 'continue') {
        return poiSegment;
      }
      decisionState = poiSegment.decisionState;
    }

    if (shouldRun('gate_eval')) {
      const gateSegment = await this.getGateEvalNode().runPrePlanSegment({
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        deadline: params.deadline,
        systemRequestId: state.request_id,
        logger: this.logger,
        prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
      });
      if (gateSegment.kind !== 'continue') {
        return gateSegment;
      }
      decisionState = gateSegment.decisionState;
    }

    if (shouldRun('context_build')) {
      const contextBuildSegment = await this.getContextBuildNode().runPrePlanSegment({
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        systemRequestId: state.request_id,
        logger: this.logger,
        prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
      });
      if (contextBuildSegment.kind !== 'continue') {
        return contextBuildSegment;
      }
      decisionState = contextBuildSegment.decisionState;
    }

    return { kind: 'completed', lastNode: 'context_build', decisionState };
  }

  async applyReturnToResearchInvalidation(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    request: RouteAndRunRequestDto,
  ): Promise<DecisionState | undefined> {
    let ds = decisionState;
    if (this.decisionKernel && ds) {
      ds = this.decisionKernel.updateState(ds, {
        harnessRuntime: {
          ...(ds.harnessRuntime ?? {}),
          researchEvidenceSnapshotId: undefined,
          evidenceVersion: undefined,
        },
      });
    }
    const scopes = dedupeResearchScopes([
      'hotel',
      'flight',
      'destination',
      'transport',
      'compliance',
      'common',
    ]);
    if (state.research_data && typeof state.research_data === 'object') {
      const { clearedKeys } = invalidateResearchScopesInPlace(
        state.research_data as Record<string, unknown>,
        scopes,
        'RETURN_TO_RESEARCH',
      );
      const m0 = { ...(state.metadata as Record<string, unknown>) };
      m0.research_scope_invalidation = {
        scopes,
        cleared_keys: clearedKeys,
        at: new Date().toISOString(),
        reason: 'RETURN_TO_RESEARCH',
      };
      state.metadata = m0 as OrchestratorState['metadata'];
      state.decision_log.push({
        request_id: state.request_id,
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: 'Harness RETURN_TO_RESEARCH → invalidate research evidence snapshot',
        outputs_summary: `RESEARCH_SCOPE_INVALIDATION scopes=${scopes.join(',')}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { system_action: 'RETURN_TO_RESEARCH', scopes },
      });
    }
    return ds;
  }

  private warn(message: string): void {
    this.logger.warn(message);
  }

  private async tryPlanGenEmptyDraftTerminal(
    params: PlanGenEmptyDraftGuardParams,
  ): Promise<OrchestrationResult | null> {
    return tryPlanGenEmptyDraftTerminalGuard(this.asPlanGenEmptyDraftGuardHost(), params);
  }

  private async runTravelCompilePhaseIfEnabled(
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
  ): Promise<void> {
    this.touchAsyncTaskProgress('TRAVEL_COMPILE');
    await runTravelCompilePhase({
      state,
      request,
      compiler: this.travelCompiler,
      graphStore: this.travelGraphStore,
      configService: this.configService,
      onProgress: (view) => {
        void this.routeAndRunTaskProgress?.reportCtreCompilationProgress(view);
      },
    });
    this.maybeSnapshot(state, 'AUTO');
  }

  private async runPlanGenWithEmptyDraftGuard(
    params: PlanVerifyLoopRunParams,
  ): Promise<PlanGenWithEmptyDraftResult> {
    this.touchAsyncTaskProgress('PLAN_GEN');
    let decisionState = await this.executePlanGenPhase(
      params.decisionState,
      params.state,
      params.request,
      params.context,
      params.llmProvider,
    );
    this.maybeSnapshot(params.state, 'AUTO');
    const terminal = await tryPlanGenEmptyDraftTerminalGuard(this.asPlanGenEmptyDraftGuardHost(), {
      request: params.request,
      context: params.context,
      state: params.state,
      decisionState,
      startTime: params.startTime,
    });
    if (terminal) {
      return { decisionState, terminal };
    }
    return { decisionState };
  }

  private violationTypeToCn(type: string): string {
    const t = String(type || '').toUpperCase();
    if (t === 'REACHABILITY') return '准入类';
    if (t === 'SCOPE') return '空间类';
    if (t === 'SAFETY') return '安全类';
    if (t === 'FAILURE_RISK') return '风险类';
    return type;
  }

  /**
   * 组装面向用户的 answer_text：优先使用 NARRATE 产出的摘要与逐日叙述，
   * 避免仅有「已为您生成 N 天」导致前端只展示一句空话。
   */
  private buildUserFacingAnswerText(state: OrchestratorState): string {
    const narr = state.narration;
    const parts: string[] = [];

    const summary = narr?.user_friendly_summary?.trim();
    if (summary) {
      parts.push(summary);
    }

    const preformattedDays = narr?.day_by_day_text_zh?.trim();
    if (preformattedDays) {
      parts.push(preformattedDays);
    } else {
      const days = narr?.day_by_day_narrative;
      if (Array.isArray(days) && days.length > 0) {
        const dayLines = days
          .map((d) => {
            const header =
              d.day != null
                ? `第 ${d.day} 天${d.date ? `（${d.date}）` : ''}`
                : d.date
                  ? String(d.date)
                  : '';
            const body = (d.narrative || '').trim();
            if (!header && !body) return '';
            return header ? `${header}\n${body}` : body;
          })
          .filter(Boolean);
        if (dayLines.length > 0) {
          parts.push(dayLines.join('\n\n'));
        }
      }
    }

    if (parts.length > 0) {
      return parts.join('\n\n');
    }

    const n = state.itinerary?.days?.length ?? 0;
    if (n > 0) {
      return `已为您生成 ${n} 天的行程安排。`;
    }
    return '处理完成。';
  }

  /**
   * Recovery 重试进入 SM 时，将 recovery_context 写入本轮产生的每条 orchestrator decision_log（第一类审计公民）。
   */
  private stampRecoveryOntoOrchestratorDecisionLogs(context: AgentContext | undefined, state: OrchestratorState): void {
    const inv = context?.recoveryInvocation;
    if (!inv?.is_retry) return;

    const recovery_context: DecisionRecoveryLogContext = {
      is_retry: true,
      retry_attempt: inv.retry_attempt,
      previous_failure_domain: inv.previous_failure_domain as RecoveryAuditFailureDomain,
      elapsed_from_start_ms: inv.elapsed_from_start_ms,
    };

    for (const entry of state.decision_log) {
      entry.metadata = {
        ...(entry.metadata ?? {}),
        recovery_context,
      };
    }

    if (inv.trace_summary?.length) {
      state.metadata = {
        ...(state.metadata ?? {}),
        recovery_trace_summary: inv.trace_summary,
      } as OrchestratorState['metadata'];
    }
  }

  private resolveClarificationIntroAnswerText(state: OrchestratorState): string {
    const locale = (state.metadata as { clarification_locale?: string })?.clarification_locale;
    return clarificationIntroPlain(locale);
  }

  /**
   * PDI-4：Gate 通过后、PLAN 前，对未完成 Travel Style / Money DNA 调查的成员自动推送问卷入口。
   */
  private async maybeTriggerDecisionProfilingQuiz(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): Promise<void> {
    if (!this.decisionProfilingOrchestrator) return;

    const tripId = (request.trip_id || state.metadata?.tripId || '').trim();
    const userId = (request.user_id || state.metadata?.userId || '').trim();
    if (!tripId || !userId) return;

    try {
      const hint: DecisionProfilingOrchestrationHint =
        await this.decisionProfilingOrchestrator.tryAutoPromptQuiz({
          tripId,
          userId,
          message: request.message ?? '',
        });

      if (!hint.triggered) return;

      (state.metadata as Record<string, unknown>).decision_profiling = hint;
      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Orchestrator',
        inputs_summary: `decision_profiling auto-prompt step=${hint.nextStep}`,
        outputs_summary: `prompt_kind=${hint.promptKind}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'DECISION_PROFILING_QUIZ_PROMPTED',
          next_step: hint.nextStep,
          prompt_kind: hint.promptKind,
          team_completion_rate: hint.onboarding.teamCompletionRate,
          client_navigation: hint.clientNavigation,
        },
      });

      if (hint.agentIntroZh) {
        const prev = state.narration?.user_friendly_summary ?? '';
        state.narration = {
          day_by_day_narrative: state.narration?.day_by_day_narrative ?? [],
          highlights: state.narration?.highlights ?? [],
          tips: state.narration?.tips ?? [],
          ...state.narration,
          user_friendly_summary: prev
            ? `${prev}\n\n${hint.agentIntroZh}`
            : hint.agentIntroZh,
        };
      }
    } catch (e: any) {
      this.logger.warn(
        `[Claude Orchestrator] decision_profiling auto-prompt skipped: ${e?.message ?? e}`,
      );
    }
  }

  /**
   * F3.1：Gate 通过后、PLAN 前，对多人行程在检测到关键决策节点时自动发起偏好分享轮次。
   */
  private async maybeTriggerProcessFairnessRound(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): Promise<void> {
    if (!this.preferenceRoundOrchestrator) return;

    const tripId = (request.trip_id || state.metadata?.tripId || '').trim();
    const userId = (request.user_id || state.metadata?.userId || '').trim();
    if (!tripId || !userId) return;

    try {
      const hint: ProcessFairnessOrchestrationHint =
        await this.preferenceRoundOrchestrator.tryAutoStartForRequest({
          tripId,
          userId,
          message: resolveRouteAndRunUserMessage(request),
        });

      if (!hint.triggered) return;

      (state.metadata as Record<string, unknown>).process_fairness = hint;
      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Orchestrator',
        inputs_summary: `process_fairness auto-start node=${hint.decisionNode}`,
        outputs_summary: `round_id=${hint.roundId}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'PROCESS_FAIRNESS_ROUND_STARTED',
          decision_node: hint.decisionNode,
          round_id: hint.roundId,
          client_navigation: hint.clientNavigation,
        },
      });

      if (hint.agentIntroZh) {
        const prev = state.narration?.user_friendly_summary ?? '';
        state.narration = {
          day_by_day_narrative: state.narration?.day_by_day_narrative ?? [],
          highlights: state.narration?.highlights ?? [],
          tips: state.narration?.tips ?? [],
          ...state.narration,
          user_friendly_summary: prev
            ? `${prev}\n\n${hint.agentIntroZh}`
            : hint.agentIntroZh,
        };
      }
    } catch (e: any) {
      this.logger.warn(
        `[Claude Orchestrator] process_fairness auto-start skipped: ${e?.message ?? e}`,
      );
    }
  }

  /**
   * 构建成功结果
   * @param decisionState DSO（含 confidence/history/decisionMeta），供 RLHF/分析/前端使用
   */
  private async persistDecisionTrajectoryAtOrchestrationExit(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    answerText?: string,
  ): Promise<void> {
    await finalizeOrchestrationDecisionTrajectory({
      interlocutor: this.decisionTrajectoryInterlocutor,
      state,
      decisionState,
      answerText,
    });
  }

  private attachHotelRouteRunUiToOrchestrationResult(
    result: OrchestrationResult,
    hotelRouteRunUi: HotelRouteRunUiPayload,
  ): OrchestrationResult {
    if (!result.result) return result;
    return {
      ...result,
      result: {
        ...result.result,
        accommodations: hotelRouteRunUi.accommodations,
        airbnbListings: hotelRouteRunUi.airbnbListings,
        routing: hotelRouteRunUi.routing,
        ...(hotelRouteRunUi.night_groups?.length
          ? { accommodation_night_groups: hotelRouteRunUi.night_groups }
          : {}),
        ...(hotelRouteRunUi.hotel_search_meta
          ? { hotel_search_meta: hotelRouteRunUi.hotel_search_meta }
          : {}),
      },
    };
  }

  private persistRouteRunAccommodationsToClientSession(
    request: RouteAndRunRequestDto,
    tripId: string | undefined,
    hotelRouteRunUi: HotelRouteRunUiPayload,
  ): void {
    const sessionId = request.options?.client_session_id?.trim();
    const tid = tripId?.trim();
    if (!sessionId || !tid || !this.planningAssistantV2Service) return;
    const items = mapHotelRouteRunUiToAccommodationItems(hotelRouteRunUi);
    if (!items.length) return;
    void this.planningAssistantV2Service
      .persistLastAccommodationsForApply(sessionId, tid, items, request.user_id)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `[Claude Orchestrator] persist route_run accommodations failed sessionId=${sessionId}: ${msg}`,
        );
      });
  }

  /** 整段多日重规划完成后：自动逐晚触发住宿 MCP，写入出站卡片载荷 */
  private async enrichOrchestrationResultWithFullTripReplanHotel(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    result: OrchestrationResult,
  ): Promise<OrchestrationResult> {
    if (!isItineraryFullTripReplanMetadata(state.metadata as Record<string, unknown> | undefined)) {
      return result;
    }
    const md = state.metadata as Record<string, unknown>;
    const hasClarification =
      Array.isArray(state.clarification_questions) && state.clarification_questions.length > 0;
    if (hasClarification) return result;

    const msg =
      request.message ??
      (typeof md.intake_user_message === 'string' ? md.intake_user_message : '');
    if (!detectFullTripReplanHotelIntent(msg, md)) return result;

    const tripId = request.trip_id?.trim() ?? context.tripId?.trim();
    if (!this.mcpToolDispatcher) {
      state.decision_log.push({
        request_id: state.request_id,
        step: 'NARRATE',
        actor: 'Orchestrator',
        inputs_summary: '整段多日重规划：绑定 Trip 后自动触发逐晚住宿 MCP',
        outputs_summary: '住宿 MCP 未配置（mcpToolDispatcher 不可用），已跳过检索',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'FULL_TRIP_REPLAN_HOTEL_SENSOR',
          skipped: true,
          reason: 'mcp_unavailable',
        },
      });
      return result;
    }
    try {
      const hBranch = await this.runLiveHotelSensorBranch(request, context, tripId, {
        fullTripReplan: true,
      });
      (state.metadata as Record<string, unknown>).full_trip_replan_hotel_sensor = {
        attempted: true,
        ok: !!hBranch.hotelRouteRunUi?.accommodations?.length,
        card_count: hBranch.hotelRouteRunUi?.accommodations?.length ?? 0,
      };
      state.decision_log.push({
        request_id: state.request_id,
        step: 'NARRATE',
        actor: 'Orchestrator',
        inputs_summary: '整段多日重规划：绑定 Trip 后自动触发逐晚住宿 MCP',
        outputs_summary: hBranch.hotelRouteRunUi?.accommodations?.length
          ? `住宿 MCP 返回 ${hBranch.hotelRouteRunUi.accommodations.length} 张候选卡片（第 ${(hBranch.hotelRouteRunUi.hotel_search_meta?.sampled_nights ?? []).join('、')} 晚）`
          : '住宿 MCP 未返回可用候选（不影响行程草案）',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { system_action: 'FULL_TRIP_REPLAN_HOTEL_SENSOR' },
      });
      if (!hBranch.hotelRouteRunUi?.accommodations?.length) {
        return result;
      }
      const enrichedUi = enrichHotelRouteRunUiForClientApply(hBranch.hotelRouteRunUi);
      this.persistRouteRunAccommodationsToClientSession(request, tripId, enrichedUi);
      return this.attachHotelRouteRunUiToOrchestrationResult(result, enrichedUi);
    } catch (e: unknown) {
      this.logger.warn(
        `[Claude Orchestrator] FULL_TRIP_REPLAN hotel sensor failed request_id=${request.request_id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return result;
    }
  }

  private buildSuccessResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult {
    this.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
    attachTravelPreferenceSnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    attachAgentMemorySnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;
    this.finalizeHarnessTraceFromOrchestration(
      decisionState,
      hasClarificationQuestions ? 'NEED_USER_CONFIRM' : 'DONE',
    );

    // 如果有澄清问题，说明需要用户提供更多信息
    const answerText = hasClarificationQuestions
      ? this.resolveClarificationIntroAnswerText(state)
      : this.buildUserFacingAnswerText(state);

    void this.persistDecisionTrajectoryAtOrchestrationExit(state, decisionState, answerText).catch(
      (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[Claude Orchestrator] DecisionTrajectory finalize failed: ${msg}`);
      },
    );

    this.logger.log(`[Claude Orchestrator] 构建成功结果: decision_log.length=${state.decision_log.length}, current_step=${state.current_step}`);

    return {
      success: !hasClarificationQuestions, // 如果有澄清问题，success 为 false（需要用户输入）
      result: {
        state,
        itinerary: state.itinerary,
        gate_result: state.gate_result,
        decision_log: state.decision_log,
        // Phase 2.5: DSO 供 RLHF/模型评估/异常检测
        ...(decisionState && { decisionState }),
        // 如果有澄清问题，填充到结果中
        ...(hasClarificationQuestions && state.clarification_questions ? {
          needsUserConfirmation: true,
          clarificationQuestions: state.clarification_questions,
          // 向后兼容：生成简单字符串格式的澄清消息
          clarificationMessage: this.formatClarificationMessage(
            state.clarification_questions,
            (state.metadata as any)?.clarification_locale,
          ),
        } : {}),
        ...((state.metadata as any)?.decision_profiling
          ? { decision_profiling: (state.metadata as any).decision_profiling }
          : {}),
        ...((state.metadata as any)?.process_fairness
          ? { process_fairness: (state.metadata as any).process_fairness }
          : {}),
      },
      answerText,
      stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log,
    };
  }

  /**
   * 构建被阻止的结果
   */
  private buildBlockedResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult {
    injectGateRelaxationClarificationIfEligible(state);
    this.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
    attachTravelPreferenceSnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    attachAgentMemorySnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'BLOCKED');
    const violations = state.gate_result?.violations || [];
    const answerText = `行程规划被阻止。原因：${violations.map(v => v.detail).join('；')}`;
    void this.persistDecisionTrajectoryAtOrchestrationExit(state, decisionState, answerText).catch(
      (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[Claude Orchestrator] DecisionTrajectory finalize failed: ${msg}`);
      },
    );

    // 如果有澄清问题，也包含在结果中（虽然被阻止，但可能需要用户提供替代方案）
    const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;

    return {
      success: false,
      result: {
        state,
        gate_result: state.gate_result,
        decision_log: state.decision_log,
        ...(decisionState && { decisionState }),
        // 如果有澄清问题，填充到结果中
        ...(hasClarificationQuestions && state.clarification_questions ? {
          needsUserConfirmation: true,
          clarificationQuestions: state.clarification_questions,
          clarificationMessage: this.formatClarificationMessage(
            state.clarification_questions,
            (state.metadata as any)?.clarification_locale,
          ),
        } : {}),
      },
      answerText,
      stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log,
    };
  }

  /**
   * transport.search 降级且带 clarify 动作码，或 hydration 区域不一致时：
   * 注入 ClarifyEndpoints 澄清任务并结束本轮编排（等价 RESEARCH_PARTIAL → NEED_USER_CONFIRM）。
   */
  private maybeInterceptDegradedTransportEvidence(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    startTime: number,
    context: AgentContext,
  ): OrchestrationResult | undefined {
    const rd = state.research_data as Record<string, any> | undefined;
    if (!rd) return undefined;

    const forceReinject = (state.metadata as any)?.transport_clarify_force_reinject === true;
    const existing = state.clarification_questions ?? [];
    if (!forceReinject && existing.some((q) => q.id === 'clarify_transport_endpoints_v1')) {
      return undefined;
    }
    const baseExisting = forceReinject
      ? existing.filter((q) => q.id !== 'clarify_transport_endpoints_v1')
      : existing;

    const te = rd.transport_evidence as Record<string, any> | undefined;
    const hy = rd.transport_endpoint_hydration as Record<string, any> | undefined;

    const wantsClarify =
      te &&
      te.suggested_action === TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY &&
      (te.degraded === true || te.missing === true);

    const geoOnly =
      !wantsClarify &&
      hy?.geo_context_hint === 'possible_region_mismatch' &&
      (te?.missing === true || te?.degraded === true);

    if (!wantsClarify && !geoOnly) {
      if (forceReinject) {
        (state.metadata as any) = { ...(state.metadata ?? {}), transport_clarify_force_reinject: false };
      }
      return undefined;
    }

    let questionBody =
      typeof te?.user_guidance === 'string' && te.user_guidance.trim()
        ? String(te.user_guidance).trim()
        : TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH;

    if (hy?.geo_context_hint === 'possible_region_mismatch') {
      questionBody +=
        '\n\n【区域一致性】推断的出发点与目的地（例如冰岛行程）在地图上可能相距过远；若非跨国多段行程，请确认出发城市或坐标。';
    }

    state.clarification_questions = [
      ...baseExisting,
      {
        id: 'clarify_transport_endpoints_v1',
        question: questionBody,
        type: 'text',
        required: true,
        hint: '可填写城市名、车站或经纬度（lat,lng）',
        metadata: {
          internal_task: 'ClarifyEndpoints',
          source: 'transport_evidence',
          suggested_action: te?.suggested_action ?? TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
          ...(hy?.geo_context_hint ? { geo_context_hint: hy.geo_context_hint } : {}),
        },
      },
    ];

    state.decision_log.push({
      request_id: state.request_id,
      step: 'RESEARCH',
      actor: 'Orchestrator',
      inputs_summary: 'interceptDegradedTransportEvidence → ClarifyEndpoints',
      outputs_summary: 'RESEARCH_PARTIAL: NEED_USER_CONFIRM (transport)',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'CLARIFY_ENDPOINTS_INJECT',
        research_partial: true,
        transport_snapshot: {
          degraded: te?.degraded,
          missing: te?.missing,
          suggested_action: te?.suggested_action,
          geo_context_hint: hy?.geo_context_hint,
        },
      },
    });

    state.metadata = {
      ...(state.metadata ?? {}),
      started_at: state.metadata?.started_at ?? new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      total_duration_ms: Date.now() - startTime,
      research_partial: true,
      transport_clarify_force_reinject: false,
    };
    state.current_step = 'RESEARCH';
    this.maybeSnapshot(state, 'CHECKPOINT');
    return this.buildClarificationResult(state, startTime, decisionState, context);
  }

  /**
   * 构建澄清结果（需要用户提供更多信息）
   */
  private buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult {
    this.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
    attachTravelPreferenceSnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    attachAgentMemorySnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'NEED_USER_CONFIRM');
    const answerText = this.resolveClarificationIntroAnswerText(state);
    void this.persistDecisionTrajectoryAtOrchestrationExit(state, decisionState, answerText).catch(
      (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[Claude Orchestrator] DecisionTrajectory finalize failed: ${msg}`);
      },
    );

    return {
      success: false, // 需要用户输入，所以 success 为 false
      result: {
        state,
        ...(state.gate_result ? { gate_result: state.gate_result } : {}),
        needsUserConfirmation: true,
        clarificationQuestions: state.clarification_questions || [],
        clarificationMessage: this.formatClarificationMessage(
          state.clarification_questions || [],
          (state.metadata as any)?.clarification_locale,
        ),
        gaps: state.gaps,
      },
      answerText,
      stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log,
    };
  }

  /**
   * 构建错误结果
   */
  private buildErrorResult(
    state: OrchestratorState,
    error: any,
    startTime: number,
    decisionState?: DecisionState,
    orchestratorStepAtFailure?: OrchestrationStep,
    precomputedRobustness?: OrchestratorRobustnessMetadata,
    context?: AgentContext,
  ): OrchestrationResult {
    this.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
    attachTravelPreferenceSnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    attachAgentMemorySnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'FAILED');
    void this.decisionTrajectoryInterlocutor
      ?.markFailed(state.request_id)
      .catch(() => {});
    // 🆕 检查是否是超时错误
    const isTimeout =
      error?.message?.startsWith('TIMEOUT:') ||
      error?.code === 'ECONNABORTED' ||
      state.current_step === 'TIMEOUT';

    const answerText = isTimeout
      ? `请求超时，已执行到步骤: ${state.current_step}。请缩小范围或稍后重试。`
      : `处理过程中出现错误：${error?.message || '未知错误'}`;

    this.logger.log(
      `[Claude Orchestrator] 构建错误结果: current_step=${state.current_step}, decision_log.length=${state.decision_log.length}, isTimeout=${isTimeout}`,
    );

    const stepForClassify =
      orchestratorStepAtFailure ??
      (state.current_step !== 'FAILED' && state.current_step !== 'TIMEOUT' ? state.current_step : undefined);

    let orchestrator_robustness: OrchestratorRobustnessMetadata;
    if (precomputedRobustness) {
      orchestrator_robustness = precomputedRobustness;
    } else {
      orchestrator_robustness = classifyOrchestratorFailure(error, { orchestrator_step: stepForClassify });
      if (isTimeout) orchestrator_robustness = coerceOrchestratorFailureForWallClockTimeout(orchestrator_robustness);
    }

    return {
      success: false,
      result: {
        state,
        errors: state.errors,
        errorType: isTimeout ? ('TIMEOUT_ERROR' as any) : undefined,
        orchestrator_robustness,
        ...(decisionState && { decisionState }),
      },
      answerText,
      stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log, {
        isSuccess: (step) => step !== 'FAILED' && step !== 'TIMEOUT',
      }),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log, // 🆕 确保决策日志被包含
    };
  }

  private buildTerminalNoSolutionResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult {
    this.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
    attachTravelPreferenceSnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    attachAgentMemorySnapshotToOrchestratorState(this.agentMemoryContextStore, state);
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'FAILED');

    const tf = decisionState?.systemState?.planGenTerminalFailure;
    const violations = (decisionState as any)?.constraints?.violations ?? state.gate_result?.violations ?? [];
    const vStr = Array.isArray(violations)
      ? violations
          .slice(0, 3)
          .map((v: any) => `${v?.type ?? 'CONSTRAINT'}: ${v?.detail ?? ''}`.trim())
          .filter(Boolean)
          .join('；')
      : '';

    const answerText =
      `基于您的确认，系统已停止规划（CONSENSUS_REACHED: NO_FEASIBLE_PATH）。` +
      `在不放宽约束（加天数/换车/删必去点）的前提下，当前物理/业务冲突不可逾越。` +
      (tf?.message ? ` 终止原因：${tf.message}.` : '') +
      (vStr ? ` 冲突摘要：${vStr}` : '');

    // If user terminates early (accept_no_solution), we may not have reached the RESEARCH-stage
    // PREDICTIVE_FAILURE_REPORT emission. Synthesize it from INTAKE simulation so the terminal
    // audit can still carry drift_vector / session_consistency_score for LogicOps.
    try {
      const existingEw = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
      const hasPfr = Boolean((existingEw as any)?.predictive_failure_report);
      const intakeSim = (state.metadata as any)?.intake_simulation as
        | { simulatedRepairTraces?: import('../services/route-feasibility.types').SimulatedRepairTrace[] }
        | undefined;
      const simTraces = intakeSim?.simulatedRepairTraces ?? [];
      if (!hasPfr && Array.isArray(simTraces) && simTraces.length > 0) {
        const predictive_failure_report = {
          card_type: 'PREDICTIVE_FAILURE_REPORT' as const,
          correlationId: undefined as unknown as string | undefined,
          audit_text: formatPredictiveFailureReport(simTraces),
          simulated_repair_traces: simTraces,
        };
        const mergedEw: EarlyWarning = existingEw
          ? { ...existingEw, predictive_failure_report }
          : {
              early_warning_id: `pred-${state.request_id}`,
              risk_level: 'MEDIUM',
              conflict_type: 'MIXED',
              evidence_summary: 'INTAKE_PREDICTIVE_SIMULATION',
              suggested_actions: [],
              predictive_failure_report,
            };
        (state.metadata as any) = { ...(state.metadata ?? {}), early_warning: mergedEw };
      }
    } catch {
      // best-effort only
    }

    const audit_report = AuditReportGenerator.generate(decisionState, state);
    const normalizedContract = normalizeDecisionOsAuditContract(audit_report);
    const normalizedAudit = this.normalizeDecisionOsAuditReport(normalizedContract.audit_report);
    if (normalizedContract.violations.length > 0) {
      for (const v of normalizedContract.violations) {
        this.promMetrics?.recordDecisionOsAuditContractViolation({
          stage: 'TERMINAL',
          field: v.field,
          reason: v.reason,
        });
      }
    }

    // Observability: record session consistency score for dashboards / alerts
    try {
      const score = normalizedAudit.session_consistency_score;
      const domAxiom = pickDominantAxiom(
        matchAxioms(
          buildAxiomMatchContext({
            message: (state as any)?.trip_plan_request?.message,
            constraints: (state as any)?.trip_plan_request?.constraints,
            trip: (state as any)?.trip_plan_request,
            tripId: (state as any)?.trip_plan_request?.trip_id,
            itinerary: (state as any)?.itinerary,
            routeAndRunIntent: (state.metadata as Record<string, unknown>)?.route_and_run_intent as any,
            clarificationAnswers: (state.metadata as Record<string, unknown>)?.clarification_answers as any,
          }),
        ),
      );
      const expectedCid = domAxiom?.axiom?.cid;
      const actualCid = normalizedAudit.dominant_cid;
      const axiomMatchSource = axiomMatchSourceForMetrics(domAxiom);
      this.promMetrics?.recordSessionConsistencyScore({
        score,
        axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
        cid: actualCid ?? expectedCid ?? 'UNKNOWN',
        terminal: true,
      });

      // Runtime proof counters (do not affect control flow)
      try {
        const deltaReason = normalizedAudit.delta_reason;
        const delta_reason_kind =
          deltaReason === 'aligned' ? ('aligned' as const) : deltaReason ? ('mismatch' as const) : ('unknown' as const);

        if (domAxiom?.axiom_id && expectedCid && actualCid && expectedCid !== actualCid) {
          this.promMetrics?.recordAxiomDominantCidMismatch({
            axiom_id: domAxiom.axiom_id,
            expected_cid: normalizeAxiomCidForMetrics(expectedCid),
            actual_cid: normalizeAxiomCidForMetrics(actualCid),
            stage: 'TERMINAL',
            match_source: axiomMatchSource,
          });
        }
        if (delta_reason_kind === 'mismatch') {
          this.promMetrics?.recordAxiomSimRealMismatch({
            axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
            expected_cid: normalizeAxiomCidForMetrics(expectedCid),
            actual_cid: normalizeAxiomCidForMetrics(actualCid),
            stage: 'TERMINAL',
            match_source: axiomMatchSource,
            severity: domAxiom?.axiom?.severity ?? 'UNKNOWN',
          });
        }
      } catch {
        // best-effort only
      }
    } catch {
      // best-effort only
    }

    // Observability (Logs): emit a single atomic audit event for Loki drill-down.
    // Important: only emit on terminal reports to avoid I/O explosion.
    try {
      const deltaReason = normalizedAudit.delta_reason;
      const deltaUtility = normalizedAudit.delta_utility;
      const delta_reason_kind =
        deltaReason === 'aligned' ? ('aligned' as const) : deltaReason ? ('mismatch' as const) : ('unknown' as const);
      const is_intent_revised = normalizedAudit.intent_revision_flag;
      const utility_drift_severity = (() => {
        if (!Number.isFinite(deltaUtility)) return 'unknown' as const;
        const a = Math.abs(deltaUtility);
        if (a <= 5) return 'low' as const;
        if (a <= 20) return 'medium' as const;
        return 'high' as const;
      })();

      const payload = {
        event: 'decision_os_audit_report',
        request_id: state.request_id,
        dominant_cid: normalizedAudit.dominant_cid,
        session_consistency_score: normalizedAudit.session_consistency_score,
        delta_reason_kind,
        is_intent_revised,
        utility_drift_severity,
        audit_report: normalizedAudit.audit_report,
      };
      this.logger.log(JSON.stringify(payload));
    } catch {
      // best-effort only
    }

    // In-Memory Precedents (CBR): 异步抽取并聚合 gold_sample 到本地判例库（不阻塞返回）
    if (this.localCaseStore) {
      Promise.resolve()
        .then(() => {
          const rec = auditReportToCaseRecord({ audit_report: audit_report as any, request_id: state.request_id });
          if (rec) this.localCaseStore!.saveCase(rec);
        })
        .catch(() => undefined);
    }

    if (this.cbrAggregator) {
      void this.cbrAggregator
        .ingestAuditReport(audit_report as any, state.request_id)
        .catch((err) =>
          this.logger.warn(
            `CBR background ingest failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    return {
      success: false,
      result: {
        state,
        needsUserConfirmation: false,
        terminal: {
          type: 'TERMINAL_NO_SOLUTION',
          planGenTerminalFailure: tf,
          violations,
          audit_report,
        } as any,
        ...(decisionState && { decisionState }),
      } as any,
      answerText,
      stepsExecuted: mapOrchestratorDecisionLogToStepsExecuted(state.decision_log),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log,
    };
  }

  /**
   * 收集世界模型数据（通过 Domain Agents）
   */
  private async collectWorldModelData(
    tripRequest: TripPlanRequest,
    researchData: Record<string, any>,
    evidenceRefs: string[],
  ): Promise<void> {
    this.logger.debug(`[Orchestrator] Collecting world model data via Domain Agents`);
    const promises: Promise<void>[] = [];

    // GeoAgent
    if (this.geoAgent && typeof tripRequest.destination === 'object') {
      const coords = tripRequest.destination;
      promises.push(
        this.geoAgent.analyzeTerrain([{ lat: coords.lat, lng: coords.lng }])
          .then(r => { researchData.geo_terrain = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
          .catch(e => this.logger.warn(`[GeoAgent] Failed: ${e?.message}`))
      );
    }

    // WeatherAgent
    if (this.weatherAgent && typeof tripRequest.destination === 'object' && tripRequest.date_range) {
      const coords = tripRequest.destination;
      promises.push(
        this.weatherAgent.getForecast(
          { lat: coords.lat, lng: coords.lng },
          { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date }
        ).then(r => { researchData.weather_forecast = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
          .catch(e => this.logger.warn(`[WeatherAgent] Failed: ${e?.message}`))
      );
    }

    // CostAgent
    if (this.costAgent && tripRequest.destination && tripRequest.date_range) {
      const dest = typeof tripRequest.destination === 'string' ? tripRequest.destination : 'destination';
      promises.push(
        this.costAgent.estimateTripCost(
          dest,
          { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date },
          tripRequest.party?.count || 2
        ).then(r => { researchData.cost_estimate = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
          .catch(e => this.logger.warn(`[CostAgent] Failed: ${e?.message}`))
      );
    }

    await Promise.all(promises);
  }

  /**
   * 收集预测数据（护城河扩展）
   */
  private async collectPredictionData(
    tripRequest: TripPlanRequest,
    researchData: Record<string, any>,
    evidenceRefs: string[],
    request: RouteAndRunRequestDto,
  ): Promise<void> {
    this.logger.debug(`[Orchestrator] Collecting prediction data (护城河扩展)`);

    const promises: Promise<void>[] = [];

    // 1. 天气预测
    if (this.weatherPredictionService && tripRequest.date_range) {
      promises.push(
        this.weatherPredictionService
          .predictWeather('IS', {
            start: new Date(tripRequest.date_range.start_date),
            end: new Date(tripRequest.date_range.end_date),
          })
          .then((predictions) => {
            researchData.weather_predictions = predictions;
            evidenceRefs.push(`weather_predictions_${Date.now()}`);
          })
          .catch((e) =>
            this.logger.warn(`[WeatherPredictionService] Failed: ${e?.message}`),
          ),
      );
    }

    // 2. 失败风险预测
    if (
      this.failureRiskPredictionService &&
      tripRequest.date_range &&
      request.route_direction_id
    ) {
      promises.push(
        this.failureRiskPredictionService
          .predictFailureRisk(
            request.route_direction_id,
            {
              userId: request.user_id,
              riskTolerance: tripRequest.party_profile?.risk_tolerance as any,
              fitness: tripRequest.party_profile?.fitness as any,
            },
            {
              start: new Date(tripRequest.date_range.start_date),
              end: new Date(tripRequest.date_range.end_date),
            },
          )
          .then((prediction) => {
            researchData.failure_risk_prediction = prediction;
            evidenceRefs.push(`failure_risk_prediction_${Date.now()}`);

            // 提前预警高风险日期
            const highRiskDays = prediction.predictions
              .filter((p) => p.riskLevel === 'HIGH')
              .map((p) => p.day);

            if (highRiskDays.length > 0) {
              if (!researchData.warnings) {
                researchData.warnings = [];
              }
              researchData.warnings.push({
                type: 'HIGH_RISK_DAYS',
                days: highRiskDays,
                message: `预测到第${highRiskDays.join(', ')}天存在高风险`,
              });
            }
          })
          .catch((e) =>
            this.logger.warn(`[FailureRiskPredictionService] Failed: ${e?.message}`),
          ),
      );
    }

    await Promise.all(promises);

    // 缺口修复：聚合 weather_risk (0-1) 写入 research_data，供 DSO environmentState.weatherRisk
    const weatherRisk = this.computeWeatherRisk(researchData);
    if (weatherRisk !== undefined) {
      researchData.weather_risk = weatherRisk;
      this.logger.debug(`[Orchestrator] 聚合 weather_risk=${weatherRisk.toFixed(2)}`);
    }
  }

  /**
   * 从 research_data 聚合 weather_risk（缺口解决方案）
   * 数据源：failure_risk_prediction、weather_predictions、weather_forecast
   */
  private computeWeatherRisk(researchData: Record<string, any>): number | undefined {
    return aggregateWeatherRisk(researchData);
  }

  /** 异步 route_and_run 任务进度（无 task 上下文时为 no-op） */
  private touchAsyncTaskProgress(
    step: import('../interfaces/trip-plan.interface').OrchestrationStep,
    customMessage?: string,
  ): void {
    void this.routeAndRunTaskProgress?.reportOrchestrationStep(step, customMessage);
  }
}
