// src/agent/context-engine/dto/context.dto.ts
/**
 * Context API DTOs
 * 
 * Context 相关接口的请求和响应类型定义
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsObject, Min, Max, IsIn } from 'class-validator';
import { ContextPackage, ContextBlock, ApiDocCategory } from '../types/context-package.types';
import { StateProjection } from '../types/trip-state-projection.types';
import { ContextMetricsSummary, ContextMetricsRecord } from '../services/context-metrics.service';

/**
 * 构建 Context Package 请求
 */
export class BuildContextPackageDto {
  @ApiPropertyOptional({ description: 'Trip ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiProperty({ description: '规划阶段', example: 'planning' })
  @IsString()
  phase!: string;

  @ApiProperty({ description: '当前 Agent', example: 'PLANNER' })
  @IsString()
  agent!: string;

  @ApiProperty({ description: '用户请求', example: '帮我规划冰岛7天行程' })
  @IsString()
  userQuery!: string;

  @ApiPropertyOptional({ description: 'Token 预算（默认 3600）', default: 3600 })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(100000)
  tokenBudget?: number;

  @ApiPropertyOptional({ description: '是否包含私有块（默认 false）', default: false })
  @IsOptional()
  @IsBoolean()
  includePrivate?: boolean;

  @ApiPropertyOptional({ description: '需要包含的主题块', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredTopics?: string[];

  @ApiPropertyOptional({ description: '需要排除的主题块', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeTopics?: string[];

  @ApiPropertyOptional({ description: '是否使用缓存（默认 true）', default: true })
  @IsOptional()
  @IsBoolean()
  useCache?: boolean;

  @ApiPropertyOptional({ description: '是否包含 API 文档（默认 false）', default: false })
  @IsOptional()
  @IsBoolean()
  includeApiDocs?: boolean;

  @ApiPropertyOptional({ 
    description: 'API 文档类别', 
    type: [String],
    enum: ['ROLL', 'ADMIN', 'CONTEXT', 'TRAINING', 'AGENT', 'TRIPS', 'DECISION', 'ALL'],
    example: ['CONTEXT', 'AGENT'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  apiDocCategories?: ApiDocCategory[];
}

/**
 * 构建 Context Package 响应
 */
export class BuildContextPackageResponseDto {
  @ApiProperty({ description: 'Context Package' })
  contextPackage!: ContextPackage;
}

/**
 * 压缩 Context 请求
 */
export class CompressContextDto {
  @ApiProperty({ description: '需要压缩的块列表', type: [Object] })
  @IsArray()
  blocks!: ContextBlock[];

  @ApiProperty({ description: 'Token 预算' })
  @IsNumber()
  @Min(100)
  @Max(100000)
  tokenBudget!: number;

  @ApiPropertyOptional({ 
    description: '压缩策略', 
    enum: ['aggressive', 'conservative', 'balanced'],
    default: 'balanced'
  })
  @IsOptional()
  @IsString()
  strategy?: 'aggressive' | 'conservative' | 'balanced';

  @ApiPropertyOptional({ description: '需要保留的关键块 key', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preserveKeys?: string[];
}

/**
 * 压缩 Context 响应
 */
export class CompressContextResponseDto {
  @ApiProperty({ description: '压缩后的块列表', type: [Object] })
  compressedBlocks!: ContextBlock[];

  @ApiProperty({ description: '压缩统计' })
  stats!: {
    originalBlocks: number;
    compressedBlocks: number;
    originalTokens: number;
    compressedTokens: number;
    reductionRatio: number;
    removedKeys: string[];
  };
}

/**
 * 投影状态请求
 */
export class ProjectStateDto {
  @ApiProperty({ description: 'Trip State 或 LangGraph State', type: Object })
  @IsObject()
  state: any;

  @ApiPropertyOptional({ description: '是否包含完整状态（默认 false）', default: false })
  @IsOptional()
  @IsBoolean()
  includeFullState?: boolean;

  @ApiPropertyOptional({ description: '决策日志保留数量（默认 5）', default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  decisionLogLimit?: number;

  @ApiPropertyOptional({ description: '拒绝日志保留数量（默认 3）', default: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  rejectionLogLimit?: number;

  @ApiPropertyOptional({ description: 'Token 预算（用于自动裁剪）' })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(100000)
  tokenBudget?: number;
}

/**
 * 投影状态响应
 */
export class ProjectStateResponseDto {
  @ApiProperty({ description: '状态投影结果' })
  projection!: StateProjection;
}

/**
 * 写入回写请求
 */
export class WriteBackDto {
  @ApiProperty({ description: 'Trip Run ID' })
  @IsString()
  tripRunId!: string;

  @ApiProperty({ description: '尝试次数' })
  @IsNumber()
  @Min(1)
  attemptNumber!: number;

  @ApiProperty({ description: 'Scratchpad 内容' })
  @IsObject()
  scratchpad!: {
    planOutline?: string;
    openQuestions?: string[];
    constraintsAssumed?: string[];
    nextActions?: string[];
    failureNotes?: string;
  };

  @ApiPropertyOptional({ description: '决策日志增量', type: [Object] })
  @IsOptional()
  @IsArray()
  decisionLogDelta?: any[];

  @ApiPropertyOptional({ description: 'Artifacts 引用', type: Object })
  @IsOptional()
  @IsObject()
  artifactsRefs?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Trip ID（用于 TripTaskMemory 更新，可选）' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({
    description: 'TripTaskMemory currentPhase（intake | route_selection | poi_candidate | decision | confirm）',
    enum: ['intake', 'route_selection', 'poi_candidate', 'decision', 'confirm'],
  })
  @IsOptional()
  @IsString()
  phase?: string;
}

/**
 * 获取指标请求（Query Parameters）
 */
export class GetMetricsQueryDto {
  @ApiPropertyOptional({ description: 'Trip ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '规划阶段' })
  @IsOptional()
  @IsString()
  phase?: string;

  @ApiPropertyOptional({ description: 'Agent' })
  @IsOptional()
  @IsString()
  agent?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO 8601）' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: '返回最近 N 条记录（用于 getRecent）', default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * 获取指标响应
 */
export class GetMetricsResponseDto {
  @ApiProperty({ description: '指标摘要' })
  summary!: ContextMetricsSummary;

  @ApiPropertyOptional({ description: '最近的指标记录（如果请求了 limit）', type: [Object] })
  recent?: ContextMetricsRecord[];
}
