// src/agent/services/claude-orchestrator.service.ts

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LlmService, type LlmTokenContext } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { ActionRegistryService } from './action-registry.service';
import { SimpleLruCache } from './orchestration-utils';
import { createDeadline } from './orchestration-stability.util';
import {
  collectDecisionEvidenceSummaries,
  computeDecisionEvidenceFingerprint,
} from '../utils/decision-evidence-fingerprint.util';
import {
  formatContextBuildInputsZh,
  formatContextBuildOutputsZh,
  formatFeedbackInputsZh,
  formatFeedbackOutputsZh,
  formatGateEvalInputsKernelZh,
  formatGateEvalOutputsZh,
  formatHallucinationInputsZh,
  formatHallucinationOutputsZh,
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
  formatStateUpdateOutputsZh,
  formatVerifyInputsKernelZh,
  formatVerifyOutputsZh,
  formatVerifyPoiClosedOutputsZh,
  formatVerifyTemporalOpeningInputsZh,
} from '../utils/decision-log-user-facing.zh.util';
import { CONSTRAINT_IDS } from './constraint-registry';
import { buildL3PersuasionLine, selectPersuasionMode } from '../utils/narrator-l3-persuasion.util';
import { formatPredictiveFailureReport } from '../utils/repair-causal-explainer.util';
import { calculateEarlyWarningRisk } from '../utils/early-warning-risk-model.util';
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
  collectRepairAlternativesFromStepResults,
  mergeRepairAlternativesBundles,
} from '../utils/collect-repair-alternatives-from-step-results.util';
import { rssRefinedItemsToSafetravelRouteAlerts } from '../../skills/world/safetravel-rss-to-route-verify-alerts.util';
import type {
  IcelandVehicleIntentHints,
  SkillInputIntentSnapshot,
} from '../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  isFactualMacroStatQuery,
  isLocalClockOrTimezoneFactQuery,
  isTripStatusOverviewQuery,
  isWeatherRoadConditionFocusedQuery,
  shouldEnableLiveWeatherMcpForLightweightRoute,
  shouldInjectIcelandRentalGuidanceForLightweight,
  isWestfjordsLegTransportPreferenceConsultation,
} from '../utils/orchestration-signals.util';
import {
  isExecutableFlightInventoryQuery,
  resolveFlightInventoryLegs,
} from '../utils/flight-inventory-signals.util';
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
import {
  isDiningRecommendationQuery,
  messageHasDiningLocationAnchor,
  tripSummaryIndicatesNonEmptyItineraryDraft,
} from '../utils/trip-dining-consultation.util';
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
  inferNightIndex0FromExplicitStayInTripWindow,
  narrowHotelStayWindowWithNlMessage,
  pickSpreadNightIndices,
  wrapSingleHotelPayload,
  diffCalendarDaysYmd,
  type AccommodationNightGroup,
  type HotelPartyAndPreferenceContext,
  type HotelRouteRunUiPayload,
  type RouteAndRunAccommodationCard,
} from '../utils/hotel-mcp-route-run.mapper';
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
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { UserDecisionService } from '../../trips/readiness/services/user-decision.service';
import { TripContext, TravelerProfile, ItineraryInfo } from '../../trips/readiness/types/trip-context.types';
import type { ReadinessCheckResult } from '../../trips/readiness/types/readiness-findings.types';
import { DecisionDraftGeneratorService } from '../../decision-draft/services/decision-draft-generator.service';
import { DecisionReplayService } from './decision-replay.service';
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
import { matchAxioms, pickDominantAxiom } from '../axioms/axiom-matchers';
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
import { GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY } from '../../planning-policy/regions/golden-circle-anchor-retrieval-profile';
import { POI_PLANNING_SCORE_REASON } from '../../planning-policy/constants/poi-planning-score-reasons';
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
  buildContextualPoiSearchQuerySuffix,
  filterPoisByRejectedIds,
} from '../../planning-policy/utils/contextual-poi-search-query.util';
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
    @Optional() private readonly shadowConflictScanner?: ShadowConflictScannerService,
    @Optional() private readonly localCaseStore?: LocalCaseStoreService,
    @Optional() private readonly cbrAggregator?: CbrAggregatorService,
    @Optional() private trajectoryCollection?: TrajectoryCollectionService,
    @Optional() private readonly readinessService?: ReadinessService,
    @Optional() private readonly userDecisionService?: UserDecisionService,
    @Optional() private readonly decisionDraftGenerator?: DecisionDraftGeneratorService,
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
    /** 有 trip_id 时从 Trip 记录回填目的地/日期，避免「已在行程上下文仍追问目的地」 */
    @Optional() @Inject(forwardRef(() => TripsService)) private readonly tripsService?: TripsService,
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
    /** 冰岛租车决策层（与 Booking 租车 MCP 轻量双路合并） */
    @Optional() private readonly icelandRentalGuidanceSkill?: IcelandRentalGuidanceSkill,
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
    replanLineage?: { previous_plan_version?: number; previous_world_snapshot_hash?: string };
    orchestratorPlanVersion?: number;
  } {
    const rc = state.metadata?.replan_context as
      | { previous_plan_version?: number; previous_world_snapshot_hash?: string }
      | undefined;
    return {
      evaluationRunId: request.meta?.run_id,
      ...(rc ? { replanLineage: rc } : {}),
      orchestratorPlanVersion: state.plan_version,
    };
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
    const startTime = Date.now();
    try {
      const response = await this.llmService.callLlmWithSchema(primaryProvider, prompt, schema);
      await this.recordTokenIfEnabled(prompt, response, primaryProvider, startTime, true, tokenContext);
      return response;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${primaryProvider} 失败: ${error?.message}`);
      const fallbackProviders = this.getFallbackProviders(primaryProvider);
      for (const fallbackProvider of fallbackProviders) {
        try {
          this.logger.debug(`[Claude Orchestrator] ${operationName} 尝试降级到 ${fallbackProvider}...`);
          const response = await this.llmService.callLlmWithSchema(fallbackProvider, prompt, schema);
          await this.recordTokenIfEnabled(prompt, response, fallbackProvider, startTime, true, tokenContext);
          return response;
        } catch (fallbackError: any) {
          this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${fallbackProvider} 也失败: ${fallbackError?.message}`);
          continue;
        }
      }
      await this.recordTokenIfEnabled(prompt, '', primaryProvider, startTime, false, tokenContext);
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
   * 默认按日类型骨架；西峡湾接驳、行前装备/徒步、或租车/自驾向问句额外附带「草案地点速览」（Place 名/备注），便于正文结合具体行程项与 POI。
   */
  private async resolveTripPromptSummaryForLightweightQa(
    effectiveTripId: string,
    request: RouteAndRunRequestDto,
  ): Promise<string | null> {
    const tid = effectiveTripId.trim();
    const msgLower = (request.message ?? '').trim().toLowerCase();
    const includeNamedDraftAppendix = this.shouldIncludeNamedDraftAppendixForLightweightQa(
      request.message ?? '',
      msgLower,
    );
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

  /**
   * 是否在轻量咨询骨架外附带「草案地点速览」：西峡湾接驳、行前/装备/徒步、租车/自驾、
   * 天气+路况聚焦问法，以及含路况/封路/天气等影响行程安全的用语时均需结合具体地点与日程项作答，
   * 便于模型将路段信息与草案 Place 对齐（数据喂齐 + 推理，而非 OWL 硬编码）。
   */
  private shouldIncludeNamedDraftAppendixForLightweightQa(message: string, msgLower: string): boolean {
    const m = (message ?? '').trim();
    if (!m) return false;
    if (isWeatherRoadConditionFocusedQuery(m)) return true;
    /** 路况/气象/封路类：附带具名草案，减轻「对不准」具体行程项 */
    if (/路况|封路|天气|风速|能开吗|condition|road\s*status/i.test(msgLower)) return true;
    if (isWestfjordsLegTransportPreferenceConsultation(m, msgLower)) return true;
    if (this.isPreparationGearTravelQuery(m)) return true;
    if (this.isCarRentalOrDrivingTravelQuery(m)) return true;
    return /徒步|登山|爬山|步道|长线|\b(hiking|trekking|trail)\b/i.test(m);
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
   * 轻量咨询并行分支：凡已绑定行程且非「时钟/宏观统计」类短事实问法，均拉取 Pack 准备度摘录（与问法意图无关）。
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
      const formatted = this.formatReadinessFindingsForLightweightPrompt(result);
      this.logger.debug(
        `[LightweightQA] Readiness OK trip_id=${tid} duration_ms=${Date.now() - started} findings=${result.findings?.length ?? 0}`,
      );
      return formatted;
    } catch (e: any) {
      this.logger.warn(`[LightweightQA] Readiness failed trip_id=${tid}: ${e?.message ?? e}`);
      return null;
    }
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
      this.ragRealityPolicyGate.mergeChunkRetrievalParams(p, ragScope);
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
    const tools = request.options?.enable_live_tools ?? [];
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
    const tools = request.options?.enable_live_tools ?? [];
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
    const tools = request.options?.enable_live_tools ?? [];
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
  ): Promise<{ location: string; countryCode?: string } | null> {
    const msg = request.message ?? '';
    const hints: Array<{ re: RegExp; location: string; countryCode?: string }> = [
      { re: /斯奈山|斯奈费尔|Snæfellsnes|Snaefellsnes/i, location: 'Snæfellsnes Peninsula, Iceland', countryCode: 'IS' },
      { re: /\b维克\b|Vík\b|Vik\b/i, location: 'Vík í Mýrdal, Iceland', countryCode: 'IS' },
      { re: /赫本|霍芬|Höfn|Hofn/i, location: 'Höfn, Iceland', countryCode: 'IS' },
      { re: /雷克雅未克|Reykjavik|Reykjavík/i, location: 'Reykjavik, Iceland', countryCode: 'IS' },
    ];
    for (const h of hints) {
      if (h.re.test(msg)) return { location: h.location, countryCode: h.countryCode };
    }
    if (effectiveTripId) {
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
    if (/冰岛|\bIceland\b/i.test(msg)) return { location: 'Iceland', countryCode: 'IS' };
    return null;
  }

  private formatLiveWeatherSensorBlock(data: Record<string, unknown>): string {
    const cur = data?.current as Record<string, unknown> | undefined;
    if (!cur) {
      return `【实时天气传感器 MCP】原始响应（截断）：${JSON.stringify(data).slice(0, 1200)}`;
    }
    const city = data.city ?? '?';
    const country = data.country ?? '';
    return [
      '【实时天气传感器 MCP】以下为 Open-Meteo 当前观测读数（非生成文案）：',
      `- 查询地: ${city} (${country})`,
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

  /** 与 buildStaySegmentLabelZh 同一锚点：入住当日最后一项行程 POI（需含 geometry） */
  private async getStayAnchorGeoForNight(
    tripId: string,
    checkInYmd: string,
  ): Promise<{ lat: number; lng: number; nameZh: string } | null> {
    if (!this.prisma) return null;
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
          AND td.date::date = ${checkInYmd}::date
          AND p.location IS NOT NULL
        ORDER BY ii."order" DESC NULLS LAST, ii."startTime" DESC NULLS LAST
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

  /** 为 MCP 住宿卡片写入相对当日锚点的直线距离（km），供前端与传感器摘要展示 */
  private async enrichHotelRouteRunUiPayloadWithAnchorDistances(
    payload: HotelRouteRunUiPayload,
    tripId: string,
    tripFirstCheckInYmd: string,
  ): Promise<void> {
    if (!payload.accommodations?.length) return;
    const nights = new Set(payload.accommodations.map((c) => c.nightIndex ?? 1));
    const anchorByNight = new Map<number, { lat: number; lng: number; nameZh: string } | null>();
    for (const n of nights) {
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
        block: this.formatLiveWeatherSensorBlock(data),
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
  ): Promise<{
    audits: LiveSensorAuditRow[];
    block: string | null;
    /** 供前端渲染住宿卡片（与 Planning Assistant routing.target=hotel 对齐） */
    hotelRouteRunUi?: HotelRouteRunUiPayload;
  }> {
    const audits: LiveSensorAuditRow[] = [];
    if (!this.shouldAttemptHotelSensor(request, context)) {
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
            await this.enrichHotelRouteRunUiPayloadWithAnchorDistances(hotelRouteRunUi, tripId, ci);
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
        mode: 'per_night_sample',
        segments: segments.length,
        merged_cards: merged?.accommodations?.length ?? 0,
      });

      if (!merged) {
        return { audits, block: null };
      }

      await this.enrichHotelRouteRunUiPayloadWithAnchorDistances(merged, tripId!, ci);

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
      if (effectiveTripId && !lightweightTriviaFact) {
      const summary = await this.resolveTripPromptSummaryForLightweightQa(effectiveTripId, request);
      if (summary) {
        tripContextLines = [
          '以下为本系统中该关联行程的已知信息（请据此回答季节、时长与目的地相关建议；勿声称无法读取日期或行程概况；未列出的活动/住宿等细节仍勿编造）：',
          summary,
        ];
      }
    }
    if (effectiveTripId && tripContextLines.length === 0 && !lightweightTriviaFact) {
      tripContextLines = [
        `关联行程 ID：${effectiveTripId}（后台未查到对应行程记录，或请求未携带 trip_id；仅可根据问题做一般性建议，勿编造具体日程）。`,
      ];
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
    const westfjordsAirConsult = isWestfjordsLegTransportPreferenceConsultation(
      request.message ?? '',
      msgLower,
    );
    const tripStatusOverview =
      Boolean(effectiveTripId) &&
      isTripStatusOverviewQuery(request.message ?? '', msgLower) &&
      !weatherRoadFocused;
    const needsNamedDraftAppendixForLightweight = this.shouldIncludeNamedDraftAppendixForLightweightQa(
      request.message ?? '',
      msgLower,
    );
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
    /** 所有绑定行程的轻量问均跑 Readiness（排除当地时间/GDP 等 trivia，不注入行程摘要的同路径） */
    const wantReadinessForLightweight =
      Boolean(effectiveTripId) && !lightweightTriviaFact && !!this.readinessService;

    const [wBranch, fBranch, hBranch, rBranch, readinessSupplement, structuredRagBiasZh, gBranch] = lightweightTriviaFact
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
        ]
      : await Promise.all([
          this.runLiveWeatherSensorBranch(request, context, effectiveTripId),
          this.runLiveFlightSensorBranch(request, context, effectiveTripId),
          this.runLiveHotelSensorBranch(request, context, effectiveTripId),
          this.runLiveCarRentalSensorBranch(request, context, effectiveTripId),
          this.runLightweightReadinessSupplement(effectiveTripId, request.message ?? '', wantReadinessForLightweight),
          this.resolveTripnaraStructuredRagBiasForLightweight(request),
          this.runIcelandRentalGuidanceLightweightBranch(request, tripCtxJoined),
        ]);
    const liveSensorAudit: LiveSensorAuditRow[] = [
      ...wBranch.audits,
      ...fBranch.audits,
      ...hBranch.audits,
      ...rBranch.audits,
      ...gBranch.audits,
    ];

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

    const prompt = [
      ...(clockFactOnly
        ? ['你是专业旅行顾问。', ...this.buildLightweightClockFactPromptLines(request.message ?? '')]
        : macroStatFactOnly
          ? ['你是专业旅行顾问。', ...this.buildLightweightMacroStatFactPromptLines()]
          : [
              '你是专业旅行顾问。当前请求被路由为「咨询/检索」类（非完整多日行程 JSON 生成）。',
              '请用清晰中文回答：可包含预算区间、油价/租车参考、门票大致范围；无法确定时请说明假设。',
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
            '**不要**套用「行程进度/概览」式结构去展开住宿、餐饮、亮点盘点或长篇租车攻略；除非用户同时明确要求评估行程总体准备度。',
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
        ? [
            '【行程进度/概览问法】用户关心的是当前草稿的整体状态（准备度、吃住是否有着落、有无明显不合理），而非仅复述时间轴或罗列景点卡片。',
            '请按以下结构组织回答（小标题可用 `-` 或加粗，保持简洁）：',
            '- **当前摘要**：一句话说明行程覆盖的核心区域/城市或路线主轴。',
            '- **住宿**：基于上文摘要与日程草案判断——是否已体现酒店/民宿预订或过夜城镇；若仅有日间景点而无住宿线索，须明确写「当前摘要未显示住宿预订，建议补充」或等价表述；勿编造预订记录。',
            '- **餐饮**：草案或摘要中是否安排了午餐/晚餐或留出用餐时段；若仅有景点时段而无餐饮安排，须点名缺口并建议（例如在哪些城镇预留正餐时间）；勿编造具体餐厅名除非摘录或日程已给出。',
            '- **亮点介绍**：1–2 点最吸引人的安排（基于上文摘要与已知日程事实，勿编造未出现的 POI）。',
            '- **不合理与风险（须直接可执行）**：若存在过密、绕路、衔接过紧、季节/路况或体力不匹配等问题，请**直接给出改法**；若无明显问题，写「未发现明显硬伤」。',
            '- **准备度小结**：用一句话给出准备度档位（如：高/中/低）并列出 2～4 条最关键的待办（证件、保险、装备、预订缺口等）。',
            '【Dashboard 强约束】此类问法且已绑定行程时：`<<<CONSULTATION_UI_JSON>>>` 块**禁止省略**；`summary_cards` 至少 4 张，语义分别覆盖：**预算区间与口径**、**驾驶或日程强度/松紧**、**核心游览区域或主轴**、**最大风险或优先优化点**（标题可用简短中文；value/hint 与正文一致）。',
          ]
        : []),
      ...tripContextLines,
      ...(hardOntologyAppendixLines.length > 0 ? hardOntologyAppendixLines : []),
      ...(readinessSupplement
        ? [
            '【目的地准备度规则引擎摘录】来自目的地知识 Pack 的自动检查（仅供参考；个案以官方与实时政策为准）。若与上文「知识库检索摘录」并存，装备/签证类以准备度必做/建议为准组织回答，并注明差异原因。',
            readinessSupplement,
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
      ...(gBranch.promptLines.length ? ['', ...gBranch.promptLines] : []),
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
      const rt = context.routingTaskType;
      if (rt === 'DATA_LOOKUP' || rt === 'GENERIC_QA' || rt === 'RAG_QA') {
        this.logger.log(
          `[Claude Orchestrator] routingTaskType=${rt}，走轻量知识问答路径（跳过 Skill 选择与 itinerary 类校验）`,
        );
        return await this.orchestrateLightweightKnowledgeQuery(request, context, deadline, llmProvider, startTime);
      }

      /** 已绑定行程的 TRIP_PLANNING：动态 Skill DAG 不会在 INTAKE 注入 planState/itinerary，校验必报缺 planState/request/itinerary → 统一走状态机 */
      const boundTripId = (request.trip_id || context.tripId || '').trim();
      if (boundTripId && rt === 'TRIP_PLANNING') {
        this.logger.log(
          `[Claude Orchestrator] 已绑定 trip_id 且 TRIP_PLANNING → 状态机编排（避免 CLAUDE_DYNAMIC Skills 缺参）request_id=${request.request_id}`,
        );
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

      // 1. 使用 LLM 分析用户意图（原有流程，作为fallback）
      this.logger.debug(`[Claude Orchestrator] 步骤 1/6: 分析用户意图...`);
      const intentAnalysis = await this.analyzeIntent(request, context, llmProvider);
      this.logger.log(`[Claude Orchestrator] ✅ 意图分析完成: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`);

      // 2. 使用 LLM 选择路由策略
      this.logger.debug(`[Claude Orchestrator] 步骤 2/6: 选择路由策略...`);
      const routingDecision = await this.decideRouting(intentAnalysis, llmProvider, request.request_id);
      this.logger.log(
        `[Claude Orchestrator] ✅ 路由决策完成: ${routingDecision.route}, 置信度: ${routingDecision.confidence}`,
      );

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
      this.logger.debug(`[Claude Orchestrator] 步骤 4/6: 选择 Skills...`);
      const skillsPlan = await this.selectSkills(
        intentAnalysis,
        routingDecision,
        context,
        llmProvider,
        request.request_id,
        request.emergency_constraints,
      );
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
            results[step.id] = mergedSkillResult;
            
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
            results[step.id] = result;
            
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
                  results[step.id] = merged;
                  
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
                  results[step.id] = result;
                  
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
    return `
${INTENT_ANALYSIS_PROMPT}

[用户请求]
${request.message}

[上下文信息]
- 用户 ID: ${context.userId}
- 行程 ID: ${context.tripId || '无'}
- 对话历史: ${context.conversationHistory?.join('\n') || '无'}

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

    return input;
  }

  /** skillName → OrchestrationStep（用于 Token 按阶段打点） */
  private mapSkillNameToStep(skillName?: string): import('../../agent/interfaces/trip-plan.interface').OrchestrationStep {
    if (!skillName) return 'INTAKE';
    if (skillName.includes('gate') || skillName.includes('runThreeGuardians') || skillName.includes('precheck')) return 'GATE_EVAL';
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
    const startTime = Date.now();
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
        this.logger.debug(
          `[Claude Orchestrator] Durable resume: DSO 已加载 admission_step=${String(step)} skip_intake=${resumeSkipIntake}`,
        );
      }
    } else if (this.decisionKernel && this.isKernelEnabledForRequest(request)) {
      decisionState = this.decisionKernel.createInitialState(
        request.request_id,
        this.kernelCreateInitialOpts(request, state),
      );
      this.logger.debug(`[Claude Orchestrator] DSO 已初始化: requestId=${request.request_id}`);
    }

    try {
      // 步骤 1: INTAKE - 解析请求 & 缺口识别（Durable：lastStep=INTAKE 时跳过重复 INTAKE）
      if (!resumeSkipIntake) {
        await this.executeIntakeStep(request, context, state, llmProvider);
      } else {
        this.logger.log('[Claude Orchestrator] Durable resume: 跳过 INTAKE，进入 STATE_UPDATE');
        state.current_step = 'STATE_UPDATE';
        state.metadata.last_updated_at = new Date().toISOString();
      }
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 2: STATE_UPDATE - Phase 2.3 显式 DSO 同步
      decisionState = await this.executeStateUpdateStep(state, decisionState) ?? decisionState;
      this.maybeSnapshot(state, 'AUTO');

      // 在 DSO 里记录本轮澄清 fingerprint 与重复尝试次数（用于高亮 accept_no_solution 等防御性策略）
      if (this.decisionKernel && decisionState) {
        const fp = (state.metadata as any)?.last_relaxation_fingerprint as string | undefined;
        if (fp) {
          const prev = decisionState.systemState?.lastRelaxationFingerprint;
          const prevSame = decisionState.systemState?.consecutiveSameRelaxationAttempts ?? 0;
          const same = prev && prev === fp;
          const nextSame = same ? prevSame + 1 : 0;
          const prevRetry = decisionState.systemState?.planGenRetryCount ?? 0;
          decisionState = this.decisionKernel.updateState(decisionState, {
            systemState: {
              requestId: state.request_id,
              lastRelaxationFingerprint: fp,
              consecutiveSameRelaxationAttempts: nextSame,
              planGenRetryCount: prevRetry + 1,
            } as any,
          });
        }
      }

      // 用户批准终止：优雅拒绝出口（不进入 RESEARCH/Gate/Plan）
      const terminalIntent = (state.metadata as any)?.terminal_intent as string | undefined;
      if (terminalIntent === 'TERMINAL_NO_SOLUTION') {
        this.logger.warn(`[Claude Orchestrator] TERMINAL_NO_SOLUTION confirmed by user; halting orchestration.`);
        state.current_step = 'DONE';
        state.verdict = 'REJECT';
        state.metadata.last_updated_at = new Date().toISOString();
        state.metadata.total_duration_ms = Date.now() - startTime;
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildTerminalNoSolutionResult(state, startTime, decisionState, context);
      }

      // HARD 缺口 + 已生成澄清问题：必须在 RESEARCH 之前返回，避免 transport.search 等技能在「未指定」上失败
      if (this.shouldReturnClarificationForHardGaps(state)) {
        const compileHard =
          state.gaps?.find(
            (g) =>
              g?.severity === 'HARD' &&
              (g.type === 'INTENT_COMPILE_ERROR' || g.type === 'SPEC_TYPE_ERROR'),
          ) ?? null;
        if (compileHard) {
          state.decision_log.push({
            request_id: state.request_id,
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
              allow_partial: state.metadata?.allow_partial === true,
            },
          });
        }
        this.logger.debug(
          `[Claude Orchestrator] HARD 缺口且已有澄清问题，跳过 RESEARCH/Gate/Plan，直接返回澄清`,
        );
        return this.buildClarificationResult(state, startTime, decisionState, context);
      }

      // 步骤 3: RESEARCH - KERNEL_NATIVE_EXECUTION 时走 Kernel.executeResearch，否则走 callback
      decisionState = await this.executeResearchPhase(decisionState, state, request, context, llmProvider);
      this.maybeSnapshot(state, 'AUTO');

      const transportIntercept = this.maybeInterceptDegradedTransportEvidence(
        state,
        decisionState,
        startTime,
        context,
      );
      if (transportIntercept) {
        this.logger.warn(
          '[Claude Orchestrator] RESEARCH 拦截：交通证据需澄清端点（ClarifyEndpoints），已返回 NEED_USER_CONFIRM',
        );
        return transportIntercept;
      }
      if ((state.metadata as any)?.transport_clarify_force_reinject) {
        (state.metadata as any) = { ...(state.metadata ?? {}), transport_clarify_force_reinject: false };
      }

      // Early Warning：RESEARCH 后前置侦察（不阻断；仅写入 metadata/decision_log，供 UI 提示）
      if (this.shadowConflictScanner) {
        try {
          const ew = await this.shadowConflictScanner.scan({
            decisionKernel: this.decisionKernel,
            decisionState,
            state,
            request,
          });
          if (ew) {
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
            (state.metadata as any) = { ...(state.metadata ?? {}), early_warning: withId };
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
          }
        } catch (e: any) {
          this.logger.debug(`[Claude Orchestrator] Early warning scan skipped: ${e?.message}`);
        }
      }

      // INTAKE 形式化仿真：PREDICTIVE_FAILURE_REPORT（可与 Shadow EW 叠加；核心载荷为 SimulatedRepairTrace[]）
      const intakeSim = (state.metadata as any)?.intake_simulation as
        | { simulatedRepairTraces?: import('../services/route-feasibility.types').SimulatedRepairTrace[] }
        | undefined;
      const simTraces = intakeSim?.simulatedRepairTraces ?? [];
      if (simTraces.length > 0) {
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
        const existingEw = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
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

      // 预防性放宽闭环：HIGH/CRITICAL 在进入 POI 前强制澄清；下一回合 `clarification_answers` 由 ClarificationHandlerService 与 PLAN_GEN 同源 Patch
      const ewMeta = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
      if (ewMeta && (ewMeta.risk_level === 'HIGH' || ewMeta.risk_level === 'CRITICAL')) {
        const clarAnswers = (request as any).clarification_answers as Array<{ questionId?: string }> | undefined;
        const answeredEarlyWarning = clarAnswers?.some((a) => a?.questionId === 'early_warning_relaxations');
        const earlyWarningAcknowledged =
          (state.metadata as any)?.early_warning_acknowledged === true ||
          decisionState?.systemState?.earlyWarningAcknowledged === true;
        if (!answeredEarlyWarning && !earlyWarningAcknowledged) {
            // A/B 实验：50% 保留传统模糊措辞，50% 注入 L3 级论证风格的劝说语句。
          const ab = (() => {
            // djb2:deadbeef -> 取低 8 位十六进制数字作为稳定分桶标识
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
          if (list.length > 0) {
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
             // 注意：early_warning 处于行程生成之前阶段；我们此时尚无具体的数值宽松量。
             // 但我们仍会展示一个确定性的“硬约束”横幅，包含 cid 和证据摘要。
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

            // 约束评分器：对选项进行排序，以打破振荡 / 优先处理硬物理约束。
            const topPrecedent = Array.isArray((ewMeta as any).historical_precedents)
              ? ((ewMeta as any).historical_precedents[0] as any)
              : undefined;
            const oscillation_k = decisionState?.systemState?.consecutiveSameRelaxationAttempts ?? 0;
            const dominant_cid =
              String((decisionState as any)?.constraints?.violations?.[0]?.type ?? '').trim() ||
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
                options: ([
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
                ] as any),
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
                options_snapshot: (state.clarification_questions?.[0] as any)?.options ?? [],
                ew_prompt_ab: ab,
                failure_risk_score,
                failure_risk_reason: risk.reason,
                failure_risk_confidence: risk.confidence,
                ...(l3Line ? { ew_l3_line: l3Line } : {}),
                ...(failure_prob_hint ? { failure_prob_hint } : {}),
              },
            });
            state.metadata.last_updated_at = new Date().toISOString();
            state.metadata.total_duration_ms = Date.now() - startTime;
            this.maybeSnapshot(state, 'CHECKPOINT');
            return this.buildClarificationResult(state, startTime, decisionState, context);
          }
        }
      }

      // 步骤 4: POI_SELECTION - 明确执行 POI 选择/排序，不直接从 RESEARCH 跳到 PLAN_GEN
      const poiSelectionResult = await this.executePoiSelectionStep(state, decisionState);
      this.maybeSnapshot(state, 'AUTO');
      if (poiSelectionResult.allowWithFallback) {
        this.logger.debug('[Claude Orchestrator] POI_SELECTION 无数据，触发 FALLBACK');
        this.applyFallbackPlan(state);
        this.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
        state.current_step = 'DONE';
        state.metadata.last_updated_at = new Date().toISOString();
        state.metadata.total_duration_ms = Date.now() - startTime;
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildSuccessResult(state, startTime, decisionState, context);
      }
      if (poiSelectionResult.needsClarification) {
        this.logger.debug(
          `[Claude Orchestrator] POI_SELECTION 无同国家候选，返回 NEED_MORE_INFO`,
        );
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildClarificationResult(state, startTime, decisionState, context);
      }

      // 步骤 5: GATE_EVAL - KERNEL_NATIVE_EXECUTION 时走 Kernel.executeGateEval
      decisionState = await this.executeGateEvalPhase(decisionState, state, request, context, llmProvider);
      this.relaxGateForPartialIfEligible(state);
      this.maybeSnapshot(state, 'AUTO');

      // 如果 Gate 结果为 BLOCK，直接返回
      if (state.gate_result?.gate_result === 'BLOCK') {
        this.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildBlockedResult(state, startTime, decisionState, context);
      }

      // 步骤 6: CONTEXT_BUILD - Phase 2.3 在 PLAN 前构建 Context
      decisionState = await this.executeContextBuildStep(request, context, state, decisionState);
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 7: PLAN_GEN - KERNEL_NATIVE_EXECUTION 时走 Kernel.executePlanGen
      decisionState = await this.executePlanGenPhase(decisionState, state, request, context, llmProvider);
      this.maybeSnapshot(state, 'AUTO');

      // PLAN_GEN 空草案：系统动作短路 — 不进入 OPTIMIZE/VERIFY/NARRATE，避免无依据行程建议
      const itineraryDays = Array.isArray((state.itinerary as any)?.days) ? (state.itinerary as any).days.length : 0;
      if (itineraryDays === 0 && this.decisionKernel && decisionState && !decisionState.systemState?.planGenTerminalFailure) {
        const inconsistent: PlanGenTerminalFailure = {
          code: 'INCONSISTENT_EMPTY_DRAFT',
          message: 'Itinerary is empty but no terminal failure was signaled.',
        };
        decisionState = this.decisionKernel.updateState(decisionState, {
          systemState: {
            requestId: state.request_id,
            currentPhase: 'PLAN_GEN',
            planGenTerminalFailure: inconsistent,
          } as any,
        });
      }

      const planGenTf = decisionState?.systemState?.planGenTerminalFailure;
      if (planGenTf) {
        this.logger.warn(
          `[Claude Orchestrator] PLAN_GEN 空草案终止: code=${planGenTf.code} system_action=${SYSTEM_ORCHESTRATOR_ACTIONS.PLAN_GEN_EMPTY_DRAFT_HALT}`,
        );
        const mustInclude =
          decisionState?.userIntent?.mustIncludePoiIds ??
          (state.trip_plan_request as any)?.must_include_poi_ids ??
          [];
        const days =
          decisionState?.userIntent?.days ??
          (state.trip_plan_request as any)?.days ??
          undefined;

        const vehicleRequiredRaw =
          (decisionState?.environmentState as any)?.routeCorridorWorld?.constraints?.vehicleRequired ??
          (decisionState?.environmentState as any)?.routeCorridorWorld?.constraints?.vehicle_requirement ??
          (state.research_data as any)?.routeCorridorWorld?.constraints?.vehicleRequired ??
          (state.research_data as any)?.route_corridor_world?.constraints?.vehicleRequired;
        const vehicleRequired = typeof vehicleRequiredRaw === 'string' ? vehicleRequiredRaw.toLowerCase() : '';
        const assumedVehicleType =
          typeof (state.trip_plan_request as any)?.constraints?.vehicle_type === 'string'
            ? String((state.trip_plan_request as any).constraints.vehicle_type)
            : '2WD';

        const need4x4 = /4x4|4wd|四驱/.test(vehicleRequired);
        const userIs2wd = /2wd|两驱|2驱|2x4/i.test(assumedVehicleType) || assumedVehicleType === '2WD';

        const labelWithFixTypes = (
          base: string,
          fixed: boolean,
          impact?: string,
          fixedTypes?: string[],
        ): string => {
          const fx =
            fixedTypes && fixedTypes.length > 0
              ? `｜效果: 解决${fixedTypes.map((t) => `【${t}】`).join('')}冲突`
              : '';
          return `${base}（${fixed ? 'high_probability_fixed' : 'needs_more_changes'}）${impact ? `｜Impact: ${impact}` : ''}${fx}`;
        };

        const clone = <T,>(v: T): T => {
          const sc = (globalThis as any).structuredClone as ((x: any) => any) | undefined;
          if (typeof sc === 'function') return sc(v);
          return JSON.parse(JSON.stringify(v)) as T;
        };

        const baseViolations = ((decisionState as any).constraints?.violations ??
          (state.gate_result as any)?.violations ??
          []) as Array<{ type?: string }>;
        const baseVTypes = new Set(baseViolations.map((v) => String(v?.type ?? '')).filter(Boolean));
        const baseCount = baseViolations.length;

        const shadowGate = async (
          patchTrip: (t: any) => any,
        ): Promise<{ fixed: boolean; improved: boolean; fixedTypes: string[]; afterCount: number; afterTypes: string[] }> => {
          if (!this.decisionKernel || !decisionState) {
            return { fixed: false, improved: false, fixedTypes: [], afterCount: baseCount, afterTypes: Array.from(baseVTypes) };
          }
          const shadowDso = clone(decisionState);
          const shadowTrip = patchTrip(clone(state.trip_plan_request ?? { request_id: state.request_id, origin: '', destination: '' }));
          const ctx = {
            requestId: state.request_id,
            routeDirectionId: (request as any).route_direction_id ?? undefined,
            userId: (request as any).user_id,
            tripPlanRequest: shadowTrip,
            researchData: state.research_data,
          };
          const { gateResult } = await this.decisionKernel.executeGateEval(shadowDso as any, ctx as any);
          const vs = (gateResult.violations ?? []) as Array<{ type?: string }>;
          const afterTypes = vs.map((v) => String(v?.type ?? '')).filter(Boolean);
          const afterSet = new Set(afterTypes);
          const fixedTypes = Array.from(baseVTypes).filter((t) => !afterSet.has(t)).map((t) => this.violationTypeToCn(t));
          const afterCount = vs.length;
          const fixed = afterCount === 0;
          const improved = afterCount < baseCount;
          return { fixed, improved, fixedTypes, afterCount, afterTypes };
        };

        const optA = (() => {
          // 空间约束：MustIncludePoi vs TotalTripDuration
          if (!Array.isArray(mustInclude) || mustInclude.length === 0 || typeof days !== 'number' || !Number.isFinite(days)) {
            return undefined;
          }
          const fixed = mustInclude.length <= Math.max(1, Math.floor(days) + 1);
          return {
            value: 'increase_days_by_1',
            label: labelWithFixTypes(
              `将总天数增加 1 天（${days}→${days + 1}）以容纳必去点`,
              fixed,
              `近似将必去点容量上限从 ${Math.max(1, Math.floor(days) + 1)} 提升到 ${Math.max(1, Math.floor(days + 1) + 1)}`,
            ),
          };
        })();

        const optB = (() => {
          if (!Array.isArray(mustInclude) || mustInclude.length === 0) return undefined;
          const fixed = typeof days === 'number' ? mustInclude.length - 1 <= Math.max(1, Math.floor(days)) : true;
          return {
            value: 'drop_one_must_include_poi',
            label: labelWithFixTypes(
              '移除 1 个必去点（最小冲突集近似）',
              fixed,
              `必去点数量从 ${mustInclude.length} 降至 ${Math.max(0, mustInclude.length - 1)}`,
            ),
          };
        })();

        const optC = (() => {
          // 准入约束：F-road vs Vehicle
          if (!need4x4) return undefined;
          const fixed = true; // 升级车辆能力本身即满足该原子冲突（不保证全局可行，但对该冲突是“高概率修复”）
          return {
            value: 'upgrade_vehicle_to_4wd',
            label: labelWithFixTypes(
              '将车辆能力升级为 4WD/4x4（满足 F-road 准入）',
              fixed && userIs2wd,
              vehicleRequiredRaw ? `满足车辆要求：${String(vehicleRequiredRaw)}` : undefined,
            ),
          };
        })();

        const optionsBase = [optC, optA, optB].filter(Boolean) as Array<{ value: string; label: string }>;

        // 真正 Dry-Run：对每个 option 构造 shadow tripPlanRequest，执行 Kernel.executeGateEval 并回填 delta（violation types）
        const dryRunResults = await Promise.all(
          optionsBase.map(async (o) => {
            const r = await shadowGate((t) => {
              const next = { ...t, constraints: { ...(t.constraints ?? {}) } } as any;
              if (o.value === 'upgrade_vehicle_to_4wd') next.constraints.vehicle_type = '4WD';
              if (o.value === 'increase_days_by_1') {
                if (next.date_range?.end_date) {
                  const end = new Date(next.date_range.end_date + 'T00:00:00Z');
                  if (!Number.isNaN(end.getTime())) {
                    const plus = new Date(end);
                    plus.setUTCDate(plus.getUTCDate() + 1);
                    next.date_range = { ...next.date_range, end_date: plus.toISOString().slice(0, 10) };
                  }
                } else if (typeof next.days === 'number' && Number.isFinite(next.days)) {
                  next.days = Math.max(1, Math.floor(next.days) + 1);
                }
              }
              if (o.value === 'drop_one_must_include_poi') {
                const arr = Array.isArray(next.must_include_poi_ids) ? [...next.must_include_poi_ids] : [];
                if (arr.length > 0) arr.pop();
                next.must_include_poi_ids = arr;
              }
              return next;
            });
            const fixed = r.fixed;
            const improved = r.improved;
            const fixedTypes = r.fixedTypes;
            const scoreLabel = fixed
              ? 'high_probability_fixed'
              : improved
                ? `needs_more_changes（improved ${baseCount}→${r.afterCount}）`
                : 'needs_more_changes';
            const enrichedLabel = `${o.label}`.replace(
              /\（(high_probability_fixed|needs_more_changes)\）/,
              `（${scoreLabel}）`,
            ) + (fixedTypes.length ? `｜效果: 解决${fixedTypes.map((t) => `【${t}】`).join('')}冲突` : '');
            return { value: o.value, label: enrichedLabel, fixed };
          }),
        );

        const anyHigh = dryRunResults.some((r) => r.label.includes('high_probability_fixed'));
        const sameAttempts = decisionState?.systemState?.consecutiveSameRelaxationAttempts ?? 0;
        const recommendTermination = sameAttempts >= 2;
        // 约束评分器 + 最小割集分组，用于 PLAN_GEN 空草案的澄清说明。
        const dominant_cid =
          String((decisionState as any)?.constraints?.violations?.[0]?.type ?? '').trim() ||
          (need4x4 ? 'REACHABILITY_HARD' : mustInclude?.length ? 'SCOPE' : 'MIXED');
        const is_hard = need4x4 || String((baseViolations?.[0] as any)?.severity ?? '').toUpperCase() === 'HARD';
        const ewMetaTop = (state.metadata as any)?.early_warning?.historical_precedents?.[0] as any | undefined;

        const scored = dryRunResults.map(({ value, label }) => {
          const id = value as RelaxationActionId;
          const persuasion = this.localCaseStore?.getPersuasionRate({
            signature: SignatureBuilder.buildConversionSignature({
              conflict_type: (need4x4 ? 'REACHABILITY' : mustInclude?.length ? 'SCOPE' : 'MIXED') as any,
              primary_violation_type: dominant_cid,
              region_id: (state.trip_plan_request as any)?.region_id,
              start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
            }),
            action: id,
          });
          const breakdown = ConstraintScorer.calculateScore(id, {
            dominant_cid,
            is_hard,
            oscillation_k: sameAttempts,
            precedent: ewMetaTop,
            preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
            persuasion,
            delta: 1.5,
          });
          return { value: id, label, breakdown };
        });
        scored.sort((a, b) => b.breakdown.score - a.breakdown.score);

        const grouped = groupMinCutPaths({ dominant_cid, is_hard, options: scored });
        const decorate = (prefix: string, o: (typeof scored)[number]) => ({
          value: o.value,
          label: `${prefix}${o.label}${
            o.breakdown.precedent_n > 3 && typeof ewMetaTop?.stats?.historical_late_accept_rate === 'number'
              ? `｜判例: N=${o.breakdown.precedent_n}, ${(ewMetaTop.stats.historical_late_accept_rate * 100).toFixed(0)}% 最终采纳`
              : o.breakdown.precedent_n >= 1
                ? `｜判例: N=${o.breakdown.precedent_n}`
                : ''
          }`,
          metadata: {
            score: o.breakdown.score,
            weights: o.breakdown.weights,
            dominant_cid: o.breakdown.dominant_cid,
            precedent_n: o.breakdown.precedent_n,
            terms: o.breakdown.terms,
            path: prefix.includes('路径 A') ? 'A' : prefix.includes('路径 B') ? 'B' : 'OTHER',
          },
        });

        const options = ([
          ...grouped.pathA.map((o) => decorate('【路径 A·推荐】', o)),
          ...grouped.pathB.map((o) => decorate('【路径 B·可选】', o)),
          ...grouped.other.map((o) => decorate('【可选】', o)),
          {
            value: 'accept_no_solution',
            label: `${recommendTermination ? '【推荐】' : ''}保持所有约束不变（TERMINAL_NO_SOLUTION｜CONSENSUS_REACHED: NO_FEASIBLE_PATH）${
              recommendTermination ? '（已连续多次尝试当前约束，物理冲突仍无法消除）' : ''
            }`,
            metadata: {
              score: ConstraintScorer.calculateScore('accept_no_solution', {
                dominant_cid,
                is_hard,
                oscillation_k: sameAttempts,
                precedent: ewMetaTop,
                preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
              }).score,
              dominant_cid,
              precedent_n: typeof ewMetaTop?.sample_count === 'number' ? ewMetaTop.sample_count : 0,
              path: 'OTHER',
            },
          },
        ] as any);

        state.errors.push({
          step: 'PLAN_GEN',
          error_code: planGenTf.code,
          message: planGenTf.message,
          timestamp: new Date().toISOString(),
        });
        state.clarification_questions = [
          {
            id: 'plan_gen_empty_draft_relax_constraints',
            question: `${
              recommendTermination
                ? `[SYSTEM_ACTION]: 观察到多次尝试未果（连续相同放宽尝试次数=${sameAttempts}）。建议保持当前约束终止规划，或尝试更高强度的组合放宽。\n\n`
                : ''
            }${planGenTf.message} 系统已停止后续验证与行程叙述，以免产生无依据建议。请选择一个“放宽约束”的动作（已做影子预演/近似检查并标注置信度）。`,
            type: anyHigh ? 'single_choice' : 'multi_choice',
            required: true,
            options:
            options.length > 0
                ? options
                : [
                    {
                      value: 'manual_relax_constraints',
                      label: labelWithFixTypes('手动描述你愿意放宽的约束（改期/减少必去点/降低强度）', false),
                    },
                  ],
            hint: planGenTf.detail ? `技术详情：${planGenTf.detail}` : undefined,
          },
        ];
        state.decision_log.push({
          request_id: state.request_id,
          step: 'PLAN_GEN',
          actor: 'Orchestrator',
          inputs_summary: 'PLAN_GEN_EMPTY_DRAFT → clarification options snapshot',
          outputs_summary: `PLAN_GEN_EMPTY_DRAFT_CLARIFICATION: options=${Array.isArray(options) ? options.length : 0}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'PLAN_GEN_EMPTY_DRAFT_CLARIFICATION',
            options_snapshot: options ?? [],
            dominant_cid,
            is_hard,
          },
        });
        state.current_step = 'DONE';
        state.metadata.last_updated_at = new Date().toISOString();
        state.metadata.total_duration_ms = Date.now() - startTime;
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildClarificationResult(state, startTime, decisionState, context);
      }

      // 步骤 8:优化（OPTIMIZE）- 阶段 2.3：抽取优化提示
      decisionState = await this.executeOptimizeStep(state, decisionState);
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 9: 验证（VERIFY）- 当执行模式为 KERNEL_NATIVE_EXECUTION 时，走 Kernel.executeVerify 路径
      decisionState = await this.executeVerifyPhase(decisionState, state, request, context, llmProvider);
      decisionState = this.syncConfidenceAfterVerify(state, decisionState) ?? decisionState;
      this.maybeSnapshot(state, 'AUTO');

      // FATAL 不可修复：跳过 REPAIR/NARRATE，直接 FAILED
      if (decisionState?.verification?.hasFatal) {
        const msg =
          decisionState.verification.issues.find((i) => i.class === 'FATAL')?.message ??
          'FATAL_VERIFICATION_ISSUE';
        state.current_step = 'FAILED';
        state.errors.push({
          step: 'VERIFY',
          error_code: 'VERIFICATION_FATAL',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildErrorResult(state, new Error(msg), startTime, decisionState, 'VERIFY', undefined, context);
      }

      // 步骤 10: 修复（REPAIR）- 当执行模式为 KERNEL_NATIVE_EXECUTION 时，走 Kernel.executeRepair 路径（条件执行）
      if (state.gate_result?.gate_result === 'ADJUST_REQUIRED' || state.errors.length > 0) {
        const euBefore = decisionState?.optimizationHints?.expectedUtility;
        decisionState = await this.executeRepairPhase(decisionState, state, request, context, llmProvider) ?? decisionState;
        this.maybeSnapshot(state, 'AUTO');

        // Utility Decay：修复后重新 OPTIMIZE（轻量）并检测 E[U] 连续下降
        if (this.decisionKernel && decisionState) {
          try {
            // 重用 OPTIMIZE 的 fatigue 计算逻辑（与 executeOptimizeStep 一致）
            let fatigue: number | undefined;
            const planDraft = decisionState.tripState?.planDraft as Itinerary | undefined;
            if (planDraft?.days?.length && this.tdfpmCalculator) {
              const contexts = this.itineraryToTdfpmDayContexts(planDraft);
              const scores = contexts.map((c) => this.tdfpmCalculator!.computeFatigueScore(c).fatigueScore);
              const maxScore = Math.max(...scores, 0);
              fatigue = Math.min(1, maxScore / 100);
            }
            const { newState: afterOpt, optimizationHints } = await this.decisionKernel.executeOptimize(decisionState, {
              fatigue,
            });
            decisionState = afterOpt;
            const euAfter = optimizationHints?.expectedUtility;
            const prevEu = euBefore ?? decisionState.systemState?.lastExpectedUtility;
            const prevDeclines = decisionState.systemState?.consecutiveUtilityDeclines ?? 0;
            const decline = typeof prevEu === 'number' && typeof euAfter === 'number' && euAfter < prevEu;
            const nextDeclines = decline ? prevDeclines + 1 : 0;
            decisionState = this.decisionKernel.updateState(decisionState, {
              systemState: {
                requestId: state.request_id,
                lastExpectedUtility: typeof euAfter === 'number' ? euAfter : prevEu,
                consecutiveUtilityDeclines: nextDeclines,
              },
            });

            const maxDeclines = parseInt(process.env.DECISION_REPAIR_UTILITY_DECAY_MAX ?? '2', 10);
            if (maxDeclines > 0 && nextDeclines >= maxDeclines) {
              state.clarification_questions = [
                {
                  id: 'utility_decay_halt_confirmation',
                  question:
                    `自动修复后期望效用已连续 ${nextDeclines} 次下降（E[U] ${String(prevEu)} → ${String(euAfter)}）。是否缩小范围/放宽约束，或由您确认继续？`,
                  type: 'NEED_CONFIRMATION',
                  required: true,
                  options: [
                    { id: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
                    { id: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
                    { id: 'continue_auto_repair', label: '继续自动修复' },
                  ],
                } as any,
              ];
              this.maybeSnapshot(state, 'CHECKPOINT');
              return this.buildClarificationResult(state, startTime, decisionState, context);
            }
          } catch (e: any) {
            this.logger.debug(`[Claude Orchestrator] Utility decay check skipped: ${e?.message}`);
          }
        }
      }

      // 修复收敛保护：repairCount 超过阈值后转为 NEED_CONFIRMATION（避免 VERIFY↔REPAIR 横跳）
      const repairCount = decisionState?.systemState?.repairCount ?? 0;
      const maxRepairs = parseInt(process.env.DECISION_MAX_REPAIR_COUNT ?? '3', 10);
      if (repairCount >= maxRepairs && maxRepairs > 0) {
        state.clarification_questions = [
          {
            id: 'repair_halt_confirmation',
            question: `系统已自动修复尝试 ${repairCount} 次，仍未收敛。是否需要缩小范围/放宽约束/或由您确认继续自动修复？`,
            type: 'NEED_CONFIRMATION',
            required: true,
            options: [
              { id: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
              { id: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
              { id: 'continue_auto_repair', label: '继续自动修复' },
            ],
            hint: '为避免“拆东墙补西墙”的循环，系统需要您的指令。',
          } as any,
        ];
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildClarificationResult(state, startTime, decisionState, context);
      }

      // 步骤 11: NARRATE - 产出用户可读解释（不得改硬字段）
      this.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
      await this.executeNarrateStep(request, context, state, llmProvider);
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 11.5: FEEDBACK - 专利反馈学习模块，记录决策日志（异步，不阻塞）
      decisionState = await this.executeFeedbackStep(state, decisionState) ?? decisionState;
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 12: HALLUCINATION_DETECTION - 防幻觉检测
      await this.executeHallucinationDetectionStep(request, context, state);
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 13: DONE
      state.current_step = 'DONE';
      state.metadata.last_updated_at = new Date().toISOString();
      state.metadata.total_duration_ms = Date.now() - startTime;
      this.maybeSnapshot(state, 'CHECKPOINT');

      return this.buildSuccessResult(state, startTime, decisionState, context);
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
    const recentSlice = (request.conversation_context?.recent_messages ?? []).slice(-16);
    const rawIntakeBundle = [request.message, ...recentSlice].filter(Boolean).join('\n');
    const textForIntake = String(rawIntakeBundle).replace(
      /[０-９]/g,
      (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    );

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

    // 提取日期（改进的规则）
    let start_date: string | undefined;
    let date_range: { start_date: string; end_date: string } | undefined;
    let days: number | undefined;

    // 匹配日期范围（如 "2024-01-01 到 2024-01-07" 或 "2024-01-01 - 2024-01-07"）
    const dateRangeMatch = textForIntake.match(
      /(\d{4})-(\d{2})-(\d{2})\s*(?:到|至|-|~)\s*(\d{4})-(\d{2})-(\d{2})/,
    );
    if (dateRangeMatch) {
      const startDateStr = `${dateRangeMatch[1]}-${dateRangeMatch[2]}-${dateRangeMatch[3]}`;
      const endDateStr = `${dateRangeMatch[4]}-${dateRangeMatch[5]}-${dateRangeMatch[6]}`;
      date_range = {
        start_date: startDateStr,
        end_date: endDateStr,
      };
      start_date = startDateStr;
    } else {
      // 匹配单个日期
      const dateMatch = textForIntake.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        start_date = dateMatch[0];
      }
    }

    // 相对日期兜底（今天/明天/后天）
    if (!start_date) {
      const now = new Date();
      const relativeDays =
        /后天/.test(textForIntake)
          ? 2
          : /明天/.test(textForIntake)
            ? 1
            : /今天|今日/.test(textForIntake)
              ? 0
              : undefined;
      if (relativeDays !== undefined) {
        const d = new Date(now);
        d.setDate(now.getDate() + relativeDays);
        start_date = d.toISOString().slice(0, 10);
      }
    }

    // 提取天数（改进的规则：匹配 "N天"、"N日"、"N晚" 等）
    const daysPatterns = [
      /(\d+)\s*天/,
      /(\d+)\s*日/,
      /(\d+)\s*晚/,
      /(\d+)\s*days?/i,
      /(\d+)\s*nights?/i,
    ];
    for (const pattern of daysPatterns) {
      const daysMatch = textForIntake.match(pattern);
      if (daysMatch) {
        const extractedDays = parseInt(daysMatch[1], 10);
        if (extractedDays > 0 && extractedDays <= 30) {
          days = extractedDays;
          break;
        }
      }
    }

    // 中文天数兜底（如：一日/两日/三天）
    if (!days) {
      const zhDayPatterns: Array<{ pattern: RegExp; value: number }> = [
        { pattern: /一日|一天/, value: 1 },
        { pattern: /两日|两天|二日|二天/, value: 2 },
        { pattern: /三日|三天/, value: 3 },
        { pattern: /四日|四天/, value: 4 },
        { pattern: /五日|五天/, value: 5 },
        { pattern: /六日|六天/, value: 6 },
        { pattern: /七日|七天/, value: 7 },
      ];
      const matched = zhDayPatterns.find((x) => x.pattern.test(textForIntake));
      if (matched) {
        days = matched.value;
      }
    }

    // 如果没有提取到天数，但有日期范围，计算天数
    if (!days && date_range) {
      const start = new Date(date_range.start_date);
      const end = new Date(date_range.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 0 && diffDays <= 30) {
        days = diffDays;
      }
    }

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

    // 提取车辆类型（用于准入类约束与 INTAKE predictive simulation）
    const vehicle_type: '2WD' | '4WD' | undefined = /4wd|4x4|四驱|四驱车/i.test(textForIntake)
      ? '4WD'
      : /2wd|两驱/i.test(textForIntake)
        ? '2WD'
        : undefined;

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
    };
  }

  /** INTAKE 回填所需的最小 Trip 字段（与 {@link TripsService.findOne} 校验语义对齐） */
  private async loadTripCoreForIntakeHydration(
    tripId: string,
    userId: string | undefined,
  ): Promise<
    | {
        ok: true;
        trip: { destination: string | null; startDate: Date | null; endDate: Date | null };
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
      select: { destination: true, startDate: true, endDate: true },
    });
    if (!row) {
      return { ok: false, error_message: `行程 ID ${tid} 不存在` };
    }
    return { ok: true, trip: row, source: 'prisma_fallback' };
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

    const tripDest =
      trip.destination == null ? '' : typeof trip.destination === 'string' ? trip.destination.trim() : String(trip.destination).trim();
    const tripHasDest = Boolean(tripDest);
    const tripHasDates = Boolean(trip.startDate && trip.endDate);

    const filledFields: string[] = [];

    if (destUnset && tripDest) {
      tripPlanRequest.destination = tripDest;
      filledFields.push('destination');
    }

    const noDates =
      !tripPlanRequest.start_date &&
      !(tripPlanRequest.date_range?.start_date && tripPlanRequest.date_range?.end_date);

    if (noDates && trip.startDate && trip.endDate) {
      const start =
        trip.startDate instanceof Date
          ? trip.startDate.toISOString().slice(0, 10)
          : String(trip.startDate).slice(0, 10);
      const end =
        trip.endDate instanceof Date
          ? trip.endDate.toISOString().slice(0, 10)
          : String(trip.endDate).slice(0, 10);
      tripPlanRequest.date_range = { start_date: start, end_date: end };
      tripPlanRequest.start_date = start;
      filledFields.push('date_range', 'start_date');
      if (!tripPlanRequest.days) {
        const sd = new Date(`${start}T12:00:00.000Z`);
        const ed = new Date(`${end}T12:00:00.000Z`);
        const diffDays = Math.ceil(Math.abs(ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 0 && diffDays <= 366) {
          tripPlanRequest.days = diffDays;
          filledFields.push('days');
        }
      }
    }

    tripPlanRequest.ontology_context = {
      ...(tripPlanRequest.ontology_context ?? {}),
      trip_id: tid,
    };

    const status = filledFields.length > 0 ? 'applied' : 'noop';
    const sparseDb =
      (destUnset && !tripHasDest) || (noDates && !tripHasDates);
    const detail =
      filledFields.length > 0
        ? `已从 Trip 回填：${filledFields.join(', ')}`
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
      plan_dates_missing: noDates,
      detail,
    });

    if (filledFields.length > 0) {
      this.logger.log(`[INTAKE] trip_hydration applied trip_id=${tid} filled=[${filledFields.join(', ')}]`);
    } else {
      this.logger.log(`[INTAKE] trip_hydration noop trip_id=${tid} sparse_db=${sparseDb}`);
    }
  }

  /**
   * INTAKE 步骤：解析请求 & 缺口识别
   * P3 B: 优先经 Kernel.executeIntake（IntakeExecutor 封装 PlannerAgent），否则降级到直接调用
   */
  private async executeIntakeStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'INTAKE';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 INTAKE 步骤...`);

    try {
      state.metadata = {
        ...(state.metadata ?? {}),
        clarification_locale: request.conversation_context?.locale,
      } as any;

      let tripPlanRequest = this.convertToTripPlanRequest(request, state);
      await this.hydrateTripPlanRequestFromTripRecord(request, tripPlanRequest, state);

      // Constraint Zone (Temporal hard deadlines): make them explicitly visible to downstream LLM/planning skills.
      // We keep it as a high-weight system hint embedded in TripPlanRequest.message (best-effort, backwards compatible).
      const hardDeadlines = (request as any)?.emergency_constraints?.hard_deadlines as Record<string, string> | undefined;
      if (hardDeadlines && typeof hardDeadlines === 'object' && Object.keys(hardDeadlines).length > 0) {
        const lines = Object.entries(hardDeadlines)
          .slice(0, 10)
          .map(([k, v]) => `- ${String(k)} 截止于 ${String(v)}`);
        const sysHint =
          `[SYSTEM_MESSAGE][CONSTRAINT_ZONE][TEMPORAL_DEADLINE]\n` +
          `注意：以下 POI/Segment 受到物理环境限制（如日落），必须在指定时间前结束。\n` +
          `${lines.join('\n')}\n` +
          `如果当前计划冲突，请优先尝试调换行程顺序（例如将上午的室内活动挪至傍晚，或将高风险户外活动提前）。\n`;
        tripPlanRequest.message = `${sysHint}\n${tripPlanRequest.message ?? request.message ?? ''}`.trim();
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: 'emergency_constraints.hard_deadlines → Constraint Zone system hint',
          outputs_summary: `TEMPORAL_DEADLINES=${Object.keys(hardDeadlines).length}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'CONSTRAINT_ZONE_TEMPORAL_DEADLINE',
            hard_deadlines: hardDeadlines,
          },
        });
      }

      // 闭环：消费澄清回合答案 → 组合放宽补丁 / 或用户批准终止
      const clarificationAnswers = (request as any).clarification_answers as any[] | undefined;
      if (this.clarificationHandler && Array.isArray(clarificationAnswers) && clarificationAnswers.length > 0) {
        const {
          tripPlanRequest: patched,
          applied,
          terminalIntent,
          fingerprint,
          earlyWarningProceedAtOwnRisk,
          didPatch,
          transportClarificationApplied,
        } = this.clarificationHandler.applyRelaxationsFromAnswers(tripPlanRequest, clarificationAnswers);
        // 防御性：记录 fingerprint 与重试次数到 DSO.systemState（用于识别无效重复尝试）
        if (this.decisionKernel && (state as any).decisionState) {
          // no-op: decisionState 不在 state 上；留给 STATE_UPDATE 后统一写入
        }
        if (terminalIntent) {
          state.metadata = {
            ...(state.metadata ?? {}),
            terminal_intent: terminalIntent,
            last_relaxation_fingerprint: fingerprint,
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → TerminalIntent',
            outputs_summary: 'CONSENSUS_REACHED: NO_FEASIBLE_PATH',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CONSENSUS_REACHED_NO_FEASIBLE_PATH',
              terminal_intent: terminalIntent,
              fingerprint,
            },
          });
        } else if (applied.length > 0 || didPatch) {
          tripPlanRequest = patched;
          state.metadata = {
            ...(state.metadata ?? {}),
            applied_relaxations: applied,
            last_relaxation_fingerprint: fingerprint,
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CompositeRelaxationPatch',
            outputs_summary: `RELAXATION_APPLIED: ${applied.map((a) => a.id).join('+')}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'RELAXATION_APPLIED',
              applied_relaxations: applied,
              fingerprint,
            },
          });
        }

        if (earlyWarningProceedAtOwnRisk) {
          const ew = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
          // 此时我们可能还没有 VERIFY 报告；保持绑定的稳定性和轻量级。
          const evidence = collectDecisionEvidenceSummaries(undefined);
          const fp = computeDecisionEvidenceFingerprint(evidence);
          state.metadata = {
            ...(state.metadata ?? {}),
            early_warning_acknowledged: true,
            early_warning_proceed_at: new Date().toISOString(),
            ...(fingerprint ? { last_relaxation_fingerprint: fingerprint } : {}),
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → EARLY_WARNING_PROCEED_AT_OWN_RISK',
            outputs_summary: 'USER_PROCEEDED_AT_OWN_RISK: no TripPlanRequest patch; downstream POI/PLAN_GEN allowed',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'EARLY_WARNING_PROCEED_AT_OWN_RISK',
              early_warning_id: ew?.early_warning_id,
              event: 'PROCEED_AT_OWN_RISK',
              evidence_fingerprint: fp.evidence_fingerprint,
              acknowledged_violations: fp.acknowledged_violations,
              max_violation_slack: fp.max_violation_slack,
            },
          });
        }

        // 行为分析：记录用户在澄清问题上的“选择/拒绝”（用于 EARLY_WARNING → PLAN_GEN 的认知差语料）
        const ewAnswer = clarificationAnswers.find((a) => a?.questionId === 'early_warning_relaxations');
        const pgAnswer = clarificationAnswers.find((a) => a?.questionId === 'plan_gen_empty_draft_relax_constraints');

        const normalizePicked = (v: any): string[] => {
          if (Array.isArray(v)) return v.map(String).filter(Boolean);
          if (typeof v === 'string') return [v].filter(Boolean);
          return [];
        };

        if (ewAnswer) {
          const ew = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
          const suggested = Array.isArray(ew?.suggested_actions)
            ? ew!.suggested_actions.map((s) => String(s?.relaxation_type ?? '')).filter(Boolean)
            : [];
          const chosen = normalizePicked(ewAnswer.value);
          const rejected = suggested.filter((x) => !chosen.includes(x));
          const proceed = chosen.includes('proceed_at_own_risk');
          const evidence = proceed ? collectDecisionEvidenceSummaries(undefined) : [];
          const fp = proceed ? computeDecisionEvidenceFingerprint(evidence) : undefined;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → EARLY_WARNING_USER_CHOICE',
            outputs_summary: `EARLY_WARNING_USER_CHOICE: chosen=${chosen.join(',') || '∅'} rejected=${rejected.join(',') || '∅'}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'EARLY_WARNING_USER_CHOICE',
              early_warning_id: ew?.early_warning_id,
              suggested_actions: suggested,
              chosen_actions: chosen,
              rejected_actions: rejected,
              ...(proceed && fp
                ? {
                    event: 'PROCEED_AT_OWN_RISK',
                    evidence_fingerprint: fp.evidence_fingerprint,
                    acknowledged_violations: fp.acknowledged_violations,
                    max_violation_slack: fp.max_violation_slack,
                  }
                : {}),
            },
          });

          // Conversion Learning: CLARIFICATION_FEEDBACK — bind the choice to the option snapshot at presentation time.
          const snap = (state.decision_log ?? [])
            .slice()
            .reverse()
            .find((e) => e?.metadata?.system_action === 'EARLY_WARNING_INTERCEPT')?.metadata?.options_snapshot as any[] | undefined;
          const top = Array.isArray(snap)
            ? snap
                .filter((o) => o && typeof o === 'object' && typeof (o as any).metadata?.score === 'number')
                .sort((a, b) => ((b as any).metadata.score as number) - ((a as any).metadata.score as number))[0]
            : undefined;
          const topValue = top ? String((top as any).value ?? '') : '';
          const reward = proceed ? -1 : topValue && chosen.includes(topValue) ? 1 : 0;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CLARIFICATION_FEEDBACK (EARLY_WARNING)',
            outputs_summary: `CLARIFICATION_FEEDBACK: q=early_warning_relaxations reward=${reward}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CLARIFICATION_FEEDBACK',
              questionId: 'early_warning_relaxations',
              early_warning_id: ew?.early_warning_id,
              dominant_cid: (top as any)?.metadata?.dominant_cid ?? (ew as any)?.conflict_type,
              fingerprint: (state.metadata as any)?.last_relaxation_fingerprint,
              oscillation_k: 0,
              options_snapshot: Array.isArray(snap) ? snap : [],
              chosen_actions: chosen,
              top_scored_value: topValue || undefined,
              reward,
            },
          });

          // 回灌到 CaseStore：记录 shown/chosen_top/proceeded/rejected（best-effort，不阻塞）
          if (this.localCaseStore && Array.isArray(snap)) {
            const sig = SignatureBuilder.buildConversionSignature({
              conflict_type: ((ew as any)?.conflict_type ?? 'MIXED') as any,
              primary_violation_type: (top as any)?.metadata?.dominant_cid,
              region_id: (state.trip_plan_request as any)?.region_id,
              start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
            }) as any;
            Promise.resolve()
              .then(() => {
                for (const o of snap) {
                  const v = String((o as any)?.value ?? '');
                  if (!v) continue;
                  this.localCaseStore!.recordConversion({ signature: sig, action: v as any, kind: 'shown' });
                }
                if (proceed) this.localCaseStore!.recordConversion({ signature: sig, action: 'proceed_at_own_risk', kind: 'proceeded' });
                if (topValue && chosen.includes(topValue)) this.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'chosen_top' });
                // targeted rejection: only count top-scored action rejected when user didn't pick it.
                if (topValue && !chosen.includes(topValue)) {
                  this.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'rejected' });
                }
              })
              .catch(() => undefined);
          }
        }

        if (pgAnswer) {
          const chosen = normalizePicked(pgAnswer.value);
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → PLAN_GEN_USER_CHOICE',
            outputs_summary: `PLAN_GEN_USER_CHOICE: chosen=${chosen.join(',') || '∅'}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'PLAN_GEN_USER_CHOICE',
              chosen_actions: chosen,
            },
          });

          const snap = (state.decision_log ?? [])
            .slice()
            .reverse()
            .find((e) => e?.metadata?.system_action === 'PLAN_GEN_EMPTY_DRAFT_CLARIFICATION')?.metadata?.options_snapshot as any[] | undefined;
          const top = Array.isArray(snap)
            ? snap
                .filter((o) => o && typeof o === 'object' && typeof (o as any).metadata?.score === 'number')
                .sort((a, b) => ((b as any).metadata.score as number) - ((a as any).metadata.score as number))[0]
            : undefined;
          const topValue = top ? String((top as any).value ?? '') : '';
          const reward = chosen.includes('accept_no_solution') ? -1 : topValue && chosen.includes(topValue) ? 1 : 0;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CLARIFICATION_FEEDBACK (PLAN_GEN)',
            outputs_summary: `CLARIFICATION_FEEDBACK: q=plan_gen_empty_draft_relax_constraints reward=${reward}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CLARIFICATION_FEEDBACK',
              questionId: 'plan_gen_empty_draft_relax_constraints',
              dominant_cid: (top as any)?.metadata?.dominant_cid,
              fingerprint: (state.metadata as any)?.last_relaxation_fingerprint,
              oscillation_k: 0,
              options_snapshot: Array.isArray(snap) ? snap : [],
              chosen_actions: chosen,
              top_scored_value: topValue || undefined,
              reward,
            },
          });

          if (this.localCaseStore && Array.isArray(snap)) {
            const sig = SignatureBuilder.buildConversionSignature({
              conflict_type: 'MIXED',
              primary_violation_type: (top as any)?.metadata?.dominant_cid,
              region_id: (state.trip_plan_request as any)?.region_id,
              start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
            }) as any;
            Promise.resolve()
              .then(() => {
                for (const o of snap) {
                  const v = String((o as any)?.value ?? '');
                  if (!v) continue;
                  this.localCaseStore!.recordConversion({ signature: sig, action: v as any, kind: 'shown' });
                }
                if (topValue && chosen.includes(topValue)) this.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'chosen_top' });
                if (topValue && !chosen.includes(topValue)) {
                  this.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'rejected' });
                }
              })
              .catch(() => undefined);
          }
        }

        if (transportClarificationApplied) {
          state.metadata = {
            ...(state.metadata ?? {}),
            transport_research_followup: true,
            last_transport_clarification_fingerprint: fingerprint,
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'INTAKE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → clarify_transport_endpoints_v1',
            outputs_summary: 'TRANSPORT_ENDPOINTS_PATCHED; next RESEARCH may run transport_only',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CLARIFY_TRANSPORT_ENDPOINTS_APPLIED',
              fingerprint,
            },
          });
        }
      }

      state.trip_plan_request = tripPlanRequest;
      state.metadata.intake_user_message = request.message;

      if (this.decisionKernel) {
        const intakeCtx: import('../../decision/kernel/interfaces/phase-executor.interface').IntakeExecutorContext = {
          requestId: state.request_id,
          userId: request.user_id,
          tripPlanRequest: tripPlanRequest as any,
          orchestratorState: state,
          locale: request.conversation_context?.locale,
        };
        const dso = this.decisionKernel.createInitialState(state.request_id, this.kernelCreateInitialOpts(request, state));
        const result = await this.decisionKernel.executeIntake(dso, intakeCtx);

        state.gaps = result.gaps as OrchestratorState['gaps'];
        state.clarification_questions = result.clarificationQuestions as any;
        if ((result as any).simulation) {
          (state.metadata as any) = { ...(state.metadata ?? {}), intake_simulation: (result as any).simulation };
        }
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Planner',
          inputs_summary: formatIntakeInputsPreviewZh(request.message, 100),
          outputs_summary: formatIntakeOutputsZh(result.intent ?? 'PLAN_TRIP', result.gaps.length),
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            gaps: result.gaps,
            candidate_structure: result.candidate_structure,
            clarification_questions_count: result.clarificationQuestions?.length || 0,
          },
        });
      } else {
        // P3 D.1: 降级路径统一为 util 规则识别，不再直接调用 plannerAgent
        const gaps = identifyGapsFromRequest(tripPlanRequest);
        state.gaps = gaps as OrchestratorState['gaps'];
        const hardGaps = gaps.filter((g) => g.severity === 'HARD');
        if (hardGaps.length > 0) {
          state.clarification_questions = generateClarificationQuestions(hardGaps, tripPlanRequest, {
            locale: request.conversation_context?.locale,
          });
        }
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: formatIntakeInputsPreviewZh(request.message, 100),
          outputs_summary: formatIntakeOutputsZh('PLAN_TRIP', gaps.length),
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            gaps,
            clarification_questions_count: state.clarification_questions?.length || 0,
          },
        });
      }

      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'INTAKE', 'Planner');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] INTAKE 步骤失败: ${error?.message}`);
      throw error;
    }
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
   * RESEARCH 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executeResearch，否则走 callback
   */
  private async executeResearchPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (
      this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
      this.decisionKernel &&
      decisionState &&
      state.trip_plan_request
    ) {
      const stepStartTime = Date.now();
      const transportFollowup = (state.metadata as any)?.transport_research_followup === true;
      let priorResearch: Record<string, unknown> | undefined =
        transportFollowup &&
        state.research_data &&
        typeof state.research_data === 'object' &&
        Object.keys(state.research_data as object).length > 0
          ? (state.research_data as Record<string, unknown>)
          : undefined;
      if (transportFollowup && !priorResearch && this.researchPriorSnapshot) {
        const loaded = await this.researchPriorSnapshot.load(request);
        if (loaded && Object.keys(loaded).length > 0) {
          priorResearch = loaded;
          state.research_data = loaded as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'RESEARCH',
            actor: 'Orchestrator',
            inputs_summary: 'transport_research_followup → prior research snapshot restore',
            outputs_summary: `PRIOR_RESEARCH_SNAPSHOT_RESTORED keys=${Object.keys(loaded).length}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'PRIOR_RESEARCH_SNAPSHOT_RESTORED',
              snapshot_keys: Object.keys(loaded).slice(0, 24),
            },
          });
        }
      }
      const didRunTransportOnly = !!(transportFollowup && priorResearch);
      const ctx = {
        requestId: state.request_id,
        routeDirectionId: request.route_direction_id ?? undefined,
        userId: request.user_id,
        tripPlanRequest: state.trip_plan_request,
        recent_messages: request.conversation_context?.recent_messages,
        ...(didRunTransportOnly
          ? {
              researchMode: 'transport_only' as const,
              priorResearchData: priorResearch,
            }
          : {}),
      };
      const { newState, researchData } = await this.decisionKernel.executeResearch(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      state.research_data = researchData;
      state.current_step = 'RESEARCH';
      if (transportFollowup) {
        (state.metadata as any) = { ...(state.metadata ?? {}), transport_research_followup: false };
        if (didRunTransportOnly) {
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
              inputs_summary: 'transport_only follow-up still degraded transport_evidence',
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
        inputs_summary: formatResearchInputsKernelZh(),
        outputs_summary: formatResearchOutputsZh(Object.keys(researchData)),
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          data_types: Object.keys(researchData),
          ...(didRunTransportOnly ? { system_action: 'TRANSPORT_RESEARCH_FOLLOWUP', research_mode: 'transport_only' } : {}),
        },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'RESEARCH', 'LocalInsight');
      await this.researchPriorSnapshot?.save(request, researchData as Record<string, unknown>);
      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'RESEARCH', () =>
      this.executeResearchStep(request, context, state, llmProvider, decisionState),
    );
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
      detectRhythmOrDiningPlanningIntent(planningTextForDiversity) &&
      rankedPois.length >= 3;
    let scored = skipGeoClusterForDiversity
      ? rankedPois.slice(0, topNLimit)
      : this.selectClusteredPois(
          rankedPois,
          topNLimit,
          startCoordinates,
          destinationRaw,
        );
    /** Phase 2.6：最后一跳强制锚点进入 TopN（候选来自 rankedPois；与聚类解耦） */
    if (destinationCountry === 'IS' && requiredAnchors.length > 0) {
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
    if (estimatedCommuteMinutes > commuteBudgetMinutes) {
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
          options: [
            `${destinationExample} 市区`,
            `${destinationExample} 南部`,
            `${destinationExample} 西部`,
            '我来手动输入具体城市/区域',
          ],
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

    const minPoiRequired = 2;
    if (scored.length > 0 && scored.length < minPoiRequired) {
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
          options: [
            `${destinationExample} 市区`,
            `${destinationExample} 近郊`,
            `${destinationExample} 南部`,
            '我来手动输入具体城市/区域',
          ],
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

    if (destinationCountry && scored.length === 0) {
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

  private inferCountryFromDestination(destination: string): string | undefined {
    const d = this.normalizeText(destination);
    if (!d) return undefined;
    if (/东京|大阪|京都|日本|tokyo|osaka|kyoto|japan/.test(d)) return 'JP';
    if (/首尔|韩国|seoul|korea/.test(d)) return 'KR';
    if (/上海|北京|广州|深圳|杭州|成都|重庆|中国|china/.test(d)) return 'CN';
    /** 冰岛：POI_SELECTION / poiPlanning 冰岛分支依赖 ISO 国家码 IS */
    if (/冰岛|iceland|reykjav[ií]k|雷克雅未克/.test(d)) return 'IS';
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

  /**
   * GATE_EVAL 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executeGateEval，否则走 callback
   */
  private async executeGateEvalPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (
      this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
      this.decisionKernel &&
      decisionState &&
      state.trip_plan_request
    ) {
      const stepStartTime = Date.now();
      const ctx = {
        requestId: state.request_id,
        routeDirectionId: request.route_direction_id ?? undefined,
        userId: request.user_id,
        tripPlanRequest: state.trip_plan_request,
        researchData: state.research_data,
      };
      const { newState, gateResult } = await this.decisionKernel.executeGateEval(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      state.gate_result = {
        gate_result: gateResult.gate_result,
        violations: gateResult.violations as GateResult['violations'],
        required_adjustments: gateResult.required_adjustments as GateResult['required_adjustments'],
        confidence: gateResult.confidence,
        evidence_refs: [],
      };
      state.current_step = 'GATE_EVAL';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: formatGateEvalInputsKernelZh(),
        outputs_summary: formatGateEvalOutputsZh(gateResult.gate_result, gateResult.violations.length),
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'GATE_EVAL', 'Gatekeeper');
      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'GATE_EVAL', () =>
      this.executeGateEvalStep(request, context, state, llmProvider),
    );
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
    if (this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) && this.decisionKernel && decisionState && state.trip_plan_request) {
      const stepStartTime = Date.now();
      let dsoForPlan = decisionState;
      if (
        dsoForPlan.systemState?.pendingMigrations?.length &&
        (dsoForPlan.tripState?.planDraft as { days?: unknown[] } | undefined)?.days?.length
      ) {
        dsoForPlan = this.decisionKernel.applyPrePlanMigrationInjections(dsoForPlan);
        state.decision_log.push({
          request_id: state.request_id,
          step: 'CONTEXT_BUILD',
          actor: 'Orchestrator',
          inputs_summary: '消费 DSO.systemState.pendingMigrations → 注入既有 planDraft',
          outputs_summary: `剩余待迁移条目=${dsoForPlan.systemState?.pendingMigrations?.length ?? 0}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: { duration_ms: 0 },
        });
      }
      const ctx = {
        requestId: state.request_id,
        tripPlanRequest: state.trip_plan_request,
        researchData: state.research_data,
        gateResult: state.gate_result as any,
      };
      const { newState, itinerary } = await this.decisionKernel.executePlanGen(dsoForPlan, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      state.itinerary = itinerary as Itinerary;
      state.current_step = 'PLAN_GEN';
      const pgFail = newState.systemState?.planGenTerminalFailure;
      state.decision_log.push({
        request_id: state.request_id,
        step: 'PLAN_GEN',
        actor: 'Planner',
        inputs_summary: formatPlanGenInputsKernelZh(),
        outputs_summary: formatPlanGenOutputsZh(
          itinerary.days.length,
          pgFail?.message ?? 'planGenTerminalFailure',
        ),
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          ...(pgFail
            ? {
                system_action: SYSTEM_ORCHESTRATOR_ACTIONS.PLAN_GEN_EMPTY_DRAFT_HALT,
                planGenTerminalFailure: pgFail,
              }
            : {}),
        },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'PLAN_GEN', 'Planner');
      if (this.trajectoryCollection && state.itinerary && state.gate_result) {
        try {
          let complianceResult = state.compliance_result;
          if (!complianceResult && this.complianceAgent) {
            try {
              complianceResult = await this.complianceAgent.checkCompliance(state.itinerary, state.gate_result, state);
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
      }
      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'PLAN_GEN', () =>
      this.executePlanGenStep(request, context, state, llmProvider),
    );
  }

  /**
   * VERIFY 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executeVerify
   */
  private async executeVerifyPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) && this.decisionKernel && decisionState && state.itinerary) {
      const stepStartTime = Date.now();
      const ctx = {
        requestId: state.request_id,
        tripPlanRequest: state.trip_plan_request,
        itinerary: state.itinerary as any,
        researchData: state.research_data,
      };
      const { newState, issues } = await this.decisionKernel.executeVerify(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      const fatalIssues = (issues as Array<{ class?: string; message?: string }>).filter((i) => i?.class === 'FATAL');
      const conflictIssues = (issues as Array<{ class?: string }>).filter((i) => i?.class === 'CONFLICT');
      const advisoryIssues = (issues as Array<{ class?: string }>).filter((i) => i?.class === 'ADVISORY');

      // FATAL 的终止由主链在 VERIFY 后统一处理（避免在 phase 内 throw 导致非预期降级）。

      // CONFLICT/ADVISORY：不一定阻塞 DONE。当前工程口径：只要有 issues 就进入 errors（后续 REPAIR gate 用）。
      // ADVISORY 未来可从 errors 中剥离为 warnings；先保持兼容。
      if (issues.length > 0) {
        state.errors.push({
          step: 'VERIFY',
          error_code: 'VERIFICATION_ISSUES',
          message: `发现 ${issues.length} 个验证问题`,
          timestamp: new Date().toISOString(),
        });
      }
      state.current_step = 'VERIFY';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: formatVerifyInputsKernelZh(),
        outputs_summary: formatVerifyOutputsZh({
          issueCount: issues.length,
          fatal: fatalIssues.length,
          conflict: conflictIssues.length,
          advisory: advisoryIssues.length,
        }),
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime, issues, guardian: 'DR_DRE' as GuardianType },
      });

      // Hard opening-hours audit proof (C1 strict): materialize a stable evidence bundle for temporal_opening_v1.
      // Source of truth: Kernel verify issues + (itinerary + research_data.opening_hours_evidence) for human-readable windows.
      try {
        const poiClosed = (issues as any[]).filter((i) => i?.code === 'POI_CLOSED' && i?.entityRef?.type === 'POI');
        if (poiClosed.length > 0 && state.itinerary && state.research_data?.opening_hours_evidence) {
          const ohData = state.research_data.opening_hours_evidence;
          const openingHoursMap = new Map<string, any>();
          const rows = Array.isArray(ohData) ? ohData : Array.isArray((ohData as any)?.opening_hours) ? (ohData as any).opening_hours : [];
          for (const r of rows) {
            if (r && r.poi_id && r.opening_hours) openingHoursMap.set(String(r.poi_id), r);
          }
          const day0 = (state.itinerary as any)?.days?.[0];
          const dayDate = String(day0?.date ?? '');
          const items: any[] = Array.isArray(day0?.items) ? day0.items : [];
          for (const it of items) {
            const poiId = String(it?.location_ref?.place_id ?? '');
            if (!poiId) continue;
            const hit = poiClosed.find((x) => String(x?.entityRef?.id ?? '') === String(it?.id ?? ''));
            if (!hit) continue;
            const oh = openingHoursMap.get(poiId);
            const openWindow = oh?.opening_hours ?? (oh?.open_time && oh?.close_time ? `${oh.open_time}-${oh.close_time}` : undefined) ?? 'UNKNOWN';
            state.decision_log.push({
              request_id: state.request_id,
              step: 'VERIFY',
              actor: 'Orchestrator',
              inputs_summary: formatVerifyTemporalOpeningInputsZh(),
              outputs_summary: formatVerifyPoiClosedOutputsZh(
                String(it?.location_ref?.name ?? poiId),
                String(it?.start_window ?? ''),
                String(it?.end_window ?? ''),
              ),
              evidence_refs: oh?.evidence_id ? [String(oh.evidence_id)] : [],
              timestamp: new Date().toISOString(),
              metadata: {
                rule_id: 'temporal_opening_v1',
                details: {
                  evidence: {
                    type: 'opening_hours',
                    source: 'OPENING_HOURS',
                    poi_id: poiId,
                    date: dayDate || undefined,
                    timezone: 'UTC',
                    planned_start: dayDate && it?.start_window ? `${dayDate}T${String(it.start_window)}:00.000Z` : null,
                    planned_end: dayDate && it?.end_window ? `${dayDate}T${String(it.end_window)}:00.000Z` : null,
                    open_window: openWindow,
                    is_violated: true,
                    item_id: String(it?.id ?? ''),
                  },
                },
              },
            } as any);
          }
        }
      } catch {
        // best-effort only
      }

      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'VERIFY', 'CoreDecision');
      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'VERIFY', () =>
      this.executeVerifyStep(request, context, state, llmProvider),
    );
  }

  /**
   * REPAIR 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executeRepair
   */
  private async executeRepairPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) && this.decisionKernel && decisionState && state.itinerary && state.gate_result) {
      const stepStartTime = Date.now();
      const ctx = {
        requestId: state.request_id,
        tripPlanRequest: state.trip_plan_request,
        researchData: state.research_data,
        gateResult: state.gate_result as any,
        itinerary: state.itinerary as any,
        alternatives: state.alternatives,
      };
      const { newState, itinerary, repairApplied } = await this.decisionKernel.executeRepair(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      if (itinerary) state.itinerary = itinerary as Itinerary;
      state.current_step = 'REPAIR';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'REPAIR',
        actor: 'LocalInsight',
        inputs_summary: formatRepairInputsKernelZh(),
        outputs_summary: formatRepairOutputsZh(repairApplied),
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime, repair_applied: repairApplied, guardian: 'NEPTUNE' as GuardianType },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'REPAIR', 'LocalInsight');

      // Observability: best-effort score sample even for non-terminal REPAIR exits (oscillation/max-iter/utility-compensation)
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
        const domAxiom = pickDominantAxiom(matchAxioms({ message: request?.message, constraints: (state as any)?.trip_plan_request?.constraints }));
        const expectedCid = domAxiom?.axiom?.cid;
        const actualCid = normalizedAudit.dominant_cid;
        this.promMetrics?.recordSessionConsistencyScore({
          score,
          axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
          cid: actualCid ?? expectedCid ?? 'UNKNOWN',
          terminal: false,
        });

        // LogicOps: emit a single atomic audit event when REPAIR produced actionable traces or a score.
        // This allows P0/P1/P2 matrix to light up even when the run returns OK (non-terminal).
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

          // Runtime proof counters (do not affect control flow)
          try {
            if (domAxiom?.axiom_id && expectedCid && actualCid && expectedCid !== actualCid) {
              this.promMetrics?.recordAxiomDominantCidMismatch({
                axiom_id: domAxiom.axiom_id,
                expected_cid: expectedCid,
                actual_cid: actualCid,
                stage: 'REPAIR',
              });
            }
            if (delta_reason_kind === 'mismatch') {
              this.promMetrics?.recordAxiomSimRealMismatch({
                axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
                expected_cid: expectedCid ?? 'UNKNOWN',
                actual_cid: actualCid ?? 'UNKNOWN',
                stage: 'REPAIR',
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

      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'REPAIR', () =>
      this.executeRepairStep(request, context, state, llmProvider),
    );
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
    const userRoute: Partial<UserRouteIntent> = {
      regionId: ui.regionId,
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
   * STATE_UPDATE 步骤：Phase 2.3 显式同步，专利权利要求 7 原子提交
   */
  private async executeStateUpdateStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'STATE_UPDATE';
    const stepStartTime = Date.now();
    this.logger.debug(`[Claude Orchestrator] 执行 STATE_UPDATE 步骤（原子提交）...`);

    const patch = this.isDsoAsPrimary()
      ? buildPatchFromDSOPrimary(decisionState, state)
      : orchestratorStateToDecisionStatePatch(state);
    patch.systemState = {
      ...patch.systemState,
      requestId: state.request_id,
      currentPhase: 'STATE_UPDATE',
      lastUpdatedAt: new Date().toISOString(),
    };
    this.applyPoiPlanningToPatch(patch, decisionState, state);
    // Scheme C: 世界模型三段式，从 patch + decisionState 构建 worldStateSummary（P3: research_data 补全，world.buildContext 优先）
    const { buildWorldStateSummaryFromDso } = await import('../../decision/kernel/world-state-summary.types');
    const mergedForSummary = {
      environmentState: patch.environmentState ?? decisionState.environmentState,
      userIntent: patch.userIntent ?? decisionState.userIntent,
    };
    const worldFromContext = this.extractWorldModelFromContextPackage(decisionState);
    const worldStateSummary = buildWorldStateSummaryFromDso(
      mergedForSummary,
      state.research_data,
      worldFromContext ?? (state as any).world_model_context,
    );
    if (Object.keys(worldStateSummary).length > 0) {
      patch.worldStateSummary = worldStateSummary;
    }

    const requestId = state.request_id;
    const getLatestState = this.dsoLatestStateProvider
      ? () => this.dsoLatestStateProvider!.getLatest(requestId)
      : undefined;

    // P3 A.1: 经 Kernel.executeStateUpdate 封装（原子提交 + 冲突回退）
    const { newState: updated } = await this.decisionKernel.executeStateUpdate(decisionState, patch, {
      getLatestState,
      maxRetries: 3,
    });

    // DSO 为主时：派生 OrchestratorState 兼容字段
    const derived = decisionStateToOrchestratorState(updated, state);
    Object.assign(state, derived);

    state.decision_log.push({
      request_id: state.request_id,
      step: 'STATE_UPDATE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: '把本轮对话与约束写入统一决策状态（DSO），一次性提交',
      outputs_summary: formatStateUpdateOutputsZh({
        hasUserIntent: !!patch.userIntent,
        hasConstraints: !!patch.constraints,
        hasEnvironmentState: !!patch.environmentState,
        version: updated.systemState?.version,
        destinationBefore: decisionState.userIntent?.destination as unknown,
        destinationAfter: (patch.userIntent?.destination ?? updated.userIntent?.destination) as unknown,
      }),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        state_update_user_intent_destination: {
          before: decisionState.userIntent?.destination ?? null,
          after: patch.userIntent?.destination ?? updated.userIntent?.destination ?? null,
        },
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();

    return updated;
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
          const hydration = hydrateTripPlanTransportEndpoints(dsoForHydration, tripRequest, {
            recentMessages: request.conversation_context?.recent_messages,
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
            });
            poiSearchCtxForTrace = poiSearchCtx;
            const semanticGapsForQuery = detectItineraryGapsV1({
              poiSearchCtx,
              decisionState,
              itinerary: state.itinerary,
            });
            const gapSuffix = gapRetrievalIntentQuerySuffix(semanticGapsForQuery);
            const ctxSuffix = buildContextualPoiSearchQuerySuffix(poiSearchCtx);
            const boost =
              plan.boostedTerms.length > 0 ? ` ${plan.boostedTerms.slice(0, 12).join(' ')}` : '';
            const scenicQuery = `${destinationQuery} attractions landmark museum sightseeing${boost}${ctxSuffix}${gapSuffix}`
              .replace(/\s+/g, ' ')
              .trim();
            const generalQuery =
              plan.boostedTerms.length > 0
                ? `${destinationQuery} ${plan.boostedTerms.slice(0, 8).join(' ')}${ctxSuffix}${gapSuffix}`
                    .replace(/\s+/g, ' ')
                    .trim()
                : `${destinationQuery}${ctxSuffix}${gapSuffix}`.replace(/\s+/g, ' ').trim();

            const scenicResult = await poiSkill.execute({
              query: scenicQuery,
              limit: 12,
              lat,
              lng,
              category: 'ATTRACTION',
            } as any);
            const generalResult = await poiSkill.execute({
              query: generalQuery,
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
            if (plan.regionTags.includes('golden_circle') && plan.boostedTerms.length > 0) {
              const anchorQuery = `Iceland Golden Circle ${plan.boostedTerms.slice(0, 10).join(' ')}`;
              extraSubQueries.golden_circle_anchor = anchorQuery;
              const anchorResult = await poiSkill.execute({
                query: anchorQuery,
                limit: 12,
                lat,
                lng,
                category: 'ATTRACTION',
              } as any);
              const anchorPois = Array.isArray(anchorResult?.pois)
                ? anchorResult.pois
                : Array.isArray(anchorResult)
                  ? anchorResult
                  : [];
              merged = mergeResearchPoiLists(anchorPois, merged, 22);
            }
            /** Phase 3.2：第四路专补 Geysir / Gullfoss 召回（合并优先） */
            if (plan.regionTags.includes('golden_circle')) {
              extraSubQueries.golden_circle_pair = GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY;
              const pairResult = await poiSkill.execute({
                query: GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY,
                limit: 14,
                lat,
                lng,
                category: 'ATTRACTION',
              } as any);
              const pairPois = Array.isArray(pairResult?.pois)
                ? pairResult.pois
                : Array.isArray(pairResult)
                  ? pairResult
                  : [];
              merged = mergeResearchPoiLists(pairPois, merged, 30);
            }
            if (plan.regionTags.includes('westfjords')) {
              const wfQuery = `Iceland Westfjords scenic viewpoints ${plan.boostedTerms.slice(0, 10).join(' ')}`;
              extraSubQueries.westfjords = wfQuery;
              const wfResult = await poiSkill.execute({
                query: wfQuery,
                limit: 12,
                lat,
                lng,
                category: 'ATTRACTION',
              } as any);
              const wfPois = Array.isArray(wfResult?.pois)
                ? wfResult.pois
                : Array.isArray(wfResult)
                  ? wfResult
                  : [];
              merged = mergeResearchPoiLists(wfPois, merged, 26);
            }
            merged = filterPoisByRejectedIds(merged, poiSearchCtx.rejectedPoiIds);
            researchData.poi_evidence = merged;
            const semanticGaps = semanticGapsForQuery;
            researchData.retrieval_decision_trace = buildPlanningRetrievalDecisionTrace({
              poiSearchCtx,
              scenicQuery,
              generalQuery,
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
            // 提取 POI IDs（兼容新旧格式）
            let poiIds: string[] = [];
            if (Array.isArray(researchData.poi_evidence)) {
              poiIds = researchData.poi_evidence.slice(0, 5).map((poi: any) => 
                poi.poi_id || poi.id || poi.place_id
              ).filter(Boolean);
            } else if (researchData.poi_evidence.pois && Array.isArray(researchData.poi_evidence.pois)) {
              poiIds = researchData.poi_evidence.pois.slice(0, 5).map((poi: any) => 
                poi.poi_id || poi.id || poi.place_id
              ).filter(Boolean);
            }
            
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
      // ========== 1. 准备度检查（新增） ==========
      let readinessCheckResult: any = null;
      let readinessBlockers: any[] = [];
      let readinessMust: any[] = [];
      let rulesNeedingDecision: any[] = [];

      if (this.readinessService && state.trip_plan_request) {
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
    const traveler: TravelerProfile = {
      nationality: undefined, // 可以从 request 或其他地方提取
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

  /**
   * CONTEXT_BUILD 步骤：Phase 2.3 在 PLAN 前构建 Context Package
   * P3 A.2: 经 Kernel.executeContextBuild 封装
   */
  private async executeContextBuildStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'CONTEXT_BUILD';
    const stepStartTime = Date.now();
    this.logger.debug(`[Claude Orchestrator] 执行 CONTEXT_BUILD 步骤...`);

    const tripId = state.metadata?.tripId as string | undefined;
    const destinationCountryCode =
      !tripId && request.message
        ? this.extractCountryCodeFromMessage(request.message)
        : undefined;
    const overrides = {
      tripId,
      userId: state.metadata?.userId as string | undefined,
      userQuery: request.message,
      phase: 'PLANNING' as const,
      agent: 'PLANNER' as const,
      destinationCountryCode,
      abortSignal: context.abortSignal,
    };

    try {
      const { newState, contextPackage: pkg } = await this.decisionKernel.executeContextBuild(decisionState, overrides);
      state.decision_log.push({
        request_id: state.request_id,
        step: 'CONTEXT_BUILD' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: formatContextBuildInputsZh(),
        outputs_summary: formatContextBuildOutputsZh((pkg as any)?.blocks?.length ?? 0, !pkg),
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      return newState;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] CONTEXT_BUILD 失败: ${error?.message}`);
      state.decision_log.push({
        request_id: state.request_id,
        step: 'CONTEXT_BUILD' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: formatContextBuildInputsZh(),
        outputs_summary: `上下文包构建失败：${error?.message ?? '未知错误'}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime, error: true },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      return decisionState;
    }
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

  /**
   * OPTIMIZE 步骤：Phase 2.3 抽取 Optimization Hints
   * P3 A.3: 经 Kernel.executeOptimize 封装；TDFPM fatigue 由 Orchestrator 预计算后传入
   */
  private async executeOptimizeStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'OPTIMIZE';
    const stepStartTime = Date.now();
    this.logger.debug(`[Claude Orchestrator] 执行 OPTIMIZE 步骤...`);

    // TDFPM: 预计算 fatigue 传入 Kernel（Kernel 无 TdfpmCalculator 依赖）
    let fatigue: number | undefined;
    const planDraft = decisionState.tripState?.planDraft as Itinerary | undefined;
    if (planDraft?.days?.length && this.tdfpmCalculator) {
      try {
        const contexts = this.itineraryToTdfpmDayContexts(planDraft);
        const scores = contexts.map((ctx) => this.tdfpmCalculator!.computeFatigueScore(ctx).fatigueScore);
        const maxScore = Math.max(...scores, 0);
        fatigue = Math.min(1, maxScore / 100);
        this.logger.debug(`[Claude Orchestrator] TDFPM fatigue: maxScore=${maxScore}, fatigue=${fatigue.toFixed(2)}`);
      } catch (e: any) {
        this.logger.warn(`[Claude Orchestrator] TDFPM 计算失败: ${e?.message}`);
      }
    }

    const { newState, optimizationHints: hints } = await this.decisionKernel.executeOptimize(decisionState, {
      fatigue,
    });

    const summarizeOptimizeOutputs = (): string => {
      if (!hints) return '本轮未产出数值型优化结论（可能跳过或降级）。';
      const ci = hints.confidenceInterval;
      return formatOptimizeOutputsZh({
        method: hints.method,
        recommendedId: hints.recommendedAlternativeId,
        altCount: hints.alternatives?.length ?? 0,
        expectedUtility: hints.expectedUtility,
        feasibilityProbability: hints.feasibilityProbability,
        ciLower: ci?.lower,
        ciUpper: ci?.upper,
        strategyDirection: hints.strategyDirection,
      });
    };

    state.decision_log.push({
      request_id: state.request_id,
      step: 'OPTIMIZE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: formatOptimizeInputsZh(),
      outputs_summary: summarizeOptimizeOutputs(),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        guardian: 'DR_DRE',
        alternatives_considered: hints?.alternatives?.length ?? undefined,
        expected_utility: hints?.expectedUtility,
        feasibility_probability: hints?.feasibilityProbability,
        optimization_method: hints?.method,
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    return newState;
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
          const verifySkill = this.skillsRegistry.getSkill('itinerary.verify');
          if (verifySkill) {
            const verifyResult = await verifySkill.execute({
              itinerary: state.itinerary,
              research_data: state.research_data,
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

  /**
   * NARRATE 步骤：产出用户可读解释（不得改硬字段）
   * P3 C: 优先经 Kernel.executeNarrate（NarrateExecutor 封装 NarratorAgent），否则降级到直接调用
   */
  private async executeNarrateStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'NARRATE';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 NARRATE 步骤...`);

    try {
      if (this.decisionKernel && state.itinerary && state.gate_result) {
        const narrateCtx: import('../../decision/kernel/interfaces/phase-executor.interface').NarrateExecutorContext = {
          requestId: state.request_id,
          userId: request.user_id,
          orchestratorState: state,
        };
        const dso = this.decisionKernel.createInitialState(state.request_id, this.kernelCreateInitialOpts(request, state));
        const result = await this.decisionKernel.executeNarrate(dso, narrateCtx);
        state.narration = result.narration as any;
      } else {
        // P3 D.1 原意：无 Kernel 时不强行走 NarrateExecutor；但若已有日程仍应产出叙述（否则调试里常年「0 天」）。
        state.narration = {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        };
      }

      // Kernel / NarrateExecutor 若返回空 day 列表，或上层未走 Kernel，则用 NarratorAgent 直接基于 itinerary.days 生成（与侧边栏有行程但叙述为 0 的根因对齐）。
      const narrativeDays = state.narration?.day_by_day_narrative?.length ?? 0;
      const itineraryDayCount = Array.isArray(state.itinerary?.days) ? state.itinerary!.days.length : 0;
      if (
        this.narratorAgent &&
        itineraryDayCount > 0 &&
        narrativeDays === 0
      ) {
        const gate: GateResult =
          state.gate_result ??
          ({
            gate_result: 'ALLOW',
            violations: [],
            required_adjustments: [],
            confidence: 0.9,
          } as GateResult);
        try {
          const fb = await this.narratorAgent.narrate(
            state.itinerary as Itinerary,
            gate,
            state.decision_log ?? [],
            state,
          );
          state.narration = fb as any;
          this.logger.debug(
            `[Claude Orchestrator] NARRATE fallback: NarratorAgent 生成 ${fb.day_by_day_narrative?.length ?? 0} 天叙述`,
          );
        } catch (e: any) {
          this.logger.warn(`[Claude Orchestrator] NARRATE fallback narrator failed: ${e?.message ?? e}`);
        }
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'NARRATE',
        actor: 'Narrator',
        inputs_summary: '把结构化日程转成自然语言说明（不改具体时间安排）',
        outputs_summary: state.narration
          ? `已写出 ${state.narration?.day_by_day_narrative?.length || 0} 天的讲解文案与要点提示`
          : '未生成叙述（可能缺少 Kernel 或日程为空）',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] NARRATE 步骤失败: ${error?.message}`);
      // Narrate 失败不影响整体流程，记录错误但继续
      state.errors.push({
        step: 'NARRATE',
        error_code: 'NARRATION_ERROR',
        message: error?.message || '叙述生成失败',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * FEEDBACK 步骤：专利反馈学习模块，记录决策日志
   * P3 A.4: 经 Kernel.executeFeedback 封装
   */
  private async executeFeedbackStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'FEEDBACK';
    const patch = this.isDsoAsPrimary()
      ? buildPatchFromDSOPrimary(decisionState, state)
      : orchestratorStateToDecisionStatePatch(state);

    const { newState: synced } = await this.decisionKernel.executeFeedback(decisionState, patch);

    state.decision_log.push({
      request_id: state.request_id,
      step: 'FEEDBACK' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: formatFeedbackInputsZh(),
      outputs_summary: formatFeedbackOutputsZh(synced.confidence, synced.systemState?.version),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
    });
    state.metadata.last_updated_at = new Date().toISOString();

    return synced;
  }

  /**
   * 步骤 8: HALLUCINATION_DETECTION - 防幻觉检测
   */
  private async executeHallucinationDetectionStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
  ): Promise<void> {
    if (!this.hallucinationDetection) {
      this.logger.debug(`[Claude Orchestrator] HallucinationDetectionService 未注入，跳过防幻觉检测`);
      return;
    }

    const stepStartTime = Date.now();
    this.logger.debug(`[Claude Orchestrator] 执行 HALLUCINATION_DETECTION 步骤...`);

    try {
      // 对narration进行防幻觉检测
      if (state.narration) {
        const detectionResult = await this.hallucinationDetection.detectHallucinations(
          state.narration,
          context,
        );

        // 使用清理后的输出
        if (detectionResult.cleanedOutput) {
          state.narration = detectionResult.cleanedOutput as any;
        }

        // 如果有幻觉风险，记录警告
        if (detectionResult.hallucinationRisks.length > 0) {
          // 在state中添加warnings字段（如果不存在）
          if (!state.metadata.warnings) {
            state.metadata.warnings = [];
          }

          (state.metadata.warnings as any[]).push({
            type: 'HALLUCINATION_RISK',
            message: detectionResult.userNotification.message,
            items: detectionResult.hallucinationRisks.map(r => ({
              text: r.text,
              confidence: r.confidence,
              action: r.action,
            })),
          });

          this.logger.warn(
            `[Claude Orchestrator] 检测到 ${detectionResult.hallucinationRisks.length} 个幻觉风险`,
          );
        }

        // 记录决策日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'HALLUCINATION_DETECTION',
          actor: 'HallucinationDetection',
          inputs_summary: formatHallucinationInputsZh(),
          outputs_summary: formatHallucinationOutputsZh(
            detectionResult.statistics.totalClaims,
            detectionResult.statistics.verifiedClaims,
            detectionResult.statistics.hallucinationRisks,
          ),
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            statistics: detectionResult.statistics,
          },
        });
      }

      state.metadata.last_updated_at = new Date().toISOString();
    } catch (error: any) {
      this.logger.error(
        `[Claude Orchestrator] HALLUCINATION_DETECTION 步骤失败: ${error?.message}`,
      );
      // 防幻觉检测失败不影响整体流程，记录错误但继续
      state.errors.push({
        step: 'HALLUCINATION_DETECTION',
        error_code: 'HALLUCINATION_DETECTION_ERROR',
        message: error?.message || '防幻觉检测失败',
        timestamp: new Date().toISOString(),
      });
    }
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

  /**
   * 构建成功结果
   * @param decisionState DSO（含 confidence/history/decisionMeta），供 RLHF/分析/前端使用
   */
  private buildSuccessResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult {
    this.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
    const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;
    this.finalizeHarnessTraceFromOrchestration(
      decisionState,
      hasClarificationQuestions ? 'NEED_USER_CONFIRM' : 'DONE',
    );

    // 如果有澄清问题，说明需要用户提供更多信息
    const answerText = hasClarificationQuestions
      ? clarificationIntroPlain((state.metadata as any)?.clarification_locale)
      : this.buildUserFacingAnswerText(state);

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
      },
      answerText,
      stepsExecuted: state.decision_log.map(log => ({
        stepId: log.step,
        success: true,
        duration: log.metadata?.duration_ms || 0,
      })),
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
    this.stampRecoveryOntoOrchestratorDecisionLogs(context, state);
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'BLOCKED');
    const violations = state.gate_result?.violations || [];
    const answerText = `行程规划被阻止。原因：${violations.map(v => v.detail).join('；')}`;

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
      stepsExecuted: state.decision_log.map(log => ({
        stepId: log.step,
        success: true,
        duration: log.metadata?.duration_ms || 0,
      })),
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
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'NEED_USER_CONFIRM');
    const answerText = clarificationIntroPlain((state.metadata as any)?.clarification_locale);

    return {
      success: false, // 需要用户输入，所以 success 为 false
      result: {
        state,
        needsUserConfirmation: true,
        clarificationQuestions: state.clarification_questions || [],
        clarificationMessage: this.formatClarificationMessage(
          state.clarification_questions || [],
          (state.metadata as any)?.clarification_locale,
        ),
        gaps: state.gaps,
      },
      answerText,
      stepsExecuted: state.decision_log.map(log => ({
        stepId: log.step,
        success: true,
        duration: log.metadata?.duration_ms || 0,
      })),
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
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'FAILED');
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
      stepsExecuted: state.decision_log.map(log => ({
        stepId: log.step,
        success: log.step !== 'FAILED' && log.step !== 'TIMEOUT',
        duration: log.metadata?.duration_ms || 0,
      })),
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
        matchAxioms({
          message: (state as any)?.trip_plan_request?.message,
          constraints: (state as any)?.trip_plan_request?.constraints,
        }),
      );
      const expectedCid = domAxiom?.axiom?.cid;
      const actualCid = normalizedAudit.dominant_cid;
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
            expected_cid: expectedCid,
            actual_cid: actualCid,
            stage: 'TERMINAL',
          });
        }
        if (delta_reason_kind === 'mismatch') {
          this.promMetrics?.recordAxiomSimRealMismatch({
            axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
            expected_cid: expectedCid ?? 'UNKNOWN',
            actual_cid: actualCid ?? 'UNKNOWN',
            stage: 'TERMINAL',
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
      stepsExecuted: state.decision_log.map((log) => ({
        stepId: log.step,
        success: true,
        duration: log.metadata?.duration_ms || 0,
      })),
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
}
