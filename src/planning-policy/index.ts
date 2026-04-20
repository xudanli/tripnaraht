// src/planning-policy/index.ts

/**
 * 规划策略模块 - 统一导出
 */

// 模块
export { PlanningPolicyModule } from './planning-policy.module';

// 服务
export { PolicyCompilerService } from './services/policy-compiler.service';
export {
  DefaultCostModel,
  DefaultCostModelInstance,
} from './services/cost-model.service';
export { HpSimulatorService } from './services/hp-simulator.service';
export { DaySchedulerService } from './services/day-scheduler.service';
export { ReplannerService } from './services/replanner.service';
export { FeasibilityService } from './services/feasibility.service';
export {
  RobustnessEvaluatorService,
  MapPoiLookup,
  type RobustnessConfig,
  type RobustnessMetrics,
  type PerPoiWindowRisk,
  type PerPoiWindowWaitRisk,
  type PerPoiEntrySlackRisk,
  type OptimizationSuggestion,
  type WhatIfAction,
  type WhatIfCandidate,
  type WhatIfReport,
  type WhatIfReportMeta,
  type WhatIfEvalContext,
  type WhatIfTransformer,
  type BuiltCandidate,
  type PoiLookup,
} from './services/robustness-evaluator.service';

// Re-export DayScheduleResult for convenience
export type { DayScheduleResult } from './interfaces/scheduler.interface';
export { RankingService } from './services/ranking.service';

// 接口
export * from './interfaces/planning-policy.interface';
export * from './interfaces/transit-segment.interface';
export * from './interfaces/poi.interface';
export * from './interfaces/region-intent.types';
export { GOLDEN_CIRCLE_INTENT, ICELAND_REGION_INTENT_BY_ID } from './regions/iceland-region-intents';
export { ICELAND_POI_SLUG_KEYWORDS } from './regions/iceland-poi-slugs';
export {
  GOLDEN_CIRCLE_ANCHOR_MAPPINGS,
  aliasesForGoldenCircleAnchor,
  type GoldenCircleAnchorSlug,
} from './regions/golden-circle-anchor-mappings';
export {
  GOLDEN_CIRCLE_RETRIEVAL_PROFILE,
  GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY,
  getAnchorRetrievalProfile,
  type AnchorRetrievalProfile,
  type AnchorRetrievalEntry,
} from './regions/golden-circle-anchor-retrieval-profile';
export { POI_PLANNING_SCORE_REASON } from './constants/poi-planning-score-reasons';
export { buildPoiPlanningNarrationHint } from './utils/poi-planning-narration.util';
export {
  computePoiPlanningOutcomeMetrics,
  buildPoiPlanningOutcomePhaseReport,
  type PoiPlanningOutcomeMetrics,
  type PoiPlanningOutcomePhaseReport,
  type PoiPlanningAdmissionDiagnosticsInput,
} from './utils/poi-planning-outcome-metrics.util';
export {
  buildCandidateRetrievalQueryPlan,
  mergeResearchPoiLists,
  type CandidateRetrievalQueryPlan,
} from './utils/build-candidate-retrieval-query-plan.util';
export {
  goldenCircleEntityStrongMatch,
  keywordMatchResearchPoiToSlug,
  researchPoiHasStableId,
  matchAnchorSlugFromResearchPoi,
} from './utils/anchor-entity-match.util';
export {
  computeAnchorOutcomeSources,
  type AnchorOutcomeSourceRow,
  type AnchorOutcomeSourceKind,
} from './utils/anchor-outcome-sources.util';
export {
  pickRequiredAnchorPoisInOrder,
  enforceRequiredAnchorsTopN,
  poiRowMatchesRequiredAnchorSlug,
  buildPoiPlanningAdmissionDiagnostics,
  poiPlanningRowIdentityKey,
  type PoiPlanningAdmissionDiagnostics,
} from './utils/poi-planning-anchor-admission.util';
export {
  resolveIcelandPlanningSlugFromPoi,
  resolveIcelandPlanningSlugFromItineraryItem,
  extractPlanningSlugsFromPois,
  extractPlanningSlugsFromItinerary,
  computeTopAnchorRanksInSelection,
  countPoiPlanningFallbackInPois,
  matchGoldenCircleSlugFromHaystack,
  computeUnresolvedAnchorReasonsForPoiRows,
  computeUnresolvedAnchorReasonsForItineraryItems,
  type MinimalItinerary,
  type MinimalItineraryItem,
  type UnresolvedAnchorReason,
} from './utils/poi-planning-slug-resolve.util';
export { RegionIntentResolverService } from './services/region-intent-resolver.service';
export {
  RegionAnchorPlanningService,
  paceBufferFraction,
  POI_PLAN_BACKOFF_STEPS,
  type AnchorBudgetOptions,
  type PoiPlanBackoffStep,
} from './services/region-anchor-planning.service';
export * from './interfaces/rest-stop.interface';
export * from './interfaces/scheduler.interface';
export * from './interfaces/replanner.interface';
export * from './interfaces/ranking.interface';
export {
  type PoiFeasibility,
  type TransitFeasibility,
  type WaitEstimate,
} from './services/feasibility.service';

// 工具
export {
  hhmmToMin,
  minToHhmm,
  isOpenAt,
  latestEntryMin,
  calculateDistance,
  isHoliday,
  dayOfWeekFromISO,
  withinTimeWindowForEvaluation,
  getEntryDeadlineInfoForEvaluation,
  type DayOfWeek,
  type TimeWindowStatus,
  type EntryDeadlineInfo,
} from './utils/time-utils';
