/**
 * Route Direction Fixture Types
 * 
 * 兼容层：重新导出所有 fixture 所需的类型
 * 这样 docs/route-direction-fixtures/ 中的文件可以直接复制过来使用
 */

// 重新导出 RouteDirectionData 为 RouteDirection（保持向后兼容）
export type { RouteDirectionData as RouteDirection } from '../interfaces/route-direction.interface';

// 重新导出所有相关类型接口
export type {
  RouteDirectionData,
  RouteConstraints,
  HardConstraints,
  SoftConstraints,
  ObjectiveWeights,
  RiskProfile,
  Seasonality,
  SignaturePois,
  ItinerarySkeleton,
  FailureProfile,
  RouteNarrative,
  ComplianceRules,
  DayPlan,
  DayPlanPoi,
  PoiPriority,
  FailureReasonType,
  RescueDifficultyType,
} from '../interfaces/route-direction.interface';

// 重新导出值（常量）
export { POI_PRIORITY_SCORE } from '../interfaces/route-direction.interface';

// 重新导出 RoutePhilosophy 类型
export type { RoutePhilosophy } from '../../trips/decision/models/route-philosophy.model';

// 导出哲学验证函数（如果需要）
export {
  validateReplacementAgainstPhilosophy,
  checkCoreExperienceCoverage,
} from '../../trips/decision/models/route-philosophy.model';
