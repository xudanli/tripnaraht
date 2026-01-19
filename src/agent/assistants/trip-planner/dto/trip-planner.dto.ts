// src/agent/assistants/trip-planner/dto/trip-planner.dto.ts

import { IsString, IsOptional, IsNumber, IsObject, IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ==================== 上下文相关 DTO ====================

/**
 * 选中的行程项上下文
 */
export class SelectedContextDto {
  @ApiPropertyOptional({ description: '选中的天数 (1-based)', example: 1 })
  @IsNumber()
  @IsOptional()
  dayIndex?: number;

  @ApiPropertyOptional({ description: '选中的日期', example: '2026-03-01' })
  @IsString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ description: '选中的行程项 ID', example: 'item_浅草寺' })
  @IsString()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: '选中的地点名称', example: '浅草寺' })
  @IsString()
  @IsOptional()
  placeName?: string;

  @ApiPropertyOptional({ 
    description: '选中的行程项类型',
    enum: ['ACTIVITY', 'TRANSIT', 'MEAL_ANCHOR', 'MEAL_FLOATING', 'REST'],
    example: 'ACTIVITY',
  })
  @IsString()
  @IsOptional()
  itemType?: 'ACTIVITY' | 'TRANSIT' | 'MEAL_ANCHOR' | 'MEAL_FLOATING' | 'REST';
}

/**
 * 相邻行程项
 */
export class AdjacentItemDto {
  @ApiProperty({ description: '名称', example: '浅草寺' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '结束时间 (ISO 8601)', example: '2026-03-01T11:00:00.000Z' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ description: '开始时间 (ISO 8601)', example: '2026-03-01T12:00:00.000Z' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ description: '类型', example: 'ACTIVITY' })
  @IsString()
  @IsOptional()
  type?: string;
}

/**
 * 前后衔接信息
 */
export class AdjacentItemsDto {
  @ApiPropertyOptional({ description: '前一个行程项' })
  @ValidateNested()
  @Type(() => AdjacentItemDto)
  @IsOptional()
  prevItem?: AdjacentItemDto;

  @ApiPropertyOptional({ description: '后一个行程项' })
  @ValidateNested()
  @Type(() => AdjacentItemDto)
  @IsOptional()
  nextItem?: AdjacentItemDto;
}

/**
 * 空闲时段
 */
export class FreeSlotDto {
  @ApiProperty({ description: '开始时间 (HH:mm)', example: '14:00' })
  @IsString()
  start!: string;

  @ApiProperty({ description: '结束时间 (HH:mm)', example: '17:00' })
  @IsString()
  end!: string;
}

/**
 * 当天统计
 */
export class DayStatsDto {
  @ApiProperty({ description: '总行程项数', example: 5 })
  @IsNumber()
  totalItems!: number;

  @ApiProperty({ description: '是否有用餐安排', example: true })
  @IsBoolean()
  hasMeal!: boolean;

  @ApiProperty({ description: '是否有交通安排', example: true })
  @IsBoolean()
  hasTransit!: boolean;

  @ApiPropertyOptional({ description: '空闲时段列表', type: [FreeSlotDto] })
  @ValidateNested({ each: true })
  @Type(() => FreeSlotDto)
  @IsOptional()
  freeSlots?: FreeSlotDto[];
}

/**
 * 当前位置
 */
export class CurrentLocationDto {
  @ApiProperty({ description: '纬度', example: 35.7147 })
  @IsNumber()
  lat!: number;

  @ApiProperty({ description: '经度', example: 139.7967 })
  @IsNumber()
  lng!: number;
}

/**
 * 增强的上下文 DTO
 */
export class EnhancedContextDto {
  @ApiPropertyOptional({ description: '用户当前选中的上下文' })
  @ValidateNested()
  @Type(() => SelectedContextDto)
  @IsOptional()
  selectedContext?: SelectedContextDto;

  @ApiPropertyOptional({ description: '前后衔接信息' })
  @ValidateNested()
  @Type(() => AdjacentItemsDto)
  @IsOptional()
  adjacentItems?: AdjacentItemsDto;

  @ApiPropertyOptional({ description: '当天统计' })
  @ValidateNested()
  @Type(() => DayStatsDto)
  @IsOptional()
  dayStats?: DayStatsDto;

  @ApiPropertyOptional({ description: '当前位置' })
  @ValidateNested()
  @Type(() => CurrentLocationDto)
  @IsOptional()
  currentLocation?: CurrentLocationDto;

  @ApiPropertyOptional({ description: '时区', example: 'Asia/Tokyo' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ description: '语言', enum: ['zh', 'en'], example: 'zh' })
  @IsString()
  @IsOptional()
  language?: 'zh' | 'en';
}

// ==================== 澄清相关 DTO ====================

/**
 * 时间段
 */
export class TimeSlotDto {
  @ApiProperty({ description: '开始时间 (HH:mm)', example: '11:30' })
  @IsString()
  start!: string;

  @ApiProperty({ description: '结束时间 (HH:mm)', example: '14:00' })
  @IsString()
  end!: string;
}

/**
 * 澄清目标参数
 */
export class ClarificationParamsDto {
  @ApiPropertyOptional({ description: '目标天数 (1-based)', example: 1 })
  @IsNumber()
  @IsOptional()
  dayNumber?: number;

  @ApiPropertyOptional({ description: '时间段' })
  @ValidateNested()
  @Type(() => TimeSlotDto)
  @IsOptional()
  timeSlot?: TimeSlotDto;

