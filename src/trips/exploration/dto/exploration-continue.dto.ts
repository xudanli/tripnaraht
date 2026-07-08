import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AcceptablePriceDto {
  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  max?: number;
}

export class SubmitPackageFeedbackDto {
  @ApiProperty({
    description: '商品排序，最Preferred 在前',
    example: ['expert_review', 'full_report', 'trip_assurance', 'auto_repair'],
  })
  @IsArray()
  @IsString({ each: true })
  packageRankings!: string[];

  @ApiProperty({
    description: 'packageId → 1-5 价值评分',
    example: { full_report: 5, expert_review: 4 },
  })
  @IsObject()
  valueScores!: Record<string, number>;

  @ApiProperty({
    description: 'packageId → 1-5 信任评分',
    example: { full_report: 4, expert_review: 5 },
  })
  @IsObject()
  trustScores!: Record<string, number>;

  @ApiPropertyOptional({ type: AcceptablePriceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AcceptablePriceDto)
  acceptablePriceUsd?: AcceptablePriceDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leastPreferredPackageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredPackageId?: string;
}

export class SubmitResearchCommitmentDto {
  @ApiProperty({ enum: ['NOTIFY_ME', 'SELF_CHECK', 'PRICE_LOCK', 'DEPOSIT'] })
  @IsIn(['NOTIFY_ME', 'SELF_CHECK', 'PRICE_LOCK', 'DEPOSIT'])
  commitmentType!: 'NOTIFY_ME' | 'SELF_CHECK' | 'PRICE_LOCK' | 'DEPOSIT';

  @ApiPropertyOptional({ description: 'NOTIFY_ME 时必填其一' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class PackageScoreEntryDto {
  @ApiProperty()
  @IsString()
  packageId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;
}
