// src/trips/decision/optimization/controllers/admin/index.ts
/**
 * 管理端 API 控制器导出
 */

export { OptimizationAdminController } from './optimization-admin.controller';
export { RealtimeAdminController } from './realtime-admin.controller';
export { ABTestingAdminController } from './ab-testing-admin.controller';
export { AxiomAdminController } from './axiom-admin.controller';
export { DSOAuditAdminController } from './dso-audit-admin.controller';
export { MetricsAdminController } from './metrics-admin.controller';

// DTOs
export type {
  BatchLearnDto,
  UpdateDefaultWeightsDto,
  SystemStatsResponse,
  BatchLearnResponse,
  LearningHistoryResponse,
} from './optimization-admin.controller';

export type {
  BatchObservationDto,
  InitializeStateDto,
  BatchObservationResponse,
  SubscriptionStatsResponse,
} from './realtime-admin.controller';

export type {
  CreateExperimentDto,
  StopExperimentDto,
  ExperimentSummary,
  ExperimentListResponse,
} from './ab-testing-admin.controller';

export type {
  ValidateWeightsDto,
  UpdateUtilityWeightsDto,
  EvaluateUtilityDto,
  ValidationResultResponse,
  AxiomHealthResponse,
} from './axiom-admin.controller';
