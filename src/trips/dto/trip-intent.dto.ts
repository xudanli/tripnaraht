// src/trips/dto/trip-intent.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 出行方式
 */
export enum TravelMode {
  /** 自驾 - 全程自驾或租车 */
  DRIVING = 'DRIVING',
  /** 公共交通 - 地铁、公交、火车等 */
  PUBLIC_TRANSIT = 'PUBLIC_TRANSIT',
  /** 混合 - 城市内公交 + 城际自驾/包车 */
  MIXED = 'MIXED',
}

/**
 * 节奏配置
 */
export class PacingConfigDto {
  @ApiPropertyOptional({ description: '每日最大活动数' })
  maxDailyActivities?: number;

  @ApiPropertyOptional({ description: '休息间隔（小时）' })
  restIntervalHours?: number;

  @ApiPropertyOptional({ description: '节奏等级', enum: ['relaxed', 'standard', 'tight'] })
  level?: 'relaxed' | 'standard' | 'tight';

  @ApiPropertyOptional({ 
    description: '出行方式', 
    enum: TravelMode,
    default: TravelMode.DRIVING,
  })
  travelMode?: TravelMode;
}

/**
 * 约束条件
 */
export class ConstraintsDto {
  @ApiPropertyOptional({ description: '每日步行限制（公里）' })
  dailyWalkLimit?: number;

  @ApiPropertyOptional({ description: '单段最长行驶距离（公里），超过即 road_class 冲突' })
  maxSegmentDistanceKm?: number;

  @ApiPropertyOptional({ description: '单段长距离提醒阈值（公里），默认随国家/上限推导' })
  warnSegmentDistanceKm?: number;

  @ApiPropertyOptional({ description: '早起者' })
  earlyRiser?: boolean;

  @ApiPropertyOptional({ description: '夜猫子' })
  nightOwl?: boolean;

  @ApiPropertyOptional({ description: '必去地点 ID 数组', type: [Number] })
  mustPlaces?: number[];

  @ApiPropertyOptional({ description: '避免地点 ID 数组', type: [Number] })
  avoidPlaces?: number[];
}

/**
 * 更新意图请求 DTO
 */
export class UpdateIntentRequestDto {
  @ApiPropertyOptional({ description: '节奏配置', type: PacingConfigDto })
  pacingConfig?: PacingConfigDto;

  @ApiPropertyOptional({ description: '偏好设置', type: [String] })
  preferences?: string[];

  @ApiPropertyOptional({ description: '约束条件', type: ConstraintsDto })
  constraints?: ConstraintsDto;

  @ApiPropertyOptional({ description: '规划策略', enum: ['safe', 'experience', 'challenge'] })
  planningPolicy?: 'safe' | 'experience' | 'challenge';

  @ApiPropertyOptional({ description: '总预算' })
  totalBudget?: number;

  @ApiPropertyOptional({
    description: '午餐时间窗策略：staggered（错峰）| rigid（卡点）| route_driven（路性）| balanced（均衡）',
    enum: ['staggered', 'rigid', 'route_driven', 'balanced'],
  })
  lunch_strategy?: 'staggered' | 'rigid' | 'route_driven' | 'balanced';
}

/**
 * 预算配置
 */
export class BudgetConfigDto {
  @ApiProperty({ description: '总预算' })
  totalBudget!: number;

  @ApiPropertyOptional({ description: '货币', default: 'CNY' })
  currency?: string;
}

/**
 * 意图响应 DTO
 */
export class IntentResponseDto {
  @ApiProperty({ description: '行程 ID' })
  id!: string;

  @ApiPropertyOptional({ description: '节奏配置', type: PacingConfigDto })
  pacingConfig?: PacingConfigDto;

  @ApiPropertyOptional({ description: '预算配置', type: BudgetConfigDto })
  budgetConfig?: BudgetConfigDto;

  @ApiPropertyOptional({ description: '元数据' })
  metadata?: {
    preferences?: string[];
    constraints?: ConstraintsDto;
    planningPolicy?: string;
    lunch_strategy?: string;
    lunch_strategy_label?: string;
  };
}

/**
 * 更新意图响应 DTO
 */
export class UpdateIntentResponseDto {
  @ApiProperty({ description: '是否成功' })
  success!: boolean;

  @ApiProperty({ description: '行程信息', type: IntentResponseDto })
  trip!: IntentResponseDto;

  @ApiPropertyOptional({ description: '元数据' })
  metadata?: {
    preferences?: string[];
    constraints?: ConstraintsDto;
    planningPolicy?: string;
    lunch_strategy?: string;
    lunch_strategy_label?: string;
  };

  @ApiPropertyOptional({ description: '约束版本快照（写后）' })
  constraints?: {
    constraintsVersion: number;
    constraintsConfirmedAt: string | null;
    constraintsConfirmedBy: string | null;
  };
}

