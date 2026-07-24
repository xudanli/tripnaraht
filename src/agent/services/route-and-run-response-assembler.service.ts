import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  readOtelTraceContextFromRouteAndRunRequest,
  resolveHarnessOtelObservabilityFields,
} from '../../harness/tracing/harness-otel-correlation.util';
import { readExecutionPolicyGatewayObservability } from '../runtime/execution-policy-gateway-context.util';
import type { RouteAndRunExecutionPolicyCarrier } from '../runtime/execution-policy-gateway-context.util';
import {
  readSubagentPermissionSandboxObservability,
  type RouteAndRunSubagentSandboxCarrier,
} from '../runtime/subagent-permission-sandbox-context.util';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto, PlanningPhaseIntentDto } from '../dto/route-and-run.dto';
import { enrichClientUiDisplay, type ClientUiEnrichmentInput } from '../utils/client-ui-enrichment.util';
import { buildFlawedDraftDescriptorV1 } from '../utils/build-flawed-draft-descriptor.util';
import { buildAgentRunTraceV1 } from '../orchestration/agent-run-trace.util';
import { projectTrustedDeliveryV1 } from '../delivery/utils/trusted-delivery.project.util';
import type { DecisionCandidateDto } from '../dto/route-and-run.dto';
import { TokenCalculator } from '../utils/token-calculator.util';
import type { OrchestrationResult, RoutingDecision } from '../interfaces/claude-orchestration.interface';
import {
  OrchestrationStep,
  DecisionLogEntry,
  GateResult,
  Itinerary,
  ItineraryRiskTag,
  OrchestratorState,
  SimplifiedExplanation,
  AICapabilityDisplay,
  TripPlanRequest,
} from '../interfaces/trip-plan.interface';
import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import { generateClarificationQuestions } from '../utils/clarification-question-generator.util';
import type { IntakeGap } from '../utils/clarification-question-generator.util';
import { resolveClarificationLocale } from '../../common/constants/agent-prompts';
import { RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';
import { MetricsRecorder, extractMetricsFromResponse } from '../utils/agent-metrics.util';
import { deriveExternalVerdict, shouldIntakeClarifyShortCircuit, type PolicyAction } from '../utils/external-verdict.util';
import { ErrorType } from '../interfaces/error-types.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { buildTravelOntologyStateFromOrchestrator, mergeTravelOntologyState } from '../../decision/kernel/travel-ontology.mapper';
import {
  buildTravelRuntimeGraphFromReplan,
  travelOntologyNounsToSchemaOrgDiscovery,
} from '../../travel-cognition';
import { JepaProjectorService } from './jepa-projector.service';
import { detectItineraryAdjustIntent, extractItineraryAdjustTargetDateFromMessage, detectFullTripReplanIntent, isItineraryFullTripReplanMetadata } from '../utils/itinerary-adjust-intent.util';
import {
  enrichRouteRunCardForClientApply,
} from '../utils/route-run-accommodation-apply.util';
import type {
  AccommodationNightGroup,
  RouteAndRunAccommodationCard,
} from '../utils/hotel-mcp-route-run.mapper';
import {
  buildItineraryAdjustActionExecutionPayload,
  buildItineraryAdjustAutoApplyLeadMessage,
} from '../utils/itinerary-adjust-auto-apply.util';
import {
  buildItineraryAdjustOptimizationResult,
  coalesceItineraryAdjustOptimizationResult,
  type ItineraryAdjustOptimizationResult,
  type ItineraryAdjustScheduleItem,
} from '../utils/itinerary-adjust-optimization-summary.util';
import {
  extractPoiNamesFromItineraryDay,
  extractScheduleItemsFromItineraryDay,
} from '../utils/itinerary-adjust-decision-log.util';
import { applyPacingRelaxToAdjustTargetState } from '../../skills/itinerary/experience-curator-pacing-relax.util';
import type { NeighborAnchorContext } from '../utils/itinerary-adjust-neighbor-anchors.util';
import { assertDoneResponseCompleteness } from '../guards/done-response-completeness.guard';
import { normalizeClientDsoVersion } from '../utils/client-dso-version.util';
import {
  applyConsultationItineraryPayloadHygiene,
  shouldApplyConsultationItineraryPayloadHygiene,
} from '../utils/route-and-run-consultation-payload-hygiene.util';
import { assembleDecisionEvidenceCards } from '../utils/evidence-payload-assembler.util';
import { assembleEvidenceCardUIPropsFromState } from '../utils/evidence-ui-assembler.util';
import { sha256Signature } from '../contracts/decision-contract.types';
import { normalizeHardRuleSnapshot } from '../../trips/decision/shared/hard-rule-snapshot.types';
import { deriveFactsFromMetadata } from '../../trips/decision/shared/fact-derivation.util';
import {
  resolveUnifiedExplainForRouteAndRunResponse,
} from '../../trips/decision/explainability/resolve-unified-explain-for-response.util';
import { dedupeUnifiedExplainabilityInClientOrchestratorState } from '../../trips/decision/explainability/dedupe-unified-explainability-client-payload.util';
import {
  assessNarrativeExplainabilityDrift,
  buildNarrativeDriftObservabilitySlice,
  emitNarrativeDriftMetricEvent,
} from '../../trips/decision/explainability/narrative-drift-monitor.util';
import type { UnifiedExplainabilityEnvelopeV1 } from '../../trips/decision/explainability/unified-explainability.types';
import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import { projectDecisionCockpitFromEnvelope } from '../../trips/decision/explainability/project-decision-cockpit-from-envelope.util';
import { TradeoffEngineService } from './tradeoff-engine.service';
import { NegotiationSessionStoreService } from './negotiation-session-store.service';
import { projectWorldModelGuardsExplain } from '../utils/world-model-guards-projection.util';
import { buildCoverageDisclosureFromRouteAndRunEvidence } from '../../travel-cognition';
import { buildDependencyImpactFromEvidence } from '../../travel-cognition';
import type { TripItineraryItemLike } from '../../travel-cognition';
import { buildReadinessCascadeUiHints } from '../../trips/readiness/utils/readiness-causal-preanalysis.util';
import {
  EVIDENCE_MISSING_BUT_RESULTS_PRESENT,
  VERIFICATION_FAILED_UNSPECIFIED,
  failureReasonCodeLabelsZh,
  failureReasonCodesFromHardGaps,
  sortFailureReasonCodes,
} from '../constants/failure-reason-codes.constants';
import { orchestrationStepDisplayZh } from '../constants/orchestration-step-display.constants';
import { isBoundTripLightConsultQuery, type TaskType } from '../utils/orchestration-signals.util';
import { shouldExposeSimplifiedExplanationForClient } from '../utils/route-and-run-option-defaults.util';
import {
  buildRuntimeExecutionProfileClaudeDynamicAssembly,
  resolveThinkingModeFromRuntimeProfile,
} from '../utils/runtime-execution-profile.builder';
import { validateRuntimeExecutionProfile } from '../utils/runtime-execution-profile.validation';
import {
  RouteRunItineraryPoiHydratorService,
  applyRouteRunPoiDisplayNamesToTimeline,
  type RouteRunPoiCard,
} from './route-run-itinerary-poi-hydrator.service';
import {
  toOrchestrationFailureObservability,
  type OrchestratorRobustnessMetadata,
} from '../utils/orchestrator-failure-taxonomy.util';
import type { ConsultationDashboardV1 } from '../types/consultation-dashboard.types';
import {
  buildNarrativeIntegrityObservabilitySlice,
  emitNarrativeIntegrityMetricEvent,
  type NarrativeIntegrityReport,
} from '../inventory/narrative-integrity-validator.util';
import type { NarrativeSafetyPayload } from '../inventory/narrative-safety-evaluator.util';
import { buildConsultationDashboardFallbackFromSuggestedOperations } from '../utils/consultation-dashboard-fallback.util';
import { buildDecisionVerdictFromHints } from '../../decision/kernel/decision-verdict.util';
import { formatDecisionVerdictNarrationZh } from '../utils/decision-verdict-narration.zh.util';
import type { TripConsultationSuggestedOperation } from '../utils/trip-consultation-suggested-operations.util';
import { buildSafetySurfacePayload } from '../utils/safety-surface-payload.util';
import { appendBudgetArbitrationEntriesToDecisionLogInPlace } from '../teams/research/research-budget-arbitration-k3-decision-log.util';
import { buildRecommendationReasoningZhBlock } from '../utils/recommendation-reasoning.util';
import { attachGuardianPersonaSurface } from '../utils/guardian-persona-surface.util';
import { resolvePersonaClosureAudit } from '../utils/persona-closure-repair-skip.util';
import { GuardiansDebateService } from './guardians-debate.service';
import { rollupVerifyIssuesFromDecisionLog } from '../utils/decision-log-verify-rollup.util';
import {
  humanizeFeasibilityMessageForUserZh,
  humanizeVerifyConflictCodesZh,
  simplifyDecisionLogLineForUserZh,
  sanitizeGateResultForClientDisplay,
  sanitizeDecisionLogForClientDisplay,
  sanitizeClarificationQuestionsForClientDisplay,
} from '../utils/feasibility-message-surface.zh.util';
import { renderClarificationMarkdownToSafeHtml, resolveClarificationShortStepDetail, resolveClarificationChatLead, renderPlainClarificationChatLeadHtml, isStructuredClarificationChoiceCard } from '../utils/user-clarification-markdown.util';
import { attachRelaxationSuggestionsToPayload } from '../utils/relaxation-suggestion-bff.projection.util';
import { attachOptionComparisonToResponse } from '../utils/option-comparison-bff.projection.util';
import { filterGateViolationsToDraftScheduleOnly } from '../utils/filter-stale-verify-violations.util';
import { filterDecisionLogVerifyToDraftPois } from '../utils/itinerary-adjust-decision-log.util';
import { extractSkillsHitFromDecisionLog } from '../utils/itinerary-item-crud-decision-log.util';
import {
  buildWorkbenchDisplayAlignment,
  pickItineraryDaysForDisplay,
  stripGateViolationsFromOrchestratorStateForClient,
  type WorkbenchDisplayAlignment,
} from '../utils/workbench-display-alignment.util';
import { resyncWorkbenchOpeningHoursFeasibility } from '../utils/workbench-feasibility-resync.util';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { HarnessShadowGraderService } from '../training/services/harness-shadow-grader.service';
import { buildHarnessQualitySampleObservability } from '../../harness/eval/quality/harness-quality-loop.util';
import { buildLlmRoutingObservabilityFromAccumulator } from '../runtime/harness-llm-routing-observability.util';
import { EpisodicMemorySummarizerService } from '../memory/services/episodic-memory-summarizer.service';
import {
  buildCostGovernanceObservability,
  type CostGovernanceObservabilityV1,
  type RouteAndRunCostGovernanceCarrier,
} from '../runtime/cost-governance-observability.util';
import { enrichRouteAndRunCostInPlace } from '../runtime/route-and-run-cost-est.util';
import { readAgenticTaskRollbackObservabilityFromTrace } from '../runtime/agentic-task-rollback.util';
import type { RouteAndRunEpisodicCarrier } from '../memory/utils/episodic-memory-summarizer.util';
import type { ShadowGraderObservabilityV1 } from '../training/utils/shadow-grader-observability.util';

@Injectable()
export class RouteAndRunResponseAssemblerService {
  private readonly logger = new Logger(RouteAndRunResponseAssemblerService.name);

  constructor(
    private readonly jepaProjector: JepaProjectorService,
    private readonly tradeoffEngine: TradeoffEngineService,
    @Optional() private readonly poiHydrator?: RouteRunItineraryPoiHydratorService,
    @Optional() private readonly negotiationSessions?: NegotiationSessionStoreService,
    @Optional() private readonly guardiansDebate?: GuardiansDebateService,
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly harnessShadowGrader?: HarnessShadowGraderService,
    @Optional() private readonly episodicMemorySummarizer?: EpisodicMemorySummarizerService,
  ) {}

  /** `enable_guardians_debate_llm`：硬门致命时由辩论服务内短路，不发起 LLM。 */
  private async maybeApplyGuardiansDebateLlm(
    request: RouteAndRunRequestDto,
    gate: GateResult | undefined,
    tripPlanRequest: TripPlanRequest | undefined,
    orchestratorState?: OrchestratorState,
  ): Promise<GateResult | undefined> {
    if (!gate || !request.options?.enable_guardians_debate_llm || !this.guardiansDebate) {
      return gate;
    }
    if (
      orchestratorState?.metadata?.debate_merged_before_plan_gen === true &&
      gate.guardian_results?.source === 'llm_debate'
    ) {
      return gate;
    }
    try {
      return await this.guardiansDebate.consumeShadowOrMerge(request.request_id, gate, {
        personaHint: request.options.persona_hint as TripPlanRequest['persona_hint'] | undefined,
        tripContext: tripPlanRequest,
        llmProvider: request.options.llm_provider,
        personaClosureAudit: resolvePersonaClosureAudit({
          gateResult: gate,
          orchestratorMetadata: orchestratorState?.metadata as Record<string, unknown> | undefined,
        }),
      });
    } catch (e: any) {
      this.logger.warn(`[RouteAndRunAssembler] GuardiansDebate LLM skipped: ${e?.message ?? e}`);
      return gate;
    }
  }

  private buildRecommendationReasoningProse(
    state: OrchestratorState | undefined,
    itinerary: Itinerary | undefined,
    orchestrationResult?: OrchestrationResult,
  ): string | null {
    const snap = state?.metadata?.travel_preference_snapshot as Record<string, unknown> | undefined;
    const resultAny = orchestrationResult?.result as
      | { trip_plan_request?: TripPlanRequest; state?: OrchestratorState }
      | undefined;
    const tripPlanRequest =
      state?.trip_plan_request ??
      resultAny?.trip_plan_request ??
      resultAny?.state?.trip_plan_request ??
      null;
    return buildRecommendationReasoningZhBlock({
      travelPreference: snap,
      itinerary: itinerary ?? null,
      tripPlanRequest: tripPlanRequest,
    });
  }

  /**
   * 咨询类（检索/问答）与「生成/修改行程」区分 UI：避免前端成功态一律展示「安排行程成功」。
   */
  /**
   * 咨询态：在剥离编排侧 timeline 之后，用 **库内 Trip 草案** 重新补水 `poi_cards_by_day`，
   * 与 `applyConsultationItineraryPayloadHygiene` 解耦，避免前端只能合并陈旧 orchestration POI。
   */
  private async maybeAttachPersistedTripPoiCardsForConsultation(
    request: RouteAndRunRequestDto,
    response: RouteAndRunResponseDto,
  ): Promise<void> {
    const tid = request.trip_id?.trim();
    if (!tid || !this.poiHydrator) return;
    if (response.result?.status !== 'OK') return;
    if (!shouldApplyConsultationItineraryPayloadHygiene(response)) return;
    try {
      const hydration = await this.poiHydrator.hydratePersistedTripDraft(tid);
      if (!hydration.poi_cards.length) return;
      const payload = response.result!.payload as Record<string, unknown>;
      Object.assign(payload, hydration);
      payload['trip_persisted_poi_cards'] = true;
      const prev = (payload['poi_cards_meta'] as Record<string, unknown> | undefined) ?? {};
      payload['poi_cards_meta'] = {
        ...prev,
        /** 轻量咨询正文与草案卡片并排展示；勿压制顾问长文（前端会误收起 Markdown） */
        suppress_answer_prose: false,
        trip_persisted_draft: true,
      };
    } catch (e: any) {
      this.logger.warn(
        `[RouteAndRunAssembler] persisted trip POI attach skipped trip_id=${tid}: ${e?.message ?? e}`,
      );
    }
  }

  private isConsultationUiSurface(
    orchestrationResult: OrchestrationResult,
    routingTaskType?: TaskType,
  ): boolean {
    if (this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)) return false;
    const r = orchestrationResult.result as
      | { lightweightKnowledgeQa?: boolean; routingTaskType?: TaskType }
      | undefined;
    if (r?.lightweightKnowledgeQa) return true;
    if ((orchestrationResult.result as { teamStructuredDiscussionBypass?: boolean } | undefined)
      ?.teamStructuredDiscussionBypass) {
      return true;
    }
    const tt = routingTaskType ?? r?.routingTaskType;
    return tt === 'DATA_LOOKUP' || tt === 'GENERIC_QA' || tt === 'RAG_QA';
  }

  private resolveSuccessUiHintMessage(
    orchestrationResult: OrchestrationResult,
    consultationUi: boolean,
  ): string {
    if (this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)) {
      return this.isItineraryItemCrudApplied(orchestrationResult) ? '行程已更新' : '未能更新行程';
    }
    if (this.isItineraryAdjustSession(orchestrationResult)) {
      return '行程草案已更新';
    }
    if (consultationUi) return '咨询已完成';
    return '处理完成';
  }

  private getItineraryItemCrudShortCircuitResult(
    orchestrationResult: OrchestrationResult,
  ): { applied?: boolean } | undefined {
    const md = orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined;
    return (
      (md?.lodging_replace_short_circuit as { applied?: boolean } | undefined) ??
      (md?.itinerary_day_replan_short_circuit as { applied?: boolean } | undefined) ??
      (md?.itinerary_item_update_short_circuit as { applied?: boolean } | undefined) ??
      (md?.itinerary_item_add_short_circuit as { applied?: boolean } | undefined) ??
      (md?.itinerary_item_delete_short_circuit as { applied?: boolean } | undefined)
    );
  }

  private isItineraryItemCrudApplied(orchestrationResult: OrchestrationResult): boolean {
    if (!this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)) return false;
    return this.getItineraryItemCrudShortCircuitResult(orchestrationResult)?.applied === true;
  }

  private isItineraryAdjustDraftApplyIntake(
    orchestrationResult: OrchestrationResult,
  ): boolean {
    const md = orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined;
    return md?.itinerary_adjust_draft_apply_intake === true;
  }

  private isItineraryAdjustDraftApplySucceeded(orchestrationResult: OrchestrationResult): boolean {
    if (!this.isItineraryAdjustDraftApplyIntake(orchestrationResult)) return false;
    const sc = orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined;
    const apply = sc?.itinerary_adjust_apply_result as { applied?: boolean } | undefined;
    return apply?.applied === true;
  }

  private resolveUiSurfaceForPayload(
    orchestrationResult: OrchestrationResult,
    consultationUi: boolean,
  ): 'consultation' | 'planning' {
    if (this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)) return 'planning';
    return consultationUi ? 'consultation' : 'planning';
  }

  /** INTAKE 删除/新增/改时/住宿替换/整日重排 短路：轻量 CRUD 回复，不挂改排草案卡 */
  private isItineraryItemCrudIntakeShortCircuit(orchestrationResult: OrchestrationResult): boolean {
    const md = orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined;
    return (
      md?.lodging_replace_intake === true ||
      md?.itinerary_day_replan_intake === true ||
      md?.itinerary_item_delete_intake === true ||
      md?.itinerary_item_add_intake === true ||
      md?.itinerary_item_update_intake === true
    );
  }

  /**
   * 空 evidence_bundle 表示「尚未跑完整 RESEARCH·VERIFY」，不应标 FAILED。
   * INTAKE 澄清与行程单项 CRUD 短路均适用。
   */
  private resolveEmptyBundleAuditPendingReason(
    orchestrationResult: OrchestrationResult,
    needsUserConfirmation: boolean,
  ): 'intake_clarification' | 'itinerary_item_crud' | undefined {
    if (needsUserConfirmation) return 'intake_clarification';
    if (this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)) return 'itinerary_item_crud';
    return undefined;
  }

  /**
   * 行程单项 CRUD 未跑 VERIFY、且无 Iron Shield 叙事卡时，不下发 C1 证据包块。
   * ITINERARY_ADJUST：绑定 trip 改排走完整链，但产品面不展示 Iron Shield / 候选方案等调试块。
   */
  private shouldSuppressIronShieldUi(
    orchestrationResult: OrchestrationResult,
    state?: OrchestratorState | null,
    request?: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
  ): boolean {
    if (this.isItineraryAdjustSession(orchestrationResult, request)) return true;
    if (!this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)) return false;
    return assembleDecisionEvidenceCards(state ?? undefined).length === 0;
  }

  /** @deprecated use shouldSuppressIronShieldUi */
  private shouldSuppressIronShieldUiForCrud(
    orchestrationResult: OrchestrationResult,
    state?: OrchestratorState | null,
  ): boolean {
    return this.shouldSuppressIronShieldUi(orchestrationResult, state);
  }

  /** 绑定 trip 的日程调整（ITINERARY_ADJUST）：走完整规划链但面向用户展示日程草案，非 CGUS 决策驾驶舱 */
  private isItineraryAdjustSession(
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
  ): boolean {
    const md = orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined;
    if (isItineraryFullTripReplanMetadata(md)) return false;
    // 住宿 A→B / 单项 CRUD 已落库：勿再挂「草案待确认 / 应用到行程」
    if (md?.lodging_replace_intake === true) return false;
    if (md?.itinerary_day_replan_intake === true) return false;
    if (
      md?.itinerary_item_delete_intake === true ||
      md?.itinerary_item_add_intake === true ||
      md?.itinerary_item_update_intake === true
    ) {
      return false;
    }
    if (md?.itinerary_adjust_intake === true) return true;
    const routeIntent = md?.route_and_run_intent as { primary?: string } | undefined;
    if (routeIntent?.primary === 'ITINERARY_ADJUST') return true;
    const tripId = request?.trip_id?.trim();
    const msg =
      request?.message ??
      (typeof md?.intake_user_message === 'string' ? md.intake_user_message : undefined);
    const dateRange =
      orchestrationResult.result?.state?.trip_plan_request?.date_range;
    if (tripId && typeof msg === 'string' && detectFullTripReplanIntent(msg, dateRange)) return false;
    if (tripId && typeof msg === 'string' && detectItineraryAdjustIntent(msg, dateRange)) return true;
    return false;
  }

  private resolveItineraryAdjustTargetDate(
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'message' | 'trip_id'>,
    state?: OrchestratorState | null,
  ): string | undefined {
    const md = (state?.metadata ??
      orchestrationResult.result?.state?.metadata) as Record<string, unknown> | undefined;
    const anchors = md?.itinerary_adjust_neighbor_anchors as NeighborAnchorContext | undefined;
    const fromMeta =
      (typeof md?.itinerary_adjust_target_date_iso === 'string'
        ? md.itinerary_adjust_target_date_iso.slice(0, 10)
        : undefined) ?? anchors?.targetDateIso?.slice(0, 10);
    if (fromMeta) return fromMeta;

    const msg =
      request?.message ??
      (typeof md?.intake_user_message === 'string' ? md.intake_user_message : undefined);
    if (!msg) return undefined;
    const dateRange =
      state?.trip_plan_request?.date_range ??
      orchestrationResult.result?.state?.trip_plan_request?.date_range;
    return extractItineraryAdjustTargetDateFromMessage(msg, dateRange);
  }

  private async resolveWorkbenchDisplayContext(
    request: RouteAndRunRequestDto,
    orchestrationResult: OrchestrationResult,
    orchestratorDays: Itinerary['days'],
    stateMetadata?: Record<string, unknown>,
  ): Promise<{
    alignment: WorkbenchDisplayAlignment;
    displayDays: Itinerary['days'];
    displayItinerary: Itinerary | undefined;
  }> {
    const tripId = request.trip_id?.trim();
    let tripDays: Itinerary['days'] | null = null;
    if (tripId && this.poiHydrator) {
      const tripItin = await this.poiHydrator.loadPersistedTripItinerary(tripId);
      tripDays = tripItin?.days ?? null;
    }
    const alignment = buildWorkbenchDisplayAlignment({
      tripId,
      orchestratorDays,
      tripDays,
      autoApplyApplied:
        (stateMetadata?.itinerary_adjust_auto_apply as { applied?: boolean } | undefined)?.applied ===
        true,
      entryPoint: request.options?.entry_point,
      itineraryAdjustDraftPending:
        this.isItineraryAdjustSession(orchestrationResult, request) &&
        (stateMetadata?.itinerary_adjust_auto_apply as { applied?: boolean } | undefined)?.applied !== true,
      fullTripReplanDraftPending:
        isItineraryFullTripReplanMetadata(stateMetadata) &&
        (stateMetadata?.itinerary_adjust_auto_apply as { applied?: boolean } | undefined)?.applied !== true &&
        !this.isItineraryAdjustSession(orchestrationResult, request),
    });
    const displayDays = pickItineraryDaysForDisplay(alignment, orchestratorDays, tripDays);
    const base = orchestrationResult.result?.itinerary;
    const displayItinerary: Itinerary | undefined = displayDays.length
      ? base
        ? { ...base, days: displayDays }
        : { request_id: request.request_id, days: displayDays }
      : undefined;
    if (alignment.drift_detected) {
      this.logger.debug(
        `[RouteAndRunAssembler] workbench display drift trip_id=${tripId} source=${alignment.timeline_source}`,
      );
    }
    return { alignment, displayDays, displayItinerary };
  }

  private sanitizeGateForClientPayload(
    gate: GateResult | undefined,
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
    displayItinerary?: Itinerary,
    adjustDraftPoiNames?: string[],
    researchData?: Record<string, unknown>,
  ): GateResult | undefined {
    if (!gate) return undefined;
    const stripHarnessSynthetic = this.isItineraryAdjustSession(orchestrationResult, request);
    const itinerary =
      displayItinerary ??
      orchestrationResult.result?.state?.itinerary ??
      orchestrationResult.result?.itinerary;
    let sanitized = sanitizeGateResultForClientDisplay(gate, {
      stripVerifySyntheticWhenAllow: stripHarnessSynthetic,
      stripVerifySyntheticForItineraryAdjust: stripHarnessSynthetic,
      itinerary: itinerary ?? undefined,
      researchData,
    });
    if (stripHarnessSynthetic && adjustDraftPoiNames?.length && sanitized.violations?.length) {
      sanitized = {
        ...sanitized,
        violations: filterGateViolationsToDraftScheduleOnly(
          sanitized.violations ?? [],
          adjustDraftPoiNames,
        ),
      };
    }
    return sanitized;
  }

  /** Trip 与编排器漂移或 CRUD 改排后：用展示 itinerary 重算开放时间类 VERIFY，避免 Agent 与时间轴不同步 */
  private async resyncGateFeasibilityForWorkbench(params: {
    gate: GateResult | undefined;
    displayItinerary: Itinerary | undefined;
    researchData: Record<string, unknown> | undefined;
    alignment: WorkbenchDisplayAlignment;
    crudApplied: boolean;
  }): Promise<GateResult | undefined> {
    const shouldResync =
      Boolean(params.displayItinerary?.days?.length) &&
      (params.alignment.drift_detected || params.crudApplied);
    if (!shouldResync || !params.gate) return params.gate;

    const ohSkill = this.skillsRegistry?.getSkill('opening_hours.get');
    return resyncWorkbenchOpeningHoursFeasibility({
      gate: params.gate,
      itinerary: params.displayItinerary,
      researchData: params.researchData,
      shouldResync: true,
      openingHoursSkill: ohSkill as
        | { execute: (input: { poi_ids: string[] }) => Promise<{ opening_hours?: unknown[] }> }
        | undefined,
    });
  }

  private filterItineraryDaysForAdjustScope<
    T extends {
      date?: string;
      day_index?: number;
      items?: Array<{ location_ref?: { name?: string }; name?: string }>;
    },
  >(
    days: T[],
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'message' | 'trip_id'>,
  ): T[] {
    const targetDate = this.resolveItineraryAdjustTargetDate(orchestrationResult, request);
    if (!targetDate) return days;
    const matched = days.filter((d) => String(d.date ?? '').slice(0, 10) === targetDate);
    return matched.length > 0 ? matched : days;
  }

  /** 改排出站 timeline：目标日以 adaptive_replan 后的 state.itinerary 为准 */
  private patchAdjustTargetDayFromAuthoritativeItinerary<
    T extends {
      date?: string;
      items?: Array<{
        location_ref?: { name?: string };
        name?: string;
        type?: string;
        start_window?: string;
        end_window?: string;
      }>;
    },
  >(days: T[], itinerary: Itinerary | undefined, targetDateIso: string | undefined): T[] {
    if (!targetDateIso || !itinerary?.days?.length) return days;
    const target = targetDateIso.slice(0, 10);
    const authDay = itinerary.days.find((d) => String(d.date ?? '').slice(0, 10) === target);
    if (!authDay?.items?.length) return days;

    const patchedItems = authDay.items.map((it) => ({
      location_ref: { name: it.location_ref?.name },
      name: it.location_ref?.name,
      type: it.type,
      start_window: it.start_window,
      end_window: it.end_window,
    }));

    if (days.length === 0) {
      return [{ date: target, items: patchedItems } as T];
    }

    let replaced = false;
    const next = days.map((d) => {
      if (String(d.date ?? '').slice(0, 10) !== target) return d;
      replaced = true;
      return { ...d, date: target, items: patchedItems };
    });
    return replaced ? next : [...next, { date: target, items: patchedItems } as T];
  }

  /** ITINERARY_ADJUST：与 timeline 一致，仅保留目标日历日的 POI 卡片（地图/侧栏引脚） */
  private filterPoiCardsForAdjustScope(
    cards: RouteRunPoiCard[],
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'message' | 'trip_id'>,
  ): RouteRunPoiCard[] {
    const targetDate = this.resolveItineraryAdjustTargetDate(orchestrationResult, request);
    if (!targetDate || cards.length === 0) return cards;
    const matched = cards.filter((c) => String(c.date ?? '').slice(0, 10) === targetDate);
    return matched.length > 0 ? matched : cards;
  }

  private scopeItineraryForPoiHydration(
    itinerary: Itinerary | null | undefined,
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'message' | 'trip_id'>,
  ): Itinerary | null | undefined {
    if (!itinerary?.days?.length) return itinerary;
    if (!this.isItineraryAdjustSession(orchestrationResult, request)) return itinerary;
    const scopedDays = this.filterItineraryDaysForAdjustScope(
      itinerary.days,
      orchestrationResult,
      request,
    );
    if (scopedDays.length === itinerary.days.length) return itinerary;
    return { ...itinerary, days: scopedDays };
  }

  /** 行程单项 CRUD / 日程调整：不下发 Decision Cockpit 与优化决策长文 */
  private shouldSuppressDecisionCockpitUi(
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
  ): boolean {
    return (
      this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult) ||
      this.isItineraryAdjustSession(orchestrationResult, request)
    );
  }

  /** @deprecated use shouldSuppressDecisionCockpitUi */
  private shouldSuppressDecisionCockpitForCrud(
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
  ): boolean {
    return this.shouldSuppressDecisionCockpitUi(orchestrationResult, request);
  }

  /** @deprecated use isItineraryItemCrudIntakeShortCircuit */
  private isItineraryItemDeleteIntakeShortCircuit(orchestrationResult: OrchestrationResult): boolean {
    return this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult);
  }

  private resolveClientDsoVersionForResponse(
    orchestrationResult: OrchestrationResult,
  ): string | undefined {
    const raw =
      orchestrationResult.result?.decisionState?.systemState?.version ??
      orchestrationResult.result?.state?.plan_version;
    return normalizeClientDsoVersion(raw);
  }

  /**
   * 轻量咨询：纯 DATA_LOOKUP/RAG/GENERIC 且无 trip 绑定时，不拼 fallback Dashboard（避免无关卡片）；
   * 仍下发模型显式输出的 `consultation_dashboard`。行程向（TRIP_PLANNING 或带 trip_id）保持兜底。
   */
  private allowConsultationDashboardFallbackForLightweight(
    lightweightKnowledgeQa: boolean,
    routingTaskType: TaskType | undefined,
    tripId: string | null | undefined,
  ): boolean {
    if (!lightweightKnowledgeQa) return true;
    if (routingTaskType === 'TRIP_PLANNING') return true;
    const tid = typeof tripId === 'string' ? tripId.trim() : '';
    return tid.length > 0;
  }

  /** 住宿 MCP enrich 写入 orchestrationResult.result 的卡片块，供 payload 透出 */
  private resolveHotelAccommodationPayloadBlocks(
    orchestrationResult: OrchestrationResult,
  ): Record<string, unknown> {
    const r = orchestrationResult.result as Record<string, unknown> | undefined;
    const accommodations = r?.['accommodations'];
    if (!Array.isArray(accommodations) || accommodations.length === 0) {
      return {};
    }
    const nightGroups = r?.['accommodation_night_groups'] as AccommodationNightGroup[] | undefined;
    const enrichedAccommodations = accommodations.map((card, i) =>
      enrichRouteRunCardForClientApply(card as RouteAndRunAccommodationCard, i, nightGroups),
    );
    const enrichedNightGroups = nightGroups?.map((group) => ({
      ...group,
      cards: group.cards.map((card) => {
        const idx = enrichedAccommodations.findIndex(
          (a) => a.id === card.id && a.nightIndex === card.nightIndex,
        );
        return idx >= 0
          ? enrichedAccommodations[idx]
          : enrichRouteRunCardForClientApply(card, idx, nightGroups);
      }),
    }));
    return {
      accommodations: enrichedAccommodations,
      ...(r?.['airbnbListings'] != null ? { airbnbListings: r['airbnbListings'] } : {}),
      ...(r?.['routing'] != null ? { routing: r['routing'] } : {}),
      ...(enrichedNightGroups?.length ? { accommodation_night_groups: enrichedNightGroups } : {}),
      ...(r?.['hotel_search_meta'] != null ? { hotel_search_meta: r['hotel_search_meta'] } : {}),
    };
  }

  /** 航班/酒店/租车快照 → ui_display.booking_cart 投影输入 */
  private resolveBookingPayloadForUiEnrichment(
    orchestrationResult: OrchestrationResult,
  ): ClientUiEnrichmentInput['bookingPayload'] {
    const r = orchestrationResult.result as Record<string, unknown> | undefined;
    if (!r) return undefined;

    const hotelBlocks = this.resolveHotelAccommodationPayloadBlocks(orchestrationResult);
    const flight = r['flight_inventory_snapshot'];
    const cars = r['car_rentals'];

    const hasHotel =
      (Array.isArray(hotelBlocks.accommodations) && hotelBlocks.accommodations.length > 0) ||
      (Array.isArray(hotelBlocks.accommodation_night_groups) &&
        hotelBlocks.accommodation_night_groups.length > 0);
    const hasFlight = flight != null && typeof flight === 'object';
    const hasCars = Array.isArray(cars) && cars.length > 0;

    if (!hasHotel && !hasFlight && !hasCars) return undefined;

    return {
      ...(hasFlight ? { flight_inventory_snapshot: flight as Record<string, unknown> } : {}),
      ...(hasCars ? { car_rentals: cars as unknown[] } : {}),
      ...(Array.isArray(hotelBlocks.accommodations)
        ? { accommodations: hotelBlocks.accommodations as unknown[] }
        : {}),
      ...(Array.isArray(hotelBlocks.accommodation_night_groups)
        ? { accommodation_night_groups: hotelBlocks.accommodation_night_groups as unknown[] }
        : {}),
    };
  }

  /**
   * 咨询 Dashboard：优先编排结果中的模型输出；缺失或无效时由 suggested_operations 生成兜底。
   */
  private resolveConsultationDashboardForPayload(
    orchestrationResult: OrchestrationResult,
    consultationUi: boolean,
    ctx?: { routingTaskType?: TaskType; trip_id?: string | null },
  ): ConsultationDashboardV1 | undefined {
    if (!consultationUi || !orchestrationResult.success) return undefined;
    const r = orchestrationResult.result as Record<string, unknown> | undefined;
    if (!r) return undefined;
    if (r['teamStructuredDiscussionBypass'] === true) {
      return undefined;
    }
    const pf = r['process_fairness'] as { triggered?: boolean; round?: unknown } | undefined;
    if (pf?.triggered && pf?.round) {
      return undefined;
    }
    const raw = r['consultation_dashboard'] as ConsultationDashboardV1 | undefined;
    if (raw && typeof raw === 'object' && raw.version === 1) {
      return raw;
    }
    const lw = r['lightweightKnowledgeQa'] === true;
    const tt = ctx?.routingTaskType ?? (r['routingTaskType'] as TaskType | undefined);
    const tripId = ctx?.trip_id;
    if (!this.allowConsultationDashboardFallbackForLightweight(lw, tt, tripId)) {
      return undefined;
    }
    const ops = r['suggested_operations'] as TripConsultationSuggestedOperation[] | undefined;
    const citations = r['data_lookup_rag_citations'];
    const ragCount = Array.isArray(citations) ? citations.length : 0;
    const hotelMeta = r['hotel_search_meta'];
    const liveRaw = r['live_sensor_audit'];
    const liveList =
      Array.isArray(liveRaw) && liveRaw.length
        ? (liveRaw as Array<{ tool_id?: unknown; ok?: unknown; latency_ms?: unknown; error?: unknown }>)
            .filter((row) => typeof row?.tool_id === 'string')
            .map((row) => ({
              tool_id: String(row.tool_id),
              ok: Boolean(row.ok),
              ...(typeof row.latency_ms === 'number' ? { latency_ms: row.latency_ms } : {}),
              ...(typeof row.error === 'string' ? { error: row.error } : {}),
            }))
        : undefined;

    return buildConsultationDashboardFallbackFromSuggestedOperations(ops, {
      ...(ragCount > 0 ? { rag_citation_count: ragCount } : {}),
      ...(hotelMeta && typeof hotelMeta === 'object'
        ? {
            hotel_search_meta: hotelMeta as {
              disclaimer_zh?: string;
              ui_layout_hint_zh?: string;
              strategy?: string;
            },
          }
        : {}),
      ...(liveList?.length ? { live_sensor_audit: liveList } : {}),
    });
  }

  /**
   * 用户明确询问「是否可行」类问题时，应在扼要答复可行性后再指向卡片日程。
   */
  private isFeasibilityQuestionMessage(message: string | undefined): boolean {
    if (!message?.trim()) return false;
    const m = message.trim();
    if (/feasible|feasibility|is\s+it\s+(ok|possible|realistic)\s+to\b|\bviable\b/i.test(m)) return true;
    if (/是否可行|行不行|可行吗|可以吗|能不能行|会不会太赶|现实吗|靠谱吗/.test(m)) return true;
    if (/可行/.test(m) && (/[？?]|吗/.test(m))) return true;
    return false;
  }

  /**
   * POI 卡片模式会压缩 prose：对用户「可行性」提问先给出结构化结论，再保留「请看卡片」提示。
   */
  private buildFeasibilityLeadBeforePoiCards(params: {
    request: RouteAndRunRequestDto;
    decisionState: DecisionState | undefined;
    gateResult: GateResult | undefined;
  }): string | null {
    if (!this.isFeasibilityQuestionMessage(params.request.message)) return null;

    const feas = params.decisionState?.poiPlanning?.schedulePlan?.feasibility;
    const hint = params.decisionState?.poiPlanning?.narrationHint?.trim();
    const gr = params.gateResult?.gate_result;

    let lead: string;
    if (feas === 'ok') {
      lead =
        '**结论：在系统评估的日程容量与约束下，该路线整体可行。** 下方草案已与景点库对齐；具体时段与说明请看每日卡片，可按卡片再做微调。';
    } else if (feas === 'tight') {
      lead =
        '**结论：大体可行，但日程偏紧（缓冲较少）。** 下方是在当前约束下尽量稳妥的版本；请关注车程与体力，必要时缩减单日跨度或删减次要点。';
    } else if (feas === 'failed') {
      lead =
        '**结论：在既定天数与时间预算下，这条组合较难轻松完整落地。** 下方草案给出可行域内的折中排布；请对照卡片中的长途/高风险段决定是否改线或增程。';
    } else if (gr === 'ALLOW') {
      lead =
        '**结论：在当前策略与安全审查口径下，这条路线方向总体可行。** 下方为与景点库对齐后的日程草案，细节与风险提示见卡片。';
    } else if (gr === 'ADJUST_REQUIRED') {
      lead =
        '**结论：方向可行，但仍有几处需要微调。** 下方日程已反映系统在可行域内的修订；请优先查看卡片中标出的调整点。';
    } else if (gr === 'BLOCK') {
      lead =
        '**结论：存在需优先处理的风险或硬性阻碍，不宜直接按理想清单执行。** 下方草案仅供对照；请结合卡片评估是否改线、减压或更换季节/车型。';
    } else if (gr === 'NEED_USER_CONFIRM') {
      lead =
        '**结论：路线能否稳妥落地仍取决于若干关键假设（路况、体力、装备等）。** 下方草案供对照；请结合卡片确认高风险段与日程强度后再定稿。';
    } else {
      lead =
        '**结论：** 针对「是否可行」，我们先给出系统在当前约束下生成的对齐草案；可行性高度依赖季节路况与单日车程强度，请以卡片中的衔接与提示为准并酌情微调。';
    }

    return hint ? `${lead}\n\n补充：${hint}` : lead;
  }

  /**
   * 规划成功且前端将展示 POI 卡片时：用结构化 itinerary 条目生成「住宿 / 餐饮 / 准备度」摘要，
   * 避免用户只看到时间轴却看不到吃住与草案完整度说明。
   * `request` 可选：用于对齐结构化表单日期与草案日历，减少「脱离上下文」的误解。
   */
  private buildPlanningTripReadinessFromItinerary(
    itinerary: Itinerary | null | undefined,
    request?: RouteAndRunRequestDto,
  ): string | null {
    if (!itinerary?.days?.length) return null;

    let acc = 0;
    let meal = 0;
    let poi = 0;
    const perDayLines: string[] = [];
    for (let di = 0; di < itinerary.days.length; di++) {
      const d = itinerary.days[di]!;
      const dateRaw = d.date?.trim() ?? '';
      const dateShort = dateRaw ? dateRaw.slice(0, 10) : '';
      let dayAcc = 0;
      let dayMeal = 0;
      for (const it of d.items ?? []) {
        if (it.type === 'ACCOMMODATION') {
          dayAcc++;
          acc++;
        } else if (it.type === 'MEAL') {
          dayMeal++;
          meal++;
        } else if (it.type === 'POI') poi++;
      }
      const accLabel = dayAcc > 0 ? `**本日草案已含住宿节点**（${dayAcc} 条）` : '**本日草案未出现住宿（ACCOMMODATION）节点**';
      const mealBit =
        dayMeal > 0 ? `；MEAL 用餐节点 ${dayMeal} 条` : '；当日未标注 MEAL 正餐条目';
      perDayLines.push(
        `  - 第 ${di + 1} 天${dateShort ? `（${dateShort}）` : ''}：${accLabel}${mealBit}。`,
      );
    }
    const hotelActions =
      itinerary.action_plan?.filter((a) => a.target_type === 'HOTEL').length ?? 0;

    const firstDayYmd = itinerary.days[0]?.date?.trim().slice(0, 10) ?? '';
    const lastDayYmd = itinerary.days[itinerary.days.length - 1]?.date?.trim().slice(0, 10) ?? '';
    const structStart = request?.structured_travel_input?.start_date?.slice(0, 10);
    const structEnd = request?.structured_travel_input?.end_date?.slice(0, 10);
    const spanNote =
      firstDayYmd && lastDayYmd
        ? `当前草案日历跨度为 **${firstDayYmd}** 至 **${lastDayYmd}**（共 **${itinerary.days.length}** 个日历日），下列「第 N 天」与下方时间轴/卡片日期一致。`
        : `下列「第 N 天」与下方时间轴/卡片中的日历日一致。`;
    const structMismatch =
      structStart &&
      structEnd &&
      firstDayYmd &&
      lastDayYmd &&
      (structStart !== firstDayYmd || structEnd !== lastDayYmd)
        ? ` 结构化表单日期为 **${structStart} — ${structEnd}**，若与草案不一致，**以本轮已写回的草案为准**。`
        : '';

    const lines: string[] = [];
    lines.push('### 行程整体说明（基于当前草案条目）');
    lines.push('');
    lines.push(`- **上下文**：${spanNote}${structMismatch}`);
    lines.push('');
    lines.push(
      '- **逐日是否体现住宿**：下列按「当日行程条目里是否含类型 ACCOMMODATION」判断（仅代表草稿结构；**不等于**您已在外部平台完成付款预订）。',
    );
    perDayLines.forEach((l) => lines.push(l));
    lines.push('');
    if (acc > 0 || hotelActions > 0) {
      lines.push(
        `- **住宿小结**：全行程共 **${acc}** 条住宿类条目${
          hotelActions ? `；行动计划中与酒店相关的动作 **${hotelActions}** 条。` : '。'
        }若某日显示「未出现住宿」而实际当晚需要过夜，请在行程编辑中补充过夜城镇或住宿停点。`,
      );
    } else {
      lines.push(
        '- **住宿小结**：**每一日**草案条目均未含 ACCOMMODATION，行动计划中也未见酒店类动作——过夜安排尚未写入或未在本轮生成；请按晚补充酒店/民宿节点。',
      );
    }
    if (meal > 0) {
      lines.push(
        `- **餐饮**：日程中含用餐（MEAL）条目 **${meal}** 项；其余仅为游览（POI **${poi}** 项）时，仍建议在长途日自行预留午餐/晚餐窗口。`,
      );
    } else {
      lines.push(
        `- **餐饮**：草案中**未标注 MEAL 正餐时段**（当前以游览节点为主）；卡片时间轴**不代表已订餐厅**，请在各停留点自行安排或后续添加用餐停点。`,
      );
    }
    const robust = itinerary.metadata?.robustness_score;
    let prepZh =
      '草案可用于对照地图与卡片再做收紧；请自行核对证件、保险、季节装备与租车/路况假设。';
    if (robust != null) {
      if (robust >= 0.7) prepZh = `草案衔接相对完整（系统稳健度约 ${robust.toFixed(2)}）。${prepZh}`;
      else if (robust >= 0.4)
        prepZh = `草案可用但仍建议压缩强度或增加缓冲（稳健度约 ${robust.toFixed(2)}）。${prepZh}`;
      else prepZh = `草案偏早期，建议优先核对单日车程与季节窗口（稳健度约 ${robust.toFixed(2)}）。${prepZh}`;
    }
    lines.push(`- **草案完整度**：${prepZh}`);

    return lines.join('\n');
  }

  /**
   * 行程规划类且存在 trip 会话时：用 plan_diff / optimizationHints 摘要「相对现有草稿」的决策信息，
   * 避免用户只看到新日程却看不到与当前行程的关系。
   */
  private buildTripPlanningSessionDecisionContrast(params: {
    request: RouteAndRunRequestDto;
    routingTaskType?: TaskType;
    state: OrchestratorState | undefined;
    decisionState: DecisionState | undefined;
    orchestrationResult: OrchestrationResult;
  }): string | null {
    if (this.isItineraryAdjustSession(params.orchestrationResult)) return null;

    const tripId = params.request.trip_id?.trim();
    if (!tripId) return null;

    const reviewMsg =
      params.request.message ??
      (typeof (params.state?.metadata as Record<string, unknown> | undefined)?.intake_user_message ===
      'string'
        ? ((params.state?.metadata as Record<string, unknown>).intake_user_message as string)
        : undefined);
    if (
      reviewMsg &&
      isBoundTripLightConsultQuery(reviewMsg, reviewMsg.toLowerCase())
    ) {
      return null;
    }

    const lightweight = (params.orchestrationResult.result as { lightweightKnowledgeQa?: boolean } | undefined)
      ?.lightweightKnowledgeQa;
    if (lightweight) return null;

    const tt = params.routingTaskType;
    if (
      tt === 'DATA_LOOKUP' ||
      tt === 'RAG_QA' ||
      tt === 'GENERIC_QA' ||
      tt === 'CUSTOMER_SUPPORT'
    ) {
      return null;
    }

    const st = params.state;
    const ds = params.decisionState;
    const hints = ds?.optimizationHints;
    const lines: string[] = [];

    lines.push('**基于当前行程会话的决策说明：**');

    const diff = st?.plan_diff;
    if (diff?.changes?.length) {
      lines.push(
        `相对上一版（v${diff.version_from ?? '?'}→v${diff.version_to ?? '?'}），本轮主要变动包括：`,
      );
      for (const ch of diff.changes.slice(0, 10)) {
        const verb = ch.type === 'ADD' ? '新增' : ch.type === 'DELETE' ? '删除' : '调整';
        lines.push(`- ${verb} ${ch.field || ch.path}${ch.reason ? ` — ${ch.reason}` : ''}`);
      }
    } else {
      lines.push(
        '- 本轮日程是在您**当前 trip 会话**内对齐景点库后的输出；若会话内尚有更早草案，可将下方卡片视作针对本条需求的可行域修订稿（可与回放/版本对比联用）。',
      );
    }

    if (hints?.strategyDirection?.trim()) {
      lines.push(`- **策略取向：** ${hints.strategyDirection.trim()}`);
    }

    const verdictNarration =
      hints?.decisionVerdictNarrationZh?.trim() ||
      formatDecisionVerdictNarrationZh(
        hints?.decisionVerdict ?? buildDecisionVerdictFromHints(hints ?? {}),
        hints,
      );
    if (verdictNarration) {
      lines.push('\n' + verdictNarration);
    }

    if (hints?.worldConstraintMaterialization?.appliedEvents) {
      const wm = hints.worldConstraintMaterialization;
      lines.push(
        `- **路政/公告约束已结构化：** ${wm.appliedEvents} 条写入世界约束（道路：${(wm.roadIds ?? []).join('、') || '—'}）。`,
      );
    }

    if (hints?.failSafeAction) {
      const tail = hints.failSafeReason?.trim()
        ? `（${hints.failSafeReason.trim()}）`
        : '';
      lines.push(
        `- **系统提示：** ${hints.failSafeAction === 'BLOCK' ? '存在硬阻断，请先处理约束后再采纳草案。' : '建议先收缩目标或补充信息后再推进。'}${tail}`,
      );
    }

    const alts = hints?.alternatives;
    if (Array.isArray(alts) && alts.length > 0) {
      lines.push(`\n**备选决策摘要（${alts.length} 条，可按效用/可行性权衡）：**`);
      for (const a of alts.slice(0, 5)) {
        const score =
          typeof a.finalScore === 'number'
            ? a.finalScore
            : typeof a.score === 'number'
              ? a.score
              : typeof a.expectedUtility === 'number'
                ? a.expectedUtility
                : undefined;
        const sc = score !== undefined ? ` 评分≈${score.toFixed(2)}` : '';
        const sum = (a.summary || '').trim() || String(a.id ?? '');
        if (sum) lines.push(`- ${sum}${sc}`);
      }
      const recId = hints?.recommendedAlternativeId;
      if (recId) {
        lines.push(`- 推荐优先核对候选：\`${recId}\`。`);
      }
    }

    return lines.join('\n');
  }

  private looksLikeOptimizationDecisionMeta(text: string): boolean {
    return /决策说明|CGUS|推荐方案|plan-philosophy|未采纳方案|综合约束优化|monteCarlo|META_BUDGET/i.test(text);
  }

  private looksLikeGuardianPersonaMeta(text: string): boolean {
    return /安全守护者 Abu|节奏调节者 Dr\.Dre|路线守护者 Neptune/.test(text);
  }

  private stripGuardianPersonaProse(text: string): string {
    return text
      .split(/\n+/)
      .filter((line) => {
        const t = line.trim();
        if (!t) return true;
        return (
          !/^安全守护者 Abu/.test(t) &&
          !/^节奏调节者 Dr\.Dre/.test(t) &&
          !/^路线守护者 Neptune/.test(t)
        );
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private stripGenericMultiDayPlanningBoilerplate(text: string): string {
    return text
      .replace(
        /^为您规划了\s*\d+\s*天的行程[，,]?\s*行程已通过安全检查[，,]?[^\n]*\n?/m,
        '',
      )
      .trim();
  }

  private sanitizeItineraryAdjustProse(text: string): string {
    let out = this.stripGuardianPersonaProse(text);
    out = this.stripGenericMultiDayPlanningBoilerplate(out);
    if (this.looksLikeOptimizationDecisionMeta(out)) return '';
    return out.trim();
  }

  private extractScheduleItemsFromTimelineDays(
    days: Array<{
      items?: Array<{
        location_ref?: { name?: string };
        name?: string;
        type?: string;
        start_window?: string;
        end_window?: string;
      }>;
    }>,
  ): ItineraryAdjustScheduleItem[] {
    const out: ItineraryAdjustScheduleItem[] = [];
    for (const day of days) {
      for (const it of day.items ?? []) {
        const name = String(it.location_ref?.name ?? (it as { name?: string }).name ?? '').trim();
        if (!name) continue;
        out.push({
          name,
          type: it.type,
          start_window: it.start_window,
          end_window: it.end_window,
        });
      }
    }
    return out;
  }

  private extractPoiNamesFromTimelineDays(
    days: Array<{
      items?: Array<{ location_ref?: { name?: string }; name?: string; type?: string }>;
    }>,
  ): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const day of days) {
      for (const it of day.items ?? []) {
        const t = String(it.type ?? 'POI').toUpperCase();
        if (t === 'DRIVE' || t === 'TRANSIT' || t === 'WALK' || t === 'REST') continue;
        const name = String(it.location_ref?.name ?? (it as { name?: string }).name ?? '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  private resolveItineraryAdjustOptimizationResult(
    orchestrationResult: OrchestrationResult,
    request: Pick<RouteAndRunRequestDto, 'message' | 'trip_id'> | undefined,
    timelineDays: Array<{
      date?: string;
      items?: Array<{
        location_ref?: { name?: string };
        name?: string;
        type?: string;
        start_window?: string;
        end_window?: string;
      }>;
    }>,
    state?: OrchestratorState | null,
  ): ItineraryAdjustOptimizationResult | undefined {
    if (!this.isItineraryAdjustSession(orchestrationResult, request)) return undefined;

    const md = (state?.metadata ??
      orchestrationResult.result?.state?.metadata ??
      {}) as Record<string, unknown>;
    const existing = md.itinerary_adjust_result as ItineraryAdjustOptimizationResult | undefined;

    const targetDate =
      this.resolveItineraryAdjustTargetDate(orchestrationResult, request, state) ??
      existing?.target_date_iso?.slice(0, 10);
    if (!targetDate) return undefined;

    const authoritativeItinerary =
      state?.itinerary ?? orchestrationResult.result?.itinerary ?? undefined;

    let poiNames: string[] = [];
    let scheduleItems: ItineraryAdjustScheduleItem[] = [];
    if (authoritativeItinerary) {
      scheduleItems = extractScheduleItemsFromItineraryDay(authoritativeItinerary, targetDate);
      poiNames = extractPoiNamesFromItineraryDay(authoritativeItinerary, targetDate);
    }

    if (!scheduleItems.length) {
      const scopedDays = timelineDays.filter((d) => String(d.date ?? '').slice(0, 10) === targetDate);
      const daySlice = scopedDays.length > 0 ? scopedDays : timelineDays;
      scheduleItems = this.extractScheduleItemsFromTimelineDays(daySlice);
      poiNames = this.extractPoiNamesFromTimelineDays(daySlice);
    }

    const anchors = md.itinerary_adjust_neighbor_anchors as NeighborAnchorContext | undefined;
    const targetDayNumber =
      anchors?.targetDayNumber ??
      (typeof md.itinerary_adjust_target_day_number === 'number'
        ? md.itinerary_adjust_target_day_number
        : undefined);

    const rebuilt = buildItineraryAdjustOptimizationResult({
      metadata: md,
      targetDateIso: targetDate,
      targetDayNumber,
      poiNames,
      scheduleItems,
    });
    return coalesceItineraryAdjustOptimizationResult(rebuilt, existing);
  }

  private buildItineraryAdjustPayloadBlocks(params: {
    orchestrationResult: OrchestrationResult;
    request: RouteAndRunRequestDto;
    timelineDays: Array<{
      date?: string;
      items?: Array<{
        location_ref?: { name?: string };
        name?: string;
        type?: string;
        start_window?: string;
        end_window?: string;
      }>;
    }>;
    state?: OrchestratorState | null;
    gateForClient?: GateResult | undefined;
  }): {
    itinerary_adjust_result?: ItineraryAdjustOptimizationResult;
    itinerary_adjust_apply_result?: Record<string, unknown>;
    actionExecution?: Record<string, unknown>;
    workbench_feasibility?: {
      violations: GateResult['violations'];
      verify_synthetic_suppressed: true;
    };
  } {
    if (!this.isItineraryAdjustSession(params.orchestrationResult, params.request)) {
      return {};
    }
    const md = (params.state?.metadata ??
      params.orchestrationResult.result?.state?.metadata ??
      {}) as Record<string, unknown>;
    const itineraryAdjustOptimization = this.resolveItineraryAdjustOptimizationResult(
      params.orchestrationResult,
      params.request,
      params.timelineDays,
      params.state,
    );
    if (itineraryAdjustOptimization && params.state?.metadata) {
      (params.state.metadata as Record<string, unknown>).itinerary_adjust_result =
        itineraryAdjustOptimization;
    } else if (itineraryAdjustOptimization) {
      md.itinerary_adjust_result = itineraryAdjustOptimization;
    }
    const applyResult = md.itinerary_adjust_apply_result as Record<string, unknown> | undefined;
    return {
      ...(itineraryAdjustOptimization
        ? { itinerary_adjust_result: itineraryAdjustOptimization }
        : {}),
      ...(applyResult ? { itinerary_adjust_apply_result: applyResult } : {}),
      actionExecution: buildItineraryAdjustActionExecutionPayload(md),
      workbench_feasibility: {
        violations: params.gateForClient?.violations ?? [],
        verify_synthetic_suppressed: true as const,
      },
    };
  }

  /** ITINERARY_ADJUST：用 NARRATE 逐日叙述 + 走廊优化摘要替代 CGUS/决策对比长文 */
  private buildItineraryAdjustUserAnswer(
    state: OrchestratorState | undefined,
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'message' | 'trip_id'>,
    optimization?: ItineraryAdjustOptimizationResult,
  ): string {
    const targetDate = this.resolveItineraryAdjustTargetDate(orchestrationResult, request, state);
    const md = orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined;
    const structured =
      optimization ??
      (md?.itinerary_adjust_result as ItineraryAdjustOptimizationResult | undefined);

    if (structured?.suppress_chat_lead) {
      const fromChat = structured.chat_answer_text_zh?.trim();
      if (fromChat) return fromChat;
      const bullets = structured.rationale_bullets_zh?.map((b) => b.trim()).filter(Boolean) ?? [];
      if (bullets.length > 0) return bullets.join('\n');
      const summary = structured.optimization_summary_zh?.trim();
      if (summary) return summary;
      const narr = state?.narration?.user_friendly_summary?.trim();
      if (narr) return narr;
      return '已根据您的要求整理行程调整草案，请查看下方时间轴确认后应用到行程。';
    }

    const autoLead = buildItineraryAdjustAutoApplyLeadMessage({
      applied:
        structured?.applied ??
        (md?.itinerary_adjust_auto_apply as { applied?: boolean } | undefined)?.applied === true,
      executionMode:
        structured?.execution_mode ??
        (md?.itinerary_adjust_execution_mode as 'AUTO' | 'ADVICE_ONLY' | undefined) ??
        'ADVICE_ONLY',
      targetDateIso: targetDate,
      dayNumber: structured?.target_day_number,
    });

    if (structured?.optimization_summary_zh?.trim()) {
      const body = structured.optimization_summary_zh.trim();
      return autoLead
        ? `${autoLead}\n\n${body}\n\n时间安排与说明请直接查看下方时间轴。`
        : `${body}\n\n时间安排与说明请直接查看下方时间轴。`;
    }

    const narr = state?.narration;
    const parts: string[] = [];

    const preformattedDays = narr?.day_by_day_text_zh?.trim();
    if (preformattedDays) {
      const cleaned = this.sanitizeItineraryAdjustProse(preformattedDays);
      if (cleaned) parts.push(cleaned);
    } else {
      let days = narr?.day_by_day_narrative;
      if (Array.isArray(days) && days.length > 0) {
        if (targetDate) {
          const scoped = days.filter((d) => String(d.date ?? '').slice(0, 10) === targetDate);
          if (scoped.length > 0) days = scoped;
        }
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

    const summary = narr?.user_friendly_summary?.trim();
    if (summary) {
      const cleanedSummary = this.sanitizeItineraryAdjustProse(summary);
      if (cleanedSummary && !parts.some((p) => p.includes(cleanedSummary.slice(0, 24)))) {
        parts.push(cleanedSummary);
      }
    }

    if (parts.length > 0) {
      const body = `${parts.join('\n\n')}\n\n时间安排与说明请直接查看下方时间轴。`;
      return autoLead ? `${autoLead}\n\n${body}` : body;
    }

    const orchestratorAnswer = orchestrationResult.answerText?.trim();
    if (orchestratorAnswer) {
      const cleaned = this.sanitizeItineraryAdjustProse(orchestratorAnswer);
      if (cleaned) return cleaned;
    }

    const itinerary = orchestrationResult.result?.itinerary;
    if (itinerary?.days?.length) {
      const scopedDays = this.filterItineraryDaysForAdjustScope(
        itinerary.days,
        orchestrationResult,
        request,
      );
      const dayLines = scopedDays
        .map((d, idx) => {
          const header =
            d.date != null && String(d.date).trim()
              ? String(d.date).trim()
              : d.day_index != null
                ? `第 ${d.day_index} 天`
                : `第 ${idx + 1} 天`;
          const names = (d.items ?? [])
            .map((it) => it.location_ref?.name || (it as { name?: string }).name)
            .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
          if (!names.length) return '';
          return `${header}\n${names.join(' → ')}`;
        })
        .filter(Boolean);
      if (dayLines.length > 0) {
        return `${dayLines.join('\n\n')}\n\n时间安排与说明请直接查看下方时间轴。`;
      }
    }

    if (autoLead) return autoLead;
    return '已根据您的描述更新行程草案，请在左侧时间轴查看具体安排。';
  }

  /** ITINERARY_ADJUST：Gate 已 ALLOW 时外显 ok，避免前端将缺失 feasibility 渲染为 UNKNOWN */
  private resolvePoiPlanningObservabilityForClient(
    orchestrationResult: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
  ): Record<string, unknown> {
    if (!this.isItineraryAdjustSession(orchestrationResult, request)) {
      return this.resolvePoiPlanningObservability(orchestrationResult);
    }
    const raw = this.resolvePoiPlanningObservability(orchestrationResult);
    const existing = (raw.poi_planning ?? {}) as { feasibility?: string };
    if (existing.feasibility === 'ok' || existing.feasibility === 'tight' || existing.feasibility === 'failed') {
      return raw;
    }
    const gate = orchestrationResult.result?.gate_result?.gate_result;
    if (gate === 'ALLOW' || gate === 'ALLOW_WITH_FALLBACK') {
      return { poi_planning: { ...existing, feasibility: 'ok' as const } };
    }
    return raw;
  }

  private isC1StrictEvidenceBundle(): boolean {
    const v = process.env.C1_STRICT_EVIDENCE_BUNDLE;
    return v === '1' || v === 'true';
  }

  /** FAST≈System1，DEEP≈System2；显式值优先（路由 LLM 或网关）。 */
  private deriveSelectedPath(routeKey: string, explicit?: string | null): string | undefined {
    const ex = explicit?.trim();
    if (ex) return ex;
    if (!routeKey) return undefined;
    if (routeKey.startsWith('SYSTEM1')) return 'FAST';
    if (routeKey.startsWith('SYSTEM2')) return 'DEEP';
    return undefined;
  }

  /** 将 Claude 执行步骤镜像到 `ui_state.steps`，与 Network / debug UI 对齐 */
  private buildUiProgressSteps(orchestrationResult: OrchestrationResult): Array<{
    step_id: string;
    step_name: string;
    step_display_zh: string;
    skill_name?: string;
    action_name?: string;
    success: boolean;
    duration_ms: number;
  }> {
    const raw = orchestrationResult.stepsExecuted || [];
    return raw.map((s) => ({
      step_id: s.stepId,
      step_name: (s.skillName || s.actionName || s.stepId) as string,
      step_display_zh: orchestrationStepDisplayZh(s.stepId),
      ...(s.skillName ? { skill_name: s.skillName } : {}),
      ...(s.actionName ? { action_name: s.actionName } : {}),
      success: s.success,
      duration_ms: s.duration,
    }));
  }

  /**
   * Merge evidence_bundle codes + optional intake HARD gaps into `explain.failure_reason_codes`
   *（去重 + 与产品一致的优先级排序；System1 路径可传入 opts.gaps，因此时 payload 未必含 orchestrationResult）。
   */
  private attachExplainFailureReasonCodes(
    response: RouteAndRunResponseDto,
    opts?: { gaps?: OrchestratorState['gaps'] },
  ): void {
    const payload = response.result?.payload as Record<string, unknown> | undefined;
    const bundle = payload?.evidence_bundle as { failure_reason_codes?: string[] } | undefined;
    const fromBundle = Array.isArray(bundle?.failure_reason_codes)
      ? (bundle!.failure_reason_codes as string[]).map(String)
      : [];

    const orchState = (payload?.orchestrationResult as { state?: OrchestratorState } | undefined)?.state;
    const gapDerived = sortFailureReasonCodes([
      ...failureReasonCodesFromHardGaps(orchState?.gaps),
      ...failureReasonCodesFromHardGaps(opts?.gaps),
    ]);

    const ex = (response.explain ?? {}) as Record<string, unknown>;
    const fromExplain = Array.isArray(ex.failure_reason_codes)
      ? (ex.failure_reason_codes as string[]).map(String)
      : [];

    const merged = sortFailureReasonCodes([...fromBundle, ...fromExplain, ...gapDerived]);
    if (merged.length === 0) return;

    response.explain = {
      ...ex,
      failure_reason_codes: merged,
      failure_reason_labels_zh: failureReasonCodeLabelsZh(merged),
    } as RouteAndRunResponseDto['explain'];
  }

  /** 附加非交易型覆盖声明到 explain.coverage_disclosure */
  private attachCoverageDisclosure(response: RouteAndRunResponseDto): void {
    const payload = response.result?.payload as Record<string, unknown> | undefined;
    const directBundle = payload?.evidence_bundle as
      | { sources?: Array<{ type?: string; label?: string }>; hard_facts?: Array<{ rule_id?: string }> }
      | undefined;
    const candidates = Array.isArray(payload?.candidates) ? payload!.candidates : [];
    const candidateBundle = (candidates[0] as { evidence_bundle?: typeof directBundle } | undefined)
      ?.evidence_bundle;
    const bundle = directBundle ?? candidateBundle ?? null;

    response.explain = {
      ...(response.explain ?? {}),
      coverage_disclosure: buildCoverageDisclosureFromRouteAndRunEvidence({ evidenceBundle: bundle }),
    } as RouteAndRunResponseDto['explain'];
  }

  private extractItineraryItemsForDependency(
    payload: Record<string, unknown> | undefined,
    orchState?: OrchestratorState | null,
  ): TripItineraryItemLike[] {
    const itinerary =
      (payload?.itinerary as { days?: Array<Record<string, unknown>> } | undefined) ??
      ((orchState as unknown as { itinerary?: { days?: Array<Record<string, unknown>> } } | undefined)
        ?.itinerary) ??
      ((Array.isArray(payload?.candidates) ? payload!.candidates[0] : null) as { itinerary?: { days?: unknown[] } } | null)
        ?.itinerary;
    const days = (itinerary as { days?: Array<Record<string, unknown>> } | undefined)?.days;
    if (!Array.isArray(days)) return [];

    const items: TripItineraryItemLike[] = [];
    for (const day of days) {
      const dayDate = String(day.date ?? day.dayDate ?? '');
      const slots = (day.items ?? day.timeSlots ?? []) as Array<Record<string, unknown>>;
      for (const item of slots) {
        const name = item.name as { zh?: string; en?: string } | string | undefined;
        items.push({
          id: String(item.id ?? item.slotId ?? `${dayDate}-${items.length}`),
          type: String(item.type ?? 'ACTIVITY'),
          startTime: (item.startTime ?? item.start) as string | Date | undefined,
          endTime: (item.endTime ?? item.end) as string | Date | undefined,
          note: item.note != null ? String(item.note) : undefined,
          metadata: item.metadata,
          dayDate: dayDate || undefined,
          placeName:
            typeof name === 'string'
              ? name
              : name?.zh ?? name?.en ?? (item.title != null ? String(item.title) : undefined),
          placeId: (item.placeId ?? item.poi_id) as string | number | undefined,
        });
      }
    }
    return items;
  }

  /** 有证据时附加级联影响分析到 explain.dependency_impact */
  private attachDependencyImpact(
    response: RouteAndRunResponseDto,
    ctx?: { request?: RouteAndRunRequestDto; orchestrationResult?: OrchestrationResult },
  ): void {
    const payload = response.result?.payload as Record<string, unknown> | undefined;
    const orchState =
      (payload?.orchestrationResult as { state?: OrchestratorState } | undefined)?.state ??
      ctx?.orchestrationResult?.result?.state;

    const prefetchedEvidence: unknown[] =
      ((orchState as any)?.research_data?.world?.physical?.prefetched_evidence as unknown[]) ??
      ((orchState as any)?.research_data?.worldModel?.physical?.prefetched_evidence as unknown[]) ??
      ((orchState as any)?.research_data?.world_build_context?.world?.physical?.prefetched_evidence as unknown[]) ??
      [];

    const directBundle = payload?.evidence_bundle as
      | { hard_facts?: Array<{ rule_id?: string; is_violated?: boolean }> }
      | undefined;
    const candidates = Array.isArray(payload?.candidates) ? payload!.candidates : [];
    const candidateBundle = (candidates[0] as { evidence_bundle?: typeof directBundle } | undefined)
      ?.evidence_bundle;
    const bundle = directBundle ?? candidateBundle;

    const impact = buildDependencyImpactFromEvidence({
      tripId: ctx?.request?.trip_id?.trim() || undefined,
      prefetchedEvidence,
      hardFacts: bundle?.hard_facts,
      itineraryItems: this.extractItineraryItemsForDependency(payload, orchState),
      locale: resolveClarificationLocale(ctx?.request?.conversation_context?.locale),
    });

    if (!impact) return;

    response.explain = {
      ...(response.explain ?? {}),
      dependency_impact: impact,
      travel_runtime_graph: buildTravelRuntimeGraphFromReplan(impact),
      cascade_ui_hints: buildReadinessCascadeUiHints(impact),
    } as unknown as RouteAndRunResponseDto['explain'];
  }

  /** `route.selected_path` + `ui_state.steps`（及缺失时的完整 ui_state） */
  private applyRouteProgressSurface(
    response: RouteAndRunResponseDto,
    orchestrationResult: OrchestrationResult,
  ): void {
    const rd = orchestrationResult.result?.routingDecision as RoutingDecision | undefined;
    const explicit = rd?.selected_path ?? (rd as any)?.selectedPath;
    response.route.selected_path = this.deriveSelectedPath(String(response.route.route), explicit);

    const steps = this.buildUiProgressSteps(orchestrationResult);
    const gateResult = orchestrationResult.result?.gate_result?.gate_result;
    const cs =
      (orchestrationResult.result?.state?.current_step as OrchestrationStep | undefined) ||
      (orchestrationResult.success ? ('DONE' as const) : ('FAILED' as const));

    if (!response.ui_state) {
      const stateStartedAt = orchestrationResult.result?.state?.metadata?.started_at;
      const elapsedTime = stateStartedAt ? Date.now() - new Date(stateStartedAt).getTime() : undefined;
      response.ui_state = {
        ...this.mapOrchestrationStepToUIState(cs as OrchestrationStep, gateResult, elapsedTime),
        ...(steps.length ? { steps } : {}),
      };
      return;
    }
    const mergedSteps = steps.length ? steps : (response.ui_state as { steps?: typeof steps }).steps;
    response.ui_state = {
      ...response.ui_state,
      ...(mergedSteps?.length ? { steps: mergedSteps } : {}),
    };
  }

  /**
   * NEED_MORE_INFO / INTAKE 澄清短路：与 `route.ui_hint` 对齐，避免 `ui_status=thinking` 导致前端盲等。
   */
  private applyNeedMoreInfoUiSurface(response: RouteAndRunResponseDto): void {
    if (response.result?.status !== 'NEED_MORE_INFO') return;

    const payload = response.result.payload as unknown as {
      clarificationQuestions?: ClarificationQuestion[];
      clarificationMessage?: string;
      clarification_render_format?: 'markdown';
      clarification_display?: { format: 'html'; body_html: string; body_markdown: string };
      clarification_meta?: {
        suppress_chat_prose?: boolean;
        card_source?: 'clarificationQuestions';
      };
      orchestrationResult?: { state?: OrchestratorState };
      relaxation_suggestions?: unknown[];
      relaxation_suggestions_context?: Record<string, unknown>;
      ui_display?: Record<string, unknown>;
    };

    const sanitized = sanitizeClarificationQuestionsForClientDisplay(
      payload.clarificationQuestions ??
        (payload.orchestrationResult?.state?.clarification_questions as ClarificationQuestion[] | undefined),
    );
    if (sanitized.length > 0) {
      payload.clarificationQuestions = sanitized;
      const st = payload.orchestrationResult?.state;
      if (st && Array.isArray(st.clarification_questions)) {
        st.clarification_questions = sanitized as typeof st.clarification_questions;
      }
    }

    const lead =
      sanitized[0]?.question ??
      humanizeFeasibilityMessageForUserZh(
        String(payload.clarificationMessage ?? response.result.answer_text ?? ''),
      );
    const leadHtml =
      sanitized[0]?.question_html ?? renderClarificationMarkdownToSafeHtml(lead);
    const structuredCard = isStructuredClarificationChoiceCard(sanitized[0]);

    if (structuredCard && sanitized[0]) {
      const chatLead = resolveClarificationChatLead(sanitized[0]);
      response.result.answer_text = chatLead;
      (response.result as { answer_html?: string }).answer_html =
        renderPlainClarificationChatLeadHtml(chatLead) || undefined;
      payload.clarificationMessage = lead;
      payload.clarification_render_format = 'markdown';
      payload.clarification_display = {
        format: 'html',
        body_html: leadHtml,
        body_markdown: lead,
      };
      payload.clarification_meta = {
        suppress_chat_prose: true,
        card_source: 'clarificationQuestions',
      };
    } else {
      response.result.answer_text = lead;
      (response.result as { answer_html?: string }).answer_html = leadHtml || undefined;
      payload.clarificationMessage = lead;
      payload.clarification_render_format = 'markdown';
      if (leadHtml) {
        payload.clarification_display = {
          format: 'html',
          body_html: leadHtml,
          body_markdown: lead,
        };
      }
    }

    response.route.ui_hint.status = UIStatus.AWAITING_CONFIRMATION;
    response.route.ui_hint.message = '需要您的确认';

    if (sanitized.length > 0) {
      const shortDetail = resolveClarificationShortStepDetail(sanitized[0]);
      const detailHtml = structuredCard
        ? renderPlainClarificationChatLeadHtml(resolveClarificationChatLead(sanitized[0]!))
        : leadHtml || undefined;
      response.ui_state = {
        ...response.ui_state,
        phase: 'INTAKE',
        ui_status: 'awaiting_confirmation',
        progress_percent: 100,
        message: '请补充行程信息以继续',
        requires_user_action: true,
        estimated_time_remaining_ms: 0,
        current_step_detail: shortDetail,
        current_step_detail_html: detailHtml || undefined,
      };
      return;
    }

    response.ui_state = {
      ...response.ui_state,
      phase: (response.ui_state?.phase ?? 'INTAKE') as OrchestrationStep,
      ui_status: 'awaiting_confirmation',
      progress_percent: 100,
      message: '需要您确认或补充信息后才能继续规划',
      requires_user_action: true,
      estimated_time_remaining_ms: 0,
      current_step_detail: (payload.orchestrationResult?.state?.metadata as {
        itinerary_slot_placement_intake_short_circuit?: boolean;
        peak_season_time_shift_intake_short_circuit?: boolean;
        froad_2wd_intake_clarification_short_circuit?: boolean;
        marathon_intake_clarification_short_circuit?: boolean;
        debate_gate_fusion?: string;
        itinerary_adjust_intake?: boolean;
      })?.itinerary_slot_placement_intake_short_circuit
        ? '请先选择顺路安排的行程日'
        : payload.orchestrationResult?.state?.metadata?.peak_season_time_shift_intake_short_circuit
        ? '极昼错峰观鲸场次需确认，请选择下一步'
        : payload.orchestrationResult?.state?.metadata?.froad_2wd_intake_clarification_short_circuit
          ? 'F 路车型与涉水合规需确认，请选择下一步'
          : payload.orchestrationResult?.state?.metadata?.marathon_intake_clarification_short_circuit
          ? '行程强度与天数需确认，请选择下一步'
          : payload.orchestrationResult?.state?.metadata?.debate_gate_fusion
          ? '行程强度与路线取舍需确认，请选择下一步'
          : payload.orchestrationResult?.state?.metadata?.itinerary_adjust_intake
            ? '正在按天气与车程约束改排已有行程，请稍候或补充具体调整说明'
            : (payload.orchestrationResult?.state?.gaps ?? []).some(
                (g: { type?: string; detail?: string }) =>
                  g.type === 'MISSING_DESTINATION' &&
                  /可执行 POI|目的地范围/.test(String(g.detail ?? '')),
              )
            ? '当前目的地范围过大或候选景点过少，请补充更具体的区域后继续'
            : '意图编译发现硬约束冲突，请选择调整方式或补充说明',
    };
  }

  private buildEvidenceBundle(params: {
    requestId: string;
    decisionLog: DecisionLogEntry[];
    state?: OrchestratorState | null;
    candidateId?: string;
    candidateItinerary?: Itinerary | null;
    emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'];
    /**
     * NEED_MORE_INFO / INTAKE 澄清或行程 CRUD 短路：尚未跑 RESEARCH·VERIFY，`hard_facts` 与叙事证据卡均为空。
     * 此时空包表示「尚无审计素材」，应为 PARTIAL，避免误判 FAILED + VERIFICATION_FAILED_UNSPECIFIED（Iron Shield 泛红）。
     */
    empty_bundle_audit_pending?: 'intake_clarification' | 'itinerary_item_crud';
  }): DecisionCandidateDto['evidence_bundle'] {
    const now = new Date().toISOString();
    const cards = assembleDecisionEvidenceCards(params.state ?? undefined);
    const hardFacts = new Map<string, { rule_id: string; is_violated?: boolean; severity?: string; ref_id?: string }>();

    // Warm-start evidence (Option B): pull prefetched evidence already attached to WorldModelContext.
    // This keeps reasoning/audit in sync: the world decided the evidence; assembler only records/derives facts.
    const prefetchedEvidence: any[] =
      ((params.state as any)?.research_data?.world?.physical?.prefetched_evidence as any[]) ??
      ((params.state as any)?.research_data?.worldModel?.physical?.prefetched_evidence as any[]) ??
      ((params.state as any)?.research_data?.world_build_context?.world?.physical?.prefetched_evidence as any[]) ??
      [];
    for (const ev of Array.isArray(prefetchedEvidence) ? prefetchedEvidence : []) {
      if (!ev || typeof ev !== 'object' || Array.isArray(ev)) continue;
      const meta = {
        rule_id: String((ev as any)?.rule_id ?? 'drive_safety_v1'),
        details: { evidence: ev },
      };
      const derived = deriveFactsFromMetadata({
        metadata: meta as any,
        reasonCodes: [],
        timestampIso: now,
      });
      for (const f of derived) {
        if (!hardFacts.has(f.rule_id)) {
          hardFacts.set(f.rule_id, {
            rule_id: f.rule_id,
            is_violated: f.is_violated,
            severity: f.severity,
            evidence: f.evidence,
          } as any);
        }
      }
    }

    // Kernel VERIFY snapshot: carry `verification.assertions_triggered` (e.g. solar_safety_v1)
    // into response evidence bundle, so UI/QA sees hard facts even before decision-log persistence.
    const verifyFacts = ((params.state as any)?.verification?.assertions_triggered ?? []) as any[];
    for (const f of Array.isArray(verifyFacts) ? verifyFacts : []) {
      if (!f || typeof f !== 'object') continue;
      const ruleId = String((f as any).rule_id ?? '').trim();
      if (!ruleId) continue;
      hardFacts.set(ruleId, {
        rule_id: ruleId,
        is_violated: Boolean((f as any).is_violated),
        severity: (f as any).severity,
        ref_id: undefined,
        evidence: (f as any).evidence,
      } as any);
    }

    // Primary: metadata.assertions_triggered (Kernel-native hard snapshot)
    let ptCancelledFromLog = false;
    let ptTransferWindowViolatedFromLog = false;
    for (const e of params.decisionLog ?? []) {
      const meta = (e as any)?.metadata;
      const snap = normalizeHardRuleSnapshot(meta);
      for (const f of snap.assertions_triggered ?? []) {
        hardFacts.set(f.rule_id, {
          rule_id: f.rule_id,
          is_violated: f.is_violated,
          severity: f.severity,
          ref_id: undefined,
        });
      }
      // Backfill: Pattern-A metadata.details.evidence → derived facts
      const derived = deriveFactsFromMetadata({
        metadata: (meta && typeof meta === 'object' ? meta : {}) as any,
        reasonCodes: [String((meta as any)?.rule_id ?? '')].filter(Boolean),
        timestampIso: (e as any)?.timestamp,
      });
      for (const f of derived) {
        if (!hardFacts.has(f.rule_id)) {
          hardFacts.set(f.rule_id, {
            rule_id: f.rule_id,
            is_violated: f.is_violated,
            severity: f.severity,
            // best-effort: carry evidence for local guard checks (PT cancellation, etc.)
            evidence: f.evidence,
          } as any);
        }
      }

      // PT cancellation: compute from raw evidence log (even if fact ref is compacted).
      const ev = (meta as any)?.details?.evidence;
      if (ev && typeof ev === 'object' && !Array.isArray(ev)) {
        const t = String((ev as any)?.type ?? '').toLowerCase();
        if (t === 'public_transit') {
          const st = String((ev as any)?.serviceStatus ?? (ev as any)?.boardingStatus ?? '').toUpperCase();
          if (st === 'CANCELLED' || st === 'CANCELED') {
            ptCancelledFromLog = true;
          }
          const required =
            (ev as any)?.transferWindowMin ?? (ev as any)?.transferWindow ?? (ev as any)?.transfer_window_min;
          const planned = (ev as any)?.plannedTransferWindowMin ?? (ev as any)?.planned_transfer_window_min;
          if (typeof required === 'number' && typeof planned === 'number' && planned < required) {
            ptTransferWindowViolatedFromLog = true;
          }
        }
      }
    }

    const hardFactsList = Array.from(hardFacts.values());
    const evidenceCardRefs = cards.map((c) => ({ kind: c.kind, rule_id: c.rule_id }));

    const transitPresent = Boolean(
      (params.candidateItinerary?.days ?? [])
        .flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []))
        .some((it: any) => String(it?.type ?? '').toUpperCase() === 'TRANSIT'),
    );
    const railPresent = Boolean(
      (params.candidateItinerary?.days ?? [])
        .flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []))
        .some((it: any) => {
          if (String(it?.type ?? '').toUpperCase() !== 'TRANSIT') return false;
          const mode = String((it as any)?.metadata?.transport_mode ?? (it as any)?.metadata?.transportMode ?? '').toUpperCase();
          return mode === 'RAIL';
        }),
    );
    const drivePresent = Boolean(
      (params.candidateItinerary?.days ?? [])
        .flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []))
        .some((it: any) => String(it?.type ?? '').toUpperCase() === 'DRIVE'),
    );
    const hasPtHardFact = hardFactsList.some((x) => String(x.rule_id) === 'public_transport_v1');
    const hasDriveSafetyFact = hardFactsList.some((x) => String(x.rule_id) === 'drive_safety_v1');
    const driveSafetyViolated = hardFactsList.some(
      (x) => String(x.rule_id) === 'drive_safety_v1' && Boolean((x as any)?.is_violated) === true,
    );
    const hasRailSafetyFact = hardFactsList.some((x) => String(x.rule_id) === 'rail_safety_v1');
    const railSafetyViolated = hardFactsList.some(
      (x) => String(x.rule_id) === 'rail_safety_v1' && Boolean((x as any)?.is_violated) === true,
    );

    const hasPrecipitationLimitFact = hardFactsList.some((x) => String(x.rule_id) === 'precipitation_limit_v1');
    const precipitationLimitViolated = hardFactsList.some(
      (x) => String(x.rule_id) === 'precipitation_limit_v1' && Boolean((x as any)?.is_violated) === true,
    );

    const hasSnowDepthLimitFact = hardFactsList.some((x) => String(x.rule_id) === 'snow_depth_limit_v1');
    const snowDepthLimitViolated = hardFactsList.some(
      (x) => String(x.rule_id) === 'snow_depth_limit_v1' && Boolean((x as any)?.is_violated) === true,
    );
    const forbiddenModes = (params.emergencyConstraints?.forbidden_modes ?? []).map((x) => String(x).toUpperCase());
    const driveForbidden = forbiddenModes.includes('DRIVE') || forbiddenModes.includes('MOTORCYCLE');
    const ptCancelled =
      ptCancelledFromLog ||
      hardFactsList.some((x) => {
        if (String(x.rule_id) !== 'public_transport_v1') return false;
        const st = String((x as any)?.evidence?.serviceStatus ?? (x as any)?.evidence?.boardingStatus ?? '').toUpperCase();
        return st === 'CANCELLED' || st === 'CANCELED';
      });
    const ptTransferWindowViolated =
      ptTransferWindowViolatedFromLog ||
      hardFactsList.some((x) => {
        if (String(x.rule_id) !== 'public_transport_v1') return false;
        const req =
          (x as any)?.evidence?.transferWindowMin ??
          (x as any)?.evidence?.transferWindow ??
          (x as any)?.evidence?.transfer_window_min;
        const planned =
          (x as any)?.evidence?.plannedTransferWindowMin ?? (x as any)?.evidence?.planned_transfer_window_min;
        return typeof req === 'number' && typeof planned === 'number' && planned < req;
      });

    // C1 strict rule-of-thumb:
    // - VERIFIED when we have at least 1 hard fact and at least 1 evidence card (human-auditable UI payload).
    // - PARTIAL when only one side exists.
    // - FAILED when neither exists.
    const hasFacts = hardFactsList.length > 0;
    const hasCards = evidenceCardRefs.length > 0;
    const hasStructuredItinerary =
      Array.isArray(params.candidateItinerary?.days) &&
      params.candidateItinerary!.days.some((d) => (d.items?.length ?? 0) > 0);
    let verification_status = hasFacts && hasCards ? 'VERIFIED' : hasFacts || hasCards ? 'PARTIAL' : 'FAILED';
    const failure_reason_codes: string[] = [];

    if (
      params.empty_bundle_audit_pending &&
      verification_status === 'FAILED' &&
      !hasFacts &&
      !hasCards
    ) {
      verification_status = 'PARTIAL';
    }

    // PT-Hard fact enforcement (C1 strict):
    // - If transit exists but we don't have PT hard fact → FAILED in strict mode, otherwise PARTIAL.
    // - If service status is CANCELLED → FAILED always (forces recompute under strict).
    if (transitPresent) {
      if (!hasPtHardFact) {
        verification_status = this.isC1StrictEvidenceBundle() ? 'FAILED' : verification_status === 'VERIFIED' ? 'PARTIAL' : verification_status;
        if (this.isC1StrictEvidenceBundle()) failure_reason_codes.push('PT_MISSING_HARD_FACT');
      }
      if (ptCancelled) {
        verification_status = 'FAILED';
        failure_reason_codes.push('PT_CANCELLED');
      }
      if (ptTransferWindowViolated) {
        verification_status = 'FAILED';
        failure_reason_codes.push('PT_TRANSFER_GAP_VIOLATION');
      }
    }

    // Weather hard-fact enforcement (Wind Lock, C1 strict):
    // - If DRIVE exists but we don't have drive_safety_v1 hard fact → FAILED in strict mode, otherwise PARTIAL.
    // - If drive_safety_v1 is violated (e.g. wind_speed > threshold) → FAILED always (forces recompute under strict).
    if (drivePresent) {
      if (!hasDriveSafetyFact) {
        verification_status = this.isC1StrictEvidenceBundle()
          ? 'FAILED'
          : verification_status === 'VERIFIED'
            ? 'PARTIAL'
            : verification_status;
      }
      if (driveSafetyViolated) {
        verification_status = 'FAILED';
        failure_reason_codes.push('DRIVE_SAFETY_VIOLATED');
      }
      if (driveForbidden) {
        verification_status = 'FAILED';
        failure_reason_codes.push('DRIVE_FORBIDDEN');
      }
    }

    // Solar safety HARD-fact enforcement (C1 strict):
    // - If violated facts exist, mark FAILED always (forces recompute under strict).
    const hasSolarSafetyFact = hardFactsList.some((x) => String(x.rule_id) === 'solar_safety_v1');
    const solarSafetyViolated = hardFactsList.some(
      (x) => String(x.rule_id) === 'solar_safety_v1' && Boolean((x as any)?.is_violated) === true,
    );
    if (hasSolarSafetyFact && solarSafetyViolated) {
      verification_status = 'FAILED';
      failure_reason_codes.push('SOLAR_SAFETY_VIOLATED');
    }

    // Precipitation + snow depth hard-fact enforcement (C1 strict):
    // - If violated facts exist, mark FAILED always (forces recompute under strict).
    // - If facts are missing, keep existing PARTIAL/VERIFIED logic (best-effort inference).
    if (hasPrecipitationLimitFact && precipitationLimitViolated) {
      verification_status = 'FAILED';
      failure_reason_codes.push('PRECIPITATION_LIMIT_VIOLATED');
    }
    if (hasSnowDepthLimitFact && snowDepthLimitViolated) {
      verification_status = 'FAILED';
      failure_reason_codes.push('SNOW_DEPTH_LIMIT_VIOLATED');
    }

    // Rail resilience mapping (C1 strict):
    // - If a transit segment is explicitly marked as RAIL, require rail_safety_v1 hard fact.
    // - If rail_safety_v1 is violated, fail (forces recompute).
    if (railPresent) {
      if (!hasRailSafetyFact) {
        verification_status = this.isC1StrictEvidenceBundle()
          ? 'FAILED'
          : verification_status === 'VERIFIED'
            ? 'PARTIAL'
            : verification_status;
      }
      if (railSafetyViolated) {
        verification_status = 'FAILED';
        failure_reason_codes.push('RAIL_SAFETY_VIOLATED');
      }
    }

    // 方案 A（开发调试）：非 Strict 且已有结构化行程、但无任何证据卡且无具体违规码时，勿标全局 FAILED，降级 PARTIAL
    if (
      !this.isC1StrictEvidenceBundle() &&
      verification_status === 'FAILED' &&
      failure_reason_codes.length === 0 &&
      hasStructuredItinerary &&
      !hasCards
    ) {
      verification_status = 'PARTIAL';
      failure_reason_codes.push(EVIDENCE_MISSING_BUT_RESULTS_PRESENT);
    }

    if (verification_status === 'FAILED' && failure_reason_codes.length === 0) {
      failure_reason_codes.push(VERIFICATION_FAILED_UNSPECIFIED);
    }

    const sortedFailureCodes = failure_reason_codes.length ? sortFailureReasonCodes(failure_reason_codes) : [];

    const snapshot_id = sha256Signature({
      request_id: params.requestId,
      candidate_id: params.candidateId ?? null,
      hard_facts: hardFactsList.map((x) => x.rule_id).sort(),
      evidence_cards: evidenceCardRefs.map((x) => `${x.kind}:${x.rule_id ?? ''}`).sort(),
    });
    const bundle_id = sha256Signature({
      snapshot_id,
      generated_at: now,
      verification_status,
    });

    const auditPendingNote =
      params.empty_bundle_audit_pending && !hasFacts && !hasCards && verification_status === 'PARTIAL';
    const auditPendingSourceLabel =
      params.empty_bundle_audit_pending === 'itinerary_item_crud'
        ? '行程单项编辑短路，未运行完整 VERIFY（非验证失败）'
        : '槽位待补全，尚未生成可审计证据链（非验证失败）';

    return {
      bundle_id,
      snapshot_id,
      sources: [
        ...(auditPendingNote
          ? [
              {
                type:
                  params.empty_bundle_audit_pending === 'itinerary_item_crud'
                    ? 'ITINERARY_ITEM_CRUD'
                    : 'INTAKE_CLARIFICATION',
                label: auditPendingSourceLabel,
              },
            ]
          : []),
        ...(hasFacts ? [{ type: 'HARD_RULE_SNAPSHOT', label: 'hard facts snapshot' }] : []),
        ...(hasCards ? [{ type: 'IRON_SHIELD', label: 'evidence cards' }] : []),
      ],
      hard_facts: hardFactsList,
      evidence_cards: evidenceCardRefs,
      confidence:
        hasFacts && hasCards
          ? 0.9
          : hasFacts || hasCards
            ? 0.6
            : hasStructuredItinerary && verification_status === 'PARTIAL'
              ? 0.45
              : 0.1,
      generated_at: now,
      verification_status,
      ...(sortedFailureCodes.length
        ? {
            failure_reason_codes: sortedFailureCodes,
            failure_reason_labels_zh: failureReasonCodeLabelsZh(sortedFailureCodes),
          }
        : {}),
    } as any;
  }

  /**
   * v2 confirm flow: re-derive evidence bundle for a given itinerary using provided prefetched evidence
   * (represents "Current Reality"), while reusing the same C1 strict enforcement logic.
   */
  deriveEvidenceBundleForConfirm(params: {
    requestId: string;
    itinerary: Itinerary;
    emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'];
    prefetchedEvidence: any[];
  }): DecisionCandidateDto['evidence_bundle'] {
    const stateLike: any = {
      research_data: {
        world: {
          physical: {
            prefetched_evidence: Array.isArray(params.prefetchedEvidence) ? params.prefetchedEvidence : [],
          },
        },
      },
    };
    return this.buildEvidenceBundle({
      requestId: params.requestId,
      decisionLog: [],
      state: stateLike,
      candidateId: 'confirm_mutation_verify',
      candidateItinerary: params.itinerary,
      emergencyConstraints: params.emergencyConstraints,
    });
  }

  /** Iron Shield: API evidence_cards + parallel ui_display.evidence_cards_ui */
  private extractPlanningPhaseIntentForDecisionMetadata(
    state: OrchestratorState | undefined,
  ): { planning_phase_intent?: PlanningPhaseIntentDto } {
    const raw = (state?.metadata as Record<string, unknown> | undefined)?.planning_phase_intent;
    if (!raw || typeof raw !== 'object') return {};
    return { planning_phase_intent: raw as PlanningPhaseIntentDto };
  }

  /** Iron Shield: API evidence_cards + parallel ui_display（含双轨行程单 / 交付 artifacts） */
  private buildIronShieldPayloadBlocks(
    state: OrchestratorState | undefined | null,
    uiEnrichment?: Pick<
      ClientUiEnrichmentInput,
      'itinerary' | 'request' | 'robustnessDashboard' | 'resultOk' | 'narration' | 'bookingPayload'
    >,
  ) {
    const st = state === null ? undefined : state;
    return {
      decision_metadata: {
        evidence_cards: assembleDecisionEvidenceCards(st),
        ...this.extractPlanningPhaseIntentForDecisionMetadata(st),
      },
      ui_display: enrichClientUiDisplay({
        existingUiDisplay: {
          evidence_cards_ui: assembleEvidenceCardUIPropsFromState(st),
        },
        state: st,
        narration: uiEnrichment?.narration ?? (st?.narration as import('../../decision/kernel/interfaces/phase-executor.interface').NarrationLike | undefined),
        ...uiEnrichment,
      }),
    };
  }

  /**
   * 前端澄清卡片依赖非空的 `payload.clarificationQuestions`；仅有 Markdown 文案时在此补齐结构化字段。
   */
  private fallbackClarificationQuestionsFromMessage(message: string, localeRaw?: string | null): ClarificationQuestion[] {
    const trimmed = message.replace(/\r/g, '').trim();
    const firstPara = trimmed.split(/\n\s*\n/)[0]?.trim() ?? trimmed;
    const stripped = firstPara
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/\n+/g, ' ')
      .trim();
    const loc = resolveClarificationLocale(localeRaw);
    const question =
      stripped.slice(0, 500) ||
      (loc === 'en' ? 'Please provide more details.' : '请补充更多信息。');
    return [
      {
        id: 'nl_fallback_clarification',
        question,
        type: 'text',
        required: true,
        hint:
          loc === 'en'
            ? 'Reply in your next message, or use structured fields if your client supports them.'
            : '请在下一轮对话中补充说明；若客户端支持结构化表单也可直接填写。',
      },
    ];
  }

  private resolveClarificationQuestionsForPayload(params: {
    orchestrationResult: OrchestrationResult;
    state?: OrchestratorState | null;
    request: RouteAndRunRequestDto;
  }): ClarificationQuestion[] {
    const raw = params.orchestrationResult.result?.clarificationQuestions;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw as ClarificationQuestion[];
    }

    const st = params.state ?? undefined;
    const fromState = st?.clarification_questions;
    if (Array.isArray(fromState) && fromState.length > 0) {
      return fromState as ClarificationQuestion[];
    }
    const gaps = st?.gaps as IntakeGap[] | undefined;
    const hardGaps = Array.isArray(gaps)
      ? gaps.filter((g) => String(g?.severity || '').toUpperCase() === 'HARD')
      : [];
    const tpr = st?.trip_plan_request as TripPlanRequest | undefined;
    if (hardGaps.length > 0 && tpr && typeof tpr === 'object') {
      const fromGaps = generateClarificationQuestions(hardGaps, tpr, {
        locale: params.request.conversation_context?.locale,
      });
      if (fromGaps.length > 0) return fromGaps;
    }

    const msg =
      params.orchestrationResult.result?.clarificationMessage ||
      params.orchestrationResult.answerText ||
      '';
    if (typeof msg === 'string' && msg.trim()) {
      return this.fallbackClarificationQuestionsFromMessage(msg, params.request.conversation_context?.locale);
    }

    const loc = resolveClarificationLocale(params.request.conversation_context?.locale);
    return [
      {
        id: 'generic_clarification_placeholder',
        question:
          loc === 'en' ? 'Please provide more details to continue planning.' : '请补充信息以便继续规划。',
        type: 'text',
        required: true,
      },
    ];
  }

  buildSimplifiedExplanation(
    decisionLog: DecisionLogEntry[],
    gateResult?: GateResult,
    itinerary?: Itinerary,
    clientOptions?: RouteAndRunRequestDto['options'],
  ): SimplifiedExplanation | undefined {
    if (!shouldExposeSimplifiedExplanationForClient(clientOptions)) {
      return undefined;
    }
    return this.generateSimplifiedExplanation(decisionLog, gateResult, itinerary);
  }

  async assembleClaudeStateMachineResponse(params: {
    request: RouteAndRunRequestDto;
    startTime: number;
    traceInfo?: { orchestration: any; timestamp: string };
    orchestrationResult: OrchestrationResult;
    policyAction?: PolicyAction;
    /** v1.0 Durable：断点续跑可观测性 */
    durableRun?: { trip_run_id?: string; checkpoint_loaded?: boolean };
    /** AgentService 路由信号：用于区分行程规划 vs 纯咨询，拼装「相对现有行程」决策文案 */
    routingTaskType?: TaskType;
  }): Promise<RouteAndRunResponseDto> {
    const { request, startTime, traceInfo, orchestrationResult, policyAction, durableRun, routingTaskType } =
      params;
    const latency = Date.now() - startTime;
    const routeRunCost = this.resolveRouteAndRunCostBundle(request, { orchestrationResult });

    const currentStep =
      orchestrationResult.result?.state?.current_step || (orchestrationResult.success ? 'DONE' : 'FAILED');
    const gateResult = orchestrationResult.result?.gate_result?.gate_result;

    const stateStartedAt = orchestrationResult.result?.state?.metadata?.started_at;
    const elapsedTime = stateStartedAt ? Date.now() - new Date(stateStartedAt).getTime() : latency;

    const uiState = this.mapOrchestrationStepToUIState(currentStep as OrchestrationStep, gateResult, elapsedTime);

    const isTimeout =
      !orchestrationResult.success &&
      (orchestrationResult.result?.errorType === ErrorType.TIMEOUT_ERROR ||
        orchestrationResult.result?.state?.current_step === 'TIMEOUT' ||
        orchestrationResult.answerText?.includes('超时') ||
        orchestrationResult.answerText?.includes('timeout') ||
        orchestrationResult.answerText?.includes('TIMEOUT'));

    const needsUserConfirmation =
      !orchestrationResult.success && !isTimeout && orchestrationResult.result?.needsUserConfirmation === true;

    const rawState = orchestrationResult.result?.state;
    const verdict = deriveExternalVerdict({
      gateResult: orchestrationResult.result?.gate_result,
      intakeClarifyShortCircuit: shouldIntakeClarifyShortCircuit(rawState),
      policyAction,
      orchestrationSuccess: orchestrationResult.success,
      needsUserConfirmation,
    });
    const finalVerdict = rawState?.metadata?.fallback_used === true ? 'ALLOW_WITH_FALLBACK' : verdict;
    const stateWithVerdictBase = rawState !== undefined ? { ...rawState, verdict: finalVerdict } : undefined;
    const gateSurfacedSm = attachGuardianPersonaSurface(
      orchestrationResult.result?.gate_result as GateResult | undefined,
    );
    const tripPlanForDebate =
      rawState?.trip_plan_request ??
      (orchestrationResult.result as { trip_plan_request?: TripPlanRequest } | undefined)?.trip_plan_request;
    const gateForOrchestrationPayload = await this.maybeApplyGuardiansDebateLlm(
      request,
      gateSurfacedSm,
      tripPlanForDebate,
      rawState,
    );
    /** 与前端 `ui_surface === consultation` 对齐：响应体不再携带可渲染的日程块（timeline / itinerary.days / poi_cards）。 */
    const consultationUi = this.isConsultationUiSurface(orchestrationResult, routingTaskType);
    const rawOrchestratorItineraryDays =
      consultationUi || !orchestrationResult.result?.itinerary?.days
        ? []
        : orchestrationResult.result.itinerary.days;
    const workbenchDisplay = await this.resolveWorkbenchDisplayContext(
      request,
      orchestrationResult,
      rawOrchestratorItineraryDays,
      stateWithVerdictBase?.metadata as Record<string, unknown> | undefined,
    );
    const displayDaysBeforeAdjustScope = workbenchDisplay.displayDays;
    let itineraryDaysForPayload = this.isItineraryAdjustSession(orchestrationResult, request)
      ? this.filterItineraryDaysForAdjustScope(
          displayDaysBeforeAdjustScope,
          orchestrationResult,
          request,
        )
      : displayDaysBeforeAdjustScope;
    if (this.isItineraryAdjustSession(orchestrationResult, request)) {
      const adjustTargetDate = this.resolveItineraryAdjustTargetDate(
        orchestrationResult,
        request,
        stateWithVerdictBase ?? undefined,
      );
      itineraryDaysForPayload = this.patchAdjustTargetDayFromAuthoritativeItinerary(
        itineraryDaysForPayload,
        stateWithVerdictBase?.itinerary ?? orchestrationResult.result?.itinerary,
        adjustTargetDate,
      );
    }

    const adjustDraftPoiNames = this.isItineraryAdjustSession(orchestrationResult, request)
      ? this.extractPoiNamesFromTimelineDays(itineraryDaysForPayload)
      : undefined;

    if (
      workbenchDisplay.alignment.drift_detected &&
      workbenchDisplay.displayItinerary?.days?.length &&
      stateWithVerdictBase
    ) {
      stateWithVerdictBase.itinerary = workbenchDisplay.displayItinerary;
      (stateWithVerdictBase.metadata as Record<string, unknown> | undefined) = {
        ...(stateWithVerdictBase.metadata as Record<string, unknown> | undefined),
        workbench_itinerary_synced_from_trip: true,
      };
    }

    let gateForWorkbench = gateForOrchestrationPayload;
    gateForWorkbench =
      (await this.resyncGateFeasibilityForWorkbench({
        gate: gateForWorkbench,
        displayItinerary: workbenchDisplay.displayItinerary,
        researchData: stateWithVerdictBase?.research_data as Record<string, unknown> | undefined,
        alignment: workbenchDisplay.alignment,
        crudApplied: this.isItineraryItemCrudApplied(orchestrationResult),
      })) ?? gateForWorkbench;

    if (
      workbenchDisplay.alignment.drift_detected ||
      this.isItineraryItemCrudApplied(orchestrationResult)
    ) {
      if (stateWithVerdictBase) {
        stateWithVerdictBase.metadata = {
          ...(stateWithVerdictBase.metadata as Record<string, unknown> | undefined),
          workbench_feasibility_resynced: true,
        };
      }
    }

    const gateForClientPayload = this.sanitizeGateForClientPayload(
      gateForWorkbench,
      orchestrationResult,
      request,
      workbenchDisplay.displayItinerary,
      adjustDraftPoiNames,
      stateWithVerdictBase?.research_data as Record<string, unknown> | undefined,
    );
    const stateWithVerdict =
      stateWithVerdictBase && gateForOrchestrationPayload
        ? {
            ...stateWithVerdictBase,
            gate_result: gateForClientPayload ?? gateForOrchestrationPayload,
          }
        : stateWithVerdictBase;

    const k3DecisionLogRaw = this.resolveCanonicalDecisionLogForK3(orchestrationResult);
    const k3DecisionLogScoped =
      this.isItineraryAdjustSession(orchestrationResult, request) && adjustDraftPoiNames?.length
        ? filterDecisionLogVerifyToDraftPois(k3DecisionLogRaw, adjustDraftPoiNames, {
            filterMetadataIssues: true,
          })
        : k3DecisionLogRaw;
    const k3DecisionLog = sanitizeDecisionLogForClientDisplay(k3DecisionLogScoped);

    const uiSurface = this.resolveUiSurfaceForPayload(orchestrationResult, consultationUi);
    const spreadUiSurfacePayload = orchestrationResult.success;
    const consultationDashboard = this.resolveConsultationDashboardForPayload(
      orchestrationResult,
      consultationUi,
      { routingTaskType, trip_id: request.trip_id },
    );
    if (
      this.isItineraryAdjustSession(orchestrationResult, request) &&
      stateWithVerdict
    ) {
      applyPacingRelaxToAdjustTargetState(stateWithVerdict as OrchestratorState);
      const adjustTargetDate = this.resolveItineraryAdjustTargetDate(
        orchestrationResult,
        request,
        stateWithVerdict as OrchestratorState,
      );
      itineraryDaysForPayload = this.patchAdjustTargetDayFromAuthoritativeItinerary(
        itineraryDaysForPayload,
        (stateWithVerdict as OrchestratorState).itinerary ??
          orchestrationResult.result?.itinerary,
        adjustTargetDate,
      );
    }

    const itineraryAdjustPayloadBlocks = this.buildItineraryAdjustPayloadBlocks({
      orchestrationResult,
      request,
      timelineDays: itineraryDaysForPayload,
      state: stateWithVerdict as OrchestratorState | undefined,
      gateForClient: gateForClientPayload,
    });
    const itineraryAdjustOptimization = itineraryAdjustPayloadBlocks.itinerary_adjust_result;
    const itineraryShellForPayload =
      orchestrationResult.result?.itinerary != null
        ? { ...orchestrationResult.result.itinerary, days: itineraryDaysForPayload }
        : consultationUi
          ? ({ request_id: request.request_id, days: [] } as Itinerary)
          : undefined;

    const suppressIronShieldUi = this.shouldSuppressIronShieldUi(
      orchestrationResult,
      stateWithVerdict as OrchestratorState | undefined,
      request,
    );
    const suppressDecisionCockpit = this.shouldSuppressDecisionCockpitUi(orchestrationResult, request);
    const suppressAdjustTechnicalUi =
      this.isItineraryAdjustSession(orchestrationResult, request);

    const evidenceBundle = suppressIronShieldUi
      ? undefined
      : this.buildEvidenceBundle({
          requestId: request.request_id,
          decisionLog: k3DecisionLog ?? [],
          state: stateWithVerdict as any,
          candidateItinerary: orchestrationResult.result?.itinerary ?? null,
          emergencyConstraints: request.emergency_constraints,
          empty_bundle_audit_pending: this.resolveEmptyBundleAuditPendingReason(
            orchestrationResult,
            needsUserConfirmation,
          ),
        });

    const crudFailed =
      this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult) &&
      !this.isItineraryItemCrudApplied(orchestrationResult);
    const adjustApplyFailed =
      this.isItineraryAdjustDraftApplyIntake(orchestrationResult) &&
      !this.isItineraryAdjustDraftApplySucceeded(orchestrationResult);
    const actionFailed = crudFailed || adjustApplyFailed;

    const explainUnifiedBundle = this.composeExplainUnifiedForClientPayload({
      requestId: request.request_id,
      orchestrationDecisionLog: k3DecisionLog,
      decisionState: orchestrationResult.result?.decisionState,
      orchestratorState: stateWithVerdict as OrchestratorState | undefined,
    });
    const clientOrchestratorStateRaw =
      explainUnifiedBundle.orchestratorStateForClient ??
      (stateWithVerdict as OrchestratorState | undefined);
    const clientOrchestratorState = stripGateViolationsFromOrchestratorStateForClient(
      clientOrchestratorStateRaw,
    );
    const narrativeDriftObs = this.resolveNarrativeDriftObservability(
      request,
      orchestrationResult,
      explainUnifiedBundle.unified,
    );
    const decisionCockpit = suppressDecisionCockpit
      ? undefined
      : explainUnifiedBundle.unified
        ? projectDecisionCockpitFromEnvelope({
            envelope: explainUnifiedBundle.unified,
            narrativeDrift: narrativeDriftObs.narrative_drift,
          })
        : undefined;

    const flawedDraftV1 = buildFlawedDraftDescriptorV1({
      orchestrationResult,
      gateResult: gateForOrchestrationPayload ?? orchestrationResult.result?.gate_result,
      decisionState: orchestrationResult.result?.decisionState,
      state: stateWithVerdict as OrchestratorState | undefined,
    });

    const agentRunTraceForTrusted = this.resolveAgentRunTraceObservability(
      request,
      orchestrationResult,
    ).agent_run_trace_v1;
    // resultStatus computed below — preliminary for trusted delivery
    const preliminaryStatus = isTimeout
      ? 'TIMEOUT'
      : needsUserConfirmation
        ? 'NEED_MORE_INFO'
        : actionFailed
          ? 'FAILED'
          : orchestrationResult.success
            ? 'OK'
            : 'FAILED';
    const gateForSoft =
      gateForOrchestrationPayload ?? orchestrationResult.result?.gate_result ?? undefined;
    const hasSoftWarnings =
      flawedDraftV1?.is_flawed !== true &&
      (gateForSoft?.gate_result === 'ADJUST_REQUIRED' ||
        (Array.isArray(gateForSoft?.violations) &&
          gateForSoft.violations.some(
            (v: { severity?: string }) => String(v.severity ?? '').toUpperCase() === 'SOFT',
          )));

    const trustedDeliveryV1 = projectTrustedDeliveryV1({
      currentStep: String(
        orchestrationResult.result?.state?.current_step ??
          (orchestrationResult.success ? 'DONE' : 'FAILED'),
      ),
      resultStatus: preliminaryStatus,
      agentRunTrace: agentRunTraceForTrusted,
      flawedDraft: flawedDraftV1,
      hasSoftWarnings,
      clarificationCount: Array.isArray(
        (stateWithVerdict as OrchestratorState | undefined)?.clarification_questions,
      )
        ? ((stateWithVerdict as OrchestratorState).clarification_questions?.length ?? 0)
        : 0,
    });

    const resultStatus = isTimeout
      ? 'TIMEOUT'
      : needsUserConfirmation
        ? 'NEED_MORE_INFO'
        : actionFailed
          ? 'FAILED'
          : orchestrationResult.success
            ? 'OK'
            : 'FAILED';

    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 0.8,
        reasons: [RouterReason.LLM_DECISION],
        required_capabilities: ['planning'],
        consent_required: false,
        budget: {
          max_seconds: request.options?.max_seconds || 60,
          max_steps: request.options?.max_steps || 8,
          max_browser_steps: request.options?.max_browser_steps || 0,
        },
        ui_hint: {
          mode: 'slow',
          status: isTimeout
            ? UIStatus.FAILED
            : needsUserConfirmation
              ? UIStatus.AWAITING_CONFIRMATION
              : actionFailed
                ? UIStatus.FAILED
                : orchestrationResult.success
                  ? UIStatus.DONE
                  : UIStatus.FAILED,
          message: isTimeout
            ? '请求超时，请缩小范围或稍后重试。'
            : needsUserConfirmation
              ? '需要您的确认'
              : actionFailed
                ? orchestrationResult.answerText || '未能更新行程'
                : orchestrationResult.success
                  ? this.resolveSuccessUiHintMessage(orchestrationResult, consultationUi)
                  : '处理失败',
        },
      },
      ui_state: uiState,
      result: {
        status: resultStatus as any,
        answer_text: isTimeout
          ? '请求超时，请缩小范围或稍后重试。'
          : needsUserConfirmation
            ? orchestrationResult.result?.clarificationMessage || orchestrationResult.answerText
            : orchestrationResult.answerText,
        payload: {
          ...(spreadUiSurfacePayload
            ? {
                ui_surface: uiSurface,
                ...(this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)
                  ? { itinerary_item_crud: true as const }
                  : {}),
                ...(this.isItineraryAdjustSession(orchestrationResult, request)
                  ? { itinerary_adjust_intake: true as const }
                  : {}),
                ...(suppressIronShieldUi ? { iron_shield_ui_suppressed: true as const } : {}),
                ...(suppressDecisionCockpit ? { decision_cockpit_ui_suppressed: true as const } : {}),
                ...(uiSurface === 'consultation'
                  ? { consultation_itinerary_payload_suppressed: true as const }
                  : {}),
                ...(orchestrationResult.success &&
                (workbenchDisplay.alignment.drift_detected
                  ? { workbench_display: workbenchDisplay.alignment }
                  : request.trip_id?.trim()
                    ? { workbench_display: workbenchDisplay.alignment }
                    : {})),
              }
            : {}),
          ...itineraryAdjustPayloadBlocks,
          timeline: itineraryDaysForPayload,
          dropped_items: [],
          candidates: suppressAdjustTechnicalUi
            ? []
            : this.buildDecisionCandidates(orchestrationResult.result?.decisionState, {
                requestId: request.request_id,
                decisionLog: k3DecisionLog ?? [],
                state: stateWithVerdict as any,
                emergencyConstraints: request.emergency_constraints,
              }),
          alternatives: suppressAdjustTechnicalUi
            ? []
            : this.buildDecisionCandidates(orchestrationResult.result?.decisionState, {
                requestId: request.request_id,
                decisionLog: k3DecisionLog ?? [],
                state: stateWithVerdict as any,
                emergencyConstraints: request.emergency_constraints,
              }),
          evidence: stateWithVerdict?.decision_log || [],
          robustness:
            consultationUi
              ? null
              : orchestrationResult.result?.itinerary?.metadata?.robustness_score || null,
          ...(evidenceBundle ? { evidence_bundle: evidenceBundle } : {}),
          orchestrationResult:
            orchestrationResult.result && clientOrchestratorState
              ? {
                  state: clientOrchestratorState,
                  itinerary: itineraryShellForPayload ?? orchestrationResult.result.itinerary,
                  gate_result:
                    gateForClientPayload ?? gateForOrchestrationPayload ?? orchestrationResult.result.gate_result,
                  decision_log: k3DecisionLog,
                }
              : undefined,
          travelOntologyState: this.resolveTravelOntologyForPayload(orchestrationResult.result),
          schema_org_discovery: this.resolveSchemaOrgDiscoveryForPayload(orchestrationResult.result),
          jepa: this.jepaProjector.buildJePaPayload(orchestrationResult.result?.decisionState, stateWithVerdict),
          fallbackPlan: orchestrationResult.result?.state?.metadata?.fallback_plan,
          fallbackExplain: orchestrationResult.result?.state?.metadata?.fallback_explain,
          fallbackPlans: orchestrationResult.result?.state?.metadata?.fallback_plans,
          fallbackSelectedStrategy: orchestrationResult.result?.state?.metadata?.fallback_selected_strategy,
          fallbackTemplateVersion: orchestrationResult.result?.state?.metadata?.fallback_template_version,
          fallbackPacingMode: orchestrationResult.result?.state?.metadata?.fallback_pacing_mode,
          poiTrace: orchestrationResult.result?.state?.metadata?.poi_trace,
          gap_behavior_observation: (orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined)
            ?.gap_behavior_observation,
          process_fairness:
            (orchestrationResult.result as Record<string, unknown> | undefined)?.process_fairness ??
            (orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined)
              ?.process_fairness,
          decision_profiling:
            (orchestrationResult.result as Record<string, unknown> | undefined)?.decision_profiling ??
            (orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined)
              ?.decision_profiling,
          ...(suppressAdjustTechnicalUi
            ? {}
            : {
                safety_surface: buildSafetySurfacePayload({
                  research_data: stateWithVerdict?.research_data as Record<string, unknown> | undefined,
                  itinerary:
                    workbenchDisplay.displayItinerary ??
                    (orchestrationResult.result?.itinerary as Itinerary | undefined) ??
                    undefined,
                  stepsExecuted: orchestrationResult.stepsExecuted,
                  gate_result: gateForClientPayload ?? gateForOrchestrationPayload,
                }),
              }),
          ...(suppressIronShieldUi
            ? {}
            : this.buildIronShieldPayloadBlocks(clientOrchestratorState, {
                itinerary: itineraryShellForPayload,
                request,
                resultOk: resultStatus === 'OK',
                bookingPayload: this.resolveBookingPayloadForUiEnrichment(orchestrationResult),
              })),
          ...(isTimeout ? { errorType: ErrorType.TIMEOUT_ERROR } : {}),
          ...(needsUserConfirmation
            ? {
                needsUserConfirmation: true,
                clarificationMessage: orchestrationResult.result?.clarificationMessage,
                clarificationQuestions: this.resolveClarificationQuestionsForPayload({
                  orchestrationResult,
                  state: stateWithVerdict as OrchestratorState | undefined,
                  request,
                }),
                missingServices: orchestrationResult.result?.missingServices || [],
                solutions: orchestrationResult.result?.solutions || [],
                errorType: orchestrationResult.result?.errorType,
              }
            : {}),
          ...this.resolveHotelAccommodationPayloadBlocks(orchestrationResult),
          ...(consultationDashboard ? { consultation_dashboard: consultationDashboard } : {}),
          ...(flawedDraftV1 ? { flawed_draft_v1: flawedDraftV1 } : {}),
          trusted_delivery_v1: trustedDeliveryV1,
        } as any,
      },
      explain: {
        decision_log: k3DecisionLog,
        ...(suppressAdjustTechnicalUi
          ? {}
          : {
              simplified_explanation: this.buildSimplifiedExplanation(
                k3DecisionLog,
                gateForOrchestrationPayload ?? orchestrationResult.result?.gate_result,
                orchestrationResult.result?.itinerary,
                request.options,
              ),
              ai_capability_display: this.generateAICapabilityDisplay(
                orchestrationResult,
                gateForOrchestrationPayload ?? orchestrationResult.result?.gate_result,
                clientOrchestratorState,
              ),
            }),
        ...(gateForOrchestrationPayload?.guardian_results && !suppressAdjustTechnicalUi
          ? { guardian_personas: gateForOrchestrationPayload.guardian_results }
          : {}),
        optimization: this.buildOptimizationExplain(
          orchestrationResult.result?.decisionState,
          orchestrationResult,
          request,
        ),
        ...(suppressAdjustTechnicalUi
          ? {}
          : {
              kernel_explainability: this.buildKernelExplainability(
                orchestrationResult.result?.decisionState,
              ),
              world_model_guards: this.buildWorldModelGuardsExplain(
                orchestrationResult.result?.decisionState,
                clientOrchestratorState,
              ),
            }),
        unified: suppressAdjustTechnicalUi ? undefined : explainUnifiedBundle.unified,
        decision_cockpit: suppressDecisionCockpit ? undefined : decisionCockpit,
        ...(flawedDraftV1 ? { flawed_draft_v1: flawedDraftV1 } : {}),
      } as any,
      observability: {
        latency_ms: latency,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        thinking_mode_resolved: 'deep',
        tool_calls: orchestrationResult.stepsExecuted?.length || 0,
        browser_steps: 0,
        tokens_est: routeRunCost.tokens_est,
        cost_est_usd: routeRunCost.cost_est_usd,
        fallback_used: orchestrationResult.result?.state?.metadata?.fallback_used === true,
        fallback_template_version: orchestrationResult.result?.state?.metadata?.fallback_template_version,
        fallback_data_source: orchestrationResult.result?.state?.metadata?.fallback_data_source,
        fallback_source_confidence: orchestrationResult.result?.state?.metadata?.fallback_source_confidence,
        fallback_pacing_mode: orchestrationResult.result?.state?.metadata?.fallback_pacing_mode,
        orchestration_request_id: request.request_id,
        current_step: orchestrationResult.result?.state?.current_step,
        trace: traceInfo,
        ...this.computeP4ObservabilityMetrics(orchestrationResult),
        ...this.resolveHarnessObservability(request, orchestrationResult),
        ...this.resolveAgentRunTraceObservability(request, orchestrationResult),
        ...this.resolveExecutionPolicyGatewayObservability(request),
        ...this.resolveShadowGraderObservability(request),
        ...this.resolveSubagentPermissionSandboxObservability(request),
        ...this.resolveEpisodicSummarizerObservability(request),
        ...this.resolveQualitySampleObservability(request),
        ...this.resolveLlmRoutingObservability(request),
        cost_governance_v1: routeRunCost.cost_governance_v1,
        ...this.resolveAgenticLoopCheckpointObservability(orchestrationResult),
        ...this.resolveAgenticTaskRollbackObservability(request, orchestrationResult),
        ...this.resolvePoiPlanningObservabilityForClient(orchestrationResult, request),
        ...this.resolveGapBehaviorObservationObservability(orchestrationResult),
        ...this.resolveReplanLineageObservability(request, orchestrationResult),
        ...this.resolveOrchestrationFailureObservability(orchestrationResult),
        ...this.resolveNarrativeIntegrityObservability(request, orchestrationResult),
        ...narrativeDriftObs,
        ...(durableRun?.trip_run_id ? { durable_trip_run_id: durableRun.trip_run_id } : {}),
        ...(durableRun?.checkpoint_loaded ? { durable_checkpoint_loaded: true } : {}),
        dso_version: this.resolveClientDsoVersionForResponse(orchestrationResult),
        ...(this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)
          ? {
              itinerary_item_crud: true as const,
              skills_hit: extractSkillsHitFromDecisionLog(
                orchestrationResult.decisionLog ??
                  orchestrationResult.result?.decision_log ??
                  orchestrationResult.result?.state?.decision_log,
              ),
            }
          : {}),
      } as any,
    };

    this.applyRouteProgressSurface(response, orchestrationResult);

    if (needsUserConfirmation && resultStatus === 'NEED_MORE_INFO') {
      this.applyNeedMoreInfoUiSurface(response);
    }

    // Trade-off negotiation (Layer 3): when physical healing implies user-visible TCO spikes.
    const negotiation = await this.tradeoffEngine.buildNegotiation({
      request,
      decisionLog: k3DecisionLog,
      finalItinerary: orchestrationResult.result?.itinerary ?? (orchestrationResult.result as any)?.state?.itinerary,
      state: stateWithVerdict,
    });
    if (negotiation) {
      (response.result.payload as any).negotiation_payload = negotiation;
      response.result.status = 'NEED_CONFIRMATION';
      response.route.ui_hint.status = UIStatus.AWAITING_CONFIRMATION;
      response.route.ui_hint.message = '需要您的确认';
      response.ui_state = {
        ...(response.ui_state as any),
        ui_status: 'awaiting_confirmation',
        requires_user_action: true,
        message: negotiation.impact ?? '需要您在成本/时间之间做权衡选择。',
      } as any;

      // Persist negotiation snapshot for confirm flow (optimistic lock).
      const sessionId = String((negotiation as any)?.negotiation_session_id ?? '');
      const expectedHash = String((negotiation as any)?.expected_negotiation_hash ?? '');
      const itinerary = orchestrationResult.result?.itinerary ?? (orchestrationResult.result as any)?.state?.itinerary;
      if (this.negotiationSessions && sessionId && expectedHash && itinerary) {
        this.negotiationSessions.set({
          session_id: sessionId,
          expected_negotiation_hash: expectedHash,
          negotiation_payload: negotiation,
          itinerary,
          request,
        });
      }

      // Evidence lineage audit: record why we re-measured / ignored neighbor cache.
      const lineage = (negotiation as any)?.evidence_lineage?.travel_time_v1;
      if (lineage && Array.isArray((response.explain as any)?.decision_log)) {
        (response.explain as any).decision_log.push({
          request_id: request.request_id,
          step: 'NEGOTIATE',
          actor: 'TradeoffEngine',
          inputs_summary: 'travel_time_v1 reliability decision',
          outputs_summary: 'recorded travel time lineage / invalidation',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            rule_id: 'travel_time_v1',
            details: { evidence: { type: 'travel_time_lineage', ...lineage } },
          },
        });
      }
    }

    // POI：按 itinerary 查 Place 表写入 `poi_cards` + timeline 展示名；`poi_cards_by_day` 不下发以免聊天气泡内嵌按日卡片条。
    const rawItineraryForPoi =
      workbenchDisplay.displayItinerary ??
      orchestrationResult.result?.itinerary ??
      (orchestrationResult.result as any)?.state?.itinerary;
    const itineraryForPoi = this.scopeItineraryForPoiHydration(
      rawItineraryForPoi,
      orchestrationResult,
      request,
    );
    if (
      this.poiHydrator &&
      orchestrationResult.success &&
      resultStatus === 'OK' &&
      itineraryForPoi?.days?.length &&
      !consultationUi &&
      !isTimeout &&
      !needsUserConfirmation
    ) {
      try {
        const poiPayload = await this.poiHydrator.hydrateFromItinerary(itineraryForPoi);
        if (poiPayload.poi_cards.length > 0) {
          const adjustScopedCards = this.isItineraryAdjustSession(orchestrationResult, request)
            ? this.filterPoiCardsForAdjustScope(poiPayload.poi_cards, orchestrationResult, request)
            : poiPayload.poi_cards;
          Object.assign(response.result.payload as any, {
            ...poiPayload,
            poi_cards: adjustScopedCards,
          });
          delete (response.result.payload as any).poi_cards_by_day;
          applyRouteRunPoiDisplayNamesToTimeline(
            (response.result.payload as any).timeline,
            adjustScopedCards,
          );
          /** 咨询/泛问/行程复盘类任务保留 LLM 正文（概览与风险提示），不因 POI 卡片压制长文或覆盖 answer_text */
          const proseFriendlyTaskTypes: readonly TaskType[] = ['DATA_LOOKUP', 'RAG_QA', 'GENERIC_QA'];
          const reviewMsg = String(request.message ?? '').trim();
          const isTripReviewQuery =
            reviewMsg.length > 0 &&
            isBoundTripLightConsultQuery(reviewMsg, reviewMsg.toLowerCase());
          const keepAnswerProse =
            isTripReviewQuery ||
            (routingTaskType !== undefined && proseFriendlyTaskTypes.includes(routingTaskType));
          const adjustTargetDate = this.isItineraryAdjustSession(orchestrationResult, request)
            ? this.resolveItineraryAdjustTargetDate(orchestrationResult, request)
            : undefined;
          (response.result.payload as any).poi_cards_meta = {
            suppress_answer_prose: !keepAnswerProse,
            ...(adjustTargetDate ? { itinerary_adjust_poi_scope_date: adjustTargetDate } : {}),
          };
          if (!keepAnswerProse) {
            if (this.isItineraryAdjustSession(orchestrationResult, request)) {
              response.result.answer_text = this.buildItineraryAdjustUserAnswer(
                stateWithVerdict as OrchestratorState | undefined,
                orchestrationResult,
                request,
                itineraryAdjustOptimization,
              );
            } else {
              const feasibilityLead = this.buildFeasibilityLeadBeforePoiCards({
                request,
                decisionState: orchestrationResult.result?.decisionState as DecisionState | undefined,
                gateResult: orchestrationResult.result?.gate_result,
              });
              const tripPlanningContrast = this.buildTripPlanningSessionDecisionContrast({
                request,
                routingTaskType,
                state: stateWithVerdict as OrchestratorState | undefined,
                decisionState: orchestrationResult.result?.decisionState as DecisionState | undefined,
                orchestrationResult,
              });
              const cardHint =
                '行程已生成并与景点库对齐；时间安排与说明请直接查看下方时间轴（此处不再重复罗列）。';
              const recommendationBlock = this.buildRecommendationReasoningProse(
                stateWithVerdict as OrchestratorState | undefined,
                itineraryForPoi,
                orchestrationResult,
              );
              const proseParts = [
                recommendationBlock,
                feasibilityLead,
                tripPlanningContrast,
                cardHint,
              ].filter((p): p is string => typeof p === 'string' && p.length > 0);
              response.result.answer_text = proseParts.join('\n\n');
            }
          }
        }
      } catch (e: any) {
        this.logger.warn(`[RouteAndRunAssembler] POI hydration skipped: ${e?.message ?? e}`);
      }
    }

    if (
      orchestrationResult.success &&
      resultStatus === 'OK' &&
      itineraryForPoi?.days?.length &&
      !consultationUi &&
      !isTimeout &&
      !needsUserConfirmation
    ) {
      const proseFriendlyTaskTypes: readonly TaskType[] = ['DATA_LOOKUP', 'RAG_QA', 'GENERIC_QA'];
      const reviewMsgOuter = String(request.message ?? '').trim();
      const isTripReviewQueryOuter =
        reviewMsgOuter.length > 0 &&
        isBoundTripLightConsultQuery(reviewMsgOuter, reviewMsgOuter.toLowerCase());
      const keepAnswerProse =
        isTripReviewQueryOuter ||
        (routingTaskType !== undefined && proseFriendlyTaskTypes.includes(routingTaskType));
      if (!keepAnswerProse && !this.isItineraryAdjustSession(orchestrationResult, request)) {
        const recBlock = this.buildRecommendationReasoningProse(
          stateWithVerdict as OrchestratorState | undefined,
          itineraryForPoi,
          orchestrationResult,
        );
        if (recBlock && !String(response.result.answer_text ?? '').includes('【推荐理由】')) {
          const cur = response.result.answer_text ?? '';
          response.result.answer_text = cur ? `${recBlock}\n\n${cur}` : recBlock;
        }
      }
    }

    // C1 strict: final output must carry evidence bundle; candidates must carry evidence bundle.
    if (this.isC1StrictEvidenceBundle()) {
      const payload: any = response.result?.payload ?? {};
      if (payload.iron_shield_ui_suppressed !== true) {
        if (!payload.evidence_bundle) {
          throw new Error('C1_STRICT_EVIDENCE_BUNDLE: missing payload.evidence_bundle');
        }
        if (String(payload.evidence_bundle?.verification_status ?? '') === 'FAILED') {
          throw new Error('C1_STRICT_EVIDENCE_BUNDLE: payload evidence_bundle verification_status=FAILED');
        }
        const candidates: any[] = Array.isArray(payload.alternatives)
          ? payload.alternatives
          : Array.isArray(payload.candidates)
            ? payload.candidates
            : [];
        if (candidates.some((c) => !c?.evidence_bundle)) {
          throw new Error('C1_STRICT_EVIDENCE_BUNDLE: candidate missing evidence_bundle');
        }
        if (candidates.some((c) => String(c?.evidence_bundle?.verification_status ?? '') === 'FAILED')) {
          throw new Error('C1_STRICT_EVIDENCE_BUNDLE: candidate evidence_bundle verification_status=FAILED');
        }
      }
    }

    const metrics = extractMetricsFromResponse(response);
    if (metrics.error_type) MetricsRecorder.recordClarification(metrics.error_type);
    if (metrics.decision_log_completeness !== undefined) {
      MetricsRecorder.recordDecisionLogCompleteness(metrics.decision_log_completeness);
    }

    this.attachExplainFailureReasonCodes(response);
    this.attachCoverageDisclosure(response);
    this.attachDependencyImpact(response, { request, orchestrationResult });
    applyConsultationItineraryPayloadHygiene(response);
    await this.maybeAttachPersistedTripPoiCardsForConsultation(request, response);

    if (
      suppressAdjustTechnicalUi &&
      orchestrationResult.success &&
      resultStatus === 'OK' &&
      !consultationUi &&
      !isTimeout &&
      !needsUserConfirmation
    ) {
      response.result.answer_text = this.buildItineraryAdjustUserAnswer(
        stateWithVerdict as OrchestratorState | undefined,
        orchestrationResult,
        request,
        itineraryAdjustOptimization,
      );
    }

    assertDoneResponseCompleteness(response, {
      stepsExecuted: orchestrationResult.stepsExecuted,
    });

    this.attachClientReadModels(response, {
      orchestrationResult,
      stateWithVerdict: stateWithVerdict as OrchestratorState | undefined,
      resultStatus,
      needsUserConfirmation,
    });

    return response;
  }

  /** P0-1 comparison + P0-2 relaxation 读模型（Plan Studio 矩阵 / RelaxationSuggestionBar） */
  private attachClientReadModels(
    response: RouteAndRunResponseDto,
    ctx: {
      orchestrationResult: OrchestrationResult;
      stateWithVerdict?: OrchestratorState | null;
      resultStatus: string;
      needsUserConfirmation: boolean;
    },
  ): void {
    const payload = response.result?.payload as Record<string, unknown> | undefined;
    if (!payload) return;

    const st = ctx.stateWithVerdict ?? (ctx.orchestrationResult.result?.state as OrchestratorState | undefined);
    const decisionState = ctx.orchestrationResult.result?.decisionState;
    const gateResult =
      st?.gate_result ?? ctx.orchestrationResult.result?.gate_result ?? undefined;

    if (
      ctx.resultStatus === 'OK' ||
      ctx.resultStatus === 'NEED_CONFIRMATION' ||
      (ctx.needsUserConfirmation && ctx.resultStatus === 'NEED_MORE_INFO')
    ) {
      const uiDisplay = payload.ui_display as { dual_track_itinerary?: import('../utils/dual-track-itinerary-ui.util').DualTrackItineraryUi } | undefined;
      attachOptionComparisonToResponse({
        payload,
        explain: response.explain as Record<string, unknown>,
        projectInput: {
          orchestratorState: st,
          decisionState,
          primaryItinerary:
            ctx.orchestrationResult.result?.itinerary ??
            (st?.itinerary as import('../interfaces/trip-plan.interface').Itinerary | undefined),
          dualTrackUi: uiDisplay?.dual_track_itinerary,
          candidates: payload.candidates as Parameters<
            typeof attachOptionComparisonToResponse
          >[0]['projectInput']['candidates'],
        },
      });
    }

    attachRelaxationSuggestionsToPayload(payload, {
      clarificationQuestions:
        (payload.clarificationQuestions as import('../interfaces/clarification.interface').ClarificationQuestion[] | undefined) ??
        st?.clarification_questions,
      orchestratorState: st,
      gateResult,
      decisionViolations:
        (gateResult?.violations as Array<{ type?: string; detail?: string; severity?: string }> | undefined) ??
        (decisionState?.constraints?.violations as Array<{ type?: string; detail?: string; severity?: string }> | undefined),
    });
  }

  private buildDecisionCandidates(
    decisionState: any | undefined,
    ctx?: {
      requestId: string;
      decisionLog: DecisionLogEntry[];
      state?: OrchestratorState | null;
      emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'];
    },
  ): DecisionCandidateDto[] {
    const hints = decisionState?.optimizationHints;
    const alts: any[] = Array.isArray(hints?.alternatives) ? hints.alternatives : [];
    const dim = hints?.dimensionBreakdown ?? {};
    const clamp01 = (x: unknown): number | undefined => {
      if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
      return Math.max(0, Math.min(1, x));
    };
    const safety = clamp01(1 - Math.max(Number(dim.weather ?? 0), Number(dim.fatigue ?? 0)));
    const experience = clamp01(1 - Number(dim.crowdAvoidance ?? 0));
    const costEfficiency = clamp01(1 - Number(dim.budget ?? 0));

    const forbiddenModes = (ctx?.emergencyConstraints?.forbidden_modes ?? []).map((x) => String(x).toUpperCase());
    const isForbiddenItinerary = (it: any): boolean => {
      if (!it) return false;
      const items =
        (it?.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : [])) ?? [];
      if (forbiddenModes.includes('DRIVE') || forbiddenModes.includes('MOTORCYCLE')) {
        if (items.some((x: any) => String(x?.type ?? '').toUpperCase() === 'DRIVE')) return true;
      }
      if (forbiddenModes.includes('TRANSIT')) {
        if (items.some((x: any) => String(x?.type ?? '').toUpperCase() === 'TRANSIT')) return true;
      }
      return false;
    };

    return alts
      .map((a) => ({
        candidate_id: String(a?.id ?? ''),
        itinerary: a?.itinerary ?? undefined,
        score_breakdown: {
          total_utility: clamp01(a?.expectedUtility ?? a?.score),
          dimensions: {
            safety,
            experience,
            cost_efficiency: costEfficiency,
          },
        },
        risk_profile: {
          probability_of_drift: clamp01(
            a?.feasibilityProbability !== undefined ? 1 - Number(a.feasibilityProbability) : undefined,
          ),
          critical_constraints: Array.isArray(a?.violations)
            ? a.violations
                .filter((v: any) => v?.severity === 'SOFT')
                .map((v: any) => String(v?.type ?? ''))
                .filter(Boolean)
            : [],
        },
        explanation: typeof a?.summary === 'string' ? a.summary : undefined,
        evidence_bundle:
          ctx && ctx.requestId
            ? this.buildEvidenceBundle({
                requestId: ctx.requestId,
                decisionLog: ctx.decisionLog ?? [],
                state: ctx.state ?? undefined,
                candidateId: String(a?.id ?? ''),
                candidateItinerary: (a?.itinerary as any) ?? null,
                emergencyConstraints: ctx.emergencyConstraints,
              })
            : undefined,
      }))
      .filter((c) => c.candidate_id)
      // Candidate filter (engine-level): drop forbidden-mode candidates from output surface.
      .filter((c) => (this.isC1StrictEvidenceBundle() ? !isForbiddenItinerary(c.itinerary) : true))
      // C1 strict: do not emit candidates without evidence bundle.
      .filter((c) => (this.isC1StrictEvidenceBundle() ? Boolean((c as any).evidence_bundle) : true));
  }

  async assembleClaudeDynamicResponse(params: {
    request: RouteAndRunRequestDto;
    startTime: number;
    traceInfo?: { orchestration: any; timestamp: string };
    orchestrationResult: OrchestrationResult;
    system1Result?: { success: boolean; answerText?: string; result?: any };
    /** 与 signalsFromRequest.taskType 对齐；用于成功态 ui_hint / payload.ui_surface */
    routingTaskType?: TaskType;
  }): Promise<RouteAndRunResponseDto> {
    const { request, startTime, traceInfo, orchestrationResult, system1Result, routingTaskType } =
      params;

    // System 1：由调用方传入 System1Executor 结果（保持现有行为）
    const route = orchestrationResult.result?.routingDecision?.route || RouteType.SYSTEM2_REASONING;
    const isSystem1 = route.startsWith('SYSTEM1');
    const agenticObs = orchestrationResult.result?.agentic_observability as
      | {
          tool_call_count: number;
          llm_rounds: number;
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        }
      | undefined;
    if (isSystem1 && orchestrationResult.success && system1Result) {
      const latency = Date.now() - startTime;
      const agenticLoopTrace =
        (orchestrationResult.result as any)?.agentic_tool_loop ??
        system1Result.result?.agentic_tool_loop_trace;
      const repSteps = orchestrationResult.stepsExecuted?.length ?? 0;
      const liveAudit = (orchestrationResult.result as any)?.live_sensor_audit;
      const liveToolInvocations = Array.isArray(liveAudit) ? liveAudit.length : 0;
      const runtimeExecutionProfile = buildRuntimeExecutionProfileClaudeDynamicAssembly({
        compatibilityRoute: route as RouteType,
        lightweightKnowledgeQa: false,
        isSystem1ExecutorPath: true,
        routingTaskType,
        stepsExecutedLength: repSteps,
        liveToolInvocations,
        heuristicStateMachineRun: false,
      });
      const explainUnifiedBundle = this.composeExplainUnifiedForClientPayload({
        requestId: request.request_id,
        orchestrationDecisionLog: orchestrationResult.decisionLog || [],
        decisionState: orchestrationResult.result?.decisionState,
        orchestratorState: orchestrationResult.result?.state as OrchestratorState | undefined,
      });
      const clientOrchestratorState =
        explainUnifiedBundle.orchestratorStateForClient ??
        (orchestrationResult.result?.state as OrchestratorState | undefined);
      const narrativeDriftObs = this.resolveNarrativeDriftObservability(
        request,
        orchestrationResult,
        explainUnifiedBundle.unified,
      );
      const suppressDecisionCockpitSys1 = this.shouldSuppressDecisionCockpitUi(orchestrationResult);
      const decisionCockpit = suppressDecisionCockpitSys1
        ? undefined
        : explainUnifiedBundle.unified
          ? projectDecisionCockpitFromEnvelope({
              envelope: explainUnifiedBundle.unified,
              narrativeDrift: narrativeDriftObs.narrative_drift,
            })
          : undefined;
      const repValidation = validateRuntimeExecutionProfile(runtimeExecutionProfile);
      const routeRunCostSys1 = this.resolveRouteAndRunCostBundle(request, {
        orchestrationResult,
        agenticTotalTokens: agenticObs?.total_tokens ?? null,
      });
      const resp: RouteAndRunResponseDto = {
        request_id: request.request_id,
        route: {
          route: route as any,
          confidence: orchestrationResult.result?.routingDecision?.confidence || 0.8,
          reasons: [RouterReason.LLM_DECISION],
          required_capabilities: orchestrationResult.result?.routingDecision?.requiredCapabilities || [],
          consent_required: false,
          budget: orchestrationResult.result?.routingDecision?.budget || {
            max_seconds: 3,
            max_steps: 1,
            max_browser_steps: 0,
          },
          ui_hint: {
            mode: 'fast',
            status: system1Result.success ? UIStatus.DONE : UIStatus.FAILED,
            message: system1Result.success ? '处理完成' : '处理失败',
          },
        },
        result: {
          status: system1Result.success ? 'OK' : 'FAILED',
          answer_text: system1Result.answerText ?? '',
          payload: {
            ...(agenticLoopTrace ? { agentic_tool_loop_trace: agenticLoopTrace } : {}),
            timeline: system1Result.result?.timeline || [],
            dropped_items: system1Result.result?.dropped_items || [],
            candidates: system1Result.result?.candidates || [],
            evidence: system1Result.result?.evidence || [],
            robustness: system1Result.result?.robustness || null,
            ...this.buildIronShieldPayloadBlocks(clientOrchestratorState, {
              itinerary:
                system1Result.result?.timeline?.length
                  ? {
                      request_id: request.request_id,
                      days: system1Result.result.timeline,
                      metadata: system1Result.result?.itinerary?.metadata,
                    }
                  : system1Result.result?.itinerary,
              request,
              resultOk: system1Result.success,
              bookingPayload: this.resolveBookingPayloadForUiEnrichment(orchestrationResult),
            }),
          },
        },
        explain: {
          decision_log: sanitizeDecisionLogForClientDisplay(orchestrationResult.decisionLog || []),
          simplified_explanation: this.buildSimplifiedExplanation(
            orchestrationResult.decisionLog || [],
            orchestrationResult.result?.gate_result,
            orchestrationResult.result?.itinerary,
            request.options,
          ),
          ai_capability_display: this.generateAICapabilityDisplay(
            orchestrationResult,
            orchestrationResult.result?.gate_result,
            clientOrchestratorState,
          ),
          optimization: this.buildOptimizationExplain(
          orchestrationResult.result?.decisionState,
          orchestrationResult,
          request,
        ),
          world_model_guards: this.buildWorldModelGuardsExplain(
            orchestrationResult.result?.decisionState,
            clientOrchestratorState,
          ),
          unified: explainUnifiedBundle.unified,
          decision_cockpit: suppressDecisionCockpitSys1 ? undefined : decisionCockpit,
        } as any,
        observability: {
          latency_ms: latency,
          router_ms: 0,
          system_mode: 'SYSTEM1',
          thinking_mode_resolved: resolveThinkingModeFromRuntimeProfile(runtimeExecutionProfile, {
            uiMode: 'fast',
            orchestrationMode: 'CLAUDE_DYNAMIC',
            systemMode: 'SYSTEM1',
          }),
          runtime_execution_profile: runtimeExecutionProfile,
          ...(repValidation.anomalies.length
            ? { runtime_execution_anomalies: repValidation.anomalies }
            : {}),
          tool_calls: agenticObs ? agenticObs.tool_call_count : 1,
          ...(agenticObs
            ? {
                tool_call_count: agenticObs.tool_call_count,
                agentic_llm_rounds: agenticObs.llm_rounds,
                agentic_tokens_prompt: agenticObs.prompt_tokens,
                agentic_tokens_completion: agenticObs.completion_tokens,
                agentic_tool_loop: true,
              }
            : {}),
          browser_steps: 0,
          tokens_est: routeRunCostSys1.tokens_est,
          cost_est_usd: routeRunCostSys1.cost_est_usd,
          fallback_used: false,
          orchestration_request_id: request.request_id,
          current_step: orchestrationResult.result?.state?.current_step,
          trace: traceInfo,
          ...this.computeP4ObservabilityMetrics(orchestrationResult),
          ...this.resolveHarnessObservability(request, orchestrationResult),
          ...this.resolveAgentRunTraceObservability(request, orchestrationResult),
          ...this.resolveExecutionPolicyGatewayObservability(request),
          ...this.resolveShadowGraderObservability(request),
          ...this.resolveSubagentPermissionSandboxObservability(request),
          ...this.resolveEpisodicSummarizerObservability(request),
        ...this.resolveQualitySampleObservability(request),
        ...this.resolveLlmRoutingObservability(request),
          cost_governance_v1: routeRunCostSys1.cost_governance_v1,
          ...this.resolveAgenticLoopCheckpointObservability(orchestrationResult, system1Result),
          ...this.resolveAgenticTaskRollbackObservability(request, orchestrationResult, system1Result),
          ...this.resolvePoiPlanningObservabilityForClient(orchestrationResult, request),
          ...this.resolveGapBehaviorObservationObservability(orchestrationResult),
          ...this.resolveReplanLineageObservability(request, orchestrationResult),
          ...this.resolveOrchestrationFailureObservability(orchestrationResult),
          ...this.resolveNarrativeIntegrityObservability(request, orchestrationResult),
          ...narrativeDriftObs,
        } as any,
      };
      this.applyRouteProgressSurface(resp, orchestrationResult);
      this.attachExplainFailureReasonCodes(resp, { gaps: orchestrationResult.result?.state?.gaps });
      this.attachCoverageDisclosure(resp);
      this.attachDependencyImpact(resp, { request, orchestrationResult });
      return resp;
    }

    // System 2：保持现有逻辑
    const latency = Date.now() - startTime;
    const isTimeout =
      !orchestrationResult.success &&
      (orchestrationResult.result?.errorType === ErrorType.TIMEOUT_ERROR ||
        orchestrationResult.answerText?.includes('超时') ||
        orchestrationResult.answerText?.includes('timeout') ||
        orchestrationResult.answerText?.includes('TIMEOUT'));

    const needsUserConfirmation =
      !orchestrationResult.success && !isTimeout && orchestrationResult.result?.needsUserConfirmation === true;
    const clarificationMessage = orchestrationResult.result?.clarificationMessage || orchestrationResult.answerText;

    const crudFailed =
      this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult) &&
      !this.isItineraryItemCrudApplied(orchestrationResult);
    const adjustApplyFailedDyn =
      this.isItineraryAdjustDraftApplyIntake(orchestrationResult) &&
      !this.isItineraryAdjustDraftApplySucceeded(orchestrationResult);
    const actionFailedDyn = crudFailed || adjustApplyFailedDyn;

    const resultStatus = isTimeout
      ? 'TIMEOUT'
      : needsUserConfirmation
        ? 'NEED_MORE_INFO'
        : actionFailedDyn
          ? 'FAILED'
          : orchestrationResult.success
            ? 'OK'
            : 'FAILED';

    const k3DecisionLogClaude = sanitizeDecisionLogForClientDisplay(
      this.resolveCanonicalDecisionLogForK3(orchestrationResult),
    );

    const orchStateDynEarly = (orchestrationResult.result as any)?.state as OrchestratorState | undefined;

    const suppressIronShieldUiDyn = this.shouldSuppressIronShieldUi(
      orchestrationResult,
      orchStateDynEarly,
      request,
    );
    const suppressDecisionCockpitDyn = this.shouldSuppressDecisionCockpitUi(orchestrationResult, request);
    const suppressAdjustTechnicalUiDyn =
      this.isItineraryAdjustSession(orchestrationResult, request);

    const consultationUi = this.isConsultationUiSurface(orchestrationResult, routingTaskType);
    const uiSurface = this.resolveUiSurfaceForPayload(orchestrationResult, consultationUi);
    const consultationDashboard = this.resolveConsultationDashboardForPayload(
      orchestrationResult,
      consultationUi,
      { routingTaskType, trip_id: request.trip_id },
    );

    const itineraryDaysDyn =
      consultationUi || !orchestrationResult.result?.itinerary?.days
        ? []
        : orchestrationResult.result.itinerary.days;
    const itineraryShellDyn =
      orchestrationResult.result?.itinerary != null
        ? { ...orchestrationResult.result.itinerary, days: itineraryDaysDyn }
        : consultationUi
          ? ({ request_id: request.request_id, days: [] } as Itinerary)
          : undefined;

    const researchDataForSafetySurface = {
      ...(((orchestrationResult.result as any)?.state?.research_data as Record<string, unknown> | undefined) ??
        {}),
      ...(((orchestrationResult.result as any)?.research_data as Record<string, unknown> | undefined) ?? {}),
      ...(((orchestrationResult.result as any)?.lightweight_research_data as Record<string, unknown> | undefined) ??
        {}),
    } as Record<string, unknown>;

    /** 轻量问答路径（单次 LLM + 可选 MCP）：不等价于 System1Executor，但产品上与「快速路径」一致 */
    const lightweightKnowledgeQa = Boolean(
      (orchestrationResult.result as { lightweightKnowledgeQa?: boolean } | undefined)
        ?.lightweightKnowledgeQa,
    );
    const teamStructuredDiscussionBypass = Boolean(
      (orchestrationResult.result as { teamStructuredDiscussionBypass?: boolean } | undefined)
        ?.teamStructuredDiscussionBypass,
    );

    const repStepsDyn = orchestrationResult.stepsExecuted?.length ?? 0;
    const liveAuditDyn = (orchestrationResult.result as any)?.live_sensor_audit;
    const liveToolInvocationsDyn = Array.isArray(liveAuditDyn) ? liveAuditDyn.length : 0;
    const heuristicStateMachineRun =
      routingTaskType === 'TRIP_PLANNING' && !lightweightKnowledgeQa && !isSystem1;
    const runtimeExecutionProfile = buildRuntimeExecutionProfileClaudeDynamicAssembly({
      compatibilityRoute: route as RouteType,
      lightweightKnowledgeQa,
      isSystem1ExecutorPath: isSystem1,
      routingTaskType,
      stepsExecutedLength: repStepsDyn,
      liveToolInvocations: liveToolInvocationsDyn,
      heuristicStateMachineRun,
    });
    const dynValidation = validateRuntimeExecutionProfile(runtimeExecutionProfile);
    const tokensEstDyn = agenticObs
      ? agenticObs.total_tokens
      : TokenCalculator.estimateTotalTokens(request.message, orchestrationResult.answerText, {
          orchestrationResult: orchestrationResult.result,
          stepsExecuted: orchestrationResult.stepsExecuted,
          decisionLog: k3DecisionLogClaude,
        });
    const routeRunCostDyn = this.resolveRouteAndRunCostBundle(request, {
      orchestrationResult,
      agenticTotalTokens: agenticObs?.total_tokens ?? null,
      tokensEst: tokensEstDyn,
    });

    const orchStateDyn = orchStateDynEarly;
    const gateSurfacedDyn = attachGuardianPersonaSurface(
      (orchestrationResult.result as any)?.gate_result as GateResult | undefined,
    );
    const tripPlanDyn =
      orchStateDyn?.trip_plan_request ?? (orchestrationResult.result as any)?.trip_plan_request;
    const gateForOrchestrationPayloadDyn = await this.maybeApplyGuardiansDebateLlm(
      request,
      gateSurfacedDyn,
      tripPlanDyn,
      orchStateDyn,
    );
    const gateForClientPayloadDyn = this.sanitizeGateForClientPayload(
      gateForOrchestrationPayloadDyn,
      orchestrationResult,
      request,
      undefined,
      undefined,
      orchStateDyn?.research_data as Record<string, unknown> | undefined,
    );
    const stateWithSurfacedGateDyn =
      orchStateDyn && gateForOrchestrationPayloadDyn
        ? {
            ...orchStateDyn,
            gate_result: gateForClientPayloadDyn ?? gateForOrchestrationPayloadDyn,
          }
        : orchStateDyn;

    const explainUnifiedBundleDyn = this.composeExplainUnifiedForClientPayload({
      requestId: request.request_id,
      orchestrationDecisionLog: k3DecisionLogClaude,
      decisionState: orchestrationResult.result?.decisionState,
      orchestratorState: stateWithSurfacedGateDyn,
    });
    const clientOrchestratorStateDyn = stripGateViolationsFromOrchestratorStateForClient(
      explainUnifiedBundleDyn.orchestratorStateForClient ?? stateWithSurfacedGateDyn,
    );
    const spreadUiSurfacePayloadDyn = orchestrationResult.success;
    const narrativeDriftObsDyn = this.resolveNarrativeDriftObservability(
      request,
      orchestrationResult,
      explainUnifiedBundleDyn.unified,
    );
    const decisionCockpitDyn = suppressDecisionCockpitDyn
      ? undefined
      : explainUnifiedBundleDyn.unified
        ? projectDecisionCockpitFromEnvelope({
            envelope: explainUnifiedBundleDyn.unified,
            narrativeDrift: narrativeDriftObsDyn.narrative_drift,
          })
        : undefined;

    const itineraryAdjustPayloadBlocksDyn = this.buildItineraryAdjustPayloadBlocks({
      orchestrationResult,
      request,
      timelineDays: itineraryDaysDyn,
      state: stateWithSurfacedGateDyn,
      gateForClient: gateForClientPayloadDyn,
    });
    const pfPayload = (orchestrationResult.result as any)?.process_fairness;
    const suppressProcessFairnessNavOps =
      teamStructuredDiscussionBypass || (pfPayload?.triggered && pfPayload?.round);
    const suggestedOpsForPayload = suppressProcessFairnessNavOps
      ? []
      : ((orchestrationResult.result as any)?.suggested_operations ?? []);

    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: {
        route: route as any,
        confidence: orchestrationResult.result?.routingDecision?.confidence || 0.8,
        reasons: teamStructuredDiscussionBypass
          ? (['TEAM_STRUCTURED_DISCUSSION_FAST_PATH', 'PROCESS_FAIRNESS'] as any)
          : [RouterReason.LLM_DECISION],
        required_capabilities: orchestrationResult.result?.routingDecision?.requiredCapabilities || [],
        consent_required: orchestrationResult.result?.routingDecision?.consentRequired || false,
        budget: orchestrationResult.result?.routingDecision?.budget || {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: isSystem1 || lightweightKnowledgeQa || teamStructuredDiscussionBypass ? 'fast' : 'slow',
          status: isTimeout
            ? UIStatus.FAILED
            : needsUserConfirmation
              ? UIStatus.AWAITING_CONFIRMATION
              : actionFailedDyn
                ? UIStatus.FAILED
                : orchestrationResult.success
                  ? UIStatus.DONE
                  : UIStatus.FAILED,
          message: isTimeout
            ? '请求超时，请缩小范围或稍后重试。'
            : needsUserConfirmation
              ? '需要您的确认'
              : actionFailedDyn
                ? orchestrationResult.answerText || '未能更新行程'
                : orchestrationResult.success
                  ? teamStructuredDiscussionBypass
                    ? '已开启结构化偏好分享轮次。'
                    : this.resolveSuccessUiHintMessage(orchestrationResult, consultationUi)
                  : '处理失败',
        },
      },
      result: {
        status: resultStatus as any,
        answer_text: isTimeout ? '请求超时，请缩小范围或稍后重试。' : needsUserConfirmation ? clarificationMessage : orchestrationResult.answerText,
        payload: {
          ...((orchestrationResult.result as any)?.agentic_tool_loop
            ? { agentic_tool_loop_trace: (orchestrationResult.result as any).agentic_tool_loop }
            : {}),
          ...(spreadUiSurfacePayloadDyn
            ? {
                ui_surface: uiSurface,
                ...(this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)
                  ? { itinerary_item_crud: true as const }
                  : {}),
                ...(this.isItineraryAdjustSession(orchestrationResult, request)
                  ? { itinerary_adjust_intake: true as const }
                  : {}),
                ...(suppressIronShieldUiDyn ? { iron_shield_ui_suppressed: true as const } : {}),
                ...(suppressDecisionCockpitDyn ? { decision_cockpit_ui_suppressed: true as const } : {}),
                ...(uiSurface === 'consultation'
                  ? { consultation_itinerary_payload_suppressed: true as const }
                  : {}),
              }
            : {}),
          ...itineraryAdjustPayloadBlocksDyn,
          ...((orchestrationResult.result as any)?.live_sensor_audit?.length
            ? { live_sensor_audit: (orchestrationResult.result as any).live_sensor_audit }
            : {}),
          ...((orchestrationResult.result as any)?.data_lookup_rag_citations?.length
            ? {
                data_lookup_rag_citations: (orchestrationResult.result as any)
                  .data_lookup_rag_citations,
                ...((orchestrationResult.result as any)?.kb_rag_citation_count != null
                  ? {
                      kb_rag_citation_count: (orchestrationResult.result as any).kb_rag_citation_count,
                    }
                  : {}),
              }
            : {}),
          ...(lightweightKnowledgeQa && orchestrationResult.success
            ? {
                unified_execution_trace: {
                  lightweight_knowledge_qa: true,
                  routing_task_type: routingTaskType,
                  intent_mode_resolved:
                    request.options?.intent_mode != null
                      ? String(request.options.intent_mode)
                      : routingTaskType,
                  ...((orchestrationResult.result as any)?.llm_upstream_network_fallback
                    ? {
                        llm_upstream_network_fallback: (orchestrationResult.result as any)
                          .llm_upstream_network_fallback,
                      }
                    : {}),
                  decision_log: k3DecisionLogClaude,
                  steps_executed: orchestrationResult.stepsExecuted ?? [],
                  kb_rag_hit: Boolean(
                    (orchestrationResult.result as any)?.data_lookup_rag_citations?.length,
                  ),
                  kb_rag_citation_count:
                    (orchestrationResult.result as any)?.kb_rag_citation_count ??
                    ((orchestrationResult.result as any)?.data_lookup_rag_citations?.length || 0),
                  live_sensor_audit: (orchestrationResult.result as any)?.live_sensor_audit ?? [],
                  ...((orchestrationResult.result as any)?.readiness_evidence_display_zh?.length
                    ? {
                        readiness_evidence_display_zh: (orchestrationResult.result as any)
                          .readiness_evidence_display_zh,
                      }
                    : {}),
                  ...((orchestrationResult.result as any)?.readiness_technical_evidence_refs?.length
                    ? {
                        readiness_technical_evidence_refs: (orchestrationResult.result as any)
                          .readiness_technical_evidence_refs,
                      }
                    : {}),
                  ...((orchestrationResult.result as any)?.ontology_evidence_display_zh?.length
                    ? {
                        ontology_evidence_display_zh: (orchestrationResult.result as any)
                          .ontology_evidence_display_zh,
                      }
                    : {}),
                },
              }
            : {}),
          ...((orchestrationResult.result as any)?.car_rentals !== undefined
            ? {
                car_rentals: (orchestrationResult.result as any).car_rentals,
                ...((orchestrationResult.result as any)?.car_rental_search_meta
                  ? {
                      car_rental_search_meta: (orchestrationResult.result as any)
                        .car_rental_search_meta,
                    }
                  : {}),
              }
            : {}),
          ...((orchestrationResult.result as any)?.iceland_rental_guidance
            ? { iceland_rental_guidance: (orchestrationResult.result as any).iceland_rental_guidance }
            : {}),
          ...((orchestrationResult.result as any)?.lightweight_research_data
            ? {
                lightweight_research_data: (orchestrationResult.result as any).lightweight_research_data,
              }
            : {}),
          ...((orchestrationResult.result as any)?.iceland_lightweight_red_alert_fast_fail
            ? {
                iceland_lightweight_red_alert_fast_fail: (orchestrationResult.result as any)
                  .iceland_lightweight_red_alert_fast_fail,
              }
            : {}),
          ...((orchestrationResult.result as any)?.iceland_lightweight_vehicle_terrain_fast_fail
            ? {
                iceland_lightweight_vehicle_terrain_fast_fail: (orchestrationResult.result as any)
                  .iceland_lightweight_vehicle_terrain_fast_fail,
              }
            : {}),
          ...((orchestrationResult.result as any)?.car_rental_guidance_footnotes_zh?.length
            ? {
                car_rental_guidance_footnotes_zh: (orchestrationResult.result as any)
                  .car_rental_guidance_footnotes_zh,
              }
            : {}),
          ...((orchestrationResult.result as any)?.flight_inventory_snapshot
            ? {
                flight_inventory_snapshot: (orchestrationResult.result as any).flight_inventory_snapshot,
              }
            : {}),
          ...((orchestrationResult.result as any)?.inventory_snapshots_meta
            ? {
                inventory_snapshots_meta: (orchestrationResult.result as any).inventory_snapshots_meta,
              }
            : {}),
          ...((orchestrationResult.result as any)?.narrative_safety
            ? { narrative_safety: (orchestrationResult.result as any).narrative_safety }
            : {}),
          ...((orchestrationResult.result as any)?.narrative_integrity_report
            ? {
                narrative_integrity_report: (orchestrationResult.result as any)
                  .narrative_integrity_report,
              }
            : {}),
          ...(suggestedOpsForPayload.length
            ? { suggested_operations: suggestedOpsForPayload }
            : {}),
          ...((orchestrationResult.result as any)?.process_fairness
            ? { process_fairness: (orchestrationResult.result as any).process_fairness }
            : {}),
          ...(consultationDashboard ? { consultation_dashboard: consultationDashboard } : {}),
          ...this.resolveHotelAccommodationPayloadBlocks(orchestrationResult),
          timeline: itineraryDaysDyn,
          dropped_items: [],
          candidates: suppressAdjustTechnicalUiDyn
            ? []
            : this.buildDecisionCandidates(orchestrationResult.result?.decisionState),
          alternatives: suppressAdjustTechnicalUiDyn
            ? []
            : this.buildDecisionCandidates(orchestrationResult.result?.decisionState),
          evidence: [],
          robustness: null,
          ...(orchestrationResult.result && (orchestrationResult.result as any).state
            ? {
                orchestrationResult: {
                  state: clientOrchestratorStateDyn,
                  itinerary:
                    itineraryShellDyn ?? (orchestrationResult.result as any).itinerary,
                  gate_result:
                    gateForClientPayloadDyn ??
                    gateForOrchestrationPayloadDyn ??
                    (orchestrationResult.result as any).gate_result,
                  decision_log: k3DecisionLogClaude,
                },
              }
            : {}),
          travelOntologyState: this.resolveTravelOntologyForPayload(orchestrationResult.result),
          schema_org_discovery: this.resolveSchemaOrgDiscoveryForPayload(orchestrationResult.result),
          ...(isTimeout ? { errorType: ErrorType.TIMEOUT_ERROR } : {}),
          ...(needsUserConfirmation
            ? {
                needsUserConfirmation: true,
                clarificationMessage: orchestrationResult.result?.clarificationMessage,
                clarificationQuestions: this.resolveClarificationQuestionsForPayload({
                  orchestrationResult,
                  state: (orchestrationResult.result as any)?.state as OrchestratorState | undefined,
                  request,
                }),
                missingServices: orchestrationResult.result?.missingServices || [],
                solutions: orchestrationResult.result?.solutions || [],
                errorType: orchestrationResult.result?.errorType,
              }
            : {}),
          ...(suppressAdjustTechnicalUiDyn
            ? {}
            : {
                safety_surface: buildSafetySurfacePayload({
                  research_data: researchDataForSafetySurface,
                  itinerary:
                    itineraryShellDyn ??
                    (orchestrationResult.result?.itinerary as Itinerary | undefined) ??
                    undefined,
                  stepsExecuted: orchestrationResult.stepsExecuted,
                  gate_result: gateForClientPayloadDyn ?? gateForOrchestrationPayloadDyn,
                }),
              }),
          ...(suppressIronShieldUiDyn
            ? {}
            : this.buildIronShieldPayloadBlocks(clientOrchestratorStateDyn, {
                itinerary: itineraryShellDyn,
                request,
                resultOk: resultStatus === 'OK',
                bookingPayload: this.resolveBookingPayloadForUiEnrichment(orchestrationResult),
              })),
        } as any,
      },
      explain: {
        decision_log: k3DecisionLogClaude,
        ...(suppressAdjustTechnicalUiDyn
          ? {}
          : {
              simplified_explanation: this.buildSimplifiedExplanation(
                k3DecisionLogClaude,
                gateForOrchestrationPayloadDyn ?? orchestrationResult.result?.gate_result,
                orchestrationResult.result?.itinerary,
                request.options,
              ),
              ai_capability_display: this.generateAICapabilityDisplay(
                orchestrationResult,
                gateForOrchestrationPayloadDyn ?? orchestrationResult.result?.gate_result,
                clientOrchestratorStateDyn,
              ),
            }),
        ...(gateForOrchestrationPayloadDyn?.guardian_results && !suppressAdjustTechnicalUiDyn
          ? { guardian_personas: gateForOrchestrationPayloadDyn.guardian_results }
          : {}),
        optimization: this.buildOptimizationExplain(
          orchestrationResult.result?.decisionState,
          orchestrationResult,
          request,
        ),
        ...(suppressAdjustTechnicalUiDyn
          ? {}
          : {
              kernel_explainability: this.buildKernelExplainability(
                orchestrationResult.result?.decisionState,
              ),
              world_model_guards: this.buildWorldModelGuardsExplain(
                orchestrationResult.result?.decisionState,
                clientOrchestratorStateDyn,
              ),
            }),
        unified: suppressAdjustTechnicalUiDyn ? undefined : explainUnifiedBundleDyn.unified,
        decision_cockpit: suppressDecisionCockpitDyn ? undefined : decisionCockpitDyn,
      } as any,
      observability: {
        latency_ms: latency,
        router_ms: 0,
        // 与 `route.route` 一致：轻量问答仍是 SYSTEM2_REASONING，勿标成 SYSTEM1（否则前端用 system_mode 控制「决策日志」展示时会永远不出现）。
        // 快路径语义见 `runtime_execution_profile.observability.userFacingMode` 与 `route.ui_hint.mode`。
        system_mode: isSystem1 ? 'SYSTEM1' : 'SYSTEM2',
        thinking_mode_resolved: resolveThinkingModeFromRuntimeProfile(runtimeExecutionProfile, {
          uiMode: isSystem1 || lightweightKnowledgeQa ? 'fast' : 'slow',
          orchestrationMode: 'CLAUDE_DYNAMIC',
          systemMode: isSystem1 ? 'SYSTEM1' : 'SYSTEM2',
        }),
        ...(lightweightKnowledgeQa && orchestrationResult.success
          ? {
              routing_task_type: routingTaskType,
              lightweight_knowledge_qa: true,
              kb_rag_hit: Boolean(
                (orchestrationResult.result as any)?.data_lookup_rag_citations?.length,
              ),
              kb_rag_citation_count:
                (orchestrationResult.result as any)?.kb_rag_citation_count ??
                ((orchestrationResult.result as any)?.data_lookup_rag_citations?.length || 0),
              ...((orchestrationResult.result as any)?.llm_upstream_network_fallback
                ? {
                    llm_upstream_network_fallback: (orchestrationResult.result as any)
                      .llm_upstream_network_fallback,
                  }
                : {}),
            }
          : {}),
        runtime_execution_profile: runtimeExecutionProfile,
        ...(dynValidation.anomalies.length
          ? { runtime_execution_anomalies: dynValidation.anomalies }
          : {}),
        tool_calls: agenticObs ? agenticObs.tool_call_count : orchestrationResult.stepsExecuted.length,
        ...(agenticObs
          ? {
              tool_call_count: agenticObs.tool_call_count,
              agentic_llm_rounds: agenticObs.llm_rounds,
              agentic_tokens_prompt: agenticObs.prompt_tokens,
              agentic_tokens_completion: agenticObs.completion_tokens,
              agentic_tool_loop: true,
            }
          : {}),
        browser_steps: 0,
        tokens_est: routeRunCostDyn.tokens_est,
        cost_est_usd: routeRunCostDyn.cost_est_usd,
        fallback_used: false,
        orchestration_request_id: request.request_id,
        current_step: orchestrationResult.result?.state?.current_step,
        trace: traceInfo,
        ...this.computeP4ObservabilityMetrics(orchestrationResult),
        ...this.resolveHarnessObservability(request, orchestrationResult),
        ...this.resolveAgentRunTraceObservability(request, orchestrationResult),
        ...this.resolveExecutionPolicyGatewayObservability(request),
        ...this.resolveShadowGraderObservability(request),
        ...this.resolveSubagentPermissionSandboxObservability(request),
        ...this.resolveEpisodicSummarizerObservability(request),
        ...this.resolveQualitySampleObservability(request),
        ...this.resolveLlmRoutingObservability(request),
        cost_governance_v1: routeRunCostDyn.cost_governance_v1,
        ...this.resolveAgenticLoopCheckpointObservability(orchestrationResult, system1Result),
        ...this.resolveAgenticTaskRollbackObservability(request, orchestrationResult, system1Result),
        ...this.resolvePoiPlanningObservabilityForClient(orchestrationResult, request),
        ...this.resolveGapBehaviorObservationObservability(orchestrationResult),
        ...this.resolveReplanLineageObservability(request, orchestrationResult),
        ...this.resolveOrchestrationFailureObservability(orchestrationResult),
        ...this.resolveNarrativeIntegrityObservability(request, orchestrationResult),
        ...narrativeDriftObsDyn,
        dso_version: this.resolveClientDsoVersionForResponse(orchestrationResult),
        ...(this.isItineraryItemCrudIntakeShortCircuit(orchestrationResult)
          ? {
              itinerary_item_crud: true as const,
              skills_hit: extractSkillsHitFromDecisionLog(
                orchestrationResult.decisionLog ??
                  orchestrationResult.result?.decision_log ??
                  orchestrationResult.result?.state?.decision_log,
              ),
            }
          : {}),
      } as any,
    };

    this.applyRouteProgressSurface(response, orchestrationResult);

    if (needsUserConfirmation && resultStatus === 'NEED_MORE_INFO') {
      this.applyNeedMoreInfoUiSurface(response);
    }

    // Trade-off negotiation (Layer 3): when physical healing implies user-visible TCO spikes.
    const negotiation = await this.tradeoffEngine.buildNegotiation({
      request,
      decisionLog: k3DecisionLogClaude,
      finalItinerary:
        ((orchestrationResult.result as any)?.itinerary as any) ??
        ((orchestrationResult.result as any)?.state?.itinerary as any) ??
        undefined,
      state: (orchestrationResult.result as any)?.state,
    });
    if (negotiation) {
      (response.result.payload as any).negotiation_payload = negotiation;
      response.result.status = 'NEED_CONFIRMATION';
      response.route.ui_hint.status = UIStatus.AWAITING_CONFIRMATION;
      response.route.ui_hint.message = '需要您的确认';
      response.ui_state = {
        ...(response.ui_state as any),
        phase: (response.ui_state?.phase ?? (orchestrationResult.result?.state?.current_step as any)) as any,
        ui_status: 'awaiting_confirmation',
        requires_user_action: true,
        message: negotiation.impact ?? '需要您在成本/时间之间做权衡选择。',
      } as any;

      // Persist negotiation snapshot for confirm flow (optimistic lock).
      const sessionId = String((negotiation as any)?.negotiation_session_id ?? '');
      const expectedHash = String((negotiation as any)?.expected_negotiation_hash ?? '');
      const itinerary =
        ((orchestrationResult.result as any)?.itinerary as any) ??
        ((orchestrationResult.result as any)?.state?.itinerary as any) ??
        undefined;
      if (this.negotiationSessions && sessionId && expectedHash && itinerary) {
        this.negotiationSessions.set({
          session_id: sessionId,
          expected_negotiation_hash: expectedHash,
          negotiation_payload: negotiation,
          itinerary,
          request,
        });
      }
    }

    this.attachExplainFailureReasonCodes(response);
    this.attachCoverageDisclosure(response);
    this.attachDependencyImpact(response, { request, orchestrationResult });

    applyConsultationItineraryPayloadHygiene(response);
    await this.maybeAttachPersistedTripPoiCardsForConsultation(request, response);

    if (resultStatus === 'OK' && !isSystem1) {
      assertDoneResponseCompleteness(response, {
        stepsExecuted: orchestrationResult.stepsExecuted,
      });
    }

    return response;
  }

  // ==================== helpers (migrated from AgentService) ====================

  /** Phase 2.0：poiPlanning slice + 真实 outcome（POI_SELECTION / itinerary）供聚合与前后对比 */
  private resolvePoiPlanningObservability(orchestrationResult: OrchestrationResult): Record<string, unknown> {
    const raw = orchestrationResult.result as
      | { state?: OrchestratorState; decisionState?: DecisionState }
      | undefined;
    const meta = raw?.state?.metadata as Record<string, unknown> | undefined;
    const bundle = meta?.poiPlanningOutcome as Record<string, unknown> | undefined;
    const sliceDso = raw?.decisionState?.poiPlanning;
    if (!bundle && !sliceDso) return {};
    const compactFromMeta = bundle?.slice as Record<string, unknown> | undefined;
    return {
      poi_planning: {
        regionId: compactFromMeta?.regionId ?? sliceDso?.routeIntent?.regionId,
        feasibility: compactFromMeta?.feasibility ?? sliceDso?.schedulePlan?.feasibility,
        resolution: compactFromMeta?.resolution ?? sliceDso?.resolution,
        appliedBackoffSteps: compactFromMeta?.appliedBackoffSteps ?? sliceDso?.appliedBackoffSteps,
        budgetGateApplied: compactFromMeta?.budgetGateApplied ?? sliceDso?.budgetGateApplied,
        outcome: bundle,
      },
    };
  }

  /** DOS v1：`state.metadata.gap_behavior_observation` → observability（只读外显） */
  private resolveGapBehaviorObservationObservability(
    orchestrationResult: OrchestrationResult,
  ): Record<string, unknown> {
    const raw = (orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined)
      ?.gap_behavior_observation;
    if (!raw || typeof raw !== 'object') return {};
    return { gap_behavior_observation: raw };
  }

  private resolveAgentRunTraceObservability(
    request: RouteAndRunRequestDto,
    orchestrationResult: OrchestrationResult,
  ): { agent_run_trace_v1?: import('../orchestration/agent-run-trace.util').AgentRunTraceV1 } {
    const state = orchestrationResult.result?.state;
    const meta = state?.metadata as Record<string, unknown> | undefined;
    let status: string = 'UNKNOWN';
    if (orchestrationResult.success) status = 'OK';
    else if (orchestrationResult.result?.needsUserConfirmation) status = 'NEED_CONFIRMATION';
    else if (state?.clarification_questions?.length) status = 'NEED_MORE_INFO';
    else if (!orchestrationResult.success) status = 'FAILED';

    const trace = buildAgentRunTraceV1({
      requestId: request.request_id,
      decisionLog: state?.decision_log ?? orchestrationResult.decisionLog,
      metadata: meta,
      finalDeliveryStatus: status,
    });
    return { agent_run_trace_v1: trace };
  }

  private resolveHarnessObservability(
    request: RouteAndRunRequestDto,
    orchestrationResult: OrchestrationResult,
  ): {
    harness_active_trace_id: string | null;
    harness_trace_export_path: string | null;
    evaluation_run_id: string | null;
    otel_trace_id: string | null;
    otel_span_id: string | null;
    verify_return_to_research_count?: number;
    research_scope_invalidation_reason?: string;
    return_to_research_context_v1?: import('../orchestration/return-to-research-context.util').ReturnToResearchContextV1;
  } {
    const ds = orchestrationResult.result?.decisionState as DecisionState | undefined;
    const hr = ds?.harnessRuntime;
    const stMeta = orchestrationResult.result?.state?.metadata as Record<string, unknown> | undefined;
    const retryCount = stMeta?.verify_return_to_research_count;
    const inv = stMeta?.research_scope_invalidation as { reason?: string } | undefined;
    const r2rCtx = stMeta?.return_to_research_context_v1 as
      | import('../orchestration/return-to-research-context.util').ReturnToResearchContextV1
      | undefined;
    const otel = resolveHarnessOtelObservabilityFields(
      hr,
      readOtelTraceContextFromRouteAndRunRequest(request),
    );
    const out: {
      harness_active_trace_id: string | null;
      harness_trace_export_path: string | null;
      evaluation_run_id: string | null;
      otel_trace_id: string | null;
      otel_span_id: string | null;
      verify_return_to_research_count?: number;
      research_scope_invalidation_reason?: string;
      return_to_research_context_v1?: import('../orchestration/return-to-research-context.util').ReturnToResearchContextV1;
    } = {
      harness_active_trace_id: hr?.activeTraceId ?? null,
      harness_trace_export_path: hr?.traceExportRelativePath ?? null,
      evaluation_run_id: request.meta?.run_id ?? hr?.evaluationRunId ?? null,
      ...otel,
    };
    if (typeof retryCount === 'number' && Number.isFinite(retryCount) && retryCount > 0) {
      out.verify_return_to_research_count = retryCount;
    }
    if (typeof inv?.reason === 'string' && inv.reason.trim()) {
      out.research_scope_invalidation_reason = inv.reason.trim();
    }
    if (r2rCtx?.schemaId === 'tripnara.return_to_research_context@v1') {
      out.return_to_research_context_v1 = r2rCtx;
    }
    return out;
  }

  private resolveExecutionPolicyGatewayObservability(
    request: RouteAndRunRequestDto,
  ): { execution_policy_gateway_v1?: import('../runtime/execution-policy-gateway-context.util').ExecutionPolicyGatewayObservabilityV1 } {
    const slice = readExecutionPolicyGatewayObservability(request as RouteAndRunExecutionPolicyCarrier);
    return slice ? { execution_policy_gateway_v1: slice } : {};
  }

  private resolveAgenticTaskRollbackObservability(
    request: RouteAndRunRequestDto,
    orchestrationResult: { result?: Record<string, unknown> },
    system1Result?: { result?: Record<string, unknown> },
  ): {
    agentic_task_rollback_v1?: import('../runtime/agentic-task-rollback.util').AgenticTaskRollbackObservabilityV1;
  } {
    const mounted = (
      request as RouteAndRunRequestDto & {
        __agenticTaskRollbackObservabilityV1?: import('../runtime/agentic-task-rollback.util').AgenticTaskRollbackObservabilityV1;
      }
    ).__agenticTaskRollbackObservabilityV1;
    if (mounted?.schemaId === 'tripnara.agentic_task_rollback@v1') {
      return { agentic_task_rollback_v1: mounted };
    }
    const trace =
      (system1Result?.result?.agentic_tool_loop_trace as unknown) ??
      orchestrationResult.result?.agentic_tool_loop;
    const fromTrace = readAgenticTaskRollbackObservabilityFromTrace(trace);
    return fromTrace ? { agentic_task_rollback_v1: fromTrace } : {};
  }

  private resolveAgenticLoopCheckpointObservability(
    orchestrationResult: { result?: Record<string, unknown> },
    system1Result?: { result?: Record<string, unknown> },
  ): {
    agentic_loop_checkpoints_v1?: import('../runtime/agentic-loop-checkpoint.util').AgenticLoopCheckpointObservabilityV1;
  } {
    const trace =
      (system1Result?.result?.agentic_tool_loop_trace as { checkpoint_observability?: unknown } | undefined) ??
      (orchestrationResult.result?.agentic_tool_loop as { checkpoint_observability?: unknown } | undefined);
    const obs = trace?.checkpoint_observability as
      | import('../runtime/agentic-loop-checkpoint.util').AgenticLoopCheckpointObservabilityV1
      | undefined;
    return obs?.schemaId === 'tripnara.agentic_loop_checkpoints@v1'
      ? { agentic_loop_checkpoints_v1: obs }
      : {};
  }

  private resolveShadowGraderObservability(
    request: RouteAndRunRequestDto,
  ): { shadow_grader_v1?: ShadowGraderObservabilityV1 } {
    if (!this.harnessShadowGrader) return {};
    return { shadow_grader_v1: this.harnessShadowGrader.buildObservabilityForRequest(request.request_id) };
  }

  private resolveSubagentPermissionSandboxObservability(
    request: RouteAndRunRequestDto,
  ): {
    subagent_permission_sandbox_v1?: import('../runtime/subagent-permission-sandbox.util').SubagentPermissionSandboxObservabilityV1;
  } {
    const slice = readSubagentPermissionSandboxObservability(request as RouteAndRunSubagentSandboxCarrier);
    return slice ? { subagent_permission_sandbox_v1: slice } : {};
  }

  private resolveEpisodicSummarizerObservability(
    request: RouteAndRunRequestDto,
  ): {
    episodic_summarizer_v1?: import('../memory/utils/episodic-memory-summarizer.util').EpisodicSummarizerObservabilityV1;
  } {
    if (!this.episodicMemorySummarizer) return {};
    const ingress = (request as RouteAndRunEpisodicCarrier).__episodicSummarizerIngressV1;
    return {
      episodic_summarizer_v1: this.episodicMemorySummarizer.buildObservabilityForRequest(
        request,
        ingress,
      ),
    };
  }

  private resolveQualitySampleObservability(
    request: RouteAndRunRequestDto,
  ): {
    quality_sample_v1?: import('../../harness/eval/quality/harness-quality-loop.util').HarnessQualitySampleObservabilityV1;
  } {
    const slice = buildHarnessQualitySampleObservability({
      requestId: request.request_id,
    });
    if (!slice.enabled) return {};
    return { quality_sample_v1: slice };
  }

  private resolveLlmRoutingObservability(
    request: RouteAndRunRequestDto,
  ): { llm_routing_v1?: import('../runtime/harness-llm-routing-observability.util').LlmRoutingObservabilityV1 } {
    const slice = buildLlmRoutingObservabilityFromAccumulator({ request });
    return slice ? { llm_routing_v1: slice } : {};
  }

  private resolveRouteAndRunCostBundle(
    request: RouteAndRunRequestDto,
    input: {
      orchestrationResult?: OrchestrationResult;
      agenticTotalTokens?: number | null;
      tokensEst?: number | null;
    } = {},
  ): {
    cost_est_usd: number;
    tokens_est: number;
    cost_governance_v1: CostGovernanceObservabilityV1;
  } {
    const agenticFromResult = (
      input.orchestrationResult?.result?.agentic_observability as { total_tokens?: number } | undefined
    )?.total_tokens;
    const { costEstUsd, tokensEst } = enrichRouteAndRunCostInPlace(
      request as RouteAndRunCostGovernanceCarrier,
      {
        requestId: request.request_id,
        orchestrationTotalCost: input.orchestrationResult?.totalCost,
        agenticTotalTokens: input.agenticTotalTokens ?? agenticFromResult ?? null,
        tokensEst: input.tokensEst ?? null,
      },
    );
    return {
      cost_est_usd: costEstUsd,
      tokens_est: tokensEst,
      cost_governance_v1: buildCostGovernanceObservability(request as RouteAndRunCostGovernanceCarrier),
    };
  }

  /** PRD I3：replan 继承字段回显到 observability（网关/客户端/日志聚合） */
  private resolveReplanLineageObservability(
    request: RouteAndRunRequestDto,
    orchestrationResult: OrchestrationResult,
  ): {
    replan_previous_plan_version?: number;
    replan_previous_world_snapshot_hash_preview?: string;
    replan_new_plan_version?: number;
  } {
    const opt = request.options;
    const st = orchestrationResult.result?.state as OrchestratorState | undefined;
    const metaRc = st?.metadata?.replan_context as
      | { previous_plan_version?: number; previous_world_snapshot_hash?: string }
      | undefined;

    const fromReq =
      opt?.previous_plan_version !== undefined ||
      (typeof opt?.previous_world_snapshot_hash === 'string' && !!opt.previous_world_snapshot_hash.trim());
    const fromMeta =
      metaRc &&
      (metaRc.previous_plan_version !== undefined ||
        (typeof metaRc.previous_world_snapshot_hash === 'string' && !!metaRc.previous_world_snapshot_hash.trim()));

    if (!fromReq && !fromMeta) {
      return {};
    }

    const prevPv =
      metaRc?.previous_plan_version !== undefined && Number.isFinite(Number(metaRc.previous_plan_version))
        ? Number(metaRc.previous_plan_version)
        : opt?.previous_plan_version !== undefined && Number.isFinite(Number(opt.previous_plan_version))
          ? Number(opt.previous_plan_version)
          : undefined;

    const hashRaw =
      typeof metaRc?.previous_world_snapshot_hash === 'string'
        ? metaRc.previous_world_snapshot_hash
        : typeof opt?.previous_world_snapshot_hash === 'string'
          ? opt.previous_world_snapshot_hash
          : '';
    const hashPrev =
      typeof hashRaw === 'string' && hashRaw.trim() ? hashRaw.trim().slice(0, 64) : undefined;

    const newPv = typeof st?.plan_version === 'number' ? st.plan_version : undefined;

    const out: {
      replan_previous_plan_version?: number;
      replan_previous_world_snapshot_hash_preview?: string;
      replan_new_plan_version?: number;
    } = {};
    if (prevPv !== undefined) out.replan_previous_plan_version = prevPv;
    if (hashPrev) out.replan_previous_world_snapshot_hash_preview = hashPrev;
    if (newPv !== undefined) out.replan_new_plan_version = newPv;
    return out;
  }

  /** Decision OS：unified explainability 叙事-证据漂移监测（observability + 可选 metrics log） */
  private resolveNarrativeDriftObservability(
    request: RouteAndRunRequestDto,
    orchestrationResult: OrchestrationResult,
    unified?: UnifiedExplainabilityEnvelopeV1,
  ): { narrative_drift?: ReturnType<typeof buildNarrativeDriftObservabilitySlice> } {
    if (!unified) return {};
    const narration = (orchestrationResult.result?.state?.narration ??
      (orchestrationResult.result as { narration?: NarrationLike } | undefined)?.narration) as
      | NarrationLike
      | undefined;
    const report = assessNarrativeExplainabilityDrift({
      envelope: unified,
      narration,
    });
    const narrative_drift = buildNarrativeDriftObservabilitySlice(report);
    emitNarrativeDriftMetricEvent({
      request_id: request.request_id,
      trip_id: request.trip_id?.trim() || undefined,
      slice: narrative_drift,
    });
    return { narrative_drift };
  }

  /** Gen2.1：叙事完整性信号镜像到 observability（tracing / replay / eval；与 payload 对账） */
  private resolveNarrativeIntegrityObservability(
    request: RouteAndRunRequestDto,
    orchestrationResult: OrchestrationResult,
  ): { narrative_integrity?: ReturnType<typeof buildNarrativeIntegrityObservabilitySlice> } {
    const r = orchestrationResult.result as Record<string, unknown> | undefined;
    if (!r || r.lightweightKnowledgeQa !== true) return {};
    const report = r.narrative_integrity_report as NarrativeIntegrityReport | undefined;
    const safety = r.narrative_safety as NarrativeSafetyPayload | undefined;
    if (!report || !safety) return {};
    const narrative_integrity = buildNarrativeIntegrityObservabilitySlice(safety, report);
    emitNarrativeIntegrityMetricEvent({
      request_id: request.request_id,
      trip_id: request.trip_id?.trim() || undefined,
      slice: narrative_integrity,
    });
    return { narrative_integrity };
  }

  /** PRD I5：失败域 / 来源层 / 可重试提示（与 `result.orchestrator_robustness` 一致） */
  private resolveOrchestrationFailureObservability(
    orchestrationResult: OrchestrationResult,
  ): Record<string, unknown> {
    const meta = orchestrationResult.result?.orchestrator_robustness as
      | OrchestratorRobustnessMetadata
      | undefined;
    if (!meta) return {};
    return toOrchestrationFailureObservability(meta) as Record<string, unknown>;
  }

  private resolveTravelOntologyForPayload(
    result: unknown,
  ): DecisionState['travelOntologyState'] | undefined {
    if (!result || typeof result !== 'object') return undefined;
    const r = result as { state?: OrchestratorState; decisionState?: DecisionState };
    const fromDso = r.decisionState?.travelOntologyState;
    const fromOs = r.state ? buildTravelOntologyStateFromOrchestrator(r.state) : undefined;
    if (!fromDso) return fromOs;
    if (!fromOs) return fromDso;
    return mergeTravelOntologyState(fromDso, fromOs) ?? fromDso;
  }

  /** Schema.org 发现层（非 Runtime 语义；供 SEO / 外部摄入） */
  private resolveSchemaOrgDiscoveryForPayload(result: unknown) {
    const travelOntology = this.resolveTravelOntologyForPayload(result);
    if (!travelOntology?.nouns) return undefined;
    return travelOntologyNounsToSchemaOrgDiscovery(travelOntology.nouns, travelOntology.tripId);
  }

  private computeP4ObservabilityMetrics(orchestrationResult: OrchestrationResult): {
    step_latency_ms?: Record<string, number>;
    gate_block_rate?: number;
    skill_success_rate?: number;
  } {
    const out: { step_latency_ms?: Record<string, number>; gate_block_rate?: number; skill_success_rate?: number } = {};
    const log = this.resolveCanonicalDecisionLogForK3(orchestrationResult);
    const steps = orchestrationResult.stepsExecuted || [];

    if (log.length > 0) {
      const stepLatency: Record<string, number> = {};
      for (const e of log) {
        const ms = (e as any).metadata?.duration_ms ?? 0;
        if ((e as any).step && ms > 0) {
          stepLatency[(e as any).step] = (stepLatency[(e as any).step] ?? 0) + ms;
        }
      }
      if (Object.keys(stepLatency).length > 0) out.step_latency_ms = stepLatency;
    } else if (steps.length > 0) {
      const stepLatency: Record<string, number> = {};
      for (const s of steps) {
        if ((s as any).stepId && (s as any).duration > 0) {
          stepLatency[(s as any).stepId] = (stepLatency[(s as any).stepId] ?? 0) + (s as any).duration;
        }
      }
      if (Object.keys(stepLatency).length > 0) out.step_latency_ms = stepLatency;
    }

    const gateResult = orchestrationResult.result?.gate_result?.gate_result;
    if (gateResult !== undefined) {
      out.gate_block_rate = gateResult === 'BLOCK' ? 1 : 0;
    }

    if (steps.length > 0) {
      const ok = steps.filter((s: any) => s.success).length;
      out.skill_success_rate = ok / steps.length;
    }

    return out;
  }

  private mergeResearchDataShardsForK3(orchestrationResult: OrchestrationResult): Record<string, unknown> {
    const r = orchestrationResult.result as Record<string, unknown> | undefined;
    if (!r || typeof r !== 'object') return {};
    const st = r.state as { research_data?: Record<string, unknown> } | undefined;
    return {
      ...((st?.research_data as Record<string, unknown> | undefined) ?? {}),
      ...((r.research_data as Record<string, unknown> | undefined) ?? {}),
      ...((r.lightweight_research_data as Record<string, unknown> | undefined) ?? {}),
    };
  }

  /**
   * 编排层 `DecisionLogEntry`（trip-plan.interface：request_id/step/actor）与
   * trips/decision `DecisionLogEntry`（persona/action/reasonCodes）是两套契约；
   * PRD reasonCodes 归一化仅在 DecisionLogStorage / trips 流水线执行，此处不做混洗。
   * 5.0.1：将 `research_data.__research_budget_arbitration_decision_log` 并入 K3 三处同源 `decision_log`。
   */
  private resolveCanonicalDecisionLogForK3(orchestrationResult: OrchestrationResult): DecisionLogEntry[] {
    const r = orchestrationResult.result as {
      decision_log?: DecisionLogEntry[];
      state?: OrchestratorState;
    };
    const fromState = (r as any)?.state?.decision_log;
    const fromResult = (r as any)?.decision_log;
    const top = orchestrationResult.decisionLog ?? [];

    // 勿把「空数组」当成权威来源：轻量问答只在顶层 decisionLog 写入 DONE+RAG，
    // 若 result.state.decision_log 被初始化成 []，原先会覆盖顶层导致 explain.decision_log 为空、前端决策面板空白。
    let canonical: DecisionLogEntry[];
    if (Array.isArray(fromState) && fromState.length > 0) canonical = fromState;
    else if (Array.isArray(fromResult) && fromResult.length > 0) canonical = fromResult;
    else if (top.length > 0) canonical = top;
    else if (Array.isArray(fromState)) canonical = fromState;
    else if (Array.isArray(fromResult)) canonical = fromResult;
    else canonical = Array.isArray(top) ? top : [];

    const research = this.mergeResearchDataShardsForK3(orchestrationResult);
    const requestId = String((r as any)?.state?.request_id ?? canonical[0]?.request_id ?? '');
    appendBudgetArbitrationEntriesToDecisionLogInPlace(canonical, research, requestId);

    orchestrationResult.decisionLog = canonical;
    if ((r as any)?.state) (r as any).state.decision_log = canonical;
    if (r) (r as any).decision_log = canonical;

    return canonical;
  }

  private buildKernelExplainability(
    decisionState?: DecisionState,
  ): RouteAndRunResponseDto['explain']['kernel_explainability'] {
    if (!decisionState) return undefined;
    const violations = decisionState.constraints?.violations;
    const hints = decisionState.optimizationHints as
      | {
          method?: string;
          recommendedAlternativeId?: string;
        }
      | undefined;
    const row: NonNullable<RouteAndRunResponseDto['explain']['kernel_explainability']> = {
      dso_version: normalizeClientDsoVersion(decisionState.systemState?.version),
      last_step: decisionState.systemState?.lastStep,
      current_phase: decisionState.systemState?.currentPhase,
      cursor_step: decisionState.systemState?.cursorStep as string | undefined,
    };
    if (violations && violations.length > 0) {
      row.constraint_violations = violations.map((v) => ({
        type: v.type,
        severity: v.severity,
        detail: humanizeFeasibilityMessageForUserZh(String(v.detail ?? '')),
        ...(v.constraint ? { constraint: v.constraint } : {}),
      }));
    }
    if (hints?.method) row.optimization_method = hints.method;
    if (hints?.recommendedAlternativeId) row.recommended_alternative_id = hints.recommendedAlternativeId;

    const shadow = decisionState.harnessRuntime?.shadow_harness_events;
    if (shadow?.length) {
      row.harness_shadow_events = shadow.map((e) => ({
        kernel_phase: e.kernel_phase,
        harness_step: e.harness_step,
        run_status: e.run_status,
        harness_warning: e.harness_warning,
        validation_results: e.validation_results,
        recorded_at: e.recorded_at,
      }));
      const bad = shadow.filter((e) => e.run_status !== 'PASSED' && e.run_status !== 'REPAIRED');
      if (bad.length) {
        row.harness_shadow_summary = `SHADOW_VIOLATIONS(${bad.length}): ${bad
          .map((b) => `${b.harness_step}=${b.run_status}`)
          .join('; ')}`;
      }
    }

    const rad = decisionState.harnessRuntime?.resume_admission_step;
    if (rad !== undefined && rad !== null && String(rad).length > 0) {
      row.resume_admission = {
        step: String(rad),
        passed: decisionState.harnessRuntime?.resume_admission_passed,
      };
    }

    const rpv = decisionState.harnessRuntime?.replan_previous_plan_version;
    if (rpv !== undefined && Number.isFinite(Number(rpv))) {
      row.replan_previous_plan_version = Number(rpv);
    }
    const rph = decisionState.harnessRuntime?.replan_previous_world_snapshot_hash;
    if (typeof rph === 'string' && rph.trim()) {
      row.replan_previous_world_snapshot_hash = rph.trim();
    }

    const meaningful =
      row.dso_version !== undefined ||
      !!row.last_step ||
      !!row.current_phase ||
      !!row.cursor_step ||
      (row.constraint_violations && row.constraint_violations.length > 0) ||
      !!row.optimization_method ||
      !!row.recommended_alternative_id ||
      (row.harness_shadow_events && row.harness_shadow_events.length > 0) ||
      !!row.harness_shadow_summary ||
      !!row.resume_admission ||
      row.replan_previous_plan_version !== undefined ||
      !!row.replan_previous_world_snapshot_hash;
    return meaningful ? row : undefined;
  }

  private projectWorldConstraintMaterializationExplain(
    wm?: NonNullable<DecisionState['optimizationHints']>['worldConstraintMaterialization'],
  ):
    | NonNullable<RouteAndRunResponseDto['explain']['optimization']>['world_constraint_materialization']
    | undefined {
    if (wm === undefined) return undefined;
    return {
      applied_events: wm.appliedEvents ?? 0,
      road_ids: wm.roadIds ?? [],
      weather_dates: wm.weatherDates ?? [],
      store_version: wm.storeVersion,
      ...(wm.unifiedGraphNodeCount !== undefined
        ? { unified_graph_node_count: wm.unifiedGraphNodeCount }
        : {}),
      ...(wm.unifiedGraphEdgeCount !== undefined
        ? { unified_graph_edge_count: wm.unifiedGraphEdgeCount }
        : {}),
    };
  }

  private composeExplainUnifiedForClientPayload(params: {
    requestId: string;
    orchestrationDecisionLog: DecisionLogEntry[];
    decisionState?: DecisionState;
    orchestratorState?: OrchestratorState;
  }): {
    unified: RouteAndRunResponseDto['explain']['unified'];
    orchestratorStateForClient?: OrchestratorState;
  } {
    const unified = resolveUnifiedExplainForRouteAndRunResponse({
      requestId: params.requestId,
      orchestrationDecisionLog: params.orchestrationDecisionLog,
      decisionState: params.decisionState,
      narrationFromState: params.orchestratorState?.narration as NarrationLike | undefined,
    });
    return {
      unified,
      orchestratorStateForClient: dedupeUnifiedExplainabilityInClientOrchestratorState(
        params.orchestratorState,
        unified,
      ),
    };
  }

  private buildOptimizationExplain(
    decisionState?: DecisionState,
    orchestrationResult?: OrchestrationResult,
    request?: Pick<RouteAndRunRequestDto, 'trip_id' | 'message'>,
  ): RouteAndRunResponseDto['explain']['optimization'] {
    if (orchestrationResult && this.isItineraryAdjustSession(orchestrationResult, request)) {
      return undefined;
    }
    const hints = decisionState?.optimizationHints;
    if (!hints) return undefined;
    const verdict = hints.decisionVerdict ?? buildDecisionVerdictFromHints(hints);
    return {
      method: hints.method,
      recommended_alternative_id: hints.recommendedAlternativeId,
      meta_decision_audit: hints.metaDecisionAudit,
      emergency_mask_audit: hints.emergencyMaskAudit as any,
      decision_verdict: verdict
        ? {
            chosen_plan_id: verdict.chosen_plan_id,
            rejected_plans: verdict.rejected_plans,
            monte_carlo_summary: verdict.monte_carlo_summary,
            fallback_chain: verdict.fallback_chain,
          }
        : undefined,
      decision_verdict_narration_zh:
        hints.decisionVerdictNarrationZh ??
        formatDecisionVerdictNarrationZh(verdict, hints),
      world_constraint_materialization: this.projectWorldConstraintMaterializationExplain(
        hints.worldConstraintMaterialization,
      ),
      alternatives: hints.alternatives?.map((a) => ({
        id: a.id,
        score: a.score,
        expected_utility: a.expectedUtility,
        feasibility_probability: a.feasibilityProbability,
        confidence_interval: a.confidenceInterval,
        violations: a.violations,
      })),
    };
  }

  private buildWorldModelGuardsExplain(
    decisionState?: DecisionState,
    orchestratorState?: OrchestratorState,
  ): RouteAndRunResponseDto['explain']['world_model_guards'] {
    const rd = orchestratorState?.research_data as Record<string, unknown> | undefined;
    return projectWorldModelGuardsExplain(decisionState, rd);
  }

  private mapOrchestrationStepToUIState(
    step: OrchestrationStep,
    gateResult?: string,
    elapsedTime?: number,
  ): {
    phase: OrchestrationStep;
    ui_status:
      | 'thinking'
      | 'browsing'
      | 'verifying'
      | 'repairing'
      | 'awaiting_consent'
      | 'awaiting_confirmation'
      | 'done'
      | 'failed';
    progress_percent: number;
    message: string;
    requires_user_action: boolean;
    estimated_time_remaining_ms?: number;
    current_step_detail?: string;
  } {
    const stepProgressMap: Record<OrchestrationStep, number> = {
      INTENT_COMPILE: 5.0,
      INTAKE: 8.0,
      STATE_UPDATE: 10.0,
      RESEARCH: 18.0,
      POI_SELECTION: 24.0,
      GATE_EVAL: 28.0,
      CONTEXT_BUILD: 32.0,
      PLAN_GEN: 42.0,
      TRAVEL_COMPILE: 46.0,
      OPTIMIZE: 48.0,
      VERIFY: 55.0,
      COMPLIANCE: 62.0,
      REPAIR: 72.0,
      NARRATE: 82.0,
      FEEDBACK: 92.0,
      DONE: 100.0,
      FAILED: 0,
      TIMEOUT: 0,
      HALLUCINATION_DETECTION: 96.0,
    };

    const stepMessageMap: Record<OrchestrationStep, string> = {
      INTENT_COMPILE: '正在编译行程意图...',
      INTAKE: '正在解析请求...',
      STATE_UPDATE: '正在更新决策状态...',
      RESEARCH: '正在收集数据...',
      POI_SELECTION: '正在筛选候选地点...',
      GATE_EVAL: '正在评估行程可行性...',
      CONTEXT_BUILD: '正在构建上下文...',
      PLAN_GEN: '正在生成行程安排...',
      TRAVEL_COMPILE: '正在解析 POI、路线与依赖关系（CTRE 旅行编译）…',
      OPTIMIZE: '正在抽取优化提示...',
      VERIFY: '正在验证行程...',
      COMPLIANCE: '正在检查风险合规...',
      REPAIR: '正在修复行程问题...',
      NARRATE: '正在生成说明...',
      FEEDBACK: '正在收集反馈信号...',
      DONE: '处理完成',
      FAILED: '处理失败',
      TIMEOUT: '请求超时',
      HALLUCINATION_DETECTION: '正在检测内容真实性...',
    };

    const stepEstimatedTimeMap: Record<OrchestrationStep, number> = {
      INTENT_COMPILE: 1500,
      INTAKE: 2000,
      STATE_UPDATE: 100,
      RESEARCH: 8000,
      POI_SELECTION: 1500,
      GATE_EVAL: 5000,
      CONTEXT_BUILD: 3000,
      PLAN_GEN: 10000,
      TRAVEL_COMPILE: 4000,
      OPTIMIZE: 100,
      VERIFY: 6000,
      COMPLIANCE: 3000,
      REPAIR: 4000,
      NARRATE: 3000,
      FEEDBACK: 2000,
      DONE: 0,
      FAILED: 0,
      TIMEOUT: 0,
      HALLUCINATION_DETECTION: 2000,
    };

    const stepDetailMap: Record<OrchestrationStep, string> = {
      INTENT_COMPILE: '将自然语言需求编译为结构化行程变更（PlanDelta）',
      INTAKE: '分析您的需求，提取关键信息（目的地、日期、预算等）',
      STATE_UPDATE: '同步 OrchestratorState 到 Decision Kernel',
      RESEARCH: '查询交通、POI、开放时间、DEM地形等数据',
      POI_SELECTION: '对候选 POI 做排序与裁剪，为 PLAN_GEN 提供输入',
      GATE_EVAL: '评估路线安全性、可达性和可行性（三人格评审）',
      CONTEXT_BUILD: '构建 Context Package 供 PLAN 使用',
      PLAN_GEN: '生成详细的行程安排，包括时间、地点、交通方式',
      TRAVEL_COMPILE: '将草案编译为 CanonicalTravelGraph（POI 标准化、路线解析、依赖关联）',
      OPTIMIZE: '抽取安全/疲劳趋势等优化提示',
      VERIFY: '验证时间冲突、换乘时间、开放时间等',
      COMPLIANCE: '检查风险分类、合规要求和免责留痕',
      REPAIR: '修复发现的问题，优化行程（如需要）',
      NARRATE: '生成用户友好的行程说明和提示',
      FEEDBACK: '收集用户反馈信号用于决策优化',
      DONE: '所有步骤已完成',
      FAILED: '处理过程中出现错误',
      TIMEOUT: '请求超时，请缩小范围或稍后重试',
      HALLUCINATION_DETECTION: '检测生成内容中的事实声明，确保信息准确性',
    };

    let uiStatus:
      | 'thinking'
      | 'browsing'
      | 'verifying'
      | 'repairing'
      | 'awaiting_consent'
      | 'awaiting_confirmation'
      | 'done'
      | 'failed' = 'thinking';
    let requiresUserAction = false;

    switch (step) {
      case 'INTAKE':
      case 'RESEARCH':
      case 'POI_SELECTION':
      case 'PLAN_GEN':
      case 'NARRATE':
      case 'FEEDBACK':
        uiStatus = 'thinking';
        break;
      case 'GATE_EVAL':
        uiStatus = 'verifying';
        if (gateResult === 'NEED_CONFIRM') {
          uiStatus = 'awaiting_confirmation';
          requiresUserAction = true;
        }
        break;
      case 'VERIFY':
      case 'COMPLIANCE':
        uiStatus = 'verifying';
        break;
      case 'REPAIR':
        uiStatus = 'repairing';
        break;
      case 'DONE':
        uiStatus = 'done';
        break;
      case 'FAILED':
      case 'TIMEOUT':
        uiStatus = 'failed';
        break;
      case 'HALLUCINATION_DETECTION':
        uiStatus = 'verifying';
        break;
    }

    let estimatedTimeRemaining: number | undefined;
    if (elapsedTime !== undefined && step !== 'DONE' && step !== 'FAILED' && step !== 'TIMEOUT') {
      const currentStepTime = stepEstimatedTimeMap[step];
      const currentStepRemaining = Math.max(0, currentStepTime - elapsedTime);
      estimatedTimeRemaining = currentStepRemaining;
    }

    return {
      phase: step,
      ui_status: uiStatus,
      progress_percent: stepProgressMap[step] || 0,
      message: stepMessageMap[step] || '处理中...',
      requires_user_action: requiresUserAction,
      estimated_time_remaining_ms: estimatedTimeRemaining,
      current_step_detail: stepDetailMap[step],
    };
  }

  private generateSimplifiedExplanation(
    decisionLog: DecisionLogEntry[],
    gateResult?: GateResult,
    itinerary?: Itinerary,
  ): SimplifiedExplanation | undefined {
    if (!decisionLog || decisionLog.length === 0) return undefined;

    const keyDecisions: Array<{ step: string; decision: string; impact: 'HIGH' | 'MEDIUM' | 'LOW' }> = [];
    if (gateResult) {
      keyDecisions.push({
        step: 'GATE_EVAL',
        decision: this.translateGateResult(gateResult.gate_result),
        impact: 'HIGH',
      });
    }

    const keySteps = ['GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR'];
    for (const entry of decisionLog) {
      if (keySteps.includes((entry as any).step)) {
        keyDecisions.push({
          step: (entry as any).step,
          decision: this.simplifyDecisionMessage(entry),
          impact: this.assessDecisionImpact(entry),
        });
      }
    }

    const filteredDecisionsRaw = keyDecisions.filter((d) => d.impact === 'HIGH' || d.impact === 'MEDIUM');
    const verifyRollup = rollupVerifyIssuesFromDecisionLog(decisionLog);
    let filteredDecisions = filteredDecisionsRaw;
    if (
      gateResult?.gate_result === 'ALLOW' &&
      verifyRollup.hasConflict &&
      filteredDecisionsRaw.length > 0 &&
      filteredDecisionsRaw[0].step === 'GATE_EVAL'
    ) {
      filteredDecisions = filteredDecisionsRaw.map((d, idx) =>
        idx === 0
          ? {
              ...d,
              decision:
                '允许继续对话与改稿；当前仍有须优先处理的可执行性冲突（不同于「已全部无风险通过」）。',
            }
          : d,
      );
    }
    let summary = this.generateDecisionSummary(gateResult, filteredDecisions);
    if (gateResult?.gate_result === 'ALLOW' && verifyRollup.hasConflict) {
      const codeHint = verifyRollup.conflictCodes.length
        ? `（${humanizeVerifyConflictCodesZh(verifyRollup.conflictCodes)}）`
        : '';
      summary = `行程门禁已放行，但可执行性验证仍有关键项待解决${codeHint}；共进行 ${filteredDecisions.length} 项关键检查。`;
    }
    // 轻量问答：decision_log 通常仅有 DONE + outputs_summary（无 GATE/PLAN_GEN），避免误导性「已完成行程规划」
    if (
      !gateResult &&
      filteredDecisions.length === 0 &&
      summary === '已完成行程规划。'
    ) {
      const doneEntry = decisionLog.find((e: any) => String((e as any)?.step) === 'DONE');
      const os =
        doneEntry && typeof (doneEntry as any).outputs_summary === 'string'
          ? String((doneEntry as any).outputs_summary).trim()
          : '';
      summary = os ? os.slice(0, 800) : '轻量咨询已完成（单次编排）。';
    }

    return {
      summary,
      key_decisions: filteredDecisions.slice(0, 5),
      evidence_count: decisionLog.reduce((sum, entry) => sum + (((entry as any).evidence_refs?.length as number) || 0), 0),
      risk_tags_summary: this.buildRiskTagsSummary(itinerary),
      has_details: true,
    };
  }

  private buildRiskTagsSummary(
    itinerary?: Itinerary,
  ): Array<{ tag: ItineraryRiskTag; count: number }> | undefined {
    if (!itinerary?.days?.length) return undefined;
    const counter = new Map<ItineraryRiskTag, number>();
    for (const day of itinerary.days) {
      for (const item of (day as any).items ?? []) {
        const tags = (item as any).metadata?.risk_tags as ItineraryRiskTag[] | undefined;
        if (!tags?.length) continue;
        for (const tag of tags) counter.set(tag, (counter.get(tag) ?? 0) + 1);
      }
    }
    if (counter.size === 0) return undefined;
    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
  }

  private translateGateResult(status: string): string {
    const translations: Record<string, string> = {
      ALLOW: '已通过',
      BLOCK: '被拒绝',
      ADJUST_REQUIRED: '需要调整',
      NEED_USER_CONFIRM: '需要您确认',
    };
    return translations[status] || status;
  }

  private simplifyDecisionMessage(entry: DecisionLogEntry): string {
    return simplifyDecisionLogLineForUserZh(entry as { outputs_summary?: string; inputs_summary?: string });
  }

  private assessDecisionImpact(entry: DecisionLogEntry): 'HIGH' | 'MEDIUM' | 'LOW' {
    if ((entry as any).step === 'GATE_EVAL') return 'HIGH';
    if ((entry as any).step === 'PLAN_GEN' || (entry as any).step === 'REPAIR') return 'HIGH';
    if ((entry as any).step === 'VERIFY') return 'MEDIUM';
    return 'LOW';
  }

  private generateDecisionSummary(
    gateResult: GateResult | undefined,
    keyDecisions: Array<{ step: string; decision: string; impact: string }>,
  ): string {
    const parts: string[] = [];
    if (gateResult) parts.push(`行程${this.translateGateResult(gateResult.gate_result)}`);
    if (keyDecisions.length > 0) parts.push(`进行了${keyDecisions.length}项关键检查`);
    return parts.length > 0 ? parts.join('，') + '。' : '已完成行程规划。';
  }

  private generateAICapabilityDisplay(
    orchestrationResult: any,
    gateResult?: GateResult,
    state?: any,
  ): AICapabilityDisplay | undefined {
    if (!orchestrationResult.success && !gateResult) return undefined;

    const capabilitiesUsed: Array<{ name: string; description: string; status: 'SUCCESS' | 'PARTIAL' | 'FAILED' }> = [];

    const decisionLog = orchestrationResult.decisionLog || [];
    const verifyRollup = rollupVerifyIssuesFromDecisionLog(decisionLog);
    const skillsUsed = new Set<string>();
    for (const entry of decisionLog) {
      const toolCalls = (entry as any)?.metadata?.tool_calls;
      if (Array.isArray(toolCalls)) {
        toolCalls.forEach((call: any) => {
          if (call.skill_name) skillsUsed.add(call.skill_name);
        });
      }
    }

    if (gateResult) {
      const gateAllow = gateResult.gate_result === 'ALLOW';
      capabilitiesUsed.push({
        name: '安全评估',
        description: '评估路线安全性和可行性',
        status: gateAllow && !verifyRollup.hasConflict ? 'SUCCESS' : 'PARTIAL',
      });
    }
    if (state?.itinerary) {
      capabilitiesUsed.push({
        name: '行程生成',
        description: '生成详细的行程安排',
        status: 'SUCCESS',
      });
    }

    if (skillsUsed.has('transport.search')) {
      capabilitiesUsed.push({ name: '交通查询', description: '查询交通班次和路线', status: 'SUCCESS' });
    }
    if (skillsUsed.has('poi.search')) {
      capabilitiesUsed.push({ name: '地点搜索', description: '搜索和推荐景点', status: 'SUCCESS' });
    }
    if (skillsUsed.has('dem.get_profile') || skillsUsed.has('dem.get.profile') || skillsUsed.has('dem.getProfile')) {
      capabilitiesUsed.push({ name: '地形分析', description: '分析地形和体力消耗', status: 'SUCCESS' });
    }

    const evidenceCount = decisionLog.reduce((sum: number, entry: any) => sum + (entry.evidence_refs?.length || 0), 0);
    const dataCompleteness = evidenceCount > 0 ? Math.min(1, evidenceCount / 10) : 0.5;
    const dataFreshness = 0.9;
    const dataReliability = gateResult?.confidence || 0.8;

    const gateConfidence = gateResult?.confidence || 0.8;
    const planConfidence = state?.itinerary ? 0.85 : 0.5;
    const overallConfidence = (gateConfidence + planConfidence) / 2;

    const limitations: Array<{
      type: 'DATA_MISSING' | 'SERVICE_UNAVAILABLE' | 'UNCERTAINTY' | 'ASSUMPTION';
      description: string;
      impact: 'LOW' | 'MEDIUM' | 'HIGH';
    }> = [];

    if (dataCompleteness < 0.8) {
      limitations.push({ type: 'DATA_MISSING', description: '部分数据可能不完整', impact: 'MEDIUM' });
    }
    if (gateResult?.gate_result === 'ADJUST_REQUIRED') {
      limitations.push({ type: 'UNCERTAINTY', description: '行程需要根据实际情况调整', impact: 'MEDIUM' });
    }
    if (overallConfidence < 0.7) {
      limitations.push({ type: 'UNCERTAINTY', description: '部分决策基于估算，建议人工确认', impact: 'HIGH' });
    }

    const riskSummary = this.buildRiskTagsSummary(state?.itinerary ?? orchestrationResult?.result?.itinerary);
    if (riskSummary && riskSummary.length > 0) {
      const top = riskSummary.slice(0, 3);
      const labels = top.map((x) => `${x.tag}(${x.count})`).join('、');
      const highImpactTags = new Set<ItineraryRiskTag>(['SAFETY', 'HEALTH']);
      const hasHigh = top.some((x) => highImpactTags.has(x.tag));
      limitations.push({
        type: 'UNCERTAINTY',
        description: `风险标签摘要：${labels}`,
        impact: hasHigh ? 'HIGH' : 'MEDIUM',
      });
    }

    return {
      success: orchestrationResult.success,
      capabilities_used: capabilitiesUsed,
      data_quality: {
        completeness: dataCompleteness,
        freshness: dataFreshness,
        reliability: dataReliability,
      },
      confidence: {
        overall: overallConfidence,
        gate_evaluation: gateConfidence,
        plan_generation: planConfidence,
      },
      limitations: limitations.length > 0 ? limitations : undefined,
    };
  }
}
