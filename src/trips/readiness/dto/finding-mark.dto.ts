// src/trips/readiness/dto/finding-mark.dto.ts
import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 标记不适用请求 DTO
 */
export class MarkNotApplicableDto {
  @ApiPropertyOptional({
    description: '用户填写的不适用原因',
    example: '我们已有 4x4 车辆，无需租赁',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}

/**
 * 标记不适用响应 DTO
 */
export class MarkNotApplicableResponseDto {
  @ApiProperty({ description: 'Finding 项ID', example: 'blocker-f-4x4-vehicle' })
  findingId!: string;

  @ApiProperty({ description: '是否已标记', example: true })
  marked!: boolean;

  @ApiPropertyOptional({
    description: '不适用原因',
    example: '我们已有 4x4 车辆，无需租赁',
  })
  reason?: string;

  @ApiProperty({
    description: '标记时间（ISO 8601 格式）',
    example: '2024-01-15T10:35:00Z',
  })
  markedAt!: string;
}

/**
 * 添加到稍后处理请求 DTO
 */
export class AddToLaterDto {
  @ApiPropertyOptional({
    description: '提醒日期（ISO 8601 格式）',
    example: '2024-01-20T09:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  reminderDate?: string;

  @ApiPropertyOptional({
    description: '备注',
    example: '等确认路线后再处理',
  })
  @IsString()
  @IsOptional()
  note?: string;
}

/**
 * 添加到稍后处理响应 DTO
 */
export class AddToLaterResponseDto {
  @ApiProperty({ description: 'Finding 项ID', example: 'blocker-f-4x4-vehicle' })
  findingId!: string;

  @ApiProperty({ description: '是否已添加', example: true })
  added!: boolean;

  @ApiPropertyOptional({
    description: '提醒日期（ISO 8601 格式）',
    example: '2024-01-20T09:00:00Z',
  })
  reminderDate?: string;

  @ApiPropertyOptional({
    description: '备注',
    example: '等确认路线后再处理',
  })
  note?: string;

  @ApiProperty({
    description: '添加时间（ISO 8601 格式）',
    example: '2024-01-15T10:40:00Z',
  })
  addedAt!: string;
}

/**
 * 不适用项信息 DTO
 */
export class NotApplicableItemDto {
  @ApiProperty({ description: 'Finding 项ID', example: 'blocker-f-4x4-vehicle' })
  findingId!: string;

  @ApiPropertyOptional({
    description: '不适用原因',
    example: '我们已有 4x4 车辆，无需租赁',
  })
  reason?: string;

  @ApiProperty({
    description: '标记时间（ISO 8601 格式）',
    example: '2024-01-15T10:35:00Z',
  })
  markedAt!: string;
}

/**
 * 稍后处理项信息 DTO
 */
export class LaterItemDto {
  @ApiProperty({ description: 'Finding 项ID', example: 'blocker-f-4x4-vehicle' })
  findingId!: string;

  @ApiPropertyOptional({
    description: '提醒日期（ISO 8601 格式）',
    example: '2024-01-20T09:00:00Z',
  })
  reminderDate?: string;

  @ApiPropertyOptional({
    description: '备注',
    example: '等确认路线后再处理',
  })
  note?: string;

  @ApiProperty({
    description: '添加时间（ISO 8601 格式）',
    example: '2024-01-15T10:40:00Z',
  })
  addedAt!: string;
}

/**
 * 获取不适用项列表响应 DTO
 */
export class GetNotApplicableResponseDto {
  @ApiProperty({
    description: '不适用项列表',
    type: [NotApplicableItemDto],
  })
  notApplicableItems!: NotApplicableItemDto[];
}

/**
 * 获取稍后处理列表响应 DTO
 */
export class GetLaterResponseDto {
  @ApiProperty({
    description: '稍后处理项列表',
    type: [LaterItemDto],
  })
  laterItems!: LaterItemDto[];
}

