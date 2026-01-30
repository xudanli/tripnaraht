// src/trips/dto/evidence.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, IsString, Min, MaxLength, IsArray, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 证据类型
 */
export enum EvidenceType {
  OPENING_HOURS = 'opening_hours',
  ROAD_CLOSURE = 'road_closure',
  WEATHER = 'weather',
  BOOKING = 'booking',
  OTHER = 'other',
}

/**
 * 严重程度
 */
export enum EvidenceSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * 证据状态枚举
 */
export enum EvidenceStatus {
  NEW = 'new',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

/**
 * 证据时效性状态
 */
export enum EvidenceFreshnessStatus {
  FRESH = 'FRESH',
  STALE = 'STALE',
  EXPIRED = 'EXPIRED',
}

/**
 * 证据置信度等级
 */
export enum EvidenceConfidenceLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * 证据质量等级
 */
export enum EvidenceQualityLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * 证据时效性信息
 */
export class EvidenceFreshnessDto {
  @ApiProperty({ description: '获取时间（ISO 8601 格式）', example: '2026-01-29T10:30:00Z' })
  fetchedAt!: string;

  @ApiPropertyOptional({ description: '过期时间（ISO 8601 格式）', example: '2026-01-29T11:00:00Z' })
  expiresAt?: string;

  @ApiProperty({ 
    description: '时效性状态', 
    enum: EvidenceFreshnessStatus, 
    example: EvidenceFreshnessStatus.FRESH 
  })
  freshnessStatus!: EvidenceFreshnessStatus;

  @ApiPropertyOptional({ 
    description: '建议刷新时间（ISO 8601 格式）', 
    example: '2026-01-29T11:00:00Z' 
  })
  recommendedRefreshAt?: string;
}

/**
 * 证据置信度信息
 */
export class EvidenceConfidenceDto {
  @ApiProperty({ 
    description: '置信度分数（0-1）', 
    example: 0.85,
    minimum: 0,
    maximum: 1
  })
  score!: number;

  @ApiProperty({ 
    description: '置信度等级', 
    enum: EvidenceConfidenceLevel, 
    example: EvidenceConfidenceLevel.HIGH 
  })
  level!: EvidenceConfidenceLevel;

  @ApiProperty({ 
    description: '影响置信度的因素', 
    type: [String],
    example: ['数据来源可靠', '数据新鲜', '多源验证']
  })
  factors!: string[];
}

/**
 * 证据质量评分组件
 */
export class EvidenceQualityComponentsDto {
  @ApiProperty({ 
    description: '数据源可靠性（0-1）', 
    example: 0.9,
    minimum: 0,
    maximum: 1
  })
  sourceReliability!: number;

  @ApiProperty({ 
    description: '时效性（0-1）', 
    example: 0.8,
    minimum: 0,
    maximum: 1
  })
  timeliness!: number;

  @ApiProperty({ 
    description: '完整性（0-1）', 
    example: 0.9,
    minimum: 0,
    maximum: 1
  })
  completeness!: number;

  @ApiProperty({ 
    description: '多源验证（0-1）', 
    example: 0.7,
    minimum: 0,
    maximum: 1
  })
  multiSourceVerification!: number;
}

/**
 * 证据质量评分信息
 */
export class EvidenceQualityScoreDto {
  @ApiProperty({ 
    description: '综合质量评分（0-1）', 
    example: 0.85,
    minimum: 0,
    maximum: 1
  })
  overallScore!: number;

  @ApiProperty({ 
    description: '质量评分组件', 
    type: EvidenceQualityComponentsDto
  })
  components!: EvidenceQualityComponentsDto;

  @ApiProperty({ 
    description: '质量等级', 
    enum: EvidenceQualityLevel, 
    example: EvidenceQualityLevel.HIGH 
  })
  level!: EvidenceQualityLevel;

  @ApiProperty({ 
    description: '质量说明', 
    example: '高质量：数据来源可靠、数据新鲜、多源验证，综合评分 85/100'
  })
  explanation!: string;
}

/**
 * 证据项 DTO
 */
export class EvidenceItemDto {
  @ApiProperty({ description: '证据项ID', example: 'ev-1' })
  id!: string;

