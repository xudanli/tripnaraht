// src/trips/readiness/dto/packing-list.dto.ts
import { IsBoolean, IsArray, IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 自定义打包清单项
 */
export class CustomPackingItemDto {
  @ApiProperty({ description: '物品名称', example: '充电宝' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: '类别',
    enum: ['clothing', 'gear', 'documents', 'electronics', 'food', 'medical', 'other'],
    example: 'electronics',
  })
  @IsEnum(['clothing', 'gear', 'documents', 'electronics', 'food', 'medical', 'other'])
  category!: string;

  @ApiPropertyOptional({ description: '数量', example: 1 })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: '备注', example: '20000mAh' })
  @IsString()
  @IsOptional()
  note?: string;
}

/**
 * 生成打包清单请求 DTO（增强版）
 */
export class GeneratePackingListDto {
  @ApiPropertyOptional({
    description: '是否包含可选物品（默认 false）',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  includeOptional?: boolean;

  @ApiPropertyOptional({
    description: '指定类别',
    example: ['clothing', 'gear', 'documents'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  categories?: string[];

  @ApiPropertyOptional({
    description: '用户自定义物品',
    type: [CustomPackingItemDto],
  })
  @IsArray()
  @IsOptional()
  customItems?: CustomPackingItemDto[];

  // 🆕 新增：基于模板的参数
  @ApiPropertyOptional({
    description: '季节：summer(6-8月), transition(5月/9月), winter(11-3月)',
    enum: ['summer', 'transition', 'winter'],
    example: 'summer',
  })
  @IsString()
  @IsOptional()
  season?: 'summer' | 'transition' | 'winter';

  @ApiPropertyOptional({
    description: '路线类型',
    enum: ['golden_circle', 'south_coast', 'snaefellsnes', 'full_ring_road', 'westfjords', 'highlands', 'custom'],
    example: 'south_coast',
  })
  @IsString()
  @IsOptional()
  route?: string;

  @ApiPropertyOptional({
    description: '用户类型',
    enum: ['first_timer', 'photographer', 'adventurer', 'family_with_kids', 'budget_backpacker', 'cultural_explorer', 'luxury_traveler'],
    example: 'first_timer',
  })
  @IsString()
  @IsOptional()
  userType?: string;

  @ApiPropertyOptional({
    description: '计划的活动',
    type: [String],
    example: ['hiking', 'hot_spring'],
  })
  @IsArray()
  @IsOptional()
  activities?: string[];

  @ApiPropertyOptional({
    description: '租车类型',
    enum: ['compact_car', 'sedan', 'suv_2wd', 'suv_4wd', 'campervan'],
    example: 'suv_4wd',
  })
  @IsString()
  @IsOptional()
  vehicleType?: string;

  @ApiPropertyOptional({
    description: '特殊需求',
    type: [String],
    example: [],
  })
  @IsArray()
  @IsOptional()
  specialNeeds?: string[];

  @ApiPropertyOptional({
    description: '是否使用模板数据生成（默认 true，如果提供了 season 等参数）',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  useTemplate?: boolean;
}

/**
 * 打包清单项 DTO
 */
export class PackingListItemDto {
  @ApiProperty({ description: '物品ID', example: 'item-1' })
  id!: string;

  @ApiProperty({ description: '物品名称', example: '分层保暖衣物' })
  name!: string;

  @ApiProperty({
    description: '类别',
    enum: ['clothing', 'gear', 'documents', 'electronics', 'food', 'medical', 'other'],
    example: 'clothing',
  })
  category!: 'clothing' | 'gear' | 'documents' | 'electronics' | 'food' | 'medical' | 'other';

  @ApiProperty({ description: '数量', example: 3 })
  quantity!: number;

  @ApiPropertyOptional({ description: '单位', example: '套' })
  unit?: string;

  @ApiProperty({
    description: '优先级',
    enum: ['must', 'should', 'optional'],
    example: 'must',
  })
  priority!: 'must' | 'should' | 'optional';

  @ApiPropertyOptional({
    description: '为什么需要这个物品（基于准备度检查结果）',
    example: '冰岛冬季户外温度低，天气多变',
  })
  reason?: string;

  @ApiPropertyOptional({
    description: '来源的 finding ID（如果有）',
    example: 'must-iceland-winter-clothing',
  })
  sourceFindingId?: string;

  @ApiProperty({ description: '是否已勾选（用户标记为已打包）', example: false })
  checked!: boolean;

  @ApiPropertyOptional({ description: '备注', example: '建议准备3套' })
  note?: string;
}

/**
 * 打包清单摘要 DTO
 */
export class PackingListSummaryDto {
  @ApiProperty({ description: '总物品数', example: 15 })
  totalItems!: number;

  @ApiPropertyOptional({
    description: '按类别统计',
    example: {
      clothing: 5,
      gear: 4,
      documents: 3,
      electronics: 2,
      other: 1,
    },
  })
  byCategory?: Record<string, number>;

  @ApiPropertyOptional({ description: '已勾选物品数', example: 5 })
  checkedItems?: number;
}

/**
 * 生成打包清单响应 DTO
 */
export class GeneratePackingListResponseDto {
  @ApiProperty({ description: '行程ID', example: '123' })
  tripId!: string;

  @ApiProperty({
    description: '生成时间（ISO 8601 格式）',
    example: '2024-01-15T10:45:00Z',
  })
  generatedAt!: string;

  @ApiProperty({
    description: '打包清单项列表',
    type: [PackingListItemDto],
  })
  items!: PackingListItemDto[];

  @ApiProperty({
    description: '摘要信息',
    type: PackingListSummaryDto,
  })
  summary!: PackingListSummaryDto;
}

/**
 * 获取打包清单响应 DTO
 */
export class GetPackingListResponseDto {
  @ApiProperty({ description: '行程ID', example: '123' })
  tripId!: string;

  @ApiProperty({
    description: '打包清单项列表',
    type: [PackingListItemDto],
  })
  items!: PackingListItemDto[];

  @ApiProperty({
    description: '摘要信息',
    type: PackingListSummaryDto,
  })
  summary!: PackingListSummaryDto;

  @ApiPropertyOptional({
    description: '最后生成时间（ISO 8601 格式）',
    example: '2024-01-15T10:45:00Z',
  })
  lastGeneratedAt?: string;
}

/**
 * 更新打包清单项请求 DTO
 */
export class UpdatePackingListItemDto {
  @ApiPropertyOptional({ description: '是否已勾选', example: true })
  @IsBoolean()
  @IsOptional()
  checked?: boolean;

  @ApiPropertyOptional({ description: '更新数量', example: 2 })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: '更新备注', example: '已准备' })
  @IsString()
  @IsOptional()
  note?: string;
}

/**
 * 更新打包清单项响应 DTO
 */
export class UpdatePackingListItemResponseDto {
  @ApiProperty({ description: '物品ID', example: 'item-1' })
  itemId!: string;

  @ApiProperty({ description: '是否已更新', example: true })
  updated!: boolean;
}

