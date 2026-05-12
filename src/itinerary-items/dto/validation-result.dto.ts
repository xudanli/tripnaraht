// src/itinerary-items/dto/validation-result.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidationCode, ValidationSeverity } from '../interfaces/validation.interface';

/**
 * 校验建议 DTO
 */
export class ValidationSuggestionDto {
  @ApiProperty({ description: '建议动作', example: 'ADJUST_TIME' })
  action!: string;

  @ApiProperty({ description: '描述', example: '将开始时间调整为 14:15' })
  description!: string;

  @ApiPropertyOptional({ 
    description: '建议的新值',
    example: { startTime: '2025-12-05T14:15:00Z', endTime: '2025-12-05T16:15:00Z' }
  })
  suggestedValue?: {
    startTime?: string;
    endTime?: string;
    transportMode?: string;
  };

  @ApiPropertyOptional({ description: '预计改善效果', example: '消除时间重叠' })
  estimatedImprovement?: string;
}

/**
 * 单项校验结果 DTO
 */
export class ValidationResultDto {
  @ApiProperty({ description: '是否通过', example: false })
  valid!: boolean;

  @ApiProperty({ 
    description: '严重程度', 
    enum: ValidationSeverity,
    example: 'error'
  })
  severity!: ValidationSeverity;

  @ApiProperty({ 
    description: '校验代码', 
    enum: ValidationCode,
    example: 'TIME_OVERLAP'
  })
  code!: ValidationCode;

  @ApiProperty({ description: '消息', example: '时间冲突：与「蓝湖温泉」存在重叠' })
  message!: string;

  @ApiProperty({ description: '详细信息' })
  details!: Record<string, any>;

  @ApiPropertyOptional({ type: [ValidationSuggestionDto], description: '建议列表' })
  suggestions?: ValidationSuggestionDto[];
}

/**
 * 交通信息 DTO
 */
export class TravelInfoDto {
  @ApiPropertyOptional({ description: '起点地点名称', example: '蓝湖温泉' })
  fromPlace?: string;

  @ApiPropertyOptional({ description: '终点地点名称', example: '雷克雅未克市区' })
  toPlace?: string;

  @ApiProperty({ description: '直线距离（km）', example: 42.5 })
  straightDistance!: number;

  @ApiPropertyOptional({ description: '道路距离（km）', example: 48.2 })
  roadDistance?: number;

  @ApiProperty({ description: '预计时长（分钟）', example: 45 })
  estimatedDuration!: number;

  @ApiProperty({ description: '推荐交通方式', example: 'DRIVING' })
  recommendedTransport!: string;

  @ApiProperty({ description: '可用时间（分钟）', example: 20 })
  availableTime!: number;
}

/**
 * 聚合校验结果 DTO
 */
export class AggregatedValidationResultDto {
  @ApiProperty({ description: '是否可以继续（无 ERROR）', example: true })
  canProceed!: boolean;

  @ApiProperty({ description: '是否需要确认（有 WARNING）', example: true })
  requiresConfirmation!: boolean;

  @ApiProperty({ type: [ValidationResultDto], description: 'ERROR 级别结果' })
  errors!: ValidationResultDto[];

  @ApiProperty({ type: [ValidationResultDto], description: 'WARNING 级别结果' })
  warnings!: ValidationResultDto[];

  @ApiProperty({ type: [ValidationResultDto], description: 'INFO 级别结果' })
  infos!: ValidationResultDto[];

  @ApiPropertyOptional({ type: TravelInfoDto, description: '交通信息' })
  travelInfo?: TravelInfoDto;
}

/**
 * 时间范围 DTO
 */
export class TimeRangeDto {
  @ApiProperty({ description: '开始时间', example: '09:00' })
  start!: string;

  @ApiProperty({ description: '结束时间', example: '11:00' })
  end!: string;
}

/**
 * 级联影响项 DTO
 */
export class CascadeImpactItemDto {
  @ApiProperty({ description: '行程项 ID' })
  id!: string;

  @ApiProperty({ description: '活动名称', example: '午餐' })
  name!: string;

  @ApiProperty({ description: '原时间（兼容格式）', example: '12:00-13:00' })
  originalTime!: string;

  @ApiProperty({ description: '建议时间（兼容格式）', example: '12:30-13:30' })
  suggestedTime!: string;

  @ApiProperty({ description: '延迟分钟数', example: 30 })
  delayMinutes!: number;

  @ApiPropertyOptional({ type: TimeRangeDto, description: '原时间（结构化）' })
  originalTimeRange?: TimeRangeDto;

  @ApiPropertyOptional({ type: TimeRangeDto, description: '调整后时间（结构化）' })
  adjustedTimeRange?: TimeRangeDto;

  @ApiPropertyOptional({ description: '时间变化描述', example: '+2小时30分钟' })
  timeDelta?: string;
}

/**
 * 级联影响 DTO
 */
export class CascadeImpactDto {
  @ApiProperty({ description: '受影响数量', example: 2 })
  affectedCount!: number;

  @ApiProperty({ type: [CascadeImpactItemDto], description: '受影响的行程项' })
  affectedItems!: CascadeImpactItemDto[];

  @ApiProperty({ description: '是否已自动调整', example: false })
  autoAdjusted!: boolean;

  @ApiPropertyOptional({ description: '是否会自动调整（确认后）', example: true })
  autoAdjust?: boolean;

  @ApiPropertyOptional({ description: '调整说明', example: '「黄金瀑布」将顺延+2小时' })
  adjustmentSummary?: string;
}

/**
 * 批量校验项 DTO
 */
export class BatchValidationItemDto {
  @ApiProperty({ description: '日期', example: '2025-12-05' })
  day!: string;

  @ApiProperty({ description: '受影响的行程项 ID', type: [String] })
  itemIds!: string[];

  @ApiProperty({ description: '校验类型', example: 'TIME_OVERLAP' })
  type!: string;

  @ApiProperty({ description: '消息' })
  message!: string;

  @ApiProperty({ enum: ValidationSeverity })
  severity!: ValidationSeverity;
}

/**
 * 批量校验结果 DTO
 */
export class BatchValidationResultDto {
  @ApiProperty({ description: '是否有效（无 ERROR）', example: false })
  valid!: boolean;

  @ApiProperty({ description: '行程 ID' })
  tripId!: string;

  @ApiProperty({ type: [BatchValidationItemDto], description: '错误列表' })
  errors!: BatchValidationItemDto[];

  @ApiProperty({ type: [BatchValidationItemDto], description: '警告列表' })
  warnings!: BatchValidationItemDto[];

  @ApiProperty({ 
    description: '统计摘要',
    example: { errorCount: 2, warningCount: 3, infoCount: 1 }
  })
  summary!: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}
