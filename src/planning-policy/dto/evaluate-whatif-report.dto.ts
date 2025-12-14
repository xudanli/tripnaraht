// src/planning-policy/dto/evaluate-whatif-report.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsObject,
  IsArray,
  IsOptional,
  ValidateNested,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 稳健度评估配置 DTO
 */
export class RobustnessConfigDto {
  @ApiPropertyOptional({ description: '采样次数', example: 300, default: 300 })
  @IsNumber()
  @IsOptional()
  samples?: number;

  @ApiProperty({ description: '随机种子（用于可复现评估）', example: 42 })
  @IsNumber()
  seed!: number;

  @ApiPropertyOptional({ description: '准点容差（分钟）', example: 0, default: 0 })
  @IsNumber()
  @IsOptional()
  onTimeSlackMin?: number;
}

/**
 * 预算策略 DTO
 */
export class BudgetStrategyDto {
  @ApiPropertyOptional({ description: 'Base 评估 samples', example: 300, default: 300 })
  @IsNumber()
  @IsOptional()
  baseSamples?: number;

  @ApiPropertyOptional({ description: '候选评估 samples', example: 300, default: 300 })
  @IsNumber()
  @IsOptional()
  candidateSamples?: number;

  @ApiPropertyOptional({ description: '复评 samples', example: 600, default: 600 })
  @IsNumber()
  @IsOptional()
  confirmSamples?: number;
}

/**
 * 优化建议 DTO
 */
export class OptimizationSuggestionDto {
  @ApiProperty({ description: '建议类型', enum: ['SHIFT_EARLIER', 'REORDER_AVOID_WAIT', 'UPGRADE_TRANSIT'] })
  @IsEnum(['SHIFT_EARLIER', 'REORDER_AVOID_WAIT', 'UPGRADE_TRANSIT'])
  type!: 'SHIFT_EARLIER' | 'REORDER_AVOID_WAIT' | 'UPGRADE_TRANSIT';

  @ApiProperty({ description: 'POI ID', example: 'poi-123' })
  @IsString()
  poiId!: string;

  @ApiPropertyOptional({ description: '提前分钟数（SHIFT_EARLIER 时必填）', example: 35 })
  @IsNumber()
  @IsOptional()
  minutes?: number;

  @ApiPropertyOptional({ description: '原因说明', example: '入场裕量偏紧，主要受最晚入场约束' })
  @IsString()
  @IsOptional()
  reason?: string;
}

/**
 * What-If 评估报告请求 DTO
 */
export class EvaluateWhatIfReportDto {
  @ApiProperty({ description: '规划策略（JSON 对象）', type: Object })
  @IsObject()
  policy!: any; // PlanningPolicy - 复杂对象，用 any 简化

  @ApiProperty({ description: 'Base 行程计划（DayScheduleResult）', type: Object })
  @IsObject()
  schedule!: any; // DayScheduleResult - 复杂对象，用 any 简化

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

  @ApiPropertyOptional({
    description: 'POI 查找表（Map<string, Poi>）。如果提供了 placeIds，此字段可选，系统会自动从数据库查询并转换',
    type: Object,
  })
  // 验证逻辑：只有在没有 placeIds 时才验证 poiLookup 是对象
  // @ValidateIf 必须在 @IsObject 之前，且条件为 true 时才验证
  @ValidateIf((o) => {
    // 如果没有 placeIds 或 placeIds 为空，才需要验证 poiLookup
    const hasPlaceIds = o && o.placeIds && Array.isArray(o.placeIds) && o.placeIds.length > 0;
    return !hasPlaceIds; // 返回 true 表示需要验证
  })
  @IsObject({ message: '如果未提供 placeIds，则必须提供 poiLookup 且必须是对象' })
  poiLookup?: Record<string, any>; // Map<string, Poi> - 用 Record 简化

  @ApiPropertyOptional({
    description:
      'Place ID 数组。如果提供，系统会从数据库查询这些 Place 并自动转换为 Poi。与 poiLookup 二选一即可',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  placeIds?: number[];

  @ApiPropertyOptional({ description: '评估配置', type: RobustnessConfigDto })
  @ValidateNested()
  @Type(() => RobustnessConfigDto)
  @IsOptional()
  config?: RobustnessConfigDto;

  @ApiPropertyOptional({ description: '优化建议列表（可选，不传则自动生成）', type: [OptimizationSuggestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptimizationSuggestionDto)
  @IsOptional()
  suggestions?: OptimizationSuggestionDto[];

  @ApiPropertyOptional({ description: '预算策略', type: BudgetStrategyDto })
  @ValidateNested()
  @Type(() => BudgetStrategyDto)
  @IsOptional()
  budgetStrategy?: BudgetStrategyDto;
}
