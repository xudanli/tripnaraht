// src/itinerary-items/dto/create-itinerary-item.dto.ts
import { IsString, IsInt, IsOptional, IsEnum, IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
