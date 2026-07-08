import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 单维度验证状态（Plan Gate 提交前检查） */
export const PLAN_GATE_DIMENSION_STATUSES = [
  'pass',
  'suggest_adjust',
  'need_confirm',
  'blocked',
  'insufficient_data',
] as const;

export type PlanGateDimensionStatus = (typeof PLAN_GATE_DIMENSION_STATUSES)[number];

export const PLAN_GATE_OVERALL_STATUSES = [
  'pass',
  'suggest_adjust',
  'need_confirm',
  'blocked',
  'insufficient_data',
] as const;

export type PlanGateOverallStatus = (typeof PLAN_GATE_OVERALL_STATUSES)[number];

export const PLAN_GATE_DIMENSION_KEYS = [
  'safetyFeasibility',
  'paceLoad',
  'experienceCompleteness',
] as const;

export type PlanGateDimensionKey = (typeof PLAN_GATE_DIMENSION_KEYS)[number];

export const PLAN_GATE_SUBMIT_MODES = [
  'ready',
  'pending_confirmations',
  'blocked',
  'insufficient_data',
] as const;

export type PlanGateSubmitMode = (typeof PLAN_GATE_SUBMIT_MODES)[number];

export const PLAN_GATE_PIPELINE_STEPS = [
  'merge_decisions',
  'restructure_itinerary',
  'compute_routes_timing',
  'check_budget_members',
  'pre_submit_verification',
] as const;

export type PlanGatePipelineStepId = (typeof PLAN_GATE_PIPELINE_STEPS)[number];

export class PlanGateVerificationCheckItemDto {
  @ApiProperty({ example: 'road_froad_season' })
  id!: string;

  @ApiProperty({ example: 'F 路季节性封闭' })
  label!: string;

  @ApiProperty({ enum: PLAN_GATE_DIMENSION_STATUSES })
  status!: PlanGateDimensionStatus;

  @ApiPropertyOptional()
  detail?: string;

  @ApiPropertyOptional({ type: [Number] })
  affectedDays?: number[];
}

export class PlanGateVerificationDimensionDto {
  @ApiProperty({ enum: PLAN_GATE_DIMENSION_KEYS })
  key!: PlanGateDimensionKey;

  @ApiProperty({ example: '安全与可行性' })
  title!: string;

  @ApiProperty({ enum: PLAN_GATE_DIMENSION_STATUSES })
  status!: PlanGateDimensionStatus;

  @ApiPropertyOptional({ example: '道路与硬约束检查通过' })
  summary?: string;

  @ApiPropertyOptional({ type: [PlanGateVerificationCheckItemDto] })
  checks?: PlanGateVerificationCheckItemDto[];
}

export class PlanGateTradeOffOptionDto {
  @ApiProperty({ example: 'opt_a' })
  id!: string;

  @ApiProperty({ example: 'A. 增加预算 ¥620，更换 Day 2 住宿' })
  label!: string;

  @ApiPropertyOptional()
  recommended?: boolean;
}

export class PlanGatePendingConfirmationDto {
  @ApiProperty({ example: 'signoff_pace_day3' })
  id!: string;

  @ApiProperty({ example: 'Day 3 节奏与负荷' })
  title!: string;

  @ApiProperty({ example: '老人组连续户外时间 5h20m，建议启用成员分流' })
  description!: string;

  @ApiProperty({ enum: ['sign_off', 'trade_off'] })
  kind!: 'sign_off' | 'trade_off';

  @ApiProperty({ enum: PLAN_GATE_DIMENSION_STATUSES })
  severity!: PlanGateDimensionStatus;

  @ApiPropertyOptional({ type: [PlanGateTradeOffOptionDto] })
  options?: PlanGateTradeOffOptionDto[];

  @ApiPropertyOptional()
  recommendedOptionId?: string;

  @ApiPropertyOptional({ type: [Number] })
  affectedDays?: number[];
}

export class PlanGateMetricsDeltaDto {
  @ApiPropertyOptional({ description: '可执行性 0-100' })
  executability?: { from?: number; to?: number };

  @ApiPropertyOptional()
  budgetPerPerson?: { from?: number; to?: number; delta?: number; currency?: string };

  @ApiPropertyOptional()
  totalDrivingMinutes?: { from?: number; to?: number; delta?: number };

  @ApiPropertyOptional()
  affectedDays?: number;

  @ApiPropertyOptional()
  affectedMembers?: number;
}

export class PlanGateVerificationDto {
  @ApiProperty({ example: 'A4' })
  draftLabel!: string;

