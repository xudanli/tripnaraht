import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  AttractionExplorePriority,
  AttractionExploreViewTab,
} from '../types/attraction-explore.types';

export class AttractionExploreSelectedFiltersDto {
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

  @ApiPropertyOptional({ description: '顺路推荐使用实时路由 API' })
  @IsOptional()
  @Type(() => Boolean)
  useLiveRoutes?: boolean;
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

export class AttractionExploreAutoArrangeDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  candidateIds?: string[];

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

  /** 前端常用嵌套写法 — 与顶层 themeIds / suitabilityIds / viewTab 等价 */
  @ApiPropertyOptional({ type: AttractionExploreSelectedFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttractionExploreSelectedFiltersDto)
  selectedFilters?: AttractionExploreSelectedFiltersDto;
}

export function normalizeContextPatch(
  dto: UpdateAttractionExploreContextDto,
): UpdateAttractionExploreContextDto {
  return {
    themeIds: dto.themeIds ?? dto.selectedFilters?.themeIds,
    suitabilityIds: dto.suitabilityIds ?? dto.selectedFilters?.suitabilityIds,
    viewTab: dto.viewTab ?? dto.selectedFilters?.viewTab,
  };
}

export function parseCsvIds(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
