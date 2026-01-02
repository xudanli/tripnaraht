// src/trips/dto/trip-items.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 批量更新项
 */
export class BatchUpdateItemDto {
  @ApiProperty({ description: '行程项 ID' })
  itemId: string;

  @ApiPropertyOptional({ description: '开始时间（ISO 8601）' })
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）' })
  endTime?: string;

  @ApiPropertyOptional({ description: '地点 ID' })
  placeId?: number;

  @ApiPropertyOptional({ description: '备注' })
  note?: string;
}

/**
 * 批量更新请求 DTO
 */
export class BatchUpdateItemsRequestDto {
  @ApiProperty({ description: '更新列表', type: [BatchUpdateItemDto] })
  updates: BatchUpdateItemDto[];
}

/**
 * 批量更新响应 DTO
 */
export class BatchUpdateItemsResponseDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '更新的项数量' })
  updatedCount: number;

  @ApiProperty({ description: '失败的项数量' })
  failedCount: number;

  @ApiPropertyOptional({ description: '错误信息' })
  errors?: Array<{
    itemId: string;
    error: string;
  }>;
}

