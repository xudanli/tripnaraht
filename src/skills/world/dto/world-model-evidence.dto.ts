// src/skills/world/dto/world-model-evidence.dto.ts
/**
 * 世界模型证据 API DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';

/**
 * 世界模型证据查询请求
 */
export class WorldModelEvidenceRequestDto {
  @ApiProperty({
    description: '行程ID（UUID）',
    example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
    required: false,
  })
  @IsString()
  @IsOptional()
  tripId?: string;

  @ApiPropertyOptional({
    description: '国家代码（ISO 3166-1 alpha-2），如果未提供tripId则必需',
    example: 'IS',
  })
  @IsString()
  @IsOptional()
  countryCode?: string;

  @ApiPropertyOptional({
    description: '月份（1-12），用于天气窗口评估',
    example: 7,
  })
  @IsNumber()
  @IsOptional()
  month?: number;

  @ApiPropertyOptional({
    description: '路线方向ID（UUID）',
    example: '8afd4b2e-7dd1-4837-8169-d3efed748138',
  })
  @IsString()
  @IsOptional()
  routeDirectionId?: string;

  @ApiPropertyOptional({
    description: '包含的证据类型',
    enum: ['dem', 'road', 'weather', 'philosophy', 'failure', 'all'],
    example: 'all',
    default: 'all',
  })
  @IsEnum(['dem', 'road', 'weather', 'philosophy', 'failure', 'all'])
  @IsOptional()
  include?: 'dem' | 'road' | 'weather' | 'philosophy' | 'failure' | 'all';
}

/**
 * DEM证据响应
 */
export class DemEvidenceDto {
  @ApiProperty({ description: '总距离（km）', example: 997.4 })
  totalDistanceKm!: number;

  @ApiProperty({ description: '累计爬升（m）', example: 2350 })
  cumulativeAscentM!: number;

  @ApiProperty({ description: '最大坡度（%）', example: 18 })
  maxSlopePct!: number;

  @ApiProperty({ description: '疲劳指数（0-100）', example: 72 })
  fatigueIndex!: number;

  @ApiProperty({ description: '3天滚动爬升（m）', example: 1410 })
  threeDayRollingAscentM!: number;

  @ApiProperty({ description: '路线点数量', example: 10 })
  pointCount!: number;
}

/**
 * 道路状态响应
 */
export class RoadStateDto {
  @ApiProperty({ description: '道路名称/编号', example: 'F26' })
  name!: string;

  @ApiProperty({ description: '道路状态', enum: ['open', 'closed', 'conditional'], example: 'open' })
  status!: 'open' | 'closed' | 'conditional';

  @ApiPropertyOptional({ description: '开放时间（如果适用）', example: '6月15日-9月15日' })
  openPeriod?: string;

  @ApiPropertyOptional({ description: '车辆要求', example: '四驱SUV' })
  vehicleRequirement?: string;
}

/**
 * 天气窗口响应
 */
export class WeatherWindowDto {
  @ApiProperty({ description: '最佳月份', example: [7, 8] })
  bestMonths!: number[];

  @ApiProperty({ description: '避免月份', example: [12, 1, 2, 3] })
  avoidMonths!: number[];

  @ApiProperty({ description: '当前选择月份的可达性评分（0-1）', example: 0.9 })
  accessibilityScore!: number;

  @ApiPropertyOptional({ description: '当前选择月份', example: 7 })
  selectedMonth?: number;

  @ApiPropertyOptional({ description: '天气详情', example: { temperature: 12, windSpeed: 8, snowRisk: 'LOW' } })
  weatherDetails?: {
    temperature?: number;
    windSpeed?: number;
    snowRisk?: string;
    visibility?: string;
  };
}

/**
 * 天数弹性区间
 */
export class DurationFlexibilityDto {
  @ApiProperty({ description: '最小天数', example: 7 })
  minDays!: number;

  @ApiProperty({ description: '最大天数', example: 10 })
  maxDays!: number;

  @ApiPropertyOptional({ description: '推荐天数', example: 8 })
  preferredDays?: number;
}

/**
 * 路线哲学响应
 */
export class RoutePhilosophyDto {
  @ApiProperty({ description: '核心陈述', example: '从文明进入高地，再回到人间' })
  coreStatement!: string;

  @ApiProperty({ description: '必须体验标签', example: ['高地荒原', '温泉', '火山'] })
  mustVisitTags!: string[];