  @ApiPropertyOptional({ description: '目标行程项 ID', example: 'item_xxx' })
  @IsString()
  @IsOptional()
  targetItemId?: string;

  @ApiPropertyOptional({ description: '缺口 ID', example: 'gap_meal_1_lunch' })
  @IsString()
  @IsOptional()
  gapId?: string;
}

/**
 * 澄清选择数据
 */
export class ClarificationDataDto {
  @ApiPropertyOptional({
    description: '选择的动作类型',
    enum: ['QUERY', 'ADD_TO_ITINERARY', 'REPLACE', 'REMOVE', 'MODIFY'],
    example: 'ADD_TO_ITINERARY',
  })
  @IsString()
  @IsOptional()
  selectedAction?: 'QUERY' | 'ADD_TO_ITINERARY' | 'REPLACE' | 'REMOVE' | 'MODIFY';

  @ApiPropertyOptional({ description: '目标参数' })
  @ValidateNested()
  @Type(() => ClarificationParamsDto)
  @IsOptional()
  params?: ClarificationParamsDto;
}

// ==================== 主要请求 DTO ====================

/**
 * 开始会话请求
 */
export class StartTripPlannerSessionDto {
  @ApiProperty({
    description: '行程ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  tripId!: string;
}

/**
 * 对话请求（增强版）
 */
export class TripPlannerChatDto {
  @ApiProperty({
    description: '行程ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  tripId!: string;

  @ApiProperty({
    description: '用户消息',
    example: '帮我优化一下行程路线',
  })
  @IsString()
  message!: string;

  @ApiPropertyOptional({
    description: '会话ID（可选，用于继续之前的会话）',
    example: 'planner_xxx_abc123',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description: '目标日期（某些操作需要指定日期）',
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  targetDay?: number;

  @ApiPropertyOptional({
    description: '目标项目ID（某些操作需要指定项目）',
    example: 'item_xxx',
  })
  @IsString()
  @IsOptional()
  targetItemId?: string;

  @ApiPropertyOptional({
    description: '增强的上下文信息',
  })
  @ValidateNested()
  @Type(() => EnhancedContextDto)
  @IsOptional()
  context?: EnhancedContextDto;

  @ApiPropertyOptional({
    description: '澄清选择数据（当用户选择澄清选项时携带）',
  })
  @ValidateNested()
  @Type(() => ClarificationDataDto)
  @IsOptional()
  clarificationData?: ClarificationDataDto;
}

/**
 * 快捷操作请求
 */
export class TripPlannerActionDto {
  @ApiProperty({
    description: '行程ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  tripId!: string;

  @ApiProperty({
    description: '操作类型',
    example: 'OPTIMIZE_ROUTE',
  })
  @IsString()
  action!: string;

  @ApiPropertyOptional({
    description: '会话ID',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description: '操作参数',
  })
  @IsObject()
  @IsOptional()
  params?: Record<string, any>;
}

/**
 * 确认修改请求
 */
export class ConfirmChangesDto {
  @ApiProperty({
    description: '行程ID',
  })
  @IsString()
  tripId!: string;

  @ApiProperty({
    description: '会话ID',
  })
  @IsString()
  sessionId!: string;

  @ApiProperty({
    description: '要确认的修改ID列表',
  })
  @IsArray()
  @IsString({ each: true })
  changeIds!: string[];
}

// ==================== 应用建议相关 DTO ====================

/**
 * 地点信息
 */
export class SuggestionPlaceDto {
  @ApiProperty({ description: '地点名称', example: '一兰拉面' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '中文名称', example: '一兰拉面' })
  @IsString()
  @IsOptional()
  nameCN?: string;

  @ApiPropertyOptional({ description: '地点ID', example: 12345 })
  @IsNumber()
  @IsOptional()
  placeId?: number;

  @ApiPropertyOptional({ description: '类别', example: 'RESTAURANT' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: '地址', example: '东京都台东区浅草1-2-3' })
  @IsString()
  @IsOptional()
  address?: string;
}

/**
 * 应用建议请求
 */
export class ApplySuggestionDto {
  @ApiProperty({
    description: '行程ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  tripId!: string;

  @ApiProperty({
    description: '会话ID',
    example: 'planner_xxx_abc123',
  })
  @IsString()
  sessionId!: string;

  @ApiProperty({
    description: '建议ID',
    example: 'suggestion_ramen_001',
  })
  @IsString()
  suggestionId!: string;

  @ApiProperty({
    description: '目标天数 (1-based)',
    example: 1,
  })
  @IsNumber()
  targetDay!: number;

  @ApiPropertyOptional({
    description: '时间段（可选，未提供则自动安排）',
  })
  @ValidateNested()
  @Type(() => TimeSlotDto)
  @IsOptional()
  timeSlot?: TimeSlotDto;

  @ApiProperty({
    description: '建议类型',
    enum: ['add_place', 'modify_time', 'add_meal', 'optimize_route'],
    example: 'add_place',
  })
  @IsString()
  suggestionType!: 'add_place' | 'modify_time' | 'add_meal' | 'optimize_route';

  @ApiPropertyOptional({
    description: '地点信息（add_place 时必填）',
  })
  @ValidateNested()
  @Type(() => SuggestionPlaceDto)
  @IsOptional()
  place?: SuggestionPlaceDto;
}
