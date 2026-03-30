// src/trips/decision/dto/fitness-analytics.dto.ts
/**
 * Fitness Analytics DTOs（体能数据分析 DTOs）
 * 
 * Phase 2 API 接口定义
 * 
 * @since 2026-02 Phase 2
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// ==================== 趋势分析 ====================

export class TrendAnalysisQueryDto {
  @ApiPropertyOptional({ description: '分析周期（天数）', default: 90 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(7)
  @Max(365)
  periodDays?: number;
}

export class TrendAnalysisResponseDto {
  @ApiProperty({ description: '趋势类型', enum: ['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA'] })
  trend: string;

  @ApiProperty({ description: '置信度 (0-1)' })
  confidence: number;

  @ApiProperty({ description: '变化斜率' })
  slope: number;

  @ApiProperty({ description: '分析周期（天）' })
  periodDays: number;

  @ApiProperty({ description: '数据点数量' })
  dataPoints: number;

  @ApiProperty({ description: '英文摘要' })
  summary: string;

  @ApiProperty({ description: '中文摘要' })
  summaryZh: string;
}

// ==================== 异常检测 ====================

export class AnomalyResponseDto {
  @ApiProperty({ description: '异常类型' })
  type: string;

  @ApiProperty({ description: '严重程度', enum: ['LOW', 'MEDIUM', 'HIGH'] })
  severity: string;

  @ApiProperty({ description: '英文描述' })
  description: string;

  @ApiProperty({ description: '中文描述' })
  descriptionZh: string;

  @ApiProperty({ description: '检测时间' })
  detectedAt: Date;

  @ApiPropertyOptional({ description: '相关行程ID' })
  relatedTripIds?: string[];
}

export class AnomalyDetectionResponseDto {
  @ApiProperty({ description: '是否有异常' })
  hasAnomaly: boolean;

  @ApiProperty({ description: '异常列表', type: [AnomalyResponseDto] })
  anomalies: AnomalyResponseDto[];
}

// ==================== 体能报告 ====================

export class FitnessReportQueryDto {
  @ApiPropertyOptional({ description: '报告周期（天数）', default: 30 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(7)
  @Max(90)
  periodDays?: number;
}

export class FitnessReportSummaryDto {
  @ApiProperty({ description: '总行程数' })
  totalTrips: number;

  @ApiProperty({ description: '平均疲劳指数' })
  avgFatigueIndex: number;

  @ApiProperty({ description: '平均体力评分' })
  avgEffortRating: number;

  @ApiProperty({ description: '完成率' })
  completionRate: number;
}

export class CapabilityChangesDto {
  @ApiProperty({ description: '开始时最大日爬升(m)' })
  startMaxDailyAscentM: number;

  @ApiProperty({ description: '结束时最大日爬升(m)' })
  endMaxDailyAscentM: number;

  @ApiProperty({ description: '变化百分比' })
  changePercent: number;

  @ApiProperty({ description: '校准次数' })
  calibrationCount: number;
}

export class FitnessReportResponseDto {
  @ApiProperty({ description: '生成时间' })
  generatedAt: Date;

  @ApiProperty({ description: '报告周期' })
  period: { start: Date; end: Date };

  @ApiProperty({ description: '基础统计', type: FitnessReportSummaryDto })
  summary: FitnessReportSummaryDto;

  @ApiProperty({ description: '趋势分析', type: TrendAnalysisResponseDto })
  trend: TrendAnalysisResponseDto;

  @ApiProperty({ description: '异常检测', type: AnomalyDetectionResponseDto })
  anomalies: AnomalyDetectionResponseDto;

  @ApiProperty({ description: '能力变化', type: CapabilityChangesDto })
  capabilityChanges: CapabilityChangesDto;

  @ApiProperty({ description: '英文建议' })
  recommendations: string[];

  @ApiProperty({ description: '中文建议' })
  recommendationsZh: string[];
}

// ==================== 时间线 ====================

export class TimelineEventDto {
  @ApiProperty({ description: '事件时间' })
  date: Date;

  @ApiProperty({ description: '事件类型', enum: ['TRIP_FEEDBACK', 'CALIBRATION', 'QUESTIONNAIRE'] })
  event: string;

  @ApiProperty({ description: '事件详情' })
  details: Record<string, any>;
}

export class TimelineQueryDto {
  @ApiPropertyOptional({ description: '返回数量', default: 20 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}

// ==================== A/B 测试 ====================

export class ExperimentResultsResponseDto {
  @ApiProperty({ description: '实验ID' })
  experimentId: string;

  @ApiProperty({ description: '状态', enum: ['INSUFFICIENT_DATA', 'IN_PROGRESS', 'SIGNIFICANT', 'NOT_SIGNIFICANT'] })
  status: string;

  @ApiProperty({ description: '对照组数据' })
  control: {
    sampleSize: number;
    completionRate: number;
    avgEffortRating: number;
  };

  @ApiProperty({ description: '实验组数据' })
  treatment: {
    sampleSize: number;
    completionRate: number;
    avgEffortRating: number;
  };

  @ApiPropertyOptional({ description: 'P值' })
  pValue?: number;

  @ApiPropertyOptional({ description: '提升百分比' })
  lift?: number;

  @ApiProperty({ description: '英文建议' })
  recommendation: string;

  @ApiProperty({ description: '中文建议' })
  recommendationZh: string;
}

export class ExperimentConfigDto {
  @ApiProperty({ description: '实验ID' })
  id: string;

  @ApiProperty({ description: '实验名称' })
  name: string;

  @ApiProperty({ description: '描述' })
  description: string;

  @ApiProperty({ description: '状态', enum: ['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED'] })
  status: string;

  @ApiProperty({ description: '流量百分比' })
  trafficPercent: number;

  @ApiProperty({ description: '开始日期' })
  startDate: Date;
}

// ==================== 可穿戴设备集成 ====================

export class WearableConnectionDto {
  @ApiProperty({ description: '数据源', enum: ['STRAVA', 'GARMIN', 'APPLE_HEALTH', 'GOOGLE_FIT'] })
  provider: string;

  @ApiProperty({ description: '是否已连接' })
  connected: boolean;

  @ApiPropertyOptional({ description: '最后同步时间' })
  lastSyncAt?: Date;
}

export class WearableSyncRequestDto {
  @ApiPropertyOptional({ description: '开始日期' })
  after?: Date;

  @ApiPropertyOptional({ description: '结束日期' })
  before?: Date;

  @ApiPropertyOptional({ description: '数量限制', default: 50 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Max(200)
  limit?: number;
}

export class WearableActivityDto {
  @ApiProperty({ description: '活动ID' })
  id: string;

  @ApiProperty({ description: '数据源' })
  provider: string;

  @ApiProperty({ description: '活动名称' })
  name: string;

  @ApiProperty({ description: '活动类型', enum: ['HIKE', 'RUN', 'WALK', 'BIKE', 'OTHER'] })
  type: string;

  @ApiProperty({ description: '开始时间' })
  startDate: Date;

  @ApiProperty({ description: '距离(m)' })
  distanceM: number;

  @ApiProperty({ description: '爬升(m)' })
  elevationGainM: number;

  @ApiProperty({ description: '移动时间(s)' })
  movingTimeSeconds: number;

  @ApiPropertyOptional({ description: '平均心率' })
  avgHeartRate?: number;
}

export class WearableFitnessEstimateDto {
  @ApiProperty({ description: '数据源' })
  provider: string;

  @ApiProperty({ description: '评估时间' })
  estimatedAt: Date;

  @ApiProperty({ description: '估算最大日爬升(m)' })
  estimatedMaxDailyAscentM: number;

  @ApiProperty({ description: '估算3天滚动爬升(m)' })
  estimatedRollingAscent3DaysM: number;

  @ApiProperty({ description: '置信度 (0-1)' })
  confidenceScore: number;

  @ApiProperty({ description: '活动数量' })
  activityCount: number;

  @ApiProperty({ description: '数据范围(天)' })
  dataRangeDays: number;

  @ApiProperty({ description: '峰值表现' })
  peakPerformance: {
    maxSingleDayAscentM: number;
    maxSingleDayDistanceKm: number;
    longestMovingTimeHours: number;
  };
}

// ==================== 校准调度 ====================

export class CalibrationTriggerDto {
  @ApiProperty({ description: '用户ID' })
  userId: string;

  @ApiProperty({ description: '校准原因' })
  reason: string;

  @ApiProperty({ description: '优先级', enum: ['LOW', 'MEDIUM', 'HIGH'] })
  priority: string;

  @ApiProperty({ description: '待处理反馈数' })
  pendingFeedbackCount: number;
}

export class CalibrationResultDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '校准原因' })
  reason: string;

  @ApiProperty({ description: '旧模型参数' })
  oldModel: { maxDailyAscentM: number; rollingAscent3DaysM: number };

  @ApiProperty({ description: '新模型参数' })
  newModel: { maxDailyAscentM: number; rollingAscent3DaysM: number };

  @ApiProperty({ description: '校准因子' })
  calibrationFactor: number;

  @ApiProperty({ description: '处理的反馈数' })
  feedbacksProcessed: number;

  @ApiProperty({ description: '新置信度' })
  newConfidenceLevel: string;

  @ApiProperty({ description: '校准时间' })
  calibratedAt: Date;
}

export class CalibrationStatsDto {
  @ApiProperty({ description: '总校准次数' })
  totalCalibrations: number;

  @ApiProperty({ description: '平均校准因子' })
  avgCalibrationFactor: number;

  @ApiProperty({ description: '已校准用户数' })
  usersCalibrated: number;

  @ApiProperty({ description: '最后运行时间' })
  lastRunAt: Date;

  @ApiProperty({ description: '下次计划时间' })
  nextScheduledAt: Date;
}
