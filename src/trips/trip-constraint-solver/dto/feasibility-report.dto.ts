import { IsBoolean, IsIn, IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type AccessEvidenceRefreshScope =
  | 'access_rules'
  | 'access_inventory'
  | 'access_congestion';

export class FeasibilityScopeDto {
  @IsIn(['day', 'issue', 'route'])
  type!: 'day' | 'issue' | 'route';

  @IsOptional()
  @IsNumber()
  dayNumber?: number;

  @IsOptional()
  @IsString()
  issueId?: string;

  @IsOptional()
  @IsString()
  segmentId?: string;
}

export class FeasibilityValidateScopeDto {
  @IsObject()
  @ValidateNested()
  @Type(() => FeasibilityScopeDto)
  scope!: FeasibilityScopeDto;

  @ApiPropertyOptional({ description: 'true=全量；或传 access 子 scope 数组' })
  @IsOptional()
  forceRefreshEvidence?: boolean | AccessEvidenceRefreshScope[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lang?: string;
}

export class FeasibilityPreviewRepairBodyDto {
  @ApiProperty({ description: 'repair-options 返回的选项 ID' })
  @IsString()
  optionId!: string;

  @ApiPropertyOptional({ description: '是否运行三人格博弈预览（默认 true）' })
  @IsOptional()
  @IsBoolean()
  runGuardianNegotiation?: boolean;

  @ApiPropertyOptional({ description: '预览时跳过低共识 REJECT 门控' })
  @IsOptional()
  @IsBoolean()
  forceDecisionRepair?: boolean;
}

export class FeasibilityApplyRepairBodyDto {
  @ApiProperty({ description: 'repair-options 返回的选项 ID' })
  @IsString()
  optionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '计划类修复是否直接调用决策引擎（默认按 actionType 推断）' })
  @IsOptional()
  @IsBoolean()
  executeDecision?: boolean;

  @ApiPropertyOptional({ description: 'executeDecision=true 时是否写回行程（默认 true）' })
  @IsOptional()
  @IsBoolean()
  persistDecision?: boolean;

  @ApiPropertyOptional({ description: '是否运行三人格博弈（默认 true）' })
  @IsOptional()
  @IsBoolean()
  runGuardianNegotiation?: boolean;

  @ApiPropertyOptional({ description: '跳过低共识 REJECT 门控，强制执行修复' })
  @IsOptional()
  @IsBoolean()
  forceDecisionRepair?: boolean;

  @ApiPropertyOptional({ description: 'manual_confirm：停车/入场确认码' })
  @IsOptional()
  @IsString()
  parkingReservationRef?: string;

  @ApiPropertyOptional({ description: 'manual_confirm：附件 ID（M1 可 501）' })
  @IsOptional()
  @IsString()
  evidenceAttachmentId?: string;
}

export class ValidateFeasibilityBodyDto {
  @ApiPropertyOptional({
    description: 'true=刷新全部证据；false=跳过；或 access 子 scope 数组',
  })
  @IsOptional()
  forceRefreshEvidence?: boolean | AccessEvidenceRefreshScope[];

  @ApiPropertyOptional({ description: '语言 zh | en' })
  @IsOptional()
  @IsString()
  lang?: string;

  @ApiPropertyOptional({ description: '是否运行 POMDP + Monte Carlo 概率评估（默认 true，需 FEASIBILITY_MONTE_CARLO=1）' })
  @IsOptional()
  @IsBoolean()
  runMonteCarlo?: boolean;

  @ApiPropertyOptional({ description: 'Monte Carlo 采样数（50–500，默认 200）' })
  @IsOptional()
  @IsNumber()
  monteCarloSampleSize?: number;
}