  @ApiProperty({ description: '证据类型', enum: EvidenceType, example: EvidenceType.OPENING_HOURS })
  type!: EvidenceType;

  @ApiProperty({ description: '证据标题', example: '营业时间' })
  title!: string;

  @ApiProperty({ description: '证据描述', example: '景点 A 营业时间：09:00-18:00' })
  description!: string;

  @ApiPropertyOptional({ description: '数据来源', example: 'Google Places API' })
  source?: string;

  @ApiPropertyOptional({ description: '相关链接', example: 'https://maps.google.com/place/...' })
  link?: string;

  @ApiProperty({ description: '时间戳（ISO 8601 格式）', example: '2024-01-15T10:30:00Z' })
  timestamp!: string;

  @ApiPropertyOptional({ description: '关联的POI ID', example: 'poi-123' })
  poiId?: string;

  @ApiPropertyOptional({ description: '关联的行程天数（1-based）', example: 1 })
  day?: number;

  @ApiPropertyOptional({ description: '严重程度', enum: EvidenceSeverity, example: EvidenceSeverity.LOW })
  severity?: EvidenceSeverity;

  @ApiPropertyOptional({ description: '额外元数据', type: Object, additionalProperties: true })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: '证据状态', enum: () => EvidenceStatus, example: 'new' })
  status?: EvidenceStatus;

  @ApiPropertyOptional({ description: '用户备注', example: '已确认营业时间' })
  userNote?: string;

  @ApiPropertyOptional({ description: '确认时间（ISO 8601 格式）', example: '2026-01-29T12:00:00Z' })
  acknowledgedAt?: string;

  @ApiPropertyOptional({ description: '解决时间（ISO 8601 格式）', example: '2026-01-29T12:00:00Z' })
  resolvedAt?: string;

  @ApiPropertyOptional({ description: '忽略时间（ISO 8601 格式）', example: '2026-01-29T12:00:00Z' })
  dismissedAt?: string;

  @ApiPropertyOptional({ 
    description: '证据时效性信息', 
    type: EvidenceFreshnessDto
  })
  freshness?: EvidenceFreshnessDto;

  @ApiPropertyOptional({ 
    description: '证据置信度信息', 
    type: EvidenceConfidenceDto
  })
  confidence?: EvidenceConfidenceDto;

  @ApiPropertyOptional({ 
    description: '证据质量评分信息', 
    type: EvidenceQualityScoreDto
  })
  qualityScore?: EvidenceQualityScoreDto;
}

/**
 * 证据列表响应 DTO
 */
export class EvidenceListResponseDto {
  @ApiProperty({ description: '证据项列表', type: [EvidenceItemDto] })
  items!: EvidenceItemDto[];

  @ApiProperty({ description: '总数量', example: 3 })
  total!: number;

  @ApiProperty({ description: '返回数量限制', example: 50 })
  limit!: number;

  @ApiProperty({ description: '偏移量', example: 0 })
  offset!: number;
}

/**
 * 证据优先级过滤
 */
export enum EvidencePriorityFilter {
  ALL = 'all',           // 显示所有证据
  HIGH = 'high',         // 只显示高优先级证据
  MEDIUM_AND_HIGH = 'medium_and_high',  // 显示中等和高优先级证据
}

/**
 * 证据分组方式
 */
export enum EvidenceGroupBy {
  NONE = 'none',         // 不分组
  IMPORTANCE = 'importance',  // 按重要性分组
  TYPE = 'type',         // 按类型分组
  DAY = 'day',          // 按天数分组
}

/**
 * 证据排序方式
 */
export enum EvidenceSortBy {
  TIME = 'time',         // 按时间排序（默认）
  IMPORTANCE = 'importance',  // 按重要性排序
  RELEVANCE = 'relevance',    // 按相关性排序（当前天数优先）
  FRESHNESS = 'freshness',    // 按新鲜度排序
  QUALITY = 'quality',        // 按质量评分排序
}

/**
 * 获取证据列表查询参数 DTO
 */