  @ApiProperty({ enum: PLAN_GATE_OVERALL_STATUSES })
  overallStatus!: PlanGateOverallStatus;

  @ApiProperty({ type: [PlanGateVerificationDimensionDto] })
  dimensions!: PlanGateVerificationDimensionDto[];

  @ApiPropertyOptional({ type: [PlanGatePendingConfirmationDto] })
  pendingConfirmations?: PlanGatePendingConfirmationDto[];

  @ApiPropertyOptional({ type: PlanGateMetricsDeltaDto })
  metrics?: PlanGateMetricsDeltaDto;

  @ApiPropertyOptional({ description: '综合说明（替代人格卡 headline）' })
  headline?: string;
}

export class PlanGateSubmitEligibilityDto {
  @ApiProperty({ enum: PLAN_GATE_SUBMIT_MODES })
  mode!: PlanGateSubmitMode;

  @ApiProperty()
  canSubmitToTimeline!: boolean;

  @ApiPropertyOptional()
  canSubmitWithAcceptedRisk?: boolean;

  @ApiProperty({ type: [String] })
  blockers!: string[];

  @ApiProperty({ type: [String] })
  requiredConfirmationIds!: string[];

  @ApiProperty({ type: [String] })
  satisfiedConfirmationIds!: string[];
}

export class PlanGatePipelineStepDto {
  @ApiProperty({ enum: PLAN_GATE_PIPELINE_STEPS })
  id!: PlanGatePipelineStepId;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: ['pending', 'running', 'completed', 'failed'] })
  status!: 'pending' | 'running' | 'completed' | 'failed';
}

export class PlanGateConfirmedItemDto {
  @ApiProperty({ description: '对应 pendingConfirmations[].id' })
  @IsString()
  confirmationId!: string;

  @ApiProperty({ description: '用户是否接受该确认项' })
  @IsBoolean()
  accepted!: boolean;

  @ApiPropertyOptional({ description: 'trade_off 场景下选中的 option id' })
  @IsOptional()
  @IsString()
  choiceId?: string;
}

export class PlanGateReadinessDto {
  @ApiProperty()
  tripId!: string;

  @ApiProperty()
  canGenerateDraft!: boolean;

  @ApiProperty()
  confirmedConstraintsCount!: number;

  @ApiProperty()
  decisionConclusionsCount!: number;

  @ApiPropertyOptional()
  budgetPerPerson?: { amount?: number; currency?: string };

  @ApiPropertyOptional()
  memberCount?: number;

  @ApiProperty({ type: [String] })
  blockers!: string[];

  @ApiProperty({ type: [String] })
  warnings!: string[];

  @ApiPropertyOptional()
  currentPlanId?: string;

  @ApiPropertyOptional()
  currentPlanVersion?: number;
}

export class PlanGateTimelineChangeDto {
  @ApiProperty({ enum: ['added', 'removed', 'replaced', 'time_adjusted', 'reordered', 'accommodation_changed', 'member_participation_changed'] })
  kind!: string;

  @ApiPropertyOptional()
  day?: number;

  @ApiPropertyOptional()
  segmentId?: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional()
  before?: string;

  @ApiPropertyOptional()
  after?: string;

  @ApiProperty({ enum: ['low', 'medium', 'high'] })
  impact!: 'low' | 'medium' | 'high';
}

export class PlanGateMapSegmentChangeDto {
  @ApiPropertyOptional()
  day?: number;

  @ApiPropertyOptional()
  segmentId?: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: ['new', 'removed', 'modified', 'unchanged'] })
  changeType!: 'new' | 'removed' | 'modified' | 'unchanged';

  @ApiPropertyOptional()
  distanceKmDelta?: number;
}

export class PlanGateRiskChangeDto {
  @ApiProperty({ enum: ['resolved', 'new', 'retained', 'pending'] })
  kind!: 'resolved' | 'new' | 'retained' | 'pending';

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional()
  day?: number;
}

export class PlanGateMemberSplitChangeDto {
  @ApiProperty()
  day!: number;

  @ApiProperty({
    enum: ['split_added', 'split_removed', 'meetup_changed', 'branch_changed', 'member_assignment_changed'],
  })
  kind!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional()
  before?: string;

  @ApiPropertyOptional()
  after?: string;

  @ApiProperty({ enum: ['low', 'medium', 'high'] })
  impact!: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({ description: '分流存在但缺少汇合点' })
  missingMeetup?: boolean;
}

export class PlanGateFeasibilitySnapshotDto {
  @ApiProperty({ description: '可执行性 0-100' })
  executability!: number;

