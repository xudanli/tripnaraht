// src/trips/dto/trip-conflicts.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 冲突类型
 */
export enum ConflictType {
  TIME_CONFLICT = 'TIME_CONFLICT',
  LUNCH_WINDOW = 'LUNCH_WINDOW',
  /** 当日未安排午餐（11:00-14:00 内无用餐活动） */
  LUNCH_MISSING = 'LUNCH_MISSING',
  /** 当日未安排晚餐（17:00-21:00 内无用餐活动） */
  DINNER_MISSING = 'DINNER_MISSING',
  FATIGUE_EXCEEDED = 'FATIGUE_EXCEEDED',
  BUFFER_INSUFFICIENT = 'BUFFER_INSUFFICIENT',
  CLOSURE_RISK = 'CLOSURE_RISK',
  ACCESSIBILITY_MISMATCH = 'ACCESSIBILITY_MISMATCH',
  TRANSPORT_TOO_LONG = 'TRANSPORT_TOO_LONG',
  /** 交通时间不足：可用时间 < 交通时间 + 缓冲 */
  TRANSPORT_INSUFFICIENT = 'TRANSPORT_INSUFFICIENT',
  /** 行程项重复：同一地点在同一天被安排多次 */
  DUPLICATE_ITEM = 'DUPLICATE_ITEM',
}

/**
 * 冲突严重程度
 */
export enum ConflictSeverity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * 冲突建议
 */
export class ConflictSuggestionDto {
  @ApiProperty({ description: '建议操作' })
  action!: string;

  @ApiProperty({ description: '建议描述' })
  description!: string;

  @ApiProperty({ description: '影响说明' })
  impact!: string;
}

/**
 * 冲突项 DTO
 */
export class ConflictDto {
  @ApiProperty({ description: '冲突 ID' })
  id!: string;

  @ApiProperty({ description: '冲突类型', enum: ConflictType })
  type!: ConflictType;

  @ApiProperty({ description: '严重程度', enum: ConflictSeverity })
  severity!: ConflictSeverity;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '描述' })
  description!: string;

  @ApiProperty({ description: '受影响的日期数组' })
  affectedDays!: string[];

  @ApiProperty({ description: '受影响的行程项 ID 数组' })
  affectedItemIds!: string[];

  /** 关联的证据 ID 列表，用于前端将冲突与证据列表对应展示（如 CLOSURE_RISK 对应营业时间证据） */
  @ApiPropertyOptional({ description: '关联的证据 ID 列表', type: [String] })
  evidenceIds?: string[];

  @ApiPropertyOptional({ description: '时间重叠分钟数（仅TIME_CONFLICT类型）' })
  overlapMinutes?: number;

  /** 交通相关冲突（TRANSPORT_INSUFFICIENT/TRANSPORT_TOO_LONG） */
  @ApiPropertyOptional({ description: '预计交通时间（分钟）' })
  travelTimeMinutes?: number;

  @ApiPropertyOptional({ description: '可用时间（分钟）' })
  availableMinutes?: number;

  @ApiPropertyOptional({ description: '缺口（分钟）' })
  shortfallMinutes?: number;

  @ApiPropertyOptional({ description: '直线距离（公里）' })
  distanceKm?: number;

  @ApiPropertyOptional({ description: '建议列表', type: [ConflictSuggestionDto] })
  suggestions?: ConflictSuggestionDto[];
}

/**
 * 冲突列表响应 DTO
 */
export class ConflictsResponseDto {
  @ApiProperty({ description: '行程 ID' })
  tripId!: string;

  @ApiProperty({ description: '冲突列表', type: [ConflictDto] })
  conflicts!: ConflictDto[];

  @ApiProperty({ description: '冲突总数' })
  total!: number;
}

/**
 * 冲突解决策略
 */
export enum ConflictResolutionStrategy {
  /** 自动选择最佳策略 */
  AUTO = 'AUTO',
  /** 将后续活动延后 */
  SHIFT_LATER = 'SHIFT_LATER',
  /** 缩短活动时长 */
  SHORTEN_DURATION = 'SHORTEN_DURATION',
  /** 移除冲突项 */
  REMOVE_ITEM = 'REMOVE_ITEM',
  /** 跳过（不处理） */
  SKIP = 'SKIP',
}

/**
 * 单个冲突解决结果
 */
export class ConflictResolutionResultDto {
  @ApiProperty({ description: '冲突 ID' })
  conflictId!: string;

  @ApiProperty({ description: '冲突类型', enum: ConflictType })
  conflictType!: ConflictType;

  @ApiProperty({ description: '是否成功解决' })
  resolved!: boolean;

  @ApiProperty({ description: '采用的解决策略', enum: ConflictResolutionStrategy })
  strategy!: ConflictResolutionStrategy;

  @ApiProperty({ description: '解决描述' })
  description!: string;

  @ApiPropertyOptional({ description: '受影响的行程项 ID 列表', type: [String] })
  affectedItemIds?: string[];

  @ApiPropertyOptional({ description: '修改详情' })
  changes?: {
    itemId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }[];

  @ApiPropertyOptional({ description: '失败原因（如果未解决）' })
  failureReason?: string;
}

/**
 * 一键解决冲突请求 DTO
 */
export class ResolveConflictsRequestDto {
  @ApiPropertyOptional({
    description: '要解决的冲突 ID 列表（不提供则解决所有可自动解决的冲突）',
    type: [String],
  })
  conflictIds?: string[];

  @ApiPropertyOptional({
    description: '要解决的冲突类型（过滤）',
    enum: ConflictType,
    isArray: true,
  })
  conflictTypes?: ConflictType[];

  @ApiPropertyOptional({
    description: '最低严重程度过滤（只解决该级别及以上的冲突）',
    enum: ConflictSeverity,
  })
  minSeverity?: ConflictSeverity;

  @ApiPropertyOptional({
    description: '指定日期（只解决该日期的冲突）',
    example: '2024-03-15',
  })
  date?: string;

  @ApiPropertyOptional({
    description: '是否预览模式（仅返回将要执行的操作，不实际修改）',
    default: false,
  })
  dryRun?: boolean;

  @ApiPropertyOptional({
    description: '全局解决策略偏好',
    enum: ConflictResolutionStrategy,
    default: ConflictResolutionStrategy.AUTO,
  })
  strategy?: ConflictResolutionStrategy;
}

/**
 * 一键解决冲突响应 DTO
 */
export class ResolveConflictsResponseDto {
  @ApiProperty({ description: '行程 ID' })
  tripId!: string;

  @ApiProperty({ description: '是否预览模式' })
  dryRun!: boolean;

  @ApiProperty({ description: '解决结果列表', type: [ConflictResolutionResultDto] })
  results!: ConflictResolutionResultDto[];

  @ApiProperty({ description: '成功解决的冲突数' })
  resolvedCount!: number;

  @ApiProperty({ description: '跳过的冲突数（无法自动解决）' })
  skippedCount!: number;

  @ApiProperty({ description: '失败的冲突数' })
  failedCount!: number;

  @ApiProperty({ description: '处理的冲突总数' })
  totalProcessed!: number;

  @ApiPropertyOptional({ description: '剩余未解决的冲突', type: [ConflictDto] })
  remainingConflicts?: ConflictDto[];
}