  @ApiProperty({ description: '不可协商的规则', example: ['必须四驱SUV', '必须住高地hut'] })
  nonNegotiableRules!: string[];

  @ApiProperty({ description: '可灵活调整的部分', example: ['具体F路选择', '中间停留点'] })
  flexibleParts!: string[];

  @ApiProperty({ description: '核心体验覆盖情况', example: { '高地荒原': true, '温泉': true, '火山': true } })
  coverageStatus!: Record<string, boolean>;

  @ApiPropertyOptional({ description: '天数弹性区间', type: DurationFlexibilityDto })
  durationFlexibility?: DurationFlexibilityDto;
}

/**
 * 失败场景详情
 */
export class FailureScenarioDto {
  @ApiProperty({ description: '失败日期（从1开始）', example: 3 })
  day!: number;

  @ApiProperty({ description: '失败原因', example: '河流穿越失败' })
  reason!: string;

  @ApiProperty({ description: '缓解措施', example: '建议跟随向导' })
  mitigation!: string;

  @ApiPropertyOptional({ description: '典型用户画像', example: '首次高地驾驶用户' })
  typicalUserProfile?: string;
}

/**
 * 失败画像响应
 */
export class FailureProfileDto {
  @ApiProperty({ description: '常见失败日期', example: [3, 4] })
  commonFailureDays!: number[];

  @ApiProperty({ description: '典型失败原因', example: ['河流穿越失败', '天气突变'] })
  typicalFailureReasons!: string[];

  @ApiProperty({ description: '救援难度', enum: ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH', 'EXTREME'], example: 'HIGH' })
  rescueDifficulty!: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' | 'EXTREME';

  @ApiProperty({ 
    description: '失败场景', 
    type: [FailureScenarioDto],
    example: [{ day: 3, reason: '河流穿越失败', mitigation: '建议跟随向导', typicalUserProfile: '首次高地驾驶用户' }] 
  })
  failureScenarios!: FailureScenarioDto[];
}

/**
 * 用户能力匹配响应
 */
export class UserCapabilityMatchDto {
  @ApiProperty({ description: '风险承受度匹配', example: { route: 'HIGH', user: 'high', match: true } })
  riskTolerance!: {
    route: string;
    user: string;
    match: boolean;
  };

  @ApiProperty({ description: '车辆要求匹配', example: { required: '四驱SUV', userHas: true, match: true } })
  vehicleRequirement!: {
    required: string;
    userHas: boolean;
    match: boolean;
  };

  @ApiProperty({ description: '体能匹配', example: { routeMaxAscent: 500, userMaxAscent: 500, match: true } })
  fitness!: {
    routeMaxAscent: number;
    userMaxAscent: number;
    match: boolean;
  };
}

/**
 * 世界模型证据响应
 */
export class WorldModelEvidenceResponseDto {
  @ApiProperty({ description: '行程ID', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1', required: false })
  tripId?: string;

  @ApiProperty({ description: '国家代码', example: 'IS' })
  countryCode!: string;

  @ApiPropertyOptional({ description: '路线方向ID', example: '8afd4b2e-7dd1-4837-8169-d3efed748138' })
  routeDirectionId?: string;

  @ApiPropertyOptional({ description: '路线方向名称', example: '内陆高地F路' })
  routeDirectionName?: string;

  @ApiPropertyOptional({ description: 'DEM证据', type: DemEvidenceDto })
  demEvidence?: DemEvidenceDto;

  @ApiPropertyOptional({ description: '道路状态列表', type: [RoadStateDto] })
  roadStates?: RoadStateDto[];

  @ApiPropertyOptional({ description: '天气窗口', type: WeatherWindowDto })
  weatherWindow?: WeatherWindowDto;

  @ApiPropertyOptional({ description: '路线哲学', type: RoutePhilosophyDto })
  philosophy?: RoutePhilosophyDto;

  @ApiPropertyOptional({ description: '失败画像', type: FailureProfileDto })
  failureProfile?: FailureProfileDto;

  @ApiPropertyOptional({ description: '用户能力匹配', type: UserCapabilityMatchDto })
  userCapabilityMatch?: UserCapabilityMatchDto;

  @ApiProperty({ description: '构建时间戳', example: '2026-02-10T10:00:00Z' })
  buildTimestamp!: string;
}
