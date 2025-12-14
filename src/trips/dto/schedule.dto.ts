// src/trips/dto/schedule.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DayScheduleResult } from '../../planning-policy/interfaces/scheduler.interface';

/**
 * Schedule 读取响应 DTO
 */
export class ScheduleResponseDto {
  @ApiProperty({ description: '日期（YYYY-MM-DD）', example: '2024-05-01' })
  date: string;

  @ApiProperty({ description: '行程计划（DayScheduleResult）' })
  schedule: DayScheduleResult | null;

  @ApiProperty({ description: '是否已保存到数据库', example: true })
  persisted: boolean;
}

/**
 * Schedule 保存请求 DTO
 */
export class SaveScheduleDto {
  @ApiProperty({ description: '行程计划（DayScheduleResult）' })
  schedule: DayScheduleResult;
}
