// src/trips/dto/trip-intent.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

/**
 * 约束条件
 */
export class ConstraintsDto {
  @ApiPropertyOptional({ description: '每日步行限制（公里）' })
  dailyWalkLimit?: number;

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
  };
}

