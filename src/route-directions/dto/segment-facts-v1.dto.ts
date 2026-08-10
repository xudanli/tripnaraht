import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_SEGMENT_FACT_CONFIDENCE,
  ROAD_CONDITION_STATUSES,
  ROUTE_DIRECTION_ADMIN_METADATA_SOURCE,
  type RoadConditionStatus,
} from '../contracts/admin-metadata.v1';

export class SeasonalClosureDto {
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsNumber()
  @Min(1)
  @Max(12)
  startMonth!: number;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsNumber()
  @Min(1)
  @Max(12)
  endMonth!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SegmentConnectivityDto {
  @ApiProperty()
  @IsBoolean()
  isConnected!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RoadConditionDto {
  @ApiProperty({ enum: ROAD_CONDITION_STATUSES })
  @IsIn([...ROAD_CONDITION_STATUSES])
  status!: RoadConditionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp' })
  @IsOptional()
  @IsString()
  updatedAt?: string;
}

export class SegmentGradeElevationDto {
  @ApiPropertyOptional({ description: 'Max grade percent' })
  @IsOptional()
  @IsNumber()
  maxGradePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxElevationM?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minElevationM?: number;
}

/**
 * Validated SegmentFactV1 — stored at metadata.segment_facts_v1[]
 */
export class SegmentFactV1Dto {
  @ApiProperty({ example: 'F208' })
  @IsString()
  roadId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromPoiId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toPoiId?: string;

  @ApiPropertyOptional({ enum: ['BIDIRECTIONAL', 'ONE_WAY'] })
  @IsOptional()
  @IsIn(['BIDIRECTIONAL', 'ONE_WAY'])
  direction?: 'BIDIRECTIONAL' | 'ONE_WAY';

  @ApiPropertyOptional({ type: SegmentConnectivityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentConnectivityDto)
  connectivity?: SegmentConnectivityDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  baseDurationMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  estimatedSpeedFactor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires4x4?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresPermit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  surfaceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  segmentType?: string;

  @ApiPropertyOptional({ type: [SeasonalClosureDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeasonalClosureDto)
  seasonalClosures?: SeasonalClosureDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hazards?: string[];

  @ApiPropertyOptional({ type: RoadConditionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RoadConditionDto)
  roadCondition?: RoadConditionDto;

  @ApiPropertyOptional({ type: SegmentGradeElevationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentGradeElevationDto)
  gradeElevation?: SegmentGradeElevationDto;

  @ApiPropertyOptional({
    default: DEFAULT_SEGMENT_FACT_CONFIDENCE,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedAt?: string;

  @ApiPropertyOptional({
    default: ROUTE_DIRECTION_ADMIN_METADATA_SOURCE,
  })
  @IsOptional()
  @IsString()
  source?: string;
}

export class PatchSegmentFactsDto {
  @ApiProperty({ type: [SegmentFactV1Dto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentFactV1Dto)
  facts!: SegmentFactV1Dto[];

  @ApiPropertyOptional({
    enum: ['replace', 'upsert'],
    default: 'replace',
    description:
      'replace: overwrite array; upsert: merge by roadId (+ from/to when present)',
  })
  @IsOptional()
  @IsIn(['replace', 'upsert'])
  mode?: 'replace' | 'upsert';
}
