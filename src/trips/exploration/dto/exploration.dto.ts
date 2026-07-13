import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CONSUMER_PRINCIPLE_IDS,
  type ConsumerPrincipleId,
} from '../constants/exploration-status.constants';

export class ExplorationDateRangeDto {
  @ApiProperty({ example: '2026-09-10' })
  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ example: '2026-09-18' })
  @IsString()
  @IsNotEmpty()
  endDate!: string;
}

export class ExplorationTravelerDto {
  @ApiProperty({ enum: ['ADULT', 'CHILD', 'INFANT'] })
  @IsIn(['ADULT', 'CHILD', 'INFANT'])
  type!: 'ADULT' | 'CHILD' | 'INFANT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  age?: number;
}

export class ExplorationBudgetDto {
  @ApiProperty({ example: 'USD' })
  @IsString()
  currency!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  max?: number;
}

export class ExplorationMobilityContextDto {
  @ApiPropertyOptional({
    example: '2WD_COMPACT_SUV',
    enum: ['2WD_COMPACT_SUV', '4WD_SUV'],
    description: '自驾车型（当前仅支持自驾出行）',
  })
  @IsOptional()
  @IsIn(['2WD_COMPACT_SUV', '4WD_SUV'])
  vehicleType?: string;
}

export class ExplorationInsuranceContextDto {
  @ApiPropertyOptional({
    example: 'STANDARD',
    enum: ['BASIC', 'STANDARD', 'FULL', 'UNKNOWN'],
  })
  @IsOptional()
  @IsIn(['BASIC', 'STANDARD', 'FULL', 'UNKNOWN'])
  coverageTier?: 'BASIC' | 'STANDARD' | 'FULL' | 'UNKNOWN';
}

export class ExplorationRentalContextDto {
  @ApiPropertyOptional({ example: 'KEF' })
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @ApiPropertyOptional({ example: '10:00', description: '行程首日当地取车时间 HH:mm' })
  @IsOptional()
  @IsString()
  pickupTimeLocal?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  afterHoursPickupConfirmed?: boolean;
}

export class CreateExplorationScenarioDto {
  @ApiPropertyOptional({ example: ['IS'], description: 'Consumer 模式必填；Research 模式可由 protocol 填充' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  destinationCodes?: string[];

  @ApiPropertyOptional({ type: ExplorationDateRangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationDateRangeDto)
  dateRange?: ExplorationDateRangeDto;

  @ApiPropertyOptional({ type: [ExplorationTravelerDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExplorationTravelerDto)
  travelers?: ExplorationTravelerDto[];

  @ApiPropertyOptional({ type: ExplorationBudgetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationBudgetDto)
  budget?: ExplorationBudgetDto;

  @ApiPropertyOptional({ type: ExplorationMobilityContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationMobilityContextDto)
  mobilityContext?: ExplorationMobilityContextDto;

  @ApiPropertyOptional({ type: ExplorationInsuranceContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationInsuranceContextDto)
  insuranceContext?: ExplorationInsuranceContextDto;

  @ApiPropertyOptional({ type: ExplorationRentalContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationRentalContextDto)
  rentalContext?: ExplorationRentalContextDto;

  @ApiPropertyOptional({ example: 'iceland-discovery-v1' })
  @IsOptional()
  @IsString()
  researchProtocolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  participantCode?: string;
}

export class ConsumerPrincipleSelectionDto {
  @ApiProperty({ enum: CONSUMER_PRINCIPLE_IDS })
  @IsIn([...CONSUMER_PRINCIPLE_IDS])
  principleId!: ConsumerPrincipleId;

  @ApiProperty({ minimum: 1, maximum: 3 })
  @IsInt()
  @Min(1)
  @Max(3)
  rank!: number;
}

export class PutExplorationPrinciplesDto {
  @ApiProperty({ type: [ConsumerPrincipleSelectionDto] })
  @ValidateNested({ each: true })
  @Type(() => ConsumerPrincipleSelectionDto)
  principles!: ConsumerPrincipleSelectionDto[];
}

export class GenerateExplorationCandidatesDto {
  @ApiPropertyOptional({ description: '幂等键，重复请求返回相同 generationVersion' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: '强制重新生成（归档现有 DRAFT 候选）' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class SubmitExplorationDecisionDto {
  @ApiProperty()
  @IsString()
  optionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acknowledgement?: string[];
}

export class RunExplorationCheckDto {
  @ApiPropertyOptional({ description: 'true 时返回 202 + jobId' })
  @IsOptional()
  @IsBoolean()
  async?: boolean;
}

export class RouteSelectionDto {
  @ApiProperty()
  @IsString()
  routeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  selectionReason?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prioritizedGainIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedSacrificeIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  concernText?: string;
}
