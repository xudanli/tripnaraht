// src/safety/dto/geopolitical-risk.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 地缘政治风险等级
 * Level 1: 安全 - 正常旅行
 * Level 2: 注意 - 增强安全意识
 * Level 3: 高风险 - 非必要不前往
 * Level 4: 危险 - 撤离建议
 * Level 5: 禁止 - 禁止前往，立即撤离
 */
export enum GeopoliticalRiskLevel {
  SAFE = 1,
  CAUTION = 2,
  HIGH_RISK = 3,
  DANGEROUS = 4,
  NO_GO = 5,
}

/**
 * 风险类型
 */
export enum RiskType {
  WAR = 'WAR',
  ARMED_CONFLICT = 'ARMED_CONFLICT',
  TERRORISM = 'TERRORISM',
  CIVIL_UNREST = 'CIVIL_UNREST',
  POLITICAL_INSTABILITY = 'POLITICAL_INSTABILITY',
  NATURAL_DISASTER = 'NATURAL_DISASTER',
  PANDEMIC = 'PANDEMIC',
  CRIME = 'CRIME',
  KIDNAPPING = 'KIDNAPPING',
  INFRASTRUCTURE_FAILURE = 'INFRASTRUCTURE_FAILURE',
}

/**
 * 警报紧急程度
 */
export enum AlertUrgency {
  IMMEDIATE = 'IMMEDIATE',
  EXPECTED = 'EXPECTED',
  FUTURE = 'FUTURE',
  PAST = 'PAST',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 警报严重程度
 */
export enum AlertSeverity {
  EXTREME = 'EXTREME',
  SEVERE = 'SEVERE',
  MODERATE = 'MODERATE',
  MINOR = 'MINOR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 数据源类型
 */
export enum DataSourceType {
  US_STATE_DEPT = 'US_STATE_DEPT',
  UK_FCDO = 'UK_FCDO',
  GDACS = 'GDACS',
  ACLED = 'ACLED',
  RELIEFWEB = 'RELIEFWEB',
  INTERNAL = 'INTERNAL',
}

/**
 * 风险因素
 */
export class RiskFactorsDto {
  @ApiProperty({ description: '活跃冲突风险 (0-1)' })
  activeConflict: number;

  @ApiProperty({ description: '恐怖威胁风险 (0-1)' })
  terrorismThreat: number;

  @ApiProperty({ description: '社会动荡风险 (0-1)' })
  civilUnrest: number;

  @ApiProperty({ description: '空域状态风险 (0-1)' })
  airspaceStatus: number;

  @ApiProperty({ description: '边境状态风险 (0-1)' })
  borderStatus: number;

  @ApiProperty({ description: '基础设施损坏风险 (0-1)' })
  infrastructureDamage: number;

  @ApiProperty({ description: '撤离难度 (0-1)' })
  evacuationDifficulty: number;
}

/**
 * 受影响区域
 */
export class AffectedRegionDto {
  @ApiProperty({ description: '国家代码 (ISO 3166-1 alpha-2)' })
  countryCode: string;

  @ApiPropertyOptional({ description: '国家名称' })
  countryName?: string;

  @ApiPropertyOptional({ description: '具体地区/城市' })
  region?: string;

  @ApiProperty({ description: '影响程度', enum: ['DIRECT', 'ADJACENT', 'REGIONAL', 'POTENTIAL'] })
  impactLevel: 'DIRECT' | 'ADJACENT' | 'REGIONAL' | 'POTENTIAL';

  @ApiProperty({ description: '风险等级', enum: GeopoliticalRiskLevel })
  riskLevel: GeopoliticalRiskLevel;
}

/**
 * 旅行警告
 */
export class TravelAdvisoryDto {
  @ApiProperty({ description: '警告ID' })
  id: string;

  @ApiProperty({ description: '数据源', enum: DataSourceType })
  source: DataSourceType;

  @ApiProperty({ description: '国家代码' })
  countryCode: string;

  @ApiProperty({ description: '风险等级', enum: GeopoliticalRiskLevel })
  riskLevel: GeopoliticalRiskLevel;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiProperty({ description: '详细描述' })
  description: string;

  @ApiPropertyOptional({ description: '风险类型', type: [String], enum: RiskType })
  riskTypes?: RiskType[];

  @ApiProperty({ description: '发布时间' })
  publishedAt: Date;

  @ApiPropertyOptional({ description: '更新时间' })
  updatedAt?: Date;