export class GetEvidenceQueryDto {
  @ApiPropertyOptional({ description: '返回数量限制', example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: '偏移量', example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ description: '筛选特定天数的证据', example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  day?: number;

  @ApiPropertyOptional({ description: '筛选特定类型的证据', enum: EvidenceType, example: EvidenceType.OPENING_HOURS })
  @IsOptional()
  @IsEnum(EvidenceType)
  type?: EvidenceType;

  @ApiPropertyOptional({ 
    description: '优先级过滤（P1功能）', 
    enum: EvidencePriorityFilter, 
    example: EvidencePriorityFilter.HIGH,
    default: EvidencePriorityFilter.ALL
  })
  @IsOptional()
  @IsEnum(EvidencePriorityFilter)
  priority?: EvidencePriorityFilter;

  @ApiPropertyOptional({ 
    description: '分组方式（P1功能）', 
    enum: EvidenceGroupBy, 
    example: EvidenceGroupBy.IMPORTANCE,
    default: EvidenceGroupBy.NONE
  })
  @IsOptional()
  @IsEnum(EvidenceGroupBy)
  groupBy?: EvidenceGroupBy;

  @ApiPropertyOptional({ 
    description: '排序方式（P1功能）', 
    enum: EvidenceSortBy, 
    example: EvidenceSortBy.IMPORTANCE,
    default: EvidenceSortBy.TIME
  })
  @IsOptional()
  @IsEnum(EvidenceSortBy)
  sortBy?: EvidenceSortBy;
}


/**
 * 更新证据请求 DTO
 */
export class UpdateEvidenceRequestDto {
  @ApiPropertyOptional({ 
    description: '证据状态', 
    enum: EvidenceStatus, 
    example: EvidenceStatus.ACKNOWLEDGED 
  })
  @IsOptional()
  @IsEnum(EvidenceStatus)
  status?: EvidenceStatus;

  @ApiPropertyOptional({ 
    description: '用户备注', 
    example: '已确认营业时间，已准备备选方案',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '用户备注不能超过500字符' })
  userNote?: string;
}

/**
 * 更新证据响应 DTO
 */
export class UpdateEvidenceResponseDto {
  @ApiProperty({ description: '证据项ID', example: 'ev-place-123-opening-hours' })
  evidenceId!: string;

  @ApiProperty({ description: '更新后的状态', enum: EvidenceStatus })
  status!: EvidenceStatus;

  @ApiProperty({ description: '更新时间（ISO 8601 格式）', example: '2026-01-29T12:00:00Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ description: '用户备注' })
  userNote?: string;
}

/**
 * 批量更新证据项
 */
export class BatchUpdateEvidenceItemDto {
  @ApiProperty({ description: '证据项ID', example: 'ev-place-123-opening-hours' })
  @IsString()
  evidenceId!: string;

  @ApiPropertyOptional({ 
    description: '证据状态', 
    enum: EvidenceStatus, 
    example: EvidenceStatus.ACKNOWLEDGED 
  })
  @IsOptional()
  @IsEnum(EvidenceStatus)
  status?: EvidenceStatus;

  @ApiPropertyOptional({ 
    description: '用户备注', 
    example: '已确认',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '用户备注不能超过500字符' })
  userNote?: string;
}

/**
 * 批量更新证据请求 DTO
 */
export class BatchUpdateEvidenceRequestDto {
  @ApiProperty({ 
    description: '要更新的证据项列表', 
    type: [BatchUpdateEvidenceItemDto],
    maxItems: 100
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchUpdateEvidenceItemDto)
  @ArrayMaxSize(100, { message: '批量更新最多支持100个证据项' })
  updates!: BatchUpdateEvidenceItemDto[];
}

/**
 * 批量更新证据响应 DTO
 */
export class BatchUpdateEvidenceResponseDto {
  @ApiProperty({ description: '成功更新的数量', example: 5 })
  updated!: number;

  @ApiProperty({ description: '失败的数量', example: 0 })
  failed!: number;

  @ApiPropertyOptional({ 
    description: '失败详情', 
    type: [Object]
  })
  errors?: Array<{
    evidenceId: string;
    error: string;
  }>;
}

