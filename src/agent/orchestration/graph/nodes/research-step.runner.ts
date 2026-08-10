/**
 * RESEARCH fallback step（从 ClaudeOrchestrator.executeResearchStep 迁出）。
 */

import type { ResearchStepHost } from './research-step.host';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type {
  OrchestratorState,
  TripPlanRequest,
} from '../../../interfaces/trip-plan.interface';
import { aggregateWeatherRisk } from '../../../utils/weather-risk-aggregator.util';
import {
  hydrateTripPlanTransportEndpoints,
  normalizeTransportEndpointsForSkill,
} from '../../../execution/shared/transport-endpoint-hydration.util';
import { getSkillFailureStrategy } from '../../../utils/skill-importance.util';
import { formatResearchOutputsZh } from '../../../utils/decision-log-user-facing.zh.util';
import {
  TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH,
  TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
} from '../../../execution/shared/transport-evidence-messages';
import { TRANSPORT_SEARCH_UNRESOLVED_COORDS_MARKER } from '../../../../skills/transport/transport-search.skill';
import {
  collectOpeningHoursPoiIdsForHydration,
  hydrateOpeningHoursEvidenceForItinerary,
} from '../../../utils/opening-hours-evidence-hydration.util';
import {
  buildCandidateRetrievalQueryPlan,
  mergeResearchPoiLists,
} from '../../../../planning-policy/utils/build-candidate-retrieval-query-plan.util';
import {
  buildPoiSearchContext,
} from '../../../../planning-policy/utils/build-poi-search-context.util';
import {
  filterPoisByRejectedIds,
} from '../../../../planning-policy/utils/contextual-poi-search-query.util';
import { buildPoiSearchPlanFromContext } from '../../../utils/query-rewriting-poi-context.util';
import {
  buildFailedRetrievalTrace,
  buildPlanningRetrievalDecisionTrace,
} from '../../../../planning-policy/utils/build-retrieval-decision-trace.util';
import {
  detectItineraryGapsV1,
  gapRetrievalIntentQuerySuffix,
} from '../../../../planning-policy/utils/detect-itinerary-gaps.util';
import {
  mergeDiscoveryStubsIntoPoiEvidence,
} from '../../../../planning-policy/open-world/discovery-buffer.util';
import { runOpenWorldDiscoveryPipeline } from '../../../utils/open-world-discovery-pipeline.util';
import { resolveResearchPoiBaseQueryHint } from '../../../utils/research-poi-retrieval-geography-hint.util';
import { buildSpecialRegionSupplementLanes } from '../../../utils/special-region-supplement.registry';

/**
 * RESEARCH 步骤：调用 skills 获取硬数据
 * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
 * @deprecated 优先使用 Kernel.executeResearch。此降级路径将逐步废弃，见 P3 阶段 D.2
 */
