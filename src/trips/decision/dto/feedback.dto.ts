// src/trips/decision/dto/feedback.dto.ts

/**
 * Feedback DTOs
 * 
 * 反馈相关的 DTO 定义
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsDateString, Min, Max } from 'class-validator';

/**
 * 计划变体反馈 DTO
 */
export class PlanVariantFeedbackDto {
  @ApiProperty({ description: '决策运行ID' })
  @IsString()
  runId!: string;

  @ApiProperty({ description: '变体ID' })
  @IsString()
  variantId!: string;

  @ApiProperty({ description: '变体策略', enum: ['conservative', 'balanced', 'aggressive'] })
  @IsEnum(['conservative', 'balanced', 'aggressive'])
  variantStrategy!: 'conservative' | 'balanced' | 'aggressive';

  @ApiProperty({ description: '用户选择', enum: ['selected', 'rejected', 'modified'] })
  @IsEnum(['selected', 'rejected', 'modified'])
  userChoice!: 'selected' | 'rejected' | 'modified';

  @ApiPropertyOptional({ description: '评分（1-5）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: '反馈原因' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '行程ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;
}

/**
 * 约束冲突反馈 DTO
 */
export class ConflictFeedbackDto {
  @ApiProperty({ description: '决策运行ID' })
  @IsString()
  runId!: string;

  @ApiProperty({ description: '冲突ID' })
  @IsString()
  conflictId!: string;

  @ApiProperty({ description: '冲突类型' })
  @IsString()
  conflictType!: string;

  @ApiProperty({ description: '冲突是否被理解' })
  @IsBoolean()
  understood!: boolean;

  @ApiProperty({ description: '冲突解释是否清晰' })
  @IsBoolean()
  explanationClear!: boolean;

  @ApiProperty({ description: '权衡选项是否有用' })
  @IsBoolean()
  tradeoffOptionsUseful!: boolean;

  @ApiPropertyOptional({ description: '用户选择的权衡选项' })
  @IsOptional()
  @IsString()
  selectedTradeoffOption?: string;

  @ApiPropertyOptional({ description: '行程ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;
}

/**
 * 决策质量反馈 DTO
 */
export class DecisionQualityFeedbackDto {
  @ApiProperty({ description: '决策运行ID' })
  @IsString()
  runId!: string;

  @ApiProperty({ description: '整体满意度（1-5）' })
  @IsNumber()
  @Min(1)
  @Max(5)
  overallSatisfaction!: number;

  @ApiProperty({ description: '计划质量评分（1-5）' })
  @IsNumber()
  @Min(1)
  @Max(5)
  planQuality!: number;

  @ApiPropertyOptional({ description: '冲突解释质量（1-5）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  conflictExplanationQuality?: number;

  @ApiPropertyOptional({ description: '权衡选项质量（1-5）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  tradeoffOptionsQuality?: number;

  @ApiPropertyOptional({ description: '决策速度评分（1-5）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  decisionSpeed?: number;

  @ApiPropertyOptional({ description: '额外反馈' })
  @IsOptional()
  @IsString()
  additionalFeedback?: string;

  @ApiPropertyOptional({ description: '行程ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;
}

/**
 * 批量反馈 DTO
 */
export class BatchFeedbackDto {
  @ApiPropertyOptional({ description: '计划变体反馈列表', type: [PlanVariantFeedbackDto] })
  @IsOptional()
  planVariantFeedbacks?: PlanVariantFeedbackDto[];

  @ApiPropertyOptional({ description: '约束冲突反馈列表', type: [ConflictFeedbackDto] })
  @IsOptional()
  conflictFeedbacks?: ConflictFeedbackDto[];

  @ApiPropertyOptional({ description: '决策质量反馈列表', type: [DecisionQualityFeedbackDto] })
  @IsOptional()
  decisionQualityFeedbacks?: DecisionQualityFeedbackDto[];
}

/**
 * 反馈统计查询 DTO
 */
export class FeedbackStatsQueryDto {
  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '行程ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
