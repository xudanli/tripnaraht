import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
const TRIP_MOOD_VALUES = ['relax', 'adventure', 'healing', 'social'] as const;
const TRAVEL_MODE_VALUES = ['self_drive', 'public_transit', 'mixed', 'other'] as const;
export type TripMoodTag = (typeof TRIP_MOOD_VALUES)[number];
export type TravelMode = (typeof TRAVEL_MODE_VALUES)[number];
const PLANNING_STYLE_VALUES = ['full_managed', 'co_planning', 'casual_play'] as const;

export class LaunchRecruitmentFromTemplateDto {
  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-07-04' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ minimum: 1, maximum: 6 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  slotsNeeded!: number;

  @ApiProperty({
    enum: PLANNING_STYLE_VALUES,
    example: 'co_planning',
    description: '策划协作三档：full_managed / co_planning / casual_play',
  })
  @IsIn([...PLANNING_STYLE_VALUES])
  planningStyle!: (typeof PLANNING_STYLE_VALUES)[number];

  @ApiPropertyOptional({ example: '杭州出发' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  departureLabel?: string;

  @ApiPropertyOptional({ description: '人均预算下限（分）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMinCents?: number;

  @ApiPropertyOptional({ description: '人均预算上限（分）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMaxCents?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  captainMessage?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  preferenceNotes?: string;

  @ApiPropertyOptional({ enum: TRIP_MOOD_VALUES })
  @IsOptional()
  @IsIn([...TRIP_MOOD_VALUES])
  tripMoodTag?: TripMoodTag;

  @ApiPropertyOptional({ enum: TRAVEL_MODE_VALUES })
  @IsOptional()
  @IsIn([...TRAVEL_MODE_VALUES])
  travelMode?: TravelMode;

  @ApiPropertyOptional({ description: '前端 catalog 匹配结果，可选；缺省时后端用模板元数据或模板名兜底' })
  @IsOptional()
  @IsString()
  routeTemplateCatalogId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  routeTemplateTitleZh?: string;
}
