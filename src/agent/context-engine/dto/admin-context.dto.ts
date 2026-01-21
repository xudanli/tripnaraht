// src/agent/context-engine/dto/admin-context.dto.ts
/**
 * Context Admin API DTOs
 * 
 * 后台管理接口的请求和响应类型定义
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsDateString } from 'class-validator';
import { ContextPackage } from '../types/context-package.types';
import { ContextMetricsSummary, ContextMetricsRecord } from '../services/context-metrics.service';

/**
 * 获取 Context Package 列表查询参数
 */
export class GetContextPackagesQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量（最大100）', example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Trip ID 筛选' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '规划阶段筛选', example: 'planning' })
  @IsOptional()
  @IsString()
  phase?: string;

  @ApiPropertyOptional({ description: 'Agent 筛选', example: 'PLANNER' })
  @IsOptional()
  @IsString()
  agent?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({ description: '搜索关键词（userQuery、tripId）' })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Context Package 列表项
 */
export class ContextPackageListItemDto {
  @ApiProperty({ description: 'Package ID' })
  id!: string;

  @ApiPropertyOptional({ description: 'Trip ID' })
  tripId?: string;

  @ApiProperty({ description: '规划阶段' })
  phase!: string;

  @ApiProperty({ description: 'Agent' })
  agent!: string;

  @ApiProperty({ description: '用户请求' })
  userQuery!: string;

  @ApiProperty({ description: 'Blocks 数量' })
  blocksCount!: number;

  @ApiProperty({ description: 'Total Tokens' })
  totalTokens!: number;

  @ApiProperty({ description: 'Token 预算' })
  tokenBudget!: number;

  @ApiProperty({ description: '是否已压缩' })
  compressed!: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;
}

/**
 * Context Package 列表响应
 */
export class ContextPackageListResponseDto {
  @ApiProperty({ description: 'Context Package 列表', type: [ContextPackageListItemDto] })
  packages!: ContextPackageListItemDto[];

  @ApiProperty({ description: '总数' })
  total!: number;

  @ApiProperty({ description: '页码' })
  page!: number;

  @ApiProperty({ description: '每页数量' })
  limit!: number;

  @ApiProperty({ description: '总页数' })
  totalPages!: number;
}

/**
 * Context Package 详情响应
 */
export class ContextPackageDetailResponseDto {
  @ApiProperty({ description: 'Context Package' })
  package!: ContextPackage;

  @ApiPropertyOptional({ description: '关联的指标记录' })
  metrics?: ContextMetricsRecord;
}

/**
 * 获取指标统计查询参数
 */
export class GetContextMetricsQueryDto {
  @ApiPropertyOptional({ description: 'Trip ID 筛选' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '规划阶段筛选' })
  @IsOptional()
  @IsString()
  phase?: string;

  @ApiPropertyOptional({ description: 'Agent 筛选' })
  @IsOptional()
  @IsString()
  agent?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  endTime?: string;
}

/**
 * Context 指标统计响应
 */
export class ContextMetricsResponseDto {
  @ApiProperty({ description: '指标摘要' })
  summary!: ContextMetricsSummary;

  @ApiProperty({ description: '按 Agent 分类统计' })
  byAgent!: Record<string, {
    count: number;
    avgTokens: number;
    avgBuildTimeMs: number;
    cacheHitRate: number;
  }>;

  @ApiProperty({ description: '按 Phase 分类统计' })
  byPhase!: Record<string, {
    count: number;
    avgTokens: number;
    avgBuildTimeMs: number;
    cacheHitRate: number;
  }>;
}

/**
 * 获取分析报告查询参数
 */
export class GetContextAnalyticsQueryDto {
  @ApiPropertyOptional({ description: '开始时间（ISO 8601）', example: '2025-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）', example: '2025-01-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({ description: '时间粒度', enum: ['hour', 'day', 'week', 'month'], default: 'day' })
  @IsOptional()
  @IsString()
  granularity?: 'hour' | 'day' | 'week' | 'month' = 'day';
}

/**
 * Token 使用趋势数据点
 */
export class TokenUsageTrendPoint {
  @ApiProperty({ description: '时间点' })
  timestamp!: string;

  @ApiProperty({ description: '平均 Token 使用' })
  avgTokens!: number;

  @ApiProperty({ description: '最大 Token 使用' })
  maxTokens!: number;

  @ApiProperty({ description: '最小 Token 使用' })
  minTokens!: number;

  @ApiProperty({ description: '请求数量' })
  count!: number;
}

/**
 * Context 分析报告响应
 */
export class ContextAnalyticsResponseDto {
  @ApiProperty({ description: 'Token 使用趋势', type: [TokenUsageTrendPoint] })
  tokenUsageTrend!: TokenUsageTrendPoint[];

  @ApiProperty({ description: '缓存命中率趋势', type: [Object] })
  cacheHitRateTrend!: Array<{
    timestamp: string;
    cacheHitRate: number;
    count: number;
  }>;

  @ApiProperty({ description: '压缩率分析' })
  compressionAnalysis!: {
    avgCompressionRate: number;
    compressionRateDistribution: Array<{
      range: string;
      count: number;
    }>;
  };

  @ApiProperty({ description: '质量分布分析' })
  qualityAnalysis!: {
    distribution: Record<string, number>;
    trend: Array<{
      timestamp: string;
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    }>;
  };

  @ApiProperty({ description: 'Top Block Types' })
  topBlockTypes!: Array<{
    type: string;
    count: number;
    avgTokens: number;
  }>;

  @ApiProperty({ description: '性能瓶颈分析' })
  performanceBottlenecks!: Array<{
    agent: string;
    phase: string;
    avgBuildTimeMs: number;
    count: number;
  }>;
}
