// src/trips/dto/trip-metrics.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 每日指标响应 DTO
 */
export class DayMetricsResponseDto {
  @ApiProperty({ description: '日期（YYYY-MM-DD）', example: '2025-01-01' })
  date: string;

  @ApiProperty({ description: '指标数据' })
  metrics: {
    walk: number;        // 总步行距离（公里）
    drive: number;       // 总车程（分钟）
    buffer: number;       // 总缓冲时间（分钟）
    fatigue: number;     // 总疲劳指数（0-100）
    ascent: number;       // 总爬升（米）
    cost: number;        // 预计花费
  };

  @ApiProperty({ description: '冲突列表' })
  conflicts: Array<{
    type: 'TIME_CONFLICT' | 'LUNCH_WINDOW' | 'FATIGUE_EXCEEDED' | 'BUFFER_INSUFFICIENT';
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    description: string;
    affectedItemIds: string[];
  }>;
}

/**
 * 行程指标摘要
 */
export class TripMetricsSummaryDto {
  @ApiProperty({ description: '总步行距离（公里）' })
  totalWalk: number;

  @ApiProperty({ description: '总车程（分钟）' })
  totalDrive: number;

  @ApiProperty({ description: '总缓冲时间（分钟）' })
  totalBuffer: number;

  @ApiProperty({ description: '总疲劳指数' })
  totalFatigue: number;

  @ApiProperty({ description: '总花费' })
  totalCost: number;

  @ApiProperty({ description: '平均每日步行距离（公里）' })
  averageWalkPerDay: number;

  @ApiProperty({ description: '平均每日车程（分钟）' })
  averageDrivePerDay: number;
}

/**
 * 批量指标响应 DTO
 */
export class TripMetricsResponseDto {
  @ApiProperty({ description: '行程 ID' })
  tripId: string;

  @ApiProperty({ description: '每日指标列表', type: [DayMetricsResponseDto] })
  days: DayMetricsResponseDto[];

  @ApiProperty({ description: '摘要信息', type: TripMetricsSummaryDto })
  summary: TripMetricsSummaryDto;
}