  @ApiPropertyOptional({ description: '过期时间' })
  expiresAt?: Date;

  @ApiPropertyOptional({ description: '原始链接' })
  sourceUrl?: string;
}

/**
 * 安全警报
 */
export class SafetyAlertDto {
  @ApiProperty({ description: '警报ID' })
  id: string;

  @ApiProperty({ description: '警报类型', enum: RiskType })
  type: RiskType;

  @ApiProperty({ description: '紧急程度', enum: AlertUrgency })
  urgency: AlertUrgency;

  @ApiProperty({ description: '严重程度', enum: AlertSeverity })
  severity: AlertSeverity;

  @ApiProperty({ description: '风险等级', enum: GeopoliticalRiskLevel })
  riskLevel: GeopoliticalRiskLevel;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiProperty({ description: '简短描述' })
  summary: string;

  @ApiProperty({ description: '详细描述' })
  description: string;

  @ApiProperty({ description: '受影响区域', type: [AffectedRegionDto] })
  affectedRegions: AffectedRegionDto[];

  @ApiPropertyOptional({ description: '建议措施', type: [String] })
  recommendations?: string[];

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiPropertyOptional({ description: '更新时间' })
  updatedAt?: Date;

  @ApiPropertyOptional({ description: '过期时间' })
  expiresAt?: Date;

  @ApiProperty({ description: '是否活跃' })
  isActive: boolean;
}

/**
 * 国家安全评估
 */
export class CountrySafetyAssessmentDto {
  @ApiProperty({ description: '国家代码' })
  countryCode: string;

  @ApiProperty({ description: '国家名称' })
  countryName: string;

  @ApiProperty({ description: '综合风险等级', enum: GeopoliticalRiskLevel })
  overallRiskLevel: GeopoliticalRiskLevel;

  @ApiProperty({ description: '风险因素', type: RiskFactorsDto })
  riskFactors: RiskFactorsDto;

  @ApiProperty({ description: '活跃警告', type: [TravelAdvisoryDto] })
  activeAdvisories: TravelAdvisoryDto[];

  @ApiProperty({ description: '活跃警报', type: [SafetyAlertDto] })
  activeAlerts: SafetyAlertDto[];

  @ApiProperty({ description: '评估时间' })
  assessedAt: Date;

  @ApiPropertyOptional({ description: '下次评估时间' })
  nextAssessmentAt?: Date;

  @ApiPropertyOptional({ description: '数据源', type: [String], enum: DataSourceType })
  dataSources?: DataSourceType[];
}

/**
 * 行程安全影响评估
 */
export class TripSafetyImpactDto {
  @ApiProperty({ description: '行程ID' })
  tripId: string;

  @ApiProperty({ description: '是否受影响' })
  isAffected: boolean;

  @ApiProperty({ description: '影响程度', enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  impactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiProperty({ description: '受影响的目的地', type: [AffectedRegionDto] })
  affectedDestinations: AffectedRegionDto[];

  @ApiProperty({ description: '相关警报', type: [SafetyAlertDto] })
  relatedAlerts: SafetyAlertDto[];

  @ApiPropertyOptional({ description: '建议措施', type: [String] })
  recommendations?: string[];

  @ApiPropertyOptional({ description: '替代目的地建议', type: [String] })
  alternativeDestinations?: string[];

  @ApiProperty({ description: '评估时间' })
  assessedAt: Date;
}

/**
 * 安全评估请求
 */
export class SafetyAssessmentRequestDto {
  @ApiProperty({ description: '国家代码列表', type: [String] })
  countryCodes: string[];

  @ApiPropertyOptional({ description: '是否包含邻国风险' })
  includeAdjacentCountries?: boolean;

  @ApiPropertyOptional({ description: '计划旅行日期' })
  plannedTravelDate?: Date;
}

/**
 * 通知偏好设置
 */
export class SafetyNotificationPreferencesDto {
  @ApiProperty({ description: '用户ID' })
  userId: string;

  @ApiProperty({ description: '是否启用推送通知' })
  pushEnabled: boolean;

  @ApiProperty({ description: '是否启用邮件通知' })
  emailEnabled: boolean;

  @ApiProperty({ description: '是否启用短信通知' })
  smsEnabled: boolean;

  @ApiProperty({ description: '最低通知风险等级', enum: GeopoliticalRiskLevel })
  minRiskLevel: GeopoliticalRiskLevel;

  @ApiPropertyOptional({ description: '关注的国家列表', type: [String] })
  watchedCountries?: string[];
}
