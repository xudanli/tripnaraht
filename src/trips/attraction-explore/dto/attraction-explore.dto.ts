import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  AttractionExplorePriority,
  AttractionExploreSortId,
  AttractionExploreViewTab,
} from '../types/attraction-explore.types';
import {
  ATTRACTION_EXPLORE_SORT_IDS,
} from '../constants/attraction-explore-catalog.constants';

export class AttractionExploreSelectedFiltersDto {
  @ApiPropertyOptional({ type: [String], description: '快捷 Chip ids：nearby | indoor | supply | easy | team' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  quickFilterIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  themeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suitabilityIds?: string[];

  @ApiPropertyOptional({ enum: ['recommended', 'map', 'along_route'] })
  @IsOptional()
  @IsIn(['recommended', 'map', 'along_route'])
  viewTab?: AttractionExploreViewTab;

  @ApiPropertyOptional({ enum: ['smart', 'distance', 'match', 'open_now'] })
  @IsOptional()
  @IsIn(['smart', 'distance', 'match', 'open_now'])
  sort?: AttractionExploreSortId;
}

export class AttractionExploreContextQueryDto {
  @ApiPropertyOptional({
    description: '1-based 焦点日（添加活动页建议必传；缺省时不回显 dayLabel）',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayIndex?: number;
}

export class AttractionExploreRecommendationsQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated theme ids' })
  @IsOptional()
  @IsString()
  themeIds?: string;

  @ApiPropertyOptional({ description: 'Comma-separated suitability ids' })
  @IsOptional()
  @IsString()
  suitabilityIds?: string;

  @ApiPropertyOptional({ enum: ['recommended', 'map', 'along_route'] })
  @IsOptional()
  @IsIn(['recommended', 'map', 'along_route'])
  viewTab?: AttractionExploreViewTab;

  @ApiPropertyOptional({
    description: '1-based 焦点日：按当日主题/地点过滤已出现推荐，并按当日上下文排序',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayIndex?: number;

  @ApiPropertyOptional({ description: '顺路推荐使用实时路由 API' })
  @IsOptional()
  @Type(() => Boolean)
  useLiveRoutes?: boolean;

  @ApiPropertyOptional({
    description: '单个快捷筛选（与 Chip 对应）；也可用 quickFilterIds',
    example: 'nearby',
  })
  @IsOptional()
  @IsString()
  quickFilter?: string;

  @ApiPropertyOptional({ description: 'Comma-separated quick filter ids' })
  @IsOptional()
  @IsString()
  quickFilterIds?: string;

  @ApiPropertyOptional({ enum: ['smart', 'distance', 'match', 'open_now'] })
  @IsOptional()
  @IsIn(['smart', 'distance', 'match', 'open_now'])
  sort?: AttractionExploreSortId;

  @ApiPropertyOptional({ description: '搜索词（可与 spatial/search 共用）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: '用户纬度，用于附近/驾车时间' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: '用户经度，用于附近/驾车时间' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

export class AttractionExploreSearchDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  query!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  themeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suitabilityIds?: string[];

  @ApiPropertyOptional({ enum: ['recommended', 'map', 'along_route'] })
  @IsOptional()
  @IsIn(['recommended', 'map', 'along_route'])
  viewTab?: AttractionExploreViewTab;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: '搜索评分使用实时路由绕路成本' })
  @IsOptional()
  @Type(() => Boolean)
  useLiveRoutes?: boolean;

  @ApiPropertyOptional({ description: '规则不足时 LLM 增强意图解析' })
  @IsOptional()
  @Type(() => Boolean)
  useLlmIntent?: boolean;

  @ApiPropertyOptional({
    description: '1-based 焦点日：搜索结果按当日上下文排序，并标记已在行程',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayIndex?: number;
}

export class AddAttractionExploreCandidateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  placeId?: number;

  @ApiPropertyOptional({ description: 'Alias of placeId via Place.uuid' })
  @IsOptional()
  @IsString()
  attractionId?: string;

  @ApiPropertyOptional({ enum: ['must_go', 'very_interested', 'alternative'] })
  @IsOptional()
  @IsIn(['must_go', 'very_interested', 'alternative'])
  priority?: AttractionExplorePriority;
}

export class PatchAttractionExploreCandidateItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ enum: ['must_go', 'very_interested', 'alternative'] })
  @IsIn(['must_go', 'very_interested', 'alternative'])
  priority!: AttractionExplorePriority;

  @ApiProperty()
  @IsInt()
  sortOrder!: number;
}

export class PatchAttractionExploreCandidatesDto {
  @ApiProperty({ type: [PatchAttractionExploreCandidateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchAttractionExploreCandidateItemDto)
  candidates!: PatchAttractionExploreCandidateItemDto[];
}

export class AttractionExploreAutoArrangeOptionsDto {
  @ApiPropertyOptional({ description: '避免夜间驾驶（默认 true）' })
  @IsOptional()
  @Type(() => Boolean)
  respectNoNightDrive?: boolean;

  @ApiPropertyOptional({ description: '单日最大驾驶分钟（提示用，当前启发式）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDailyDriveMinutes?: number;

  @ApiPropertyOptional({ description: '周末上午预留缓冲' })
  @IsOptional()
  @Type(() => Boolean)
  preferWeekendBuffer?: boolean;
}

export class AttractionExploreAutoArrangeDto {
  @ApiPropertyOptional({ type: [String], description: '仅编排指定候选；缺省=候选池全部' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  candidateIds?: string[];

  @ApiPropertyOptional({
    description: '优先落入哪一天（1-based）；缺省=服务端均匀分配',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayIndex?: number;

  @ApiPropertyOptional({
    enum: ['proposal'],
    description: '固定 proposal；与 commitMode 等价（优先本字段强制草案）',
  })
  @IsOptional()
  @IsIn(['proposal'])
  mode?: 'proposal';

  @ApiPropertyOptional({
    description: '编排选项（向后兼容，均可选）',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttractionExploreAutoArrangeOptionsDto)
  options?: AttractionExploreAutoArrangeOptionsDto;

  @ApiPropertyOptional({
    enum: ['proposal', 'direct'],
    default: 'proposal',
    description: 'proposal=生成草案待确认；direct=兼容旧行为直接写入',
  })
  @IsOptional()
  @IsIn(['proposal', 'direct'])
  commitMode?: 'proposal' | 'direct';
}

export class AttractionExploreAiConsultDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  question?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  candidateIds?: string[];
}

export class AttractionExploreMapQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated candidate ids' })
  @IsOptional()
  @IsString()
  candidateIds?: string;

  @ApiPropertyOptional({ enum: ['recommended', 'map', 'along_route'] })
  @IsOptional()
  @IsIn(['recommended', 'map', 'along_route'])
  viewTab?: AttractionExploreViewTab;

  @ApiPropertyOptional({ description: '1-based 行程日 — 与中栏选中天地图联动' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayIndex?: number;

  @ApiPropertyOptional({ description: '高亮 itinerary item / candidate POI' })
  @IsOptional()
  @IsString()
  highlightItemId?: string;

  @ApiPropertyOptional({ description: '为候选 POI 附带插入建议（绕路/推荐时段）' })
  @IsOptional()
  @Type(() => Boolean)
  includeInsertHints?: boolean;
}

export class AttractionExploreIntentDto {
  @ApiProperty({ example: '适合老人、停车方便、沿黄金圈路线的自然景点' })
  @IsString()
  @MaxLength(500)
  query!: string;

  @ApiPropertyOptional({ description: '规则不足时启用 LLM 增强解析' })
  @IsOptional()
  @Type(() => Boolean)
  useLlm?: boolean;
}

export class AttractionExploreMapPlaceProposalDto {
  @ApiProperty()
  @IsInt()
  placeId!: number;

  @ApiPropertyOptional({ description: '1-based 目标日' })
  @IsOptional()
  @IsInt()
  @Min(1)
  dayIndex?: number;

  @ApiPropertyOptional({ description: '若来自候选清单' })
  @IsOptional()
  @IsString()
  candidateId?: string;
}

export class UpdateAttractionExploreContextDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  themeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suitabilityIds?: string[];

  @ApiPropertyOptional({ enum: ['recommended', 'map', 'along_route'] })
  @IsOptional()
  @IsIn(['recommended', 'map', 'along_route'])
  viewTab?: AttractionExploreViewTab;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  quickFilterIds?: string[];

  @ApiPropertyOptional({ enum: ['smart', 'distance', 'match', 'open_now'] })
  @IsOptional()
  @IsIn(['smart', 'distance', 'match', 'open_now'])
  sort?: AttractionExploreSortId;

  /** 前端常用嵌套写法 — 与顶层字段等价 */
  @ApiPropertyOptional({ type: AttractionExploreSelectedFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttractionExploreSelectedFiltersDto)
  selectedFilters?: AttractionExploreSelectedFiltersDto;

  @ApiPropertyOptional({ description: '1-based；写入后 GET context 回显' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayIndex?: number;
}

export function normalizeContextPatch(
  dto: UpdateAttractionExploreContextDto,
): UpdateAttractionExploreContextDto {
  return {
    themeIds: dto.themeIds ?? dto.selectedFilters?.themeIds,
    suitabilityIds: dto.suitabilityIds ?? dto.selectedFilters?.suitabilityIds,
    viewTab: dto.viewTab ?? dto.selectedFilters?.viewTab,
    quickFilterIds: dto.quickFilterIds ?? dto.selectedFilters?.quickFilterIds,
    sort: dto.sort ?? dto.selectedFilters?.sort,
    dayIndex: dto.dayIndex,
  };
}

export function parseCsvIds(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseSortId(raw?: string): AttractionExploreSortId | undefined {
  if (!raw?.trim()) return undefined;
  return (ATTRACTION_EXPLORE_SORT_IDS as readonly string[]).includes(raw)
    ? (raw as AttractionExploreSortId)
    : undefined;
}
