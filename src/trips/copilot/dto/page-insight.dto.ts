import { IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { PageId, TripLifecycle, InsightFeedbackType } from '../contracts/page-insight.types';

class EntityRefDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;
}

class ViewportDto {
  @IsOptional()
  @IsString()
  activeTab?: string;

  @IsOptional()
  @IsString()
  selectedDayId?: string | null;

  @IsOptional()
  @IsNumber()
  selectedDayIndex?: number | null;

  @IsOptional()
  @IsObject()
  mapBounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

class DraftRefDto {
  @IsString()
  draftId!: string;

  @IsNumber()
  revision!: number;
}

class RecentActionDto {
  @IsString()
  type!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EntityRefDto)
  targetRef?: EntityRefDto;
}

export class EvaluatePageInsightDto {
  @IsString()
  pageId!: PageId;

  @IsIn(['PLANNING', 'TRAVELING', 'COMPLETED'])
  lifecycle!: TripLifecycle;

  @IsOptional()
  @IsIn(['ACTIVITY_EDITOR', 'ITINERARY_DAY_EDITOR', 'PLANNING_OVERVIEW', 'EXECUTION_HOME'])
  pageMode?: 'ACTIVITY_EDITOR' | 'ITINERARY_DAY_EDITOR' | 'PLANNING_OVERVIEW' | 'EXECUTION_HOME';

  @IsOptional()
  @IsIn(['ACTIVITY', 'ITINERARY_DAY', 'TRIP', 'EXECUTION'])
  insightScope?: 'ACTIVITY' | 'ITINERARY_DAY' | 'TRIP' | 'EXECUTION';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntityRefDto)
  selectedRefs?: EntityRefDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ViewportDto)
  viewport?: ViewportDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftRefDto)
  draftRef?: DraftRefDto | null;

  @IsOptional()
  @IsNumber()
  draftRevision?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecentActionDto)
  recentAction?: RecentActionDto;

  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class PageInsightFeedbackDto {
  @IsIn([
    'OPENED',
    'DISMISSED',
    'SNOOZED',
    'ACTION_PREVIEWED',
    'ACTION_ACCEPTED',
    'ACTION_REJECTED',
    'NOT_RELEVANT',
  ])
  type!: InsightFeedbackType;

  @IsOptional()
  @IsString()
  actionRef?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  clientTimestamp?: string;
}