  @ApiProperty({ enum: ['feasibility_report', 'plan_state_estimate'] })
  source!: 'feasibility_report' | 'plan_state_estimate';

  @ApiPropertyOptional()
  verifiedAt?: string;

  @ApiPropertyOptional()
  verdictStatus?: string;

  @ApiPropertyOptional()
  canStartExecute?: boolean;

  @ApiPropertyOptional()
  memberCount?: number;

  @ApiPropertyOptional()
  completenessScore?: number;

  @ApiPropertyOptional({ type: PlanGateMetricsDeltaDto })
  delta?: PlanGateMetricsDeltaDto;
}

export class PlanGateDraftDiffDto {
  @ApiProperty()
  baselinePlanId!: string;

  @ApiProperty()
  baselineLabel!: string;

  @ApiProperty()
  draftPlanId!: string;

  @ApiProperty()
  draftLabel!: string;

  @ApiProperty({ type: [PlanGateTimelineChangeDto] })
  timelineChanges!: PlanGateTimelineChangeDto[];

  @ApiProperty({ type: PlanGateMetricsDeltaDto })
  metrics!: PlanGateMetricsDeltaDto;

  @ApiProperty({ type: [PlanGateMapSegmentChangeDto] })
  mapChanges!: PlanGateMapSegmentChangeDto[];

  @ApiPropertyOptional({ description: 'GeoJSON FeatureCollection（原路线灰 / 新路线紫）' })
  mapGeoJson?: Record<string, unknown>;

  @ApiProperty({ type: [PlanGateRiskChangeDto] })
  riskChanges!: PlanGateRiskChangeDto[];

  @ApiPropertyOptional({ type: [PlanGateMemberSplitChangeDto], description: '成员分流 / 汇合点变化' })
  memberChanges?: PlanGateMemberSplitChangeDto[];

  @ApiProperty({ type: [String] })
  changeLog!: string[];

  @ApiProperty()
  affectedDayCount!: number;
}

export class PlanGateCommitNextActionDto {
  @ApiProperty()
  label!: string;

  @ApiPropertyOptional()
  action?: string;
}

export class PlanGatePreTripTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ['booking', 'evidence', 'packing', 'compliance', 'suggestion', 'risk_ack', 'checklist'] })
  category!: string;

  @ApiProperty({ enum: ['high', 'medium', 'low'] })
  priority!: string;

  @ApiProperty()
  source!: string;

  @ApiPropertyOptional()
  day?: number;
}

export class PlanGatePreTripTasksSummaryDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  highPriority!: number;

  @ApiProperty({ type: [PlanGatePreTripTaskDto] })
  tasks!: PlanGatePreTripTaskDto[];
}

export class PlanGateCommitResultDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  committedPlanId!: string;

  @ApiProperty()
  committedVersionLabel!: string;

  @ApiProperty()
  committedAt!: string;

  @ApiProperty()
  headline!: string;

  @ApiProperty({ type: [String] })
  updates!: string[];

  @ApiPropertyOptional({ type: PlanGateMetricsDeltaDto })
  metrics?: PlanGateMetricsDeltaDto;

  @ApiPropertyOptional()
  preTripTasksCount?: number;

  @ApiPropertyOptional({ type: PlanGatePreTripTasksSummaryDto })
  preTripTasks?: PlanGatePreTripTasksSummaryDto;

  @ApiProperty({ type: [PlanGateCommitNextActionDto] })
  nextActions!: PlanGateCommitNextActionDto[];
}

export class PlanGateUiDto {
  @ApiProperty({ type: PlanGateVerificationDto })
  verification!: PlanGateVerificationDto;

  @ApiProperty({ type: PlanGateSubmitEligibilityDto })
  submitEligibility!: PlanGateSubmitEligibilityDto;

  @ApiPropertyOptional({ type: [PlanGatePipelineStepDto] })
  pipelineSteps?: PlanGatePipelineStepDto[];

  @ApiPropertyOptional({ type: PlanGateDraftDiffDto, description: '草案 vs 基线版本差异' })
  draftDiff?: PlanGateDraftDiffDto;

  @ApiPropertyOptional({ type: PlanGateCommitResultDto, description: '提交成功后结果页' })
  commitResult?: PlanGateCommitResultDto;

  @ApiPropertyOptional({ type: PlanGatePreTripTasksSummaryDto, description: '提交后将创建/待完成的行前任务' })
  preTripTasks?: PlanGatePreTripTasksSummaryDto;
}
