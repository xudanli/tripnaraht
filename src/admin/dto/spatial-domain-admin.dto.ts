import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CoordinatesDto {
  @ApiProperty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

export class PoiTimeWindowDto {
  @ApiProperty({ description: '支持 MON..SUN / MON-FRI / DAILY' })
  @IsString()
  weekday!: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  open!: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  close!: string;

  @ApiPropertyOptional({ example: 'Atlantic/Reykjavik' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class PoiDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ type: CoordinatesDto })
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates!: CoordinatesDto;

  @ApiPropertyOptional({ type: [PoiTimeWindowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoiTimeWindowDto)
  time_windows?: PoiTimeWindowDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacity_limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class UpdatePoiDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: CoordinatesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;

  @ApiPropertyOptional({ type: [PoiTimeWindowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoiTimeWindowDto)
  time_windows?: PoiTimeWindowDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacity_limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class GradientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  avg_percent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  max_percent?: number;
}

export class RoadConditionDto {
  @ApiPropertyOptional({ enum: ['PAVED', 'GRAVEL', 'MIXED', 'SNOW', 'ICE'] })
  @IsOptional()
  @IsIn(['PAVED', 'GRAVEL', 'MIXED', 'SNOW', 'ICE'])
  surface?: 'PAVED' | 'GRAVEL' | 'MIXED' | 'SNOW' | 'ICE';

  @ApiPropertyOptional({ enum: ['OPEN', 'LIMITED', 'CLOSED'] })
  @IsOptional()
  @IsIn(['OPEN', 'LIMITED', 'CLOSED'])
  status?: 'OPEN' | 'LIMITED' | 'CLOSED';
}

export class SeasonalClosureDto {
  @ApiProperty()
  @IsString()
  start!: string;

  @ApiProperty()
  @IsString()
  end!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SegmentDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsString()
  from_poi_id!: string;

  @ApiProperty()
  @IsString()
  to_poi_id!: string;

  @ApiProperty({ enum: ['HIGHWAY', 'F_ROAD', 'CITY'] })
  @IsIn(['HIGHWAY', 'F_ROAD', 'CITY'])
  segment_type!: 'HIGHWAY' | 'F_ROAD' | 'CITY';

  @ApiPropertyOptional({ type: GradientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GradientDto)
  gradient?: GradientDto;

  @ApiPropertyOptional({ type: RoadConditionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RoadConditionDto)
  road_condition?: RoadConditionDto;

  @ApiPropertyOptional({ type: [SeasonalClosureDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeasonalClosureDto)
  seasonal_closures?: SeasonalClosureDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class UpdateSegmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from_poi_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to_poi_id?: string;

  @ApiPropertyOptional({ enum: ['HIGHWAY', 'F_ROAD', 'CITY'] })
  @IsOptional()
  @IsIn(['HIGHWAY', 'F_ROAD', 'CITY'])
  segment_type?: 'HIGHWAY' | 'F_ROAD' | 'CITY';

  @ApiPropertyOptional({ type: GradientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GradientDto)
  gradient?: GradientDto;

  @ApiPropertyOptional({ type: RoadConditionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RoadConditionDto)
  road_condition?: RoadConditionDto;

  @ApiPropertyOptional({ type: [SeasonalClosureDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeasonalClosureDto)
  seasonal_closures?: SeasonalClosureDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class ValidatePoiTimeWindowsDto {
  @ApiProperty()
  @IsString()
  at!: string;
}

export class ValidateSegmentFeasibilityDto {
  @ApiProperty()
  @IsString()
  enterAt!: string;

  @ApiPropertyOptional({ enum: ['SEDAN', 'SUV', 'FOUR_BY_FOUR'] })
  @IsOptional()
  @IsIn(['SEDAN', 'SUV', 'FOUR_BY_FOUR'])
  vehicleType?: 'SEDAN' | 'SUV' | 'FOUR_BY_FOUR';
}

export class MapSnapshotDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
