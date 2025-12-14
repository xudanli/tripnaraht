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
