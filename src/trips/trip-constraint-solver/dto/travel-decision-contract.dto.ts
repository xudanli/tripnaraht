import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  TRAVEL_PRINCIPLE_KEYS,
  type AutomationLevel,
  type AutomationPermissionTier,
  type ChangeStrategyArchetype,
  type TeamGovernanceRuleType,
  type TravelPrincipleKey,
} from '../types/travel-decision-contract.types';

export class TravelObjectiveProfileDto {
  @ApiProperty({
    enum: TRAVEL_PRINCIPLE_KEYS,
    isArray: true,
    description: '排序后的旅行原则（靠前优先级更高）',
    example: ['SAFETY', 'PACE', 'CORE_EXPERIENCE', 'BUDGET', 'FEWER_HOTEL_CHANGES'],
  })
  @IsArray()
  @IsIn(TRAVEL_PRINCIPLE_KEYS, { each: true })
  rankedPrinciples!: TravelPrincipleKey[];
}

export class ChangeStrategyTolerancesDto {
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  maxBudgetOverrunPct?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  maxDelayMinutes?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  maxPoiRemovals?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowTemporaryLodgingChange?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowSameDayReroute?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptLowConfidencePlans?: boolean;
}

export class ChangeStrategyProfileDto {
  @ApiProperty({ enum: ['CONSERVATIVE', 'BALANCED', 'EXPLORATORY'] })
  @IsEnum(['CONSERVATIVE', 'BALANCED', 'EXPLORATORY'])
  archetype!: ChangeStrategyArchetype;

  @ApiPropertyOptional({ type: ChangeStrategyTolerancesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChangeStrategyTolerancesDto)
  tolerances?: ChangeStrategyTolerancesDto;
}

export class AutomationExecutionConditionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onlyUnbooked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  excludeCoreActivities?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noCrossDay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noBudgetIncrease?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noDriveTimeIncrease?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxItemsPerChange?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minMinutesBeforeActivity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyOnApply?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  teamCanUndo?: boolean;
}

export class AutomationPolicyDto {
  @ApiPropertyOptional({
    enum: ['INFORM_ONLY', 'SUGGEST', 'AUTO_REPAIR_LOW_RISK', 'AUTO_EXECUTE_CONDITIONAL'],
  })
  @IsOptional()
  @IsEnum(['INFORM_ONLY', 'SUGGEST', 'AUTO_REPAIR_LOW_RISK', 'AUTO_EXECUTE_CONDITIONAL'])
  defaultLevel?: AutomationLevel;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  autoAllowed?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  confirmationRequired?: string[];

  @ApiPropertyOptional({
    description: '按 catalog action key 覆盖权限 tier',
    example: { 'activity.trim_optional_items': 'AUTO' },
  })
  @IsOptional()
  @IsObject()
  actionOverrides?: Partial<Record<string, AutomationPermissionTier>>;

  @ApiPropertyOptional({ description: '按 catalog action key 覆盖执行条件' })
  @IsOptional()
  @IsObject()
  executionConditions?: Record<string, AutomationExecutionConditionsDto>;
}

export class TeamGovernanceRuleDto {
  @ApiProperty({ example: '高风险活动' })
  @IsString()
  topic!: string;

  @ApiProperty({
    enum: ['UNANIMOUS', 'MAJORITY', 'PAYER_CONFIRM', 'VETO', 'PROTECTIVE_PRIORITY'],
  })
  @IsEnum(['UNANIMOUS', 'MAJORITY', 'PAYER_CONFIRM', 'VETO', 'PROTECTIVE_PRIORITY'])
  rule!: TeamGovernanceRuleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memberRole?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  thresholdPct?: number;
}

export class TeamGovernancePolicyDto {
  @ApiProperty({ type: [TeamGovernanceRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamGovernanceRuleDto)
  rules!: TeamGovernanceRuleDto[];
}

export class PatchTravelDecisionContractDto {
  @ApiPropertyOptional({ type: TravelObjectiveProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TravelObjectiveProfileDto)
  objectives?: TravelObjectiveProfileDto;

  @ApiPropertyOptional({ type: ChangeStrategyProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChangeStrategyProfileDto)
  changeStrategy?: ChangeStrategyProfileDto;

  @ApiPropertyOptional({ type: AutomationPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AutomationPolicyDto)
  automation?: AutomationPolicyDto;

  @ApiPropertyOptional({ type: TeamGovernancePolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TeamGovernancePolicyDto)
  teamGovernance?: TeamGovernancePolicyDto;

  @ApiPropertyOptional({ description: '暂停本行程 AI 自动执行' })
  @IsOptional()
  @IsBoolean()
  automationPaused?: boolean;

  @ApiPropertyOptional({
    enum: ['TRIP', 'USER_TEMPLATE'],
    description: '规则作用范围：本行程 / 全部我的行程（用户模板）',
  })
  @IsOptional()
  @IsEnum(['TRIP', 'USER_TEMPLATE'])
  automationScope?: 'TRIP' | 'USER_TEMPLATE';

  @ApiPropertyOptional({
    description: '恢复 catalog 默认权限（清空 actionOverrides / executionConditions）',
  })
  @IsOptional()
  @IsBoolean()
  resetAutomationToDefaults?: boolean;

  @ApiPropertyOptional({ description: '乐观锁：与 GET meta.constraintsVersion 对齐' })
  @IsOptional()
  @IsNumber()
  constraintsVersion?: number;
}
