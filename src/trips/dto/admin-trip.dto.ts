// src/trips/dto/admin-trip.dto.ts
/**
 * 行程管理后台接口 DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum, IsArray, IsDateString } from 'class-validator';

export enum TripStatus {
  PLANNING = 'PLANNING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum SortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  START_DATE = 'startDate',
  END_DATE = 'endDate',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * 行程列表查询参数
 */
export class AdminTripListQueryDto {
  @ApiPropertyOptional({ description: '页码，从1开始', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量，默认20，最大100', example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '状态筛选', enum: TripStatus, example: 'PLANNING' })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({ description: '目的地国家代码筛选（ISO 3166-1 alpha-2）', example: 'JP' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: '开始日期范围（ISO 8601日期）', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDateFrom?: string;

  @ApiPropertyOptional({ description: '结束日期范围（ISO 8601日期）', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  startDateTo?: string;

  @ApiPropertyOptional({ description: '创建时间范围（ISO 8601）', example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  createdAtFrom?: string;

  @ApiPropertyOptional({ description: '创建时间范围（ISO 8601）', example: '2024-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  createdAtTo?: string;

  @ApiPropertyOptional({ description: '用户ID筛选（UUID）', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '排序字段', enum: SortField, example: 'createdAt', default: 'createdAt' })
  @IsOptional()
  @IsEnum(SortField)
  sortBy?: SortField = SortField.CREATED_AT;

  @ApiPropertyOptional({ description: '排序方向', enum: SortOrder, example: 'desc', default: 'desc' })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ description: '搜索关键词（目的地、用户邮箱、用户名称）', example: 'Tokyo' })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * 行程统计查询参数
 */
export class AdminTripStatsQueryDto {
  @ApiPropertyOptional({ description: '统计开始日期（ISO 8601日期）', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '统计结束日期（ISO 8601日期）', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '按目的地筛选', example: 'JP' })
  @IsOptional()
  @IsString()
  destination?: string;
}

/**
 * 批量操作请求
 */
export class BatchOperationRequestDto {
  @ApiProperty({ description: '操作类型', enum: ['DELETE', 'UPDATE_STATUS'], example: 'UPDATE_STATUS' })
  @IsEnum(['DELETE', 'UPDATE_STATUS'])
  action!: 'DELETE' | 'UPDATE_STATUS';

  @ApiProperty({ description: '行程ID列表', type: [String], example: ['trip-id-1', 'trip-id-2'] })
  @IsArray()
  @IsString({ each: true })
  tripIds!: string[];

  @ApiPropertyOptional({ description: '操作参数', example: { status: 'CANCELLED' } })
  @IsOptional()
  params?: {
    status?: TripStatus;
  };
}
