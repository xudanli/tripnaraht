import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListPostsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Comma-separated MBTI types' })
  @IsOptional()
  @IsString()
  personaTypes?: string;

  @ApiPropertyOptional({ description: 'Comma-separated quadrants NT,NF,SP,SJ' })
  @IsOptional()
  @IsString()
  personaQuadrants?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  interactionModes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planningStyles?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreatePostDto {
  @ApiProperty()
  @IsString()
  destination!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departureLabel?: string;

  @ApiProperty()
  @IsString()
  startDate!: string;

  @ApiProperty()
  @IsString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itinerarySummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  budgetMinCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  budgetMaxCents?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  slotsNeeded!: number;

  @ApiProperty({ enum: ['full_managed', 'co_planning', 'casual_play'] })
  @IsEnum(['full_managed', 'co_planning', 'casual_play'])
  planningStyle!: 'full_managed' | 'co_planning' | 'casual_play';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferences?: string;

  @ApiPropertyOptional({ enum: ['relax', 'adventure', 'healing', 'social'] })
  @IsOptional()
  @IsEnum(['relax', 'adventure', 'healing', 'social'])
  tripMoodTag?: 'relax' | 'adventure' | 'healing' | 'social';

  @ApiPropertyOptional({ enum: ['self_drive', 'public_transit', 'mixed', 'other'] })
  @IsOptional()
  @IsEnum(['self_drive', 'public_transit', 'mixed', 'other'])
  travelMode?: 'self_drive' | 'public_transit' | 'mixed' | 'other';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleInfo?: string;

  @ApiProperty()
  @IsString()
  captainMessage!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vibeFreeText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  vibeParse?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  routeDirectionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  routeDirectionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  coordinates?: { lat?: number; lng?: number };
}

export class UpdatePostStatusDto {
  @ApiProperty({ enum: ['active', 'hidden', 'closed'] })
  @IsEnum(['active', 'hidden', 'closed'])
  status!: 'active' | 'hidden' | 'closed';
}

export class SubmitApplicationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  planningCommitmentAccepted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  teamworkCommitmentAccepted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetSlotIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetSlotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetSlotLabel?: string;
}

export class ReviewApplicationDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';
}

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({ enum: ['pending'] })
  @IsOptional()
  @IsEnum(['pending'])
  status?: 'pending';
}
