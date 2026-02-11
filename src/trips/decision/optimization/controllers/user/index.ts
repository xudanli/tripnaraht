// src/trips/decision/optimization/controllers/user/index.ts
/**
 * 用户端 API 控制器导出
 */

export { OptimizationUserController } from './optimization-user.controller';
export { TeamUserController } from './team-user.controller';
export { RealtimeUserController } from './realtime-user.controller';

// DTOs
export type {
  EvaluatePlanDto,
  ComparePlansDto,
  OptimizePlanDto,
  ComputeRiskDto,
  NegotiatePlanDto,
  RecordFeedbackDto,
  CompareResult,
  NegotiationSummary,
  UserWeightsResponse,
} from './optimization-user.controller';

export type {
  CreateTeamDto,
  TeamMemberInput,
  AddMemberDto,
  TeamNegotiateDto,
  TeamWeightsResponse,
  TeamConstraintsResponse,
} from './team-user.controller';

export type {
  SubscribeDto,
  UserReportDto,
  SubscriptionResponse,
  CurrentStateResponse,
  PredictionResponse,
} from './realtime-user.controller';
