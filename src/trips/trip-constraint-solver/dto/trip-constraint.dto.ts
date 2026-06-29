import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  TRIP_CONSTRAINT_CATEGORIES,
  TRIP_CONSTRAINT_OPERATORS,
  TRIP_CONSTRAINT_SCOPE_TYPES,
  TRIP_CONSTRAINT_SOURCE_TYPES,
  TRIP_CONSTRAINT_STATUSES,
  TRIP_CONSTRAINT_TYPES,
  TRIP_CONSTRAINT_VISIBILITY,
  type TripConstraintCategory,
  type TripConstraintOperator,
  type TripConstraintScopeType,
  type TripConstraintSourceType,
  type TripConstraintStatus,
  type TripConstraintType,
  type TripConstraintVisibility,
} from '../types/trip-constraint.types';

export class TripConstraintScopeDto {
  @ApiProperty({ enum: TRIP_CONSTRAINT_SCOPE_TYPES })
  @IsIn(TRIP_CONSTRAINT_SCOPE_TYPES)
  type!: TripConstraintScopeType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}

export class TripConstraintSourceDto {
  @ApiProperty({ enum: TRIP_CONSTRAINT_SOURCE_TYPES })
  @IsIn(TRIP_CONSTRAINT_SOURCE_TYPES)
  type!: TripConstraintSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string;
}

export class TripConstraintDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tripId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: TRIP_CONSTRAINT_CATEGORIES })
  category!: TripConstraintCategory;

  @ApiProperty({ enum: TRIP_CONSTRAINT_TYPES })
  type!: TripConstraintType;

  @ApiProperty({ enum: TRIP_CONSTRAINT_STATUSES })
  status!: TripConstraintStatus;

  @ApiProperty({ type: TripConstraintScopeDto })
  scope!: TripConstraintScopeDto;

  @ApiProperty({ enum: TRIP_CONSTRAINT_OPERATORS })
  operator!: TripConstraintOperator;

  @ApiProperty({ description: '约束目标值（类型因 operator/category 而异）' })
  value!: unknown;

  @ApiPropertyOptional()
  unit?: string;

  @ApiPropertyOptional()
  tolerance?: unknown;

  @ApiPropertyOptional()
  priority?: number;

  @ApiProperty()
  allowRelaxation!: boolean;

  @ApiProperty()
  locked!: boolean;

  @ApiProperty({ type: TripConstraintSourceDto })
  source!: TripConstraintSourceDto;

  @ApiProperty({ enum: TRIP_CONSTRAINT_VISIBILITY })
  visibility!: TripConstraintVisibility;

  @ApiPropertyOptional({ type: [String] })
  evidenceIds?: string[];

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional()
  hasConflict?: boolean;

  @ApiPropertyOptional({
    enum: ['default', 'caution', 'danger', 'muted'],
    description: '卡片视觉：default=灰框+锁图标；danger=仅冲突项 accent',
  })
  cardTone?: 'default' | 'caution' | 'danger' | 'muted';
}

export class ListTripConstraintsQueryDto {
  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_TYPES })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_TYPES)
  type?: TripConstraintType;

  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_CATEGORIES })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_CATEGORIES)
  category?: TripConstraintCategory;

  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_STATUSES })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_STATUSES)
  status?: TripConstraintStatus;

  @ApiPropertyOptional({ description: '成员 ID（wish / profiling 过滤）' })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({ description: 'TripDay.id' })
  @IsOptional()
  @IsString()
  dayId?: string;

  @ApiPropertyOptional({ description: '仅返回存在冲突的约束' })
  @IsOptional()
  @IsString()
  conflictOnly?: string;
}

export class CreateTripConstraintDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TRIP_CONSTRAINT_CATEGORIES })
  @IsIn(TRIP_CONSTRAINT_CATEGORIES)
  category!: TripConstraintCategory;

  @ApiProperty({ enum: TRIP_CONSTRAINT_TYPES })
  @IsIn(TRIP_CONSTRAINT_TYPES)
  type!: TripConstraintType;

  @ApiProperty({ type: TripConstraintScopeDto })
  @ValidateNested()
  @Type(() => TripConstraintScopeDto)
  scope!: TripConstraintScopeDto;

  @ApiProperty({ enum: TRIP_CONSTRAINT_OPERATORS })
  @IsIn(TRIP_CONSTRAINT_OPERATORS)
  operator!: TripConstraintOperator;

  @ApiProperty()
  value!: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  tolerance?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowRelaxation?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({ type: TripConstraintSourceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TripConstraintSourceDto)
  source?: TripConstraintSourceDto;

  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_VISIBILITY, default: 'TEAM' })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_VISIBILITY)
  visibility?: TripConstraintVisibility;

  @ApiPropertyOptional({ description: '乐观锁：与 GET 列表 meta.constraintsVersion 对齐' })
  @IsOptional()
  @IsNumber()
  constraintsVersion?: number;
}

export class PatchTripConstraintDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_CATEGORIES })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_CATEGORIES)
  category?: TripConstraintCategory;

  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_TYPES })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_TYPES)
  type?: TripConstraintType;

  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_STATUSES })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_STATUSES)
  status?: TripConstraintStatus;

  @ApiPropertyOptional({ type: TripConstraintScopeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TripConstraintScopeDto)
  scope?: TripConstraintScopeDto;

  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_OPERATORS })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_OPERATORS)
  operator?: TripConstraintOperator;

  @ApiPropertyOptional()
  @IsOptional()
  value?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  tolerance?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowRelaxation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({ enum: TRIP_CONSTRAINT_VISIBILITY })
  @IsOptional()
  @IsIn(TRIP_CONSTRAINT_VISIBILITY)
  visibility?: TripConstraintVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  constraintsVersion?: number;
}

export class TripConstraintChangeDto {
  @ApiProperty()
  @IsString()
  constraintId!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  patch!: Record<string, unknown>;
}

export class PreviewConstraintImpactDto {
  @ApiProperty({ type: [TripConstraintChangeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripConstraintChangeDto)
  changes!: TripConstraintChangeDto[];

  @ApiPropertyOptional({ description: '针对的方案 ID（What-if）' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: '预览后是否持久化（默认 false）' })
  @IsOptional()
  @IsBoolean()
  persist?: boolean;
}

export class RepairConstraintsDto {
  @ApiPropertyOptional({ description: 'feasibility issueId；缺省取首个 must_handle' })
  @IsOptional()
  @IsString()
  issueId?: string;
}

export class DisableConstraintDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  constraintsVersion?: number;
}
