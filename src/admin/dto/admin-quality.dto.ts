import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, IsInt, Min } from 'class-validator';

export const QUALITY_TARGET_TYPES = ['DECISION_LOG', 'SAGA_LOG'] as const;
export type QualityTargetType = (typeof QUALITY_TARGET_TYPES)[number];

export class AdminQualityMarkCreateDto {
  @ApiProperty({ enum: QUALITY_TARGET_TYPES, example: 'DECISION_LOG' })
  @IsIn([...QUALITY_TARGET_TYPES])
  target_type!: QualityTargetType;

  @ApiProperty({ example: 'dlog_123_or_uuid' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  target_id!: string;

  @ApiProperty({ example: 'DRIFT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON payload for training/audit' })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class AdminQualityMarkListQueryDto {
  @ApiPropertyOptional({ description: 'Pagination offset', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ description: 'Pagination limit', example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  take?: number;

  @ApiPropertyOptional({ enum: QUALITY_TARGET_TYPES })
  @IsOptional()
  @IsIn([...QUALITY_TARGET_TYPES])
  target_type?: QualityTargetType;

  @ApiPropertyOptional({ description: 'Filter by target_id' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  target_id?: string;

  @ApiPropertyOptional({ description: 'Filter by label' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @ApiPropertyOptional({ description: 'meta.auto_sampled=true|false' })
  @IsOptional()
  @IsIn(['true', 'false'])
  auto_sampled?: 'true' | 'false';
}

export class AdminQualityMarkUpdateDto {
  @ApiPropertyOptional({ example: 'CRITICAL_DRIFT' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON payload for training/audit' })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

