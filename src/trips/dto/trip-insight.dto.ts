// src/trips/dto/trip-insight.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Finding 类型
 */
export enum FindingType {
  WARNING = 'warning',     // 警告
  SUGGESTION = 'suggestion', // 建议
  POSITIVE = 'positive',   // 正面反馈
}

/**
 * 准备度状态
 */
export enum ReadinessStatus {
  PASS = 'pass',   // 通过
  WARN = 'warn',   // 警告
  BLOCK = 'block', // 阻塞
}

/**
 * 整体状态
 */
export enum OverallStatus {
  GOOD = 'good',                    // 良好
  NEEDS_ATTENTION = 'needs_attention', // 需要关注
  HAS_ISSUES = 'has_issues',        // 有问题
}

/**
 * 行程摘要 DTO
 */
export class TripSummaryDto {
  @ApiProperty({ description: '目的地', example: '中国' })
  destination!: string;

  @ApiProperty({ description: '行程天数', example: 7 })
  days!: number;

  @ApiProperty({ description: '景点数量', example: 12 })
  placesCount!: number;

  @ApiProperty({ description: '开始日期', example: '2025-02-01' })
  startDate!: string;

  @ApiProperty({ description: '结束日期', example: '2025-02-07' })
  endDate!: string;
}

/**
 * AI 发现项 DTO
 */
export class FindingDto {
  @ApiProperty({ 
    description: '发现类型',
    enum: FindingType,
    example: 'warning'
  })
  type!: FindingType;

  @ApiProperty({ 
    description: '前端图标提示',
    example: 'clock'
  })
  icon!: string;

  @ApiProperty({ 
    description: '标题',
    example: 'Day 2 安排较紧凑'
  })
  title!: string;

  @ApiProperty({ 
    description: '详细消息',
    example: '第二天安排了 6 个景点，可能需要更多休息时间'
  })
  message!: string;

  @ApiPropertyOptional({ 
    description: '快捷按钮文案（为空时不显示按钮）',
    example: '优化 Day 2'
  })
  actionLabel?: string | null;

  @ApiPropertyOptional({ 
    description: '快捷按钮对应的 AI 提示词（为空时不显示按钮）',
    example: '帮我优化第二天的行程，适当减少景点或调整顺序'
  })
  actionPrompt?: string | null;
}

/**
 * 准备度摘要 DTO
 */
export class ReadinessSummaryDto {
  @ApiProperty({ 
    description: '准备度状态',
    enum: ReadinessStatus,
    example: 'warn'
  })
  status!: ReadinessStatus;

  @ApiProperty({ description: '阻塞项数量', example: 0 })
  blockers!: number;

  /**
   * 🆕 统一字段命名：必须项数量（对应 must）
   * 向后兼容：同时保留 warnings 字段
   */
  @ApiProperty({ description: '必须项数量', example: 2 })
  must!: number;

  /**
   * 🆕 统一字段命名：建议项数量（对应 should）
   * 向后兼容：同时保留 suggestions 字段
   */
  @ApiProperty({ description: '建议项数量', example: 5 })
  should!: number;

  /**
   * @deprecated 使用 must 替代
   * 向后兼容：保留此字段，值等于 must
   */
  @ApiPropertyOptional({ description: '警告项数量（已废弃，使用must）', example: 2, deprecated: true })
  warnings?: number;

  /**
   * @deprecated 使用 should 替代
   * 向后兼容：保留此字段，值等于 should
   */
  @ApiPropertyOptional({ description: '建议项数量（已废弃，使用should）', example: 5, deprecated: true })
  suggestions?: number;

  /** 综合准备度分数 0-100（来自 coverage-map /score） */
  @ApiPropertyOptional({ description: '综合准备度分数', example: 41 })
  overall?: number;

  @ApiPropertyOptional({ description: '证据覆盖分数', example: 76 })
  evidenceCoverage?: number;

  @ApiPropertyOptional({ description: '日程可行性分数', example: 55 })
  scheduleFeasibility?: number;

  @ApiPropertyOptional({ description: '交通确定性分数', example: 0 })
  transportCertainty?: number;

  @ApiPropertyOptional({ description: '安全风险分数', example: 0 })
  safetyRisk?: number;

  @ApiPropertyOptional({ description: '缓冲时间分数', example: 55 })
  buffers?: number;

  @ApiPropertyOptional({ description: '三人格博弈最新快照（修复后协商结果）' })
  guardianNegotiation?: {
    latest?: {
      decision: string;
      consensusLevel: number;
      humanDecisionPoints: string[];
      summary: string;
    };
  };

  @ApiPropertyOptional({ description: '级联影响 UI 提示（来自 readiness score / repair-options）' })
  cascadeUiHints?: Array<{
    id: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    recommendation: string;
    entityKind?: string;
    entityLabel?: string;
    userConfirmationRequired?: string[];
  }>;

  @ApiPropertyOptional({ description: '级联预分析摘要（触发类型 + 受影响节点数）' })
  causalPreAnalysis?: {
    triggerFactType?: string;
    affectedCount?: number;
    maxRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
}

/**
 * 行程洞察响应 DTO
 */
export class TripInsightResponseDto {
  @ApiProperty({ 
    description: '行程基本信息',
    type: TripSummaryDto
  })
  tripSummary!: TripSummaryDto;

  @ApiProperty({ 
    description: 'AI 发现的问题/建议（最多 3-5 条）',
    type: [FindingDto]
  })
  findings!: FindingDto[];

  @ApiProperty({ 
    description: '准备度摘要',
    type: ReadinessSummaryDto
  })
  readiness!: ReadinessSummaryDto;

  @ApiProperty({ 
    description: '整体状态',
    enum: OverallStatus,
    example: 'needs_attention'
  })
  overallStatus!: OverallStatus;
}
