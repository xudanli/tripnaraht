/**
 * Lightweight 知识问答实现体（从 ClaudeOrchestrator 迁出）。
 * 依赖经 LightweightKnowledgeHost 注入，无 Nest DI。
 */

import {
  type LlmTokenContext,
} from '../../llm/services/llm.service';
import {
  LlmProvider,
} from '../../llm/dto/llm-request.dto';
import {
  RoutingDecision,
  OrchestrationResult,
  AgentContext,
} from '../interfaces/claude-orchestration.interface';
import {
  RouteAndRunRequestDto,
} from '../dto/route-and-run.dto';
import {
  isFactualMacroStatQuery,
  isLocalClockOrTimezoneFactQuery,
  isBoundTripLodgingDiningPlanQuery,
  isTripStatusOverviewQuery,
  isTodayWeatherFactQuery,
  isWeatherRoadConditionFocusedQuery,
  shouldPullSafetravelAdvisoriesForLightweightIceland,
  isWestfjordsLegTransportPreferenceConsultation,
  isHotelInventorySearchQuery,
} from '../utils/orchestration-signals.util';
import { isDayLodgingChoiceQuery } from '../utils/day-lodging-choice.util';
import { readAgentTaskContract } from '../harness/compile-agent-task-contract.util';
import { resolveTaskContextSlice } from '../harness/resolve-task-context-slice.util';
import {
  buildTripLodgingCoverageAnswerZh,
  formatTripLodgingCoveragePromptLines,
  isLodgingGapDirectAnswerQuery,
  loadTripLodgingCoverageFactSlice,
} from '../harness/trip-lodging-coverage-fact.util';
import { isActivityAdvanceBookingConsultQuery } from '../chat/build-activity-booking-chat-cards.util';
import { isXhsCommunityEvidenceConsultQuery } from '../chat/build-xhs-note-chat-cards.util';
import {
  buildCarRentalChatCards,
  isCarRentalChatCardQuery,
} from '../chat/build-car-rental-chat-cards.util';
import { isExecutableFlightInventoryQuery } from '../utils/flight-inventory-signals.util';
import {
  buildDecisionStateShadow,
  isActivityDecisionFamily,
  loadActivityDayConflictHint,
  serializeActivityDecisionShadow,
} from '../decision-state';
import { buildNarrationFocusGroundingPromptLines } from './build-narration-focus-grounding.util';
import {
  buildCarRentalConsultationBodyPromptLines,
  buildLightweightConsultationRolePromptLines,
  buildLightweightConsultationUiBlockPromptLines,
  buildStructuredConsultationDensityPromptLines,
  formatDenseConsultationAnswerWithLineBreaks,
  isExplicitDetailConsultationQuery,
  resolveLightweightConsultationVerbosity,
} from '../utils/lightweight-consultation-brevity.util';
import {
  buildLightweightTemporalGroundingZhLines,
  buildLightweightTemporalRepairSuffix,
  computeDaysUntilTripStartYmd,
  parseTripDatesFromLightweightContext,
  shouldRepairLightweightTemporalHallucination,
} from '../utils/temporal-grounding.util';
import {
  buildInventorySnapshotsMeta,
} from '../inventory/lightweight-live-inventory.registry';
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
  evaluateIcelandLightweightFroad2wdFastFail,
} from '../utils/iceland-lightweight-froad-2wd-fast-fail.util';
import {
  evaluateIcelandLightweightRedAlertFastFail,
} from '../utils/iceland-lightweight-red-alert-fast-fail.util';
import {
  isDiningRecommendationQuery,
  messageHasDiningLocationAnchor,
  tripSummaryIndicatesNonEmptyItineraryDraft,
} from '../utils/trip-dining-consultation.util';
import {
  buildLunchStrategyPromptLines,
} from '../utils/lunch-strategy-briefing.util';
import {
  buildLightweightHardOntologyAppendixLines,
  buildOntologyEvidenceDisplayLinesZh,
  collectMatchedOntologyRegionDefinitions,
} from '../utils/lightweight-hard-road-ontology-appendix.util';
import {
  type OntologyRegionRoadStatusPayload,
} from '../../infrastructure/external/road-is/ontology-road-status-provider.service';
import {
  type IcelandRentalGuidanceOutput,
} from '../../skills/world/iceland-rental-guidance.skill';
import {
  type SafetravelGetAdvisoriesOutput,
} from '../../skills/world/safetravel-get-advisories.skill';
import {
  buildDefaultTripConsultationSuggestedOperations,
  buildDiningAnchorSuggestedOperations,
  extractSuggestedOperationsFromAnswer,
  isSilentVoteCreateIntentMessage,
  mergeSuggestedOperations,
  type TripConsultationSuggestedOperation,
} from '../utils/trip-consultation-suggested-operations.util';
import { buildCnClassicRouteLightweightSupplement } from './lightweight-knowledge-helpers.runner';
import {
  extractConsultationDashboardFromAnswer,
} from '../utils/consultation-dashboard-extract.util';
import {
  shouldIncludeNamedDraftAppendixForLightweightConsultation,
} from '../../trips/utils/trip-prompt-summary.util';
import {
  runWithDecisionContextAsync,
} from '../../trips/reality-kernel/reality-context.storage';
import {
  isRagRealityPolicyGateActive,
} from '../../rag/reality-policy/rag-reality-policy.env';
import {
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import {
  ErrorType,
} from '../interfaces/error-types.interface';
import {
  classifyOrchestratorFailure,
  type OrchestratorRobustnessMetadata,
} from '../utils/orchestrator-failure-taxonomy.util';
import {
  readFitnessProfileLinesForLightweightQa,
  readIcelandMarketPriorForLightweightQa,
} from '../orchestration/graph/nodes';
import {
  buildPlanningPhaseTripOverviewPromptLines,
  parseTripStartDateFromContextLines,
  shouldSkipAgentReadinessPackCheck,
} from '../utils/agent-readiness-phase.util';
import {
  isActivityRecommendationQuery,
  loadWishlistPromptInjectionForAgent,
} from '../../trips/wishlist/utils/wish-prompt-injection.util';
import { resolveTeamFitnessForActivityBooking } from '../utils/team-fitness-activity-booking.util';

import type { LightweightKnowledgeHost } from './lightweight-knowledge.host';

/**
 * 轻量知识问答：与路由层 DATA_LOOKUP / GENERIC_QA / RAG_QA 对齐，跳过 Skill 选择与 itinerary 类缺参校验。
 */
type LiveSensorAuditRow = {
  tool_id: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
  orchestrator_robustness?: OrchestratorRobustnessMetadata;
};

export async function runLightweightKnowledgeQueryPath(
  host: LightweightKnowledgeHost,
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
      const taskContract = readAgentTaskContract(request);
      let taskContextSlice: Awaited<ReturnType<typeof resolveTaskContextSlice>> = null;
      if (effectiveTripId && !lightweightTriviaFact) {
        try {
          if (taskContract) {
            taskContextSlice = await resolveTaskContextSlice({
              prisma: host.prisma,
              tripId: effectiveTripId,
              contract: taskContract,
              message: request.message ?? '',
            });
          } else if (
            isLodgingGapDirectAnswerQuery(request.message ?? '') ||
            /哪一天没住宿|哪天没住宿|还缺住宿|缺住宿/.test(request.message ?? '')
          ) {
            /** 入口未挂 contract 时仍按 Registry 最小切片答缺口（防测/旁路） */
            const lodging = await loadTripLodgingCoverageFactSlice(host.prisma, effectiveTripId);
            if (lodging) {
              taskContextSlice = {
                registryKey: 'TRIP_QUERY_LODGING',
                promptLines: formatTripLodgingCoveragePromptLines(lodging),
                directAnswerZh: isLodgingGapDirectAnswerQuery(request.message ?? '')
                  ? buildTripLodgingCoverageAnswerZh(lodging)
                  : undefined,
                lodgingCoverage: lodging,
                skipFullTripSummary: true,
              };
            }
          }
        } catch (e: any) {
          host.logger.warn(
            `[LightweightQA] task context slice failed trip_id=${effectiveTripId}: ${e?.message ?? e}`,
          );
        }
      }

      /** CASE-Q01：住宿缺口确定性短答，不进 LLM / 不全量摘要 */
      if (taskContextSlice?.directAnswerZh) {
        const duration = Math.max(0, Date.now() - startTime);
        host.logger.log(
          `[LightweightQA] task_context_direct_answer key=${taskContextSlice.registryKey} trip_id=${effectiveTripId} ms=${duration}`,
        );
        const lodgingShadow = buildDecisionStateShadow({
          message: request.message ?? '',
          lodgingHints: {
            message: request.message ?? '',
            tripId: effectiveTripId || null,
            lodgingCoverage: taskContextSlice.lodgingCoverage ?? null,
          },
        });
        context.decisionStateShadow = lodgingShadow;
        return {
          success: true,
          status: 'DONE',
          technicalSuccess: true,
          userTaskCompleted: true,
          answerText: taskContextSlice.directAnswerZh,
          result: {
            routingDecision: {
              route: 'SYSTEM1_API',
              confidence: 1,
              reasoning: 'task_context_lodging_coverage_direct',
              budget: {
                max_seconds: 5,
                max_steps: 1,
                max_browser_steps: 0,
              },
              requiredCapabilities: ['qa'],
              consentRequired: false,
              selected_path: 'QA_LIGHT_DIRECT',
            } satisfies RoutingDecision,
            intentAnalysis: {
              intentType: 'simple_query',
              complexity: 'simple',
              requiredCapabilities: ['qa'],
              confidence: 1,
              reasoning: 'task_context_lodging_coverage_direct',
            },
            lightweightKnowledgeQa: true,
            task_context_direct_answer: true as const,
            task_context_registry_key: taskContextSlice.registryKey,
            lodging_coverage: taskContextSlice.lodgingCoverage
              ? {
                  nights_expected: taskContextSlice.lodgingCoverage.nightsExpected,
                  nights_covered: taskContextSlice.lodgingCoverage.nightsCovered,
                  missing_day_numbers: taskContextSlice.lodgingCoverage.missingDayNumbers,
                  covered_day_numbers: taskContextSlice.lodgingCoverage.coveredDayNumbers,
                }
              : undefined,
            decisionStateShadow: serializeActivityDecisionShadow(lodgingShadow),
            routingTaskType: context.routingTaskType,
          },
          stepsExecuted: [
            {
              stepId: 'task_context_lodging_coverage',
              skillName: 'harness.trip_lodging_coverage',
              success: true,
              duration,
              result: {
                registry_key: taskContextSlice.registryKey,
                missing_day_numbers: taskContextSlice.lodgingCoverage?.missingDayNumbers ?? [],
              },
            },
          ],
          totalDuration: duration,
        };
      }

      if (effectiveTripId && !lightweightTriviaFact) {
      if (taskContextSlice?.skipFullTripSummary && taskContextSlice.promptLines.length > 0) {
        tripContextLines = [...taskContextSlice.promptLines];
      } else {
        const summary = await host.resolveTripPromptSummaryForLightweightQa(effectiveTripId, request);
        if (summary) {
          tripContextLines = [
            '以下为本系统中该关联行程的已知信息（请据此回答季节、时长与目的地相关建议；勿声称无法读取日期或行程概况；未列出的活动/住宿等细节仍勿编造）：',
            summary,
          ];
        }
        if (taskContextSlice?.promptLines?.length) {
          tripContextLines.push('', ...taskContextSlice.promptLines);
        }
      }
      try {
        const wishBlock = await loadWishlistPromptInjectionForAgent(
          host.prisma,
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
        host.logger.warn(
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

    /** 活动预订：注入团队体能木桶（协作者提交状态），勿只看主账号 */
    let teamFitnessActivityMeta: Awaited<
      ReturnType<typeof resolveTeamFitnessForActivityBooking>
    > = null;
    if (effectiveTripId && !lightweightTriviaFact) {
      teamFitnessActivityMeta = await resolveTeamFitnessForActivityBooking({
        prisma: host.prisma,
        tripId: effectiveTripId,
        message: request.message,
      });
      if (teamFitnessActivityMeta?.promptLines.length) {
        tripContextLines =
          tripContextLines.length > 0
            ? [...tripContextLines, '', ...teamFitnessActivityMeta.promptLines]
            : [...teamFitnessActivityMeta.promptLines];
      }
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
    if (!lightweightTriviaFact && ontologyHitDefs.length > 0 && host.ontologyRoadStatusProvider) {
      const tOnt = Date.now();
      roadStatusByOntologyId = await host.ontologyRoadStatusProvider.summarizeForOntologyNodeIds(
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
        const tripForLunch = await host.prisma.trip.findUnique({
          where: { id: effectiveTripId },
          select: { metadata: true, pacingConfig: true, destination: true },
        });
        if (tripForLunch) {
          lunchStrategyPromptLines = buildLunchStrategyPromptLines(tripForLunch);
        }
      } catch (e: any) {
        host.logger.warn(
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
      !host.isCarRentalOrDrivingTravelQuery(msgForNamedPoi) &&
      (host.isPreparationGearTravelQuery(msgForNamedPoi) ||
        /徒步|登山|爬山|步道|长线|\b(hiking|trekking|trail)\b/i.test(msgForNamedPoi));
    const carRentalNamedPoiConsult =
      Boolean(effectiveTripId) &&
      needsNamedDraftAppendixForLightweight &&
      !westfjordsAirConsult &&
      !weatherRoadFocused &&
      host.isCarRentalOrDrivingTravelQuery(msgForNamedPoi);
    /** 绑定行程的轻量问：规划阶段不跑 Readiness Pack */
    const skipReadinessPack = shouldSkipAgentReadinessPackCheck(
      request,
      parseTripStartDateFromContextLines(tripContextLines),
      request.message ?? '',
    );
    const creAcquisition = context.contextRequirementPlan?.acquisition;
    const creSlimLoadRaw = creAcquisition?.slimLoad === true;
    const msgForLiveSensors = request.message ?? '';
    /** slimLoad 本意是跳过重上下文；库存/预订检索例外，必须跑对应 live MCP */
    const hotelInventoryLive =
      isHotelInventorySearchQuery(msgForLiveSensors) ||
      isDayLodgingChoiceQuery(msgForLiveSensors);
    const flightInventoryLive = isExecutableFlightInventoryQuery(msgForLiveSensors);
    const activityBookingLive = isActivityAdvanceBookingConsultQuery(msgForLiveSensors);
    const xhsCommunityLive = isXhsCommunityEvidenceConsultQuery(msgForLiveSensors);
    const diningLive = isDiningRecommendationQuery(msgForLiveSensors);
    const carRentalLive =
      isCarRentalChatCardQuery(msgForLiveSensors) ||
      /推荐租车|租车公司|车行推荐|哪家租车|租车报价/i.test(msgForLiveSensors);
    const creSlimLoad =
      creSlimLoadRaw &&
      !hotelInventoryLive &&
      !flightInventoryLive &&
      !activityBookingLive &&
      !xhsCommunityLive &&
      !diningLive &&
      !carRentalLive;
    const wantReadinessForLightweight =
      Boolean(effectiveTripId) &&
      !lightweightTriviaFact &&
      !creSlimLoad &&
      !!host.readinessService &&
      !skipReadinessPack;

    const shouldStPull =
      !lightweightTriviaFact &&
      !creSlimLoad &&
      shouldPullSafetravelAdvisoriesForLightweightIceland({
        message: request.message ?? '',
        tripContextJoined: tripCtxJoined,
        hasAnchoredTripFact,
        weatherRoadFocused,
      });
    const stSkill = host.safetravelGetAdvisoriesSkill;
    const stPullP =
      shouldStPull && stSkill
        ? (async () => {
            const t0 = Date.now();
            try {
              const out = await stSkill.execute({ max_items: 40 });
              return { out, ms: Math.max(0, Date.now() - t0) };
            } catch (e: any) {
              host.logger.warn(
                `[Lightweight] SafeTravel.get_advisories failed request_id=${request.request_id}: ${e?.message ?? e}`,
              );
              return { out: null as SafetravelGetAdvisoriesOutput | null, ms: 0 };
            }
          })()
        : Promise.resolve({ out: null as SafetravelGetAdvisoriesOutput | null, ms: 0 });

    const emptyXhsBranch = {
      audits: [] as LiveSensorAuditRow[],
      block: null as string | null,
      xhsRouteRunUi: undefined as
        | {
            xhs_note_cards: Array<Record<string, unknown>>;
            xhs_search_meta: Record<string, unknown>;
          }
        | undefined,
    };
    const [wBranch, fBranch, hBranch, rBranch, aBranch, dBranch, xBranch, readinessSupplement, structuredRagBiasZh, gBranch, stPack] =
      lightweightTriviaFact || creSlimLoad
      ? [
          { audits: [] as LiveSensorAuditRow[], block: null },
          { audits: [] as LiveSensorAuditRow[], block: null },
          { audits: [] as LiveSensorAuditRow[], block: null },
          { audits: [] as LiveSensorAuditRow[], block: null },
          { audits: [] as LiveSensorAuditRow[], block: null },
          { audits: [] as LiveSensorAuditRow[], block: null },
          emptyXhsBranch,
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
          host.runLiveWeatherSensorBranch(request, context, effectiveTripId),
          host.runLiveFlightSensorBranch(request, context, effectiveTripId),
          host.runLiveHotelSensorBranch(request, context, effectiveTripId),
          host.runLiveCarRentalSensorBranch(request, context, effectiveTripId),
          host.runLiveActivitySensorBranch(
            request,
            context,
            effectiveTripId,
            teamFitnessActivityMeta?.meta ?? undefined,
          ),
          host.runLiveRestaurantSensorBranch(request, context, effectiveTripId),
          host.runLiveXhsSensorBranch(request, context, effectiveTripId),
          host.runLightweightReadinessSupplement(effectiveTripId, request.message ?? '', wantReadinessForLightweight),
          host.resolveTripnaraStructuredRagBiasForLightweight(request),
          host.runIcelandRentalGuidanceLightweightBranch(request, tripCtxJoined),
          stPullP,
        ]);
    const tripHealthSupplement =
      (tripStatusOverview || tripLodgingDiningPlan) && effectiveTripId
        ? await host.runLightweightTripHealthSupplement(effectiveTripId)
        : null;
    const liveSensorAudit: LiveSensorAuditRow[] = [
      ...wBranch.audits,
      ...fBranch.audits,
      ...hBranch.audits,
      ...rBranch.audits,
      ...aBranch.audits,
      ...dBranch.audits,
      ...xBranch.audits,
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
      : await host.buildDataLookupRagSupplement(
          request.message,
          structuredRagBiasZh,
          creAcquisition,
        );
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

    const explicitDetailConsult = isExplicitDetailConsultationQuery(
      request.message ?? '',
      msgLower,
    );
    const consultationVerbosity = resolveLightweightConsultationVerbosity({
      triviaFact: lightweightTriviaFact,
      tripStatusOverview,
      tripLodgingDiningPlan,
      explicitDetail: explicitDetailConsult && !weatherRoadFocused && !todayWeatherFocused,
    });
    const consultationUiMarkers = {
      uiStart: '<<<CONSULTATION_UI_JSON>>>',
      uiEnd: '<<<END_CONSULTATION_UI_JSON>>>',
      opsStart: '<<<SUGGESTED_OPS_JSON>>>',
      opsEnd: '<<<END_SUGGESTED_OPS_JSON>>>',
    };

    const prompt = [
      ...(clockFactOnly
        ? [
            ...buildLightweightConsultationRolePromptLines('trivia'),
            ...host.buildLightweightClockFactPromptLines(request.message ?? ''),
          ]
        : macroStatFactOnly
          ? [
              ...buildLightweightConsultationRolePromptLines('trivia'),
              ...host.buildLightweightMacroStatFactPromptLines(),
            ]
          : [
              ...buildLightweightConsultationRolePromptLines(consultationVerbosity),
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
            ...(consultationVerbosity === 'compact'
              ? ['【快答】接驳结论优先：可行/不可行 + 关键改动天数；细节点到为止。']
              : []),
          ]
        : []),
      ...(weatherRoadFocused
        ? [
            '【本轮主旨】用户主要关心目的地**近期天气要点**与**道路/风况/封路或官方出行提示**，请结合上文行程的**日期与经过区域**组织回答。',
            '优先使用下文「实时天气传感器」摘录（若有）、准备度与知识库中与气象、大风开门、封路或行车相关的条目；若无可靠实时摘录，须说明时效与信息来源限制，并给出官方核验渠道示例（如 vedur.is、road.is、SafeTravel）。',
            '说明「当前无法拿到某类实时数据」时，必须以【UTC 参考 / 当前时刻】与【相对行程】中的日期计算距出发天数；禁止编造「当前是某年某月」或与 UTC 参考不一致的年月。',
            '**不要**套用「行程进度/概览」式结构去展开住宿、餐饮、亮点盘点或长篇租车攻略；除非用户同时明确要求评估行程总体准备度。',
            '【快答】首段直接给天气/路况结论；官方链接与假设各一句即可。',
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
            ...(consultationVerbosity === 'compact'
              ? ['【快答】装备清单最多 5 项；勿展开无关行程体检。']
              : []),
          ]
        : []),
      ...(carRentalNamedPoiConsult
        ? [
            '【本轮主旨】用户关心租车、自驾、路况或用车。若上文含「草案地点速览」与「按日骨架」，正文须结合**草案中的 Place 名或备注**与**各日日程项类型**，说明取还车城镇是否与过夜地/活动衔接合理、哪些日可能长距驾驶或涉及碎石路/F 路等（勿编造速览未出现的地点）；若骨架未体现用车需求，须如实说明并给目的地级建议。',
            ...(consultationVerbosity === 'compact'
              ? ['【快答】先给车型/取还建议结论，再最多 3 条注意点。']
              : []),
          ]
        : []),
      ...(carRentalLive ? buildCarRentalConsultationBodyPromptLines(true) : []),
      ...(tripStatusOverview
        ? skipReadinessPack
          ? [
              ...buildStructuredConsultationDensityPromptLines('overview'),
              ...buildPlanningPhaseTripOverviewPromptLines(),
            ]
          : [
            ...buildStructuredConsultationDensityPromptLines('overview'),
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
            ...buildStructuredConsultationDensityPromptLines('lodging_dining'),
            '【住宿+餐饮方案问法】用户要的是**按晚/按日**的住宿与用餐策略（结合当前草稿路线），而非整段重规划或仅复述 Gate 门控结论。',
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
      ...(consultationVerbosity === 'structured' &&
      explicitDetailConsult &&
      !tripStatusOverview &&
      !tripLodgingDiningPlan
        ? buildStructuredConsultationDensityPromptLines('explicit_detail')
        : []),
      ...tripContextLines,
      ...(hardOntologyAppendixLines.length > 0 ? hardOntologyAppendixLines : []),
      ...(readinessSupplement
        ? [
            '【出发准备度摘录（Readiness Pack + 工作台 /score 同源）】衡量能否出发（证据覆盖、交通确定性、阻塞项等）。正文「准备度小结」须引用此处 **xx/100** 与阻塞清单；**禁止**用下方 analyzeHealth 分数替代。',
            readinessSupplement,
          ]
        : []),
      // 无行程绑定时仍可注入 G318/G211/青甘等参考骨架（有 readiness 时已内嵌，避免重复）
      ...(!readinessSupplement
        ? (() => {
            const classic = buildCnClassicRouteLightweightSupplement(request.message ?? '');
            return classic
              ? [
                  '【中国经典自驾参考骨架】用户话术命中经典/小众自驾线时的静态按日参考（非实时路况、非强制行程）。规划建议须对齐此骨架的过夜地与长距驾驶日，并提示季节窗口与预约。',
                  classic,
                ]
              : [];
          })()
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
      ...(aBranch.block ? [aBranch.block] : []),
      ...(xBranch.block ? [xBranch.block] : []),
      ...(dBranch.block ? [dBranch.block] : []),
      ...(rBranch.block
        ? [
            Array.isArray(rBranch.carRentals) && rBranch.carRentals.length > 0
              ? '若上文含「实时租车检索 MCP」摘录，正文可概括车型档位与价格区间，并注明以预订平台实时报价为准。'
              : '若上文提示 Booking 实时报价不可用，正文须明确「以下为本地车行/比价目录参考，非 Booking 实时价」，并结合卡片点名 2～3 家；勿编造具体日租价格。',
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
        ? hotelInventoryLive
          ? [
              '【界面与正文分工】结果载荷已含结构化房源。正文请先给住宿区域结论，再点名 2～3 家最匹配房源（中文名优先）及大致价位；勿逐晚长列表抄英文名。',
            ]
          : [
            '【界面与正文分工】结果载荷已包含结构化房源与 accommodation_night_groups（按晚分组）。正文请勿使用「住宿推荐方案」等标题逐晚罗列房源英文名、价格或星级，勿复制卡片清单。',
            '正文仅保留较短策略：环岛/分段住宿思路、预订顺序与注意事项。未采样到的夜晚用一两句话说明可后续补充查询即可。',
          ]
        : []),
      ...buildNarrativeSafetyPromptLines(narrativeSafety),
      ...(ragSupplement ? [ragSupplement] : []),
      ...(effectiveTripId && !lightweightTriviaFact
        ? buildLightweightConsultationUiBlockPromptLines({
            verbosity: consultationVerbosity,
            markers: consultationUiMarkers,
          })
        : []),
      ...buildNarrationFocusGroundingPromptLines({
        tripContextJoined: tripCtxJoined,
        message: request.message ?? '',
      }),
      '',
      `用户问题：${request.message}`,
    ]
      .filter(Boolean)
      .join('\n');

    let answerText: string;
    let repairStartedAt = 0;
    let narrativeIntegrityReport: NarrativeIntegrityReport | undefined;
    let llmNetworkFallback: { provider: LlmProvider; error_message: string } | undefined;
    const lightweightHttpTimeoutMs = host.resolveLightweightLlmHttpTimeoutMs();
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
      answerText = await host.llmService.callLlmWithSchema(
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
      if (anchoredForRepair && host.lightweightAnswerImpliesMissingTripContext(answerText)) {
        repairStartedAt = Date.now();
        const repairPrompt =
          prompt +
          '\n\n【系统纠正】摘要已锁定目的地与日期（见上文「事实签名」）。请重写回答：删除索要目的地或声称「未告知目的地/未指定地点」的语句，直接给出针对该目的地与出行区间的建议。' +
          (effectiveTripId && !lightweightTriviaFact
            ? consultationVerbosity === 'compact'
              ? `\n\n【输出完整性】若上文含建议操作块，重写后保留精简 ${'<<<SUGGESTED_OPS_JSON>>>'}（1～2 条）；CONSULTATION_UI 可按上文「可选」规则省略。`
              : `\n\n【输出完整性】若上文要求输出 ${'<<<CONSULTATION_UI_JSON>>>'} … ${'<<<END_CONSULTATION_UI_JSON>>>'} 以及 ${'<<<SUGGESTED_OPS_JSON>>>'} … ${'<<<END_SUGGESTED_OPS_JSON>>>'}，重写后仍须在文末按顺序保留更新后的两块（先 Dashboard 单行对象，再建议操作单行数组）。`
            : '');
        answerText = await host.llmService.callLlmWithSchema(llmProvider, repairPrompt, undefined, {
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
            ? consultationVerbosity === 'compact'
              ? `\n\n【输出完整性】若上文含建议操作块，重写后保留精简 ${'<<<SUGGESTED_OPS_JSON>>>'}（1～2 条）；CONSULTATION_UI 可按上文「可选」规则省略。`
              : `\n\n【输出完整性】若上文要求输出 ${'<<<CONSULTATION_UI_JSON>>>'} … ${'<<<END_CONSULTATION_UI_JSON>>>'} 以及 ${'<<<SUGGESTED_OPS_JSON>>>'} … ${'<<<END_SUGGESTED_OPS_JSON>>>'}，重写后仍须在文末按顺序保留更新后的两块。`
            : '');
        answerText = await host.llmService.callLlmWithSchema(
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
        host.logger.warn(
          `[Lightweight] temporal hallucination repair request_id=${request.request_id} utc=${lightweightNow.toISOString()}`,
        );
      }

      const integrityOutcome = await enforceNarrativeIntegrityPipeline({
        answerText,
        safety: narrativeSafety,
        basePrompt: prompt,
        callLlm: (retryPrompt) =>
          host.llmService.callLlmWithSchema(llmProvider, retryPrompt, undefined, {
            request_id: request.request_id,
            state_machine_step: 'INTAKE' as OrchestrationStep,
            sub_agent: 'Orchestrator' as SubAgentType,
            ...lightweightLlmTokenBase,
          }),
      });
      answerText = integrityOutcome.answerText;
      narrativeIntegrityReport = integrityOutcome.report;
      if (lightweightTriviaFact) {
        answerText = host.stripConsultationPromptLeakageFromLightweightAnswer(answerText);
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
          include_silent_vote: isSilentVoteCreateIntentMessage(request.message ?? ''),
        }),
      );
    }

    // 抽取 <<<CONSULTATION_UI_JSON>>> / <<<SUGGESTED_OPS_JSON>>> 后，去掉模型误粘贴的块标题行（用户不应看到）
    finalAnswerText = host.stripConsultationPromptLeakageFromLightweightAnswer(finalAnswerText);
    finalAnswerText = host.coerceLightweightKnowledgeUserVisibleAnswer(finalAnswerText, request);
    /** 全部轻量咨询正文统一换行排版（短事实题除外） */
    if (!lightweightTriviaFact) {
      finalAnswerText = formatDenseConsultationAnswerWithLineBreaks(finalAnswerText);
    }

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

    const focusDayForMds =
      context.contextRequirementPlan?.target?.dayIndex ??
      (request.options as { focus_day?: number } | undefined)?.focus_day ??
      null;
    const activityDayConflictHint =
      effectiveTripId &&
      isActivityDecisionFamily(request.message ?? '') &&
      focusDayForMds != null
        ? await loadActivityDayConflictHint({
            prisma: host.prisma,
            tripId: effectiveTripId,
            focusDayIndex: focusDayForMds,
            activityHint: request.message ?? '',
          })
        : null;

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
        ...(context.contextRequirementPlan
          ? {
              contextRequirementPlan: {
                operation: context.contextRequirementPlan.operation,
                nextAction: context.contextRequirementPlan.nextAction,
                blockingGaps: context.contextRequirementPlan.blockingGaps.map((g) => g.key),
                acquisition: context.contextRequirementPlan.acquisition,
                requirements: context.contextRequirementPlan.requirements.map((r) => ({
                  key: r.key,
                  status: r.status,
                  blocking: r.blocking,
                  necessity: r.necessity,
                })),
              },
            }
          : {}),
        /** ASK/CRE slim：只暴露 Canonical，禁止 latent 全量进结果/后续 Prompt */
        realityLoad: {
          mode: 'CANONICAL_ONLY' as const,
          latentInjected: false,
          decisionSnapshotId: context.realityObservationSnapshot?.decisionSnapshot?.snapshotId,
          observedFactKeys:
            context.realityObservationSnapshot?.canonicalWorldState.observedFacts.map(
              (f) => f.key,
            ) ?? [],
          derivedFactKeys:
            context.realityObservationSnapshot?.canonicalWorldState.derivedFacts.map(
              (f) => f.key,
            ) ?? [],
        },
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
        ...(() => {
          if (!carRentalLive) return {};
          const bookingRows = Array.isArray(rBranch.carRentals)
            ? (rBranch.carRentals as Array<Record<string, unknown>>)
            : [];
          const cards = buildCarRentalChatCards({
            userMessage: request.message ?? '',
            bookingResults: bookingRows.length ? bookingRows : undefined,
            icelandRentalGuidance: gBranch.guidance
              ? (gBranch.guidance as unknown as Record<string, unknown>)
              : null,
            carRentalSearchMeta: rBranch.carRentalSearchMeta ?? null,
          });
          if (!cards.length) return {};
          return {
            schema_id: 'tripnara/chat_car_rental_cards@v1',
            car_rental_cards: cards,
            /** Booking 无行或 Direct 目录行：用卡片填充 car_rentals，兼容只读该字段的前端 */
            ...(!bookingRows.length ||
            bookingRows.every(
              (r) =>
                r &&
                typeof r === 'object' &&
                (r.source === 'catalog_fallback' || r.source === 'browserbase'),
            )
              ? { car_rentals: cards }
              : {}),
          };
        })(),
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
        ...(aBranch.activityRouteRunUi
          ? {
              activities: aBranch.activityRouteRunUi.activities,
              activity_booking_cards: aBranch.activityRouteRunUi.activities,
              activity_search_meta: aBranch.activityRouteRunUi.activity_search_meta,
            }
          : {}),
        ...(xBranch.xhsRouteRunUi
          ? {
              xhs_note_cards: xBranch.xhsRouteRunUi.xhs_note_cards,
              xhs_search_meta: xBranch.xhsRouteRunUi.xhs_search_meta,
            }
          : {}),
        /** 传感器/切片后重投影 MDS（Activity / Lodging） */
        ...(() => {
          const msg = request.message ?? '';
          const focusDayIndex =
            context.contextRequirementPlan?.target?.dayIndex ??
            (request.options as { focus_day?: number } | undefined)?.focus_day ??
            null;
          const meta = aBranch.activityRouteRunUi?.activity_search_meta as
            | Record<string, unknown>
            | undefined;
          const teamFit =
            meta?.team_fitness && typeof meta.team_fitness === 'object'
              ? (meta.team_fitness as {
                  floor_level?: string | null;
                  missing_count?: number;
                  fit?: string | null;
                })
              : teamFitnessActivityMeta?.meta;
          const refined = buildDecisionStateShadow({
            message: msg,
            activityHints: {
              message: msg,
              focusDayIndex,
              teamFitness: teamFit
                ? {
                    floor: teamFit.floor_level ?? (teamFit as { floor?: string }).floor ?? null,
                    missingCount:
                      teamFit.missing_count ??
                      (teamFit as { missingCount?: number }).missingCount ??
                      0,
                    fit: teamFit.fit ?? null,
                  }
                : null,
              activitySearchMeta: meta
                ? {
                    mode: String(meta.mode ?? '') || null,
                    probed: Number(meta.probed ?? 0),
                    browserbase_available: Boolean(meta.browserbase_available),
                    error: meta.error != null ? String(meta.error) : null,
                  }
                : null,
              dayConflict: activityDayConflictHint ?? { status: 'UNKNOWN' },
            },
            lodgingHints: {
              message: msg,
              tripId: effectiveTripId || null,
              focusDayIndex,
              lodgingCoverage: taskContextSlice?.lodgingCoverage ?? null,
            },
            transportHints: {
              message: msg,
              tripId: effectiveTripId || null,
              focusDayIndex,
              rentalGuidanceAvailable: Boolean(gBranch.guidance),
            },
            diningRiskHints: {
              message: msg,
              tripId: effectiveTripId || null,
              focusDayIndex,
              weatherSensorOk: wBranch.block ? true : wBranch.audits?.some((a) => a.ok) ?? null,
              restaurantSensorOk: dBranch.block
                ? true
                : dBranch.audits?.some((a) => a.ok) ?? null,
            },
            legacy: {
              creOperation: context.contextRequirementPlan?.operation,
              creNextAction: context.contextRequirementPlan?.nextAction,
              wouldAskUser: context.contextRequirementPlan?.nextAction === 'ASK_USER',
              blockKeys: (context.contextRequirementPlan?.blockingGaps ?? []).map(
                (g) => g.key,
              ),
            },
          });
          if (!refined.classified.decisionClass) return {};
          context.decisionStateShadow = refined;
          return {
            decisionStateShadow: serializeActivityDecisionShadow(refined),
          };
        })(),
        ...(dBranch.restaurantRouteRunUi
          ? {
              restaurants: dBranch.restaurantRouteRunUi.restaurants,
              restaurant_cards: dBranch.restaurantRouteRunUi.restaurants,
              restaurant_search_meta: dBranch.restaurantRouteRunUi.restaurant_search_meta,
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
            (liveSensorAudit.some((a) => a.tool_id.includes('xiaohongshu'))
              ? '含小红书社区体验 MCP；'
              : '') +
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
          metadata: {
            ...(context.contextRequirementPlan
              ? {
                  context_requirement_plan: {
                    operation: context.contextRequirementPlan.operation,
                    nextAction: context.contextRequirementPlan.nextAction,
                    blockingGaps: context.contextRequirementPlan.blockingGaps.map((g) => g.key),
                    acquisition: context.contextRequirementPlan.acquisition,
                  },
                }
              : {}),
          },
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
    const decisionCtx = await host.buildLightweightDecisionContextForRealityGate(request, effectiveTripId);
    return await runWithDecisionContextAsync(decisionCtx, executeLightweightKnowledgeBody);
  }
