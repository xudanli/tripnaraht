// src/itinerary-items/dto/create-itinerary-item.dto.ts
import { IsString, IsInt, IsOptional, IsEnum, IsDateString, IsNotEmpty, IsBoolean, IsArray, IsNumber, Min, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidationCode } from '../interfaces/validation.interface';
import { CostCategory } from './item-cost.dto';

/**
 * 行程项类型枚举
 * 
 * 对应 Prisma Schema 中的 ItemType 枚举
 */
export enum ItemType {
  ACTIVITY = 'ACTIVITY',           // 游玩活动
  REST = 'REST',                   // 休息/咖啡
  MEAL_ANCHOR = 'MEAL_ANCHOR',     // 必吃大餐 (需要订位)
  MEAL_FLOATING = 'MEAL_FLOATING', // 随便吃吃
  TRANSIT = 'TRANSIT'              // 交通移动
}

/**
 * 创建行程项 DTO
 * 
 * 用于在指定日期添加行程项（活动、用餐、休息、交通等）
 */
export class CreateItineraryItemDto {
  @ApiProperty({
    description: '行程日期 ID（关联到 TripDay）',
    example: 'd0f6ab6c-0e94-491b-954c-bb0355e797cf'
  })
  @IsString()
  @IsNotEmpty({ message: 'tripDayId 不能为空' })
  tripDayId!: string;

  @ApiPropertyOptional({
    description: '地点 ID（关联到 Place）。如果是 TRANSIT 或 REST 可能为空',
    example: 1,
    type: Number
  })
  @IsInt()
  @IsOptional()
  placeId?: number;

  @ApiPropertyOptional({
    description: '徒步路线 ID（关联到 Trail）。当type为ACTIVITY且是徒步活动时使用',
    example: 1,
    type: Number
  })
  @IsInt()
  @IsOptional()
  trailId?: number;

  @ApiProperty({
    description: '行程项类型',
    enum: ItemType,
    example: ItemType.ACTIVITY
  })
  @IsEnum(ItemType, { message: 'type 必须是有效的 ItemType 枚举值' })
  type!: ItemType;

  @ApiProperty({
    description: '开始时间（ISO 8601 格式）',
    example: '2024-05-01T10:00:00.000Z',
    type: String,
    format: 'date-time'
  })
  @IsDateString({}, { message: 'startTime 必须是有效的日期时间字符串 (ISO 8601)' })
  startTime!: string;

  @ApiProperty({
    description: '结束时间（ISO 8601 格式）',
    example: '2024-05-01T12:00:00.000Z',
    type: String,
    format: 'date-time'
  })
  @IsDateString({}, { message: 'endTime 必须是有效的日期时间字符串 (ISO 8601)' })
  endTime!: string;

  @ApiPropertyOptional({
    description: '备注信息（如：记得带充电宝、需要提前预约等）',
    example: '记得穿和服拍照',
    type: String
  })
  @IsString()
  @IsOptional()
  note?: string;

  /** 自定义地点名称（无 placeId 时用于展示，如住宿推荐卡片「加入行程」） */
  @ApiPropertyOptional({ description: '自定义地点名称（无 placeId 时用于展示）', example: 'Cozy Apartment Reykjavik' })
  @IsString()
  @IsOptional()
  placeName?: string;

  /** 自定义地址（可选） */
  @ApiPropertyOptional({ description: '自定义地址', example: 'Reykjavik, Iceland' })
  @IsString()
  @IsOptional()
  address?: string;

  /** 外部链接（预订页等） */
  @ApiPropertyOptional({ description: '外部链接（预订页等）', example: 'https://www.airbnb.com/rooms/123456' })
  @IsString()
  @IsOptional()
  externalUrl?: string;

  /** 元数据（如 source: hotel|airbnb|rail, rating, isOvernightRail 等，供前端展示） */
  @ApiPropertyOptional({
    description: '元数据。铁路行程可传 { source: "rail", isOvernightRail: true, lineName?: "ICE 1603" }',
    example: { source: 'rail', isOvernightRail: true, lineName: 'ICE 1603' }
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '显示顺序（数字越小越靠前，用于控制行程项的显示顺序。如果不提供，将自动计算）',
    example: 1,
    type: Number,
    minimum: 0
  })
  @IsInt()
  @IsOptional()
  @Min(0)
  order?: number;

  // ========== 费用相关字段 ==========

  @ApiPropertyOptional({
    description: '预估费用',
    example: 150,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  estimatedCost?: number;

  @ApiPropertyOptional({
    description: '实际费用',
    example: 165,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  actualCost?: number;

  @ApiPropertyOptional({
    description: '货币类型',
    example: 'CNY',
    default: 'CNY'
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    description: '费用分类',
    enum: CostCategory,
    example: CostCategory.ACTIVITIES
  })
  @IsEnum(CostCategory)
  @IsOptional()
  costCategory?: CostCategory;

  @ApiPropertyOptional({
    description: '费用备注',
    example: '门票+缆车'
  })
  @IsString()
  @IsOptional()
  costNote?: string;

  @ApiPropertyOptional({
    description: '是否已支付',
    default: false
  })
  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @ApiPropertyOptional({
    description: '支付人ID'
  })
  @IsString()
  @IsOptional()
  paidBy?: string;

  // ========== 校验控制字段 ==========

  @ApiPropertyOptional({
    description: '强制创建，忽略 WARNING 级别校验。设置为 true 时，即使存在交通时间不足等警告也会创建成功',
    example: false,
    default: false
  })
  @IsBoolean()
  @IsOptional()
  forceCreate?: boolean;

  @ApiPropertyOptional({
    description: '忽略的警告类型列表。只有列出的警告类型会被忽略，其他警告仍需确认',
    enum: ValidationCode,
    isArray: true,
    example: ['INSUFFICIENT_TRAVEL_TIME', 'SHORT_BUFFER']
  })
  @IsArray()
  @IsOptional()
  ignoreWarnings?: ValidationCode[];
}