export async function executeResearchStep(
  host: ResearchStepHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  state: OrchestratorState,
  _provider: LlmProvider,
  decisionState?: DecisionState,
): Promise<void> {
  state.current_step = 'RESEARCH';
  const stepStartTime = Date.now();

  host.logger.debug(`[Claude Orchestrator] 执行 RESEARCH 步骤...`);

  try {
    const followupIntent = (state.metadata as any)?.transport_research_followup === true;
    if (followupIntent && host.researchPriorSnapshot) {
      const has =
        state.research_data &&
        typeof state.research_data === 'object' &&
        Object.keys(state.research_data as object).length > 0;
      if (!has) {
        const loaded = await host.researchPriorSnapshot.load(request);
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
    if (host.skillsRegistry && state.trip_plan_request) {
      const tripRequest = state.trip_plan_request;

      // 1. 交通搜索（transport.search）- CRITICAL（与 ResearchExecutor 共享回填 + 规范化）
      try {
        const transportSkill = host.skillsRegistry.getSkill('transport.search');
        const dsoForHydration =
          decisionState ??
          ({
            userIntent: {},
            tripState: {},
            environmentState: {},
            systemState: { requestId: state.request_id ?? '' },
            requestId: state.request_id,
          } as DecisionState);
        const sanitizedRecentMessages = host.contextSlidingWindow.slice(
          'orchestrator_claude',
          request.conversation_context?.recent_messages,
        ) as string[] | undefined;
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
          host.logger.warn(`[Claude Orchestrator] transport.search 降级处理: ${error?.message}`);
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
          host.logger.error(`[Claude Orchestrator] ${strategy.errorMessage}`);
          throw new Error(strategy.errorMessage);
        } else if (strategy.shouldMarkMissing) {
          // 如果是重要技能失败，标记缺失但继续执行
          host.logger.warn(`[Claude Orchestrator] transport.search 失败: ${error?.message}`);
          researchData.transport_evidence = { missing: true, error: error?.message };
        }
      }

      if (!transportResearchOnly) {
      // 2. POI 搜索（poi.search）- IMPORTANT（Phase 3：golden_circle 时 query 增强 + 第二路锚点检索）
      let poiSearchCtxForTrace: ReturnType<typeof buildPoiSearchContext> | undefined;
      try {
        const poiSkill = host.skillsRegistry.getSkill('poi.search');
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
            { llmService: host.llmService },
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
        host.logger.warn(`[Claude Orchestrator] poi.search 失败: ${error?.message}`);
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
        const openingHoursSkill = host.skillsRegistry.getSkill('opening_hours.get');
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
        host.logger.warn(`[Claude Orchestrator] opening_hours.get 失败: ${error?.message}`);
        if (strategy.shouldMarkMissing) {
          researchData.opening_hours_evidence = { missing: true, error: error?.message };
        }
      }

      // 4. DEM（Registry: dem.get_profile）- OPTIONAL
      try {
        const demSkill = host.skillsRegistry.getSkill('dem.get_profile');
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
          host.logger.debug(`[Claude Orchestrator] dem.get_profile 失败（已忽略）: ${error?.message}`);
        } else {
          host.logger.warn(`[Claude Orchestrator] dem.get_profile 失败: ${error?.message}`);
        }
      }

      // 5. 风险检查（使用现有的 geo.check.hazard.zones）- OPTIONAL
      try {
        const riskSkill = host.skillsRegistry.getSkill('geo.check.hazard.zones');
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
          host.logger.debug(`[Claude Orchestrator] geo.check.hazard.zones 失败（已忽略）: ${error?.message}`);
        } else {
          host.logger.warn(`[Claude Orchestrator] geo.check.hazard.zones 失败: ${error?.message}`);
        }
      }

      // 6. 领域智能体——世界模型数据
      await collectWorldModelData(host, tripRequest, researchData, evidenceRefs);

      // 7. 护城河扩展：预测数据（并行获取）
      await collectPredictionData(host, tripRequest, researchData, evidenceRefs, request);
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
    await host.generateDecisionStepForStep(state, 'RESEARCH', 'LocalInsight');
    await host.researchPriorSnapshot?.save(request, researchData as Record<string, unknown>);
  } catch (error: any) {
    host.logger.error(`[Claude Orchestrator] RESEARCH 步骤失败: ${error?.message}`);
    throw error;
  }
}

/**
 * 收集世界模型数据（通过 Domain Agents）
 */
export async function collectWorldModelData(
  host: ResearchStepHost,
  tripRequest: TripPlanRequest,
  researchData: Record<string, any>,
  evidenceRefs: string[],
): Promise<void> {
  host.logger.debug(`[Orchestrator] Collecting world model data via Domain Agents`);
  const promises: Promise<void>[] = [];

  // GeoAgent
  if (host.geoAgent && typeof tripRequest.destination === 'object') {
    const coords = tripRequest.destination;
    promises.push(
      host.geoAgent.analyzeTerrain([{ lat: coords.lat, lng: coords.lng }])
        .then(r => { researchData.geo_terrain = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
        .catch(e => host.logger.warn(`[GeoAgent] Failed: ${e?.message}`))
    );
  }

  // WeatherAgent
  if (host.weatherAgent && typeof tripRequest.destination === 'object' && tripRequest.date_range) {
    const coords = tripRequest.destination;
    promises.push(
      host.weatherAgent.getForecast(
        { lat: coords.lat, lng: coords.lng },
        { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date }
      ).then(r => { researchData.weather_forecast = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
        .catch(e => host.logger.warn(`[WeatherAgent] Failed: ${e?.message}`))
    );
  }

  // CostAgent
  if (host.costAgent && tripRequest.destination && tripRequest.date_range) {
    const dest = typeof tripRequest.destination === 'string' ? tripRequest.destination : 'destination';
    promises.push(
      host.costAgent.estimateTripCost(
        dest,
        { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date },
        tripRequest.party?.count || 2
      ).then(r => { researchData.cost_estimate = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
        .catch(e => host.logger.warn(`[CostAgent] Failed: ${e?.message}`))
    );
  }

  await Promise.all(promises);
}

/**
 * 收集预测数据（护城河扩展）
 */
export async function collectPredictionData(
  host: ResearchStepHost,
  tripRequest: TripPlanRequest,
  researchData: Record<string, any>,
  evidenceRefs: string[],
  request: RouteAndRunRequestDto,
): Promise<void> {
  host.logger.debug(`[Orchestrator] Collecting prediction data (护城河扩展)`);

  const promises: Promise<void>[] = [];

  // 1. 天气预测
  if (host.weatherPredictionService && tripRequest.date_range) {
    promises.push(
      host.weatherPredictionService
        .predictWeather('IS', {
          start: new Date(tripRequest.date_range.start_date),
          end: new Date(tripRequest.date_range.end_date),
        })
        .then((predictions) => {
          researchData.weather_predictions = predictions;
          evidenceRefs.push(`weather_predictions_${Date.now()}`);
        })
        .catch((e) =>
          host.logger.warn(`[WeatherPredictionService] Failed: ${e?.message}`),
        ),
    );
  }

  // 2. 失败风险预测
  if (
    host.failureRiskPredictionService &&
    tripRequest.date_range &&
    request.route_direction_id
  ) {
    promises.push(
      host.failureRiskPredictionService
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
          host.logger.warn(`[FailureRiskPredictionService] Failed: ${e?.message}`),
        ),
    );
  }

  await Promise.all(promises);

  // 缺口修复：聚合 weather_risk (0-1) 写入 research_data，供 DSO environmentState.weatherRisk
  const weatherRisk = aggregateWeatherRisk(researchData);
  if (weatherRisk !== undefined) {
    researchData.weather_risk = weatherRisk;
    host.logger.debug(`[Orchestrator] 聚合 weather_risk=${weatherRisk.toFixed(2)}`);
  }
}
