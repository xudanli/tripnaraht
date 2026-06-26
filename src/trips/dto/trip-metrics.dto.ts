// src/trips/dto/trip-metrics.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TravelMode } from './trip-intent.dto';

/**
 * 按交通方式分类的时间统计
 */
export class TravelTimeByModeDto {
  @ApiProperty({ description: '步行时间（分钟）' })
  walking!: number;

  @ApiProperty({ description: '自驾时间（分钟）' })
  driving!: number;

  @ApiProperty({ description: '公共交通时间（分钟）' })
  transit!: number;

  @ApiProperty({ description: '火车/高铁时间（分钟）' })
  train!: number;

  @ApiProperty({ description: '飞机时间（分钟）' })
  flight!: number;

  @ApiProperty({ description: '轮渡时间（分钟）' })
  ferry!: number;

  @ApiProperty({ description: '骑行时间（分钟）' })
  bicycle!: number;

  @ApiProperty({ description: '出租车时间（分钟）' })
  taxi!: number;
}

/**
 * 每日指标响应 DTO
 */
export class DayMetricsResponseDto {
  @ApiProperty({ description: '日期（YYYY-MM-DD）', example: '2025-01-01' })
  date!: string;

  @ApiProperty({ description: '指标数据' })
  metrics!: {
    walk: number;        // 总步行距离（公里）
    drive: number;       // 总车程（分钟）- 兼容旧字段
    buffer: number;      // 总缓冲时间（分钟）
    fatigue: number;     // 总疲劳指数（0-100）
    ascent: number;      // 总爬升（米）
    cost: number;        // 预计花费
    travelByMode: TravelTimeByModeDto;  // 按交通方式分类的时间
    totalTravelTime: number;  // 总交通时间（分钟）
    totalDistance: number;    // 总交通距离（米）
  };

  @ApiProperty({ description: '冲突列表' })
  conflicts!: Array<{
    type: 'TIME_CONFLICT' | 'LUNCH_WINDOW' | 'LUNCH_MISSING' | 'DINNER_MISSING' | 'FATIGUE_EXCEEDED' | 'BUFFER_INSUFFICIENT' | 'TRANSPORT_INSUFFICIENT' | 'DUPLICATE_ITEM';
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    description: string;
    affectedItemIds: string[];
  }>;
}

/**
 * 行程指标摘要
 */
export class TripMetricsSummaryDto {
  @ApiProperty({ description: '总步行距离（公里）' })
  totalWalk!: number;

  @ApiProperty({ description: '总车程（分钟）' })
  totalDrive!: number;

  @ApiProperty({ description: '总缓冲时间（分钟）' })
  totalBuffer!: number;

  @ApiProperty({ description: '总疲劳指数' })
  totalFatigue!: number;

  @ApiProperty({ description: '总花费' })
  totalCost!: number;

  @ApiProperty({ description: '平均每日步行距离（公里）' })
  averageWalkPerDay!: number;

  @ApiProperty({ description: '平均每日车程（分钟）' })
  averageDrivePerDay!: number;
}

/**
 * 批量指标响应 DTO
 */
export class TripMetricsResponseDto {
  @ApiProperty({ description: '行程 ID' })
  tripId!: string;

  @ApiProperty({ description: '每日指标列表', type: [DayMetricsResponseDto] })
  days!: DayMetricsResponseDto[];

  @ApiProperty({ description: '摘要信息', type: TripMetricsSummaryDto })
  summary!: TripMetricsSummaryDto;
}

// TravelMode 从 trip-intent.dto.ts 重新导出，供其他模块使用
export { TravelMode };

/**
 * 日程类型
 */
export enum DayType {
  /** 休息日 - 用户主动标记或系统推断的休整日 */
  REST_DAY = 'REST_DAY',
  /** 到达日 - 行程首日或有抵达交通的日期 */
  ARRIVAL_DAY = 'ARRIVAL_DAY',
  /** 离开日 - 行程末日或有离开交通的日期 */
  DEPARTURE_DAY = 'DEPARTURE_DAY',
  /** 游览日 - 正常规划的游览日 */
  TOURING_DAY = 'TOURING_DAY',
  /** 未规划 - 尚未安排活动的日期 */
  UNPLANNED = 'UNPLANNED',
}

/**
 * 评估状态（三态展示）
 */
export enum AssessmentStatus {
  /** 合理 - 安排得当，无需调整 */
  REASONABLE = 'REASONABLE',
  /** 需关注 - 有改进空间 */
  NEEDS_ATTENTION = 'NEEDS_ATTENTION',
  /** 有问题 - 存在明显问题 */
  HAS_ISSUES = 'HAS_ISSUES',
  /** 待规划 - 尚未安排活动 */
  UNPLANNED = 'UNPLANNED',
}

/**
 * 评估维度
 */
export enum AssessmentDimension {
  /** 时间安排 */
  TIMING = 'TIMING',
  /** 活动密度 */
  DENSITY = 'DENSITY',
  /** 用餐安排 */
  MEALS = 'MEALS',
  /** 体力负荷 */
  PHYSICAL = 'PHYSICAL',
  /** 交通效率 */
  TRANSPORT = 'TRANSPORT',
  /** 地理分布 */
  GEOGRAPHY = 'GEOGRAPHY',
  /** 缓冲时间 */
  BUFFER = 'BUFFER',
}

/**
 * 评估等级
 */
export enum AssessmentGrade {
  EXCELLENT = 'EXCELLENT',  // 90-100
  GOOD = 'GOOD',            // 75-89
  FAIR = 'FAIR',            // 60-74
  POOR = 'POOR',            // 40-59
  BAD = 'BAD',              // 0-39
}

