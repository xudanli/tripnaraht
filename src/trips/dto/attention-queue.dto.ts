// src/trips/dto/attention-queue.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 关注项类型
 */
export enum AttentionItemType {
  SCHEDULE_CONFLICT = 'schedule_conflict',
  ROAD_CLOSED = 'road_closed',
  WEATHER_RISK = 'weather_risk',
  BUDGET_ALERT = 'budget_alert',
  SAFETY_RISK = 'safety_risk',
  BOOKING_ISSUE = 'booking_issue',
  OTHER = 'other',
}

/**
 * 严重程度
 */
export enum AttentionSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * 关注项状态
 */
export enum AttentionStatus {
  NEW = 'new',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

/**
 * 关注项 DTO
 */
export class AttentionItemDto {
  @ApiProperty({ description: '关注项ID', example: 'att-1' })
  id!: string;

  @ApiProperty({ description: '类型', enum: AttentionItemType, example: AttentionItemType.SCHEDULE_CONFLICT })
  type!: AttentionItemType;

  @ApiProperty({ description: '标题', example: '时间窗冲突' })
  title!: string;

  @ApiPropertyOptional({ description: '详细描述', example: 'Day 1 下午行程过于紧凑，缺少缓冲时间' })
  description?: string;

  @ApiProperty({ description: '关联的行程ID', example: 'trip-123' })
  tripId!: string;

  @ApiProperty({ description: '严重程度', enum: AttentionSeverity, example: AttentionSeverity.HIGH })
  severity!: AttentionSeverity;

  @ApiProperty({ description: '创建时间（ISO 8601 格式）', example: '2024-01-15T10:30:00Z' })
  createdAt!: string;

  @ApiPropertyOptional({ description: '更新时间', example: '2024-01-15T10:30:00Z' })
  updatedAt?: string;

  @ApiPropertyOptional({ description: '状态', enum: AttentionStatus, example: AttentionStatus.NEW })
  status?: AttentionStatus;

  @ApiPropertyOptional({ description: '额外元数据', type: Object, additionalProperties: true })
  metadata?: {
    day?: number;
    poiId?: string;
    evidenceIds?: string[];
    actionUrl?: string;
    [key: string]: any;
  };
}

/**
 * 关注队列响应 DTO
 */
export class AttentionQueueResponseDto {
  @ApiProperty({ description: '关注项列表', type: [AttentionItemDto] })
  items!: AttentionItemDto[];

  @ApiProperty({ description: '总数量', example: 3 })
  total!: number;

  @ApiProperty({ description: '返回数量限制', example: 20 })
  limit!: number;

  @ApiProperty({ description: '偏移量', example: 0 })
  offset!: number;
}

/**
 * 获取关注队列查询参数 DTO
 */
export class GetAttentionQueueQueryDto {
  @ApiPropertyOptional({ description: '返回数量限制', example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: '偏移量', example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ description: '筛选严重程度', enum: AttentionSeverity, example: AttentionSeverity.HIGH })
  @IsOptional()
  @IsEnum(AttentionSeverity)
  severity?: AttentionSeverity;

  @ApiPropertyOptional({ description: '筛选类型', enum: AttentionItemType, example: AttentionItemType.SCHEDULE_CONFLICT })
  @IsOptional()
  @IsEnum(AttentionItemType)
  type?: AttentionItemType;

  @ApiPropertyOptional({ description: '筛选特定行程ID', example: 'trip-123' })
  @IsOptional()
  @IsString()
  tripId?: string;
}

