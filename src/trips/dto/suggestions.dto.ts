// src/trips/dto/suggestions.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Persona 类型
 */
export enum SuggestionPersona {
  ABU = 'abu',
  DR_DRE = 'drdre',
  NEPTUNE = 'neptune',
}

/**
 * 作用范围
 */
export enum SuggestionScope {
  TRIP = 'trip',
  DAY = 'day',
  ITEM = 'item',
  SEGMENT = 'segment',
}

/**
 * 严重级别
 */
export enum SuggestionSeverity {
  INFO = 'info',
  WARN = 'warn',
  BLOCKER = 'blocker',
}

/**
 * 建议状态
 */
export enum SuggestionStatus {
  NEW = 'new',
  SEEN = 'seen',
  APPLIED = 'applied',
  DISMISSED = 'dismissed',
}

/**
 * 证据链接
 */
export class EvidenceLinkDto {
  @ApiProperty({ description: '证据ID' })
  id!: string;

  @ApiProperty({ description: '证据类型', enum: ['opening_hours', 'road_closure', 'weather', 'booking', 'other'] })
  type!: string;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiPropertyOptional({ description: '描述' })
  description?: string;

  @ApiPropertyOptional({ description: '链接' })
  link?: string;

  @ApiPropertyOptional({ description: '来源' })
  source?: string;

  @ApiPropertyOptional({ description: '时间戳' })
  timestamp?: string;
}

/**
 * 建议操作
 */
export class SuggestionActionDto {
  @ApiProperty({ description: '操作ID' })
  id!: string;

  @ApiProperty({ description: '操作标签' })
  label!: string;

  @ApiProperty({ description: '操作类型', enum: ['apply', 'preview', 'dismiss', 'snooze', 'view_evidence', 'adjust_rhythm', 'view_alternatives'] })
  type!: string;

  @ApiPropertyOptional({ description: '是否为主要操作' })
  primary?: boolean;

  @ApiPropertyOptional({ description: '图标' })
  icon?: string;
}

/**
 * 刷新策略
 */
export class RefreshPolicyDto {
  @ApiProperty({ description: '触发重新计算的事件列表', type: [String] })
  triggers!: string[];
}

/**
 * 建议 DTO
 */
export class SuggestionDto {
  @ApiProperty({ description: '建议唯一ID' })
  id!: string;

  @ApiProperty({ description: '来源人格', enum: SuggestionPersona })
  persona!: SuggestionPersona;

  @ApiProperty({ description: '作用范围', enum: SuggestionScope })
  scope!: SuggestionScope;

  @ApiPropertyOptional({ description: '作用范围ID' })
  scopeId?: string;

  @ApiProperty({ description: '严重级别', enum: SuggestionSeverity })
  severity!: SuggestionSeverity;

  @ApiProperty({ description: '状态', enum: SuggestionStatus })
  status!: SuggestionStatus;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '摘要' })
  summary!: string;

  @ApiPropertyOptional({ description: '详细描述' })
  description?: string;

  @ApiPropertyOptional({ description: '证据链', type: [EvidenceLinkDto] })
  evidence?: EvidenceLinkDto[];

  @ApiProperty({ description: '可执行的操作列表', type: [SuggestionActionDto] })
  actions!: SuggestionActionDto[];

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiPropertyOptional({ description: '更新时间' })
  updatedAt?: string;

  @ApiPropertyOptional({ description: '刷新策略', type: RefreshPolicyDto })
  refreshPolicy?: RefreshPolicyDto;

  @ApiPropertyOptional({ description: '元数据', type: Object })
  metadata?: Record<string, any>;
}

/**
 * 建议列表响应 DTO
 */
export class SuggestionListResponseDto {
  @ApiProperty({ description: '建议列表', type: [SuggestionDto] })
  items!: SuggestionDto[];

  @ApiProperty({ description: '总数' })
  total!: number;

  @ApiPropertyOptional({ description: '应用的过滤器' })
  filters?: {
    persona?: SuggestionPersona;
    scope?: SuggestionScope;
    scopeId?: string;
    severity?: SuggestionSeverity;
    status?: SuggestionStatus;
  };
}

/**
 * 建议统计 DTO
 */
export class SuggestionStatsDto {
  @ApiProperty({ description: '行程ID' })
  tripId!: string;

  @ApiProperty({ description: '按人格统计' })
  byPersona!: {
    abu: {
      total: number;
      bySeverity: {
        blocker: number;
        warn: number;
        info: number;
      };
    };
    drdre: {
      total: number;
      bySeverity: {
        blocker: number;
        warn: number;
        info: number;
      };
    };
    neptune: {
      total: number;
      bySeverity: {
        blocker: number;
        warn: number;
        info: number;
      };
    };
  };

  @ApiProperty({ description: '按作用范围统计' })
  byScope!: {
    trip: number;
    day: Record<string, number>;
    item: Record<string, number>;
  };
}

/**
 * 应用建议请求 DTO
 */
export class ApplySuggestionRequestDto {
  @ApiProperty({ description: '要执行的操作ID' })
  actionId!: string;

  @ApiPropertyOptional({ description: '操作参数', type: Object })
  params?: Record<string, any>;

  @ApiPropertyOptional({ description: '是否只是预览，不实际应用', default: false })
  preview?: boolean;
}

/**
 * 应用变更
 */
export class AppliedChangeDto {
  @ApiProperty({ description: '变更类型' })
  type!: string;

  @ApiProperty({ description: '变更描述' })
  description!: string;
}

/**
 * 影响指标
 */
export class ImpactMetricsDto {
  @ApiPropertyOptional({ description: '疲劳指数变化' })
  fatigue?: number;

  @ApiPropertyOptional({ description: '缓冲时间变化（分钟）' })
  buffer?: number;

  @ApiPropertyOptional({ description: '费用变化' })
  cost?: number;
}

/**
 * 影响风险
 */
export class ImpactRiskDto {
  @ApiProperty({ description: '风险ID' })
  id!: string;

  @ApiProperty({ description: '严重级别', enum: SuggestionSeverity })
  severity!: SuggestionSeverity;

  @ApiProperty({ description: '标题' })
  title!: string;
}

/**
 * 影响分析
 */
export class ImpactAnalysisDto {
  @ApiPropertyOptional({ description: '指标变化', type: ImpactMetricsDto })
  metrics?: ImpactMetricsDto;

  @ApiPropertyOptional({ description: '风险列表', type: [ImpactRiskDto] })
  risks?: ImpactRiskDto[];
}

/**
 * 应用建议响应 DTO
 */
export class ApplySuggestionResponseDto {
  @ApiProperty({ description: '是否成功' })
  success!: boolean;

  @ApiProperty({ description: '建议ID' })
  suggestionId!: string;

  @ApiProperty({ description: '应用的变更列表', type: [AppliedChangeDto] })
  appliedChanges!: AppliedChangeDto[];

  @ApiPropertyOptional({ description: '影响分析', type: ImpactAnalysisDto })
  impact?: ImpactAnalysisDto;

  @ApiPropertyOptional({ description: '应用后自动触发的其他建议ID列表', type: [String] })
  triggeredSuggestions?: string[];
}