/**
 * 单个维度的评估结果
 */
export class DimensionAssessmentDto {
  @ApiProperty({ description: '评估维度', enum: AssessmentDimension })
  dimension!: AssessmentDimension;

  @ApiProperty({ description: '维度名称（中文）' })
  name!: string;

  @ApiProperty({ description: '得分 (0-100)' })
  score!: number;

  @ApiProperty({ description: '评估等级', enum: AssessmentGrade })
  grade!: AssessmentGrade;

  @ApiProperty({ description: '是否通过' })
  passed!: boolean;

  @ApiProperty({ description: '评估说明' })
  description!: string;

  @ApiPropertyOptional({ description: '具体问题列表', type: [String] })
  issues?: string[];

  @ApiPropertyOptional({ description: '改进建议列表', type: [String] })
  suggestions?: string[];
}

/**
 * 每日行程评估结果
 */
export class DayAssessmentDto {
  @ApiProperty({ description: '日期（YYYY-MM-DD）', example: '2025-01-01' })
  date!: string;

  @ApiProperty({ description: '日程类型', enum: DayType })
  dayType!: DayType;

  @ApiProperty({ description: '评估状态（三态）', enum: AssessmentStatus })
  status!: AssessmentStatus;

  @ApiProperty({ description: '当天总活动数' })
  activityCount!: number;

  @ApiProperty({ description: '当天活动时长（小时）' })
  activeDurationHours!: number;

  @ApiPropertyOptional({ description: '综合得分 (0-100)，未规划时为 null' })
  overallScore!: number | null;

  @ApiPropertyOptional({ description: '综合评估等级', enum: AssessmentGrade })
  overallGrade!: AssessmentGrade | null;

  @ApiProperty({ description: '是否合理（综合评估通过）' })
  isReasonable!: boolean;

  @ApiPropertyOptional({ description: '各维度评估结果', type: [DimensionAssessmentDto] })
  dimensions?: DimensionAssessmentDto[];

  @ApiProperty({ description: '关键问题数量' })
  criticalIssueCount!: number;

  @ApiProperty({ description: '警告数量' })
  warningCount!: number;

  @ApiPropertyOptional({ description: '综合评语' })
  summary?: string;

  @ApiPropertyOptional({ description: '首要改进建议' })
  topSuggestion?: string;
}

/**
 * 行程评估请求 DTO
 */
export class AssessTripRequestDto {
  @ApiPropertyOptional({ description: '指定日期列表（不填则评估所有日期）', type: [String] })
  dates?: string[];

  @ApiPropertyOptional({ description: '用户体力等级 (1-5, 默认3)', example: 3 })
  fitnessLevel?: number;

  @ApiPropertyOptional({ description: '是否有儿童同行', default: false })
  hasChildren?: boolean;

  @ApiPropertyOptional({ description: '是否有老人同行', default: false })
  hasElderly?: boolean;

  @ApiPropertyOptional({ description: '偏好节奏: relaxed/normal/intensive', default: 'normal' })
  pacingPreference?: 'relaxed' | 'normal' | 'intensive';

  @ApiPropertyOptional({ 
    description: '出行方式（临时覆盖，不传则使用行程 pacingConfig 中的设置）', 
    enum: TravelMode,
  })
  travelMode?: TravelMode;

  @ApiPropertyOptional({
    description: '午餐时间窗策略（临时覆盖）：staggered | rigid | route_driven | balanced',
    example: 'route_driven',
  })
  lunch_strategy?: 'staggered' | 'rigid' | 'route_driven' | 'balanced';
}

/**
 * 行程评估响应 DTO
 */
export class AssessTripResponseDto {
  @ApiProperty({ description: '行程 ID' })
  tripId!: string;

  @ApiProperty({ description: '评估的总天数' })
  totalDays!: number;

  @ApiProperty({ description: '合理天数（REASONABLE 状态）' })
  reasonableDays!: number;

  @ApiProperty({ description: '需关注天数（NEEDS_ATTENTION 状态）' })
  needsAttentionDays!: number;

  @ApiProperty({ description: '有问题天数（HAS_ISSUES 状态）' })
  hasIssuesDays!: number;

  @ApiProperty({ description: '待规划天数（UNPLANNED 状态）' })
  unplannedDays!: number;

  @ApiProperty({ description: '休息日天数（仅 REST，不计入合理率分子/分母）' })
  restDays!: number;

  @ApiProperty({ description: '有效规划天数（排除未规划日与纯休息日）' })
  plannedDays!: number;

  @ApiProperty({
    description: '整体合理率 (0-100)，为有效规划日综合得分的平均值，与每日分数一致',
  })
  overallReasonableRate!: number;

  @ApiProperty({ description: '有效规划日综合得分平均值 (0-100)，与 overallReasonableRate 相同' })
  overallAverageScore!: number;

  @ApiProperty({
    description: '天数达标率 (0-100%)：status=REASONABLE 的有效规划日占比（辅助指标）',
  })
  daysPassRate!: number;

  @ApiProperty({ description: '整体评估等级', enum: AssessmentGrade })
  overallGrade!: AssessmentGrade;

  @ApiProperty({ description: '本次评估实际使用的出行方式', enum: TravelMode })
  effectiveTravelMode!: TravelMode;

  @ApiProperty({ description: '每日评估结果', type: [DayAssessmentDto] })
  days!: DayAssessmentDto[];

  @ApiPropertyOptional({ description: '整体评语' })
  summary?: string;

  @ApiPropertyOptional({ description: '首要改进建议列表', type: [String] })
  topSuggestions?: string[];
}

