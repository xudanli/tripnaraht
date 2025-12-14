// src/planning-policy/dto/re-evaluate-after-apply.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsObject,
  IsOptional,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 一键复评请求 DTO
 */
export class ReEvaluateAfterApplyDto {
  @ApiProperty({ description: '规划策略（JSON 对象）', type: Object })
  @IsObject()
  policy!: any; // PlanningPolicy

  @ApiProperty({ description: '已应用的行程计划（DayScheduleResult）', type: Object })
  @IsObject()
  appliedSchedule!: any; // DayScheduleResult

  @ApiProperty({ description: '一天结束时间（分钟）', example: 1200 })
  @IsNumber()
  dayEndMin!: number;

  @ApiProperty({ description: '日期（ISO 8601 date）', example: '2026-12-25' })
  @IsString()
  dateISO!: string;

  @ApiProperty({ description: '星期几（0=周日, 1=周一, ..., 6=周六）', example: 0, enum: [0, 1, 2, 3, 4, 5, 6] })
  @IsNumber()
  @IsEnum([0, 1, 2, 3, 4, 5, 6])
  dayOfWeek!: 0 | 1 | 2 | 3 | 4 | 5 | 6;

  @ApiProperty({ description: 'POI 查找表（Map<string, Poi>）', type: Object })
  @IsObject()
  poiLookup!: Record<string, any>; // Map<string, Poi>

  @ApiPropertyOptional({ description: '复评使用更高的 samples', example: 600, default: 600 })
  @IsNumber()
  @IsOptional()
  reEvaluateSamples?: number;

  @ApiPropertyOptional({
    description: '评估配置（seed 建议使用候选派生 seed）',
    type: Object,
    example: { seed: 42000123 },
  })
  @IsObject()
  @IsOptional()
  config?: { seed?: number };
}
