import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export { CreateHikePlanWithSegmentDto } from './create-hike-plan-with-segment.dto';

export class CreateHikePlanDto {
  @ApiProperty()
  @IsInt()
  routeDirectionId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiPropertyOptional({ example: '2026-07-15' })
  @IsOptional()
  @IsString()
  plannedDate?: string;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @IsString()
  plannedStartTime?: string;
}

export class PatchHikePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plannedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plannedStartTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class TrackPointDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsNumber()
  altitudeM?: number;

  @IsOptional()
  @IsNumber()
  accuracyM?: number;

  @IsString()
  recordedAt!: string;
}

export class PostTrackPointsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientBatchId?: string;

  @ApiProperty({ type: [TrackPointDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackPointDto)
  points!: TrackPointDto[];
}

export class PatchPrepDto {
  @ApiPropertyOptional()
  @IsOptional()
  checklist?: unknown[];

  @ApiPropertyOptional()
  @IsOptional()
  permits?: unknown[];

  @ApiPropertyOptional()
  @IsOptional()
  transport?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  checklistComplete?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  permitsComplete?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  offlineReady?: boolean;
}

export class PatchLiveStateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  currentDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  currentSegmentIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastCheckpointId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  events?: unknown[];
}

export class PatchReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summaryZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  highlights?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  lessons?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}

export class ListHikePlansQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  routeDirectionId?: number;

  @ApiPropertyOptional({ description: '仅返回绑定该 Trip 的 HikePlan' })
  @IsOptional()
  @IsUUID()
  tripId?: string;
}
