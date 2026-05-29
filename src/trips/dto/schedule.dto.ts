// src/trips/dto/schedule.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional } from 'class-validator';
import { DayScheduleResult } from '../../planning-policy/interfaces/scheduler.interface';

/**
 * Schedule 读取响应 DTO
 */
export class ScheduleResponseDto {
  @ApiProperty({ description: '日期（YYYY-MM-DD）', example: '2024-05-01' })
  date!: string;

  @ApiProperty({ description: '行程计划（DayScheduleResult）' })
  schedule!: DayScheduleResult | null;

  @ApiProperty({ description: '是否已保存到数据库', example: true })
  persisted!: boolean;
}

/**
 * Schedule 保存请求 DTO
 */
export class SaveScheduleDto {
  @IsOptional()
  @IsObject()
  @ApiProperty({
    description: '行程计划（DayScheduleResult）；也可在根级直接传 stops/items',
    required: false,
  })
  schedule?: DayScheduleResult;

  @IsOptional()
  @IsArray()
  @ApiProperty({ description: '计划站点（与 schedule.stops 等价，根级回写）', required: false })
  stops?: DayScheduleResult['stops'];

  @IsOptional()
  @IsArray()
  @ApiProperty({ description: '行程项视图（GET schedule 回写，无 stops 时自动转换）', required: false })
  items?: DayScheduleResult['items'];

  @IsOptional()
  @IsObject()
  @ApiProperty({ description: '统计指标', required: false })
  metrics?: DayScheduleResult['metrics'];
}
