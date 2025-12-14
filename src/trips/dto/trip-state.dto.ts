// src/trips/dto/trip-state.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 行程当前状态响应 DTO
 */
export class TripStateDto {
  @ApiProperty({ description: '当前日期 ID', example: 'day-uuid' })
  currentDayId: string | null;

  @ApiProperty({ description: '当前行程项 ID', example: 'item-uuid' })
  currentItemId: string | null;

  @ApiPropertyOptional({ description: '下一站信息' })
  nextStop?: {
    itemId: string;
    placeId: number;
    placeName: string;
    startTime: string;
    estimatedArrivalTime?: string;
  };

  @ApiPropertyOptional({ description: '预计到达时间（ISO 格式）' })
  eta?: string;

  @ApiProperty({ description: '时区', example: 'Asia/Tokyo' })
  timezone: string;

  @ApiProperty({ description: '当前时间（ISO 格式）', example: '2024-05-01T10:30:00.000Z' })
  now: string;
}
