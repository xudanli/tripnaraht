/**
 * POI 缺失时的 fallback plan 落盘（从 ClaudeOrchestrator 迁出）。
 */

import type { FallbackPlanHost } from './fallback-plan.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  buildFallbackPlan,
  buildFallbackPlans,
  chooseFallbackStrategy,
  fallbackPlanToItinerary,
  getFallbackTemplateVersion,
} from '../../decision/planner/fallback-planner';

export function resolvePoiPolicy(
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

export function normalizeFallbackStrategyHint(input: unknown):
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

export function applyFallbackPlan(
  host: FallbackPlanHost,
  state: OrchestratorState,
): void {
  const destination =
    typeof state.trip_plan_request?.destination === 'string'
      ? state.trip_plan_request.destination
      : '目的地';
  const query = state.decision_log.find((log) => log.step === 'INTAKE')?.inputs_summary || '';
  const strategyHint = normalizeFallbackStrategyHint(
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
    policy: resolvePoiPolicy(
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
