/**
 * Decision OS 请求验证 DTO
 * 
 * 使用 class-validator 和 class-transformer 进行请求验证
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ========== 枚举定义 ==========

export enum DecisionPhase {
  INTAKE = 'INTAKE',
  RESEARCH = 'RESEARCH',
  GATE_EVAL = 'GATE_EVAL',
  PLAN_GEN = 'PLAN_GEN',
  OPTIMIZE = 'OPTIMIZE',
  VERIFY = 'VERIFY',
  NARRATE = 'NARRATE',
  DONE = 'DONE',
}

export enum FeedbackType {
  LIKE = 'LIKE',
  DISLIKE = 'DISLIKE',
  NEUTRAL = 'NEUTRAL',
}

export enum ActionType {
  ACCEPT_PLAN = 'ACCEPT_PLAN',
  MODIFY_PLAN = 'MODIFY_PLAN',
  REGENERATE = 'REGENERATE',
  REQUEST_INFO = 'REQUEST_INFO',
  RELAX_CONSTRAINT = 'RELAX_CONSTRAINT',
  ESCALATE = 'ESCALATE',
}

// ========== 嵌套 DTO ==========

export class DecisionOptionsDto {
  @ApiPropertyOptional({ description: '是否使用 Monte Carlo 采样', default: true })
  @IsOptional()
  @IsBoolean()
  useMonteCarlo?: boolean;

  @ApiPropertyOptional({ description: '是否启用探索机制', default: false })
  @IsOptional()
  @IsBoolean()
  useExploration?: boolean;

  @ApiPropertyOptional({ description: '分布式锁超时时间（毫秒）', minimum: 1000, maximum: 30000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(30000)
  lockTimeout?: number;

  @ApiPropertyOptional({ description: 'Monte Carlo 采样数', minimum: 100, maximum: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(10000)
  numSamples?: number;
}

export class UserIntentDto {
  @ApiPropertyOptional({ description: '旅行天数', minimum: 1, maximum: 365 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: '目的地' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: '出行方式' })
  @IsOptional()
  @IsString()
  mode?: string;

  @ApiPropertyOptional({ description: '用户偏好' })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, number>;
}

export class ConstraintsDto {
  @ApiPropertyOptional({ description: '是否可行', default: true })
  @IsOptional()
  @IsBoolean()
  feasible?: boolean;

  @ApiPropertyOptional({ description: '约束违规列表' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  violations?: string[];

  @ApiPropertyOptional({ description: '硬约束' })
  @IsOptional()
  @IsObject()
  hardConstraints?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '软约束' })
  @IsOptional()
  @IsObject()
  softConstraints?: Record<string, unknown>;
}

export class SystemStateDto {
  @ApiPropertyOptional({ description: '当前决策阶段', enum: DecisionPhase })
  @IsOptional()
  @IsEnum(DecisionPhase)
  currentPhase?: DecisionPhase;

  @ApiPropertyOptional({ description: '置信度', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ description: 'DSO 版本', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  version?: number;
}

export class DsoDto {
  @ApiPropertyOptional({ description: '用户意图', type: UserIntentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserIntentDto)
  userIntent?: UserIntentDto;

  @ApiPropertyOptional({ description: '约束条件', type: ConstraintsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConstraintsDto)
  constraints?: ConstraintsDto;

  @ApiPropertyOptional({ description: '系统状态', type: SystemStateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SystemStateDto)
  systemState?: SystemStateDto;

  @ApiPropertyOptional({ description: '行程状态' })
  @IsOptional()
  @IsObject()
  tripState?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '环境状态' })
  @IsOptional()
  @IsObject()
  environmentState?: Record<string, unknown>;
}

export class ExplicitFeedbackDto {
  @ApiProperty({ description: '反馈类型', enum: FeedbackType })
  @IsEnum(FeedbackType)
  type!: FeedbackType;

  @ApiPropertyOptional({ description: '反馈评论', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class BehavioralSignalsDto {
  @ApiProperty({ description: '是否完成' })
  @IsBoolean()
  completed!: boolean;

  @ApiProperty({ description: '修改次数', minimum: 0 })
  @IsNumber()
  @Min(0)
  modificationCount!: number;

  @ApiPropertyOptional({ description: '停留时间（秒）', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dwellTimeSeconds?: number;
}

// ========== 主要请求 DTO ==========

export class MakeDecisionRequestDto {
  @ApiProperty({ description: '请求 ID', example: 'req-001' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  requestId!: string;

  @ApiProperty({ description: '用户 ID', example: 'user-001' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  userId!: string;

  @ApiProperty({ description: '决策状态对象', type: DsoDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DsoDto)
  dso!: DsoDto;

  @ApiPropertyOptional({ description: '决策选项', type: DecisionOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DecisionOptionsDto)
  options?: DecisionOptionsDto;
}

export class SubmitFeedbackRequestDto {
  @ApiProperty({ description: '决策 ID', example: 'req-001' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  decisionId!: string;

  @ApiProperty({ description: '用户 ID', example: 'user-001' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  userId!: string;

  @ApiPropertyOptional({ description: '满意度分数', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  satisfactionScore?: number;

  @ApiPropertyOptional({ description: '实际效用值', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  actualUtility?: number;

  @ApiPropertyOptional({ description: '显式反馈', type: ExplicitFeedbackDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplicitFeedbackDto)
  explicitFeedback?: ExplicitFeedbackDto;

  @ApiPropertyOptional({ description: '行为信号', type: BehavioralSignalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BehavioralSignalsDto)
  behavioralSignals?: BehavioralSignalsDto;
}

// ========== 审计请求 DTO ==========

export class QuerySnapshotsRequestDto {
  @ApiPropertyOptional({ description: '请求 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  requestId?: string;

  @ApiPropertyOptional({ description: '决策阶段', enum: DecisionPhase })
  @IsOptional()
  @IsEnum(DecisionPhase)
  phase?: DecisionPhase;

  @ApiPropertyOptional({ description: '开始时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: '返回数量限制', minimum: 1, maximum: 1000, default: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;

  @ApiPropertyOptional({ description: '偏移量', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number;
}

export class ComputeDiffRequestDto {
  @ApiProperty({ description: '请求 ID', example: 'req-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  requestId!: string;

  @ApiProperty({ description: '起始版本', minimum: 1 })
  @IsNumber()
  @Min(1)
  fromVersion!: number;

  @ApiProperty({ description: '目标版本', minimum: 1 })
  @IsNumber()
  @Min(1)
  toVersion!: number;
}

export class RollbackRequestDto {
  @ApiProperty({ description: '请求 ID', example: 'req-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  requestId!: string;

  @ApiProperty({ description: '目标版本', minimum: 1 })
  @IsNumber()
  @Min(1)
  targetVersion!: number;

  @ApiPropertyOptional({ description: '回滚原因', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CleanupRequestDto {
  @ApiPropertyOptional({ description: '保留天数', minimum: 1, default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  retentionDays?: number;

  @ApiPropertyOptional({ description: '是否执行（false 为预览模式）', default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

// ========== 训练请求 DTO ==========

export class TrainingSampleDto {
  @ApiProperty({ description: 'DSO 状态', type: DsoDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DsoDto)
  dso!: DsoDto;

  @ApiProperty({ description: '目标效用值', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  targetUtility!: number;
}

export class TrainModelRequestDto {
  @ApiProperty({ description: '训练样本', type: [TrainingSampleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingSampleDto)
  samples!: TrainingSampleDto[];

  @ApiPropertyOptional({ description: '学习率', minimum: 0.0001, maximum: 1, default: 0.01 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Max(1)
  learningRate?: number;

  @ApiPropertyOptional({ description: '训练轮数', minimum: 1, maximum: 1000, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  epochs?: number;
}

export class PolicySampleDto {
  @ApiProperty({ description: 'DSO 状态', type: DsoDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DsoDto)
  state!: DsoDto;

  @ApiProperty({ description: '执行的动作', enum: ActionType })
  @IsEnum(ActionType)
  action!: ActionType;

  @ApiProperty({ description: '奖励值', minimum: -1, maximum: 1 })
  @IsNumber()
  @Min(-1)
  @Max(1)
  reward!: number;
}

export class UpdatePolicyRequestDto {
  @ApiProperty({ description: '策略更新样本', type: [PolicySampleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PolicySampleDto)
  samples!: PolicySampleDto[];
}
