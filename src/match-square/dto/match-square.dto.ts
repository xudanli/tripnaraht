import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const emptyQueryValueToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' || trimmed === 'undefined' || trimmed === 'null'
    ? undefined
    : trimmed;
};

export class ListPostsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional()
  @Transform(emptyQueryValueToUndefined)
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @Transform(emptyQueryValueToUndefined)
  @IsOptional()
  @IsDateString()
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
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
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

  // Attribution context fields (optional)
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  compatibilityScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['high', 'medium', 'low'])
  mbtiCompatibility?: 'high' | 'medium' | 'low';

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicantSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  scheduleConflict?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['excellent', 'good', 'poor'])
  timeAvailability?: 'excellent' | 'good' | 'poor';

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['perfect', 'acceptable', 'poor'])
  budgetFit?: 'perfect' | 'acceptable' | 'poor';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captainPreference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slotRequirement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  teamBalance?: {
    genderBalance?: number;
    ageBalance?: number;
    roleBalance?: number;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pastCollaboration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ each: true })
  governanceFlags?: string[];
}

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({ enum: ['pending'] })
  @IsOptional()
  @IsEnum(['pending'])
  status?: 'pending';
}
