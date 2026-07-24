// src/trips/decision/dto/fitness-assessment.dto.ts
/**
 * Fitness Assessment DTOs
 * 
 * 体能评估相关的 DTO 定义
 * 
 * @since 2026-02 Phase 1
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsArray, Min, Max } from 'class-validator';

/**
 * 标准化问卷答案 DTO
 */
export class FitnessQuestionnaireAnswersDto {
  @ApiProperty({ 
    description: '每周运动习惯（0=基本不运动, 1=偶尔, 2=2-3次/周, 3=4次+/周, 4=专业级）',
    minimum: 0,
    maximum: 4,
  })
  @IsNumber()
  @Min(0)
  @Max(4)
  weeklyExercise!: 0 | 1 | 2 | 3 | 4;

  @ApiProperty({ 
    description: '最长单日徒步距离（0=从未, 1=5km以内, 2=5-15km, 3=15-25km, 4=25km+）',
    minimum: 0,
    maximum: 4,
  })
  @IsNumber()
  @Min(0)
  @Max(4)
  longestHike!: 0 | 1 | 2 | 3 | 4;

  @ApiProperty({ 
    description: '最大单日爬升经验（0=不确定, 1=300m以下, 2=300-600m, 3=600-1000m, 4=1000m+）',
    minimum: 0,
    maximum: 4,
  })
  @IsNumber()
  @Min(0)
  @Max(4)
  elevationExperience!: 0 | 1 | 2 | 3 | 4;

  @ApiProperty({ 
    description: '年龄段索引（0=18-29, 1=30-39, 2=40-49, 3=50-59, 4=60+）',
    minimum: 0,
    maximum: 4,
  })
  @IsNumber()
  @Min(0)
  @Max(4)
  ageGroupIndex!: 0 | 1 | 2 | 3 | 4;

  @ApiPropertyOptional({ 
    description: '风险承受度',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  riskTolerance?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({ 
    description: '高海拔经验',
    enum: ['none', 'basic', 'advanced'],
  })
  @IsOptional()
  @IsEnum(['none', 'basic', 'advanced'])
  highAltitudeExperience?: 'none' | 'basic' | 'advanced';

  @ApiPropertyOptional({ 
    description: '节奏偏好',
    enum: ['slow', 'relaxed', 'normal', 'fast', 'intense'],
  })
  @IsOptional()
  @IsEnum(['slow', 'relaxed', 'normal', 'fast', 'intense'])
  pace?: 'slow' | 'relaxed' | 'normal' | 'fast' | 'intense';
}

/**
 * 行程后体能反馈 DTO
 * 
 * 简化版：只需要用户选择一个 emoji
 */
export class TripFitnessFeedbackDto {
  @ApiProperty({ description: '行程ID' })
  @IsString()
  tripId!: string;

  @ApiProperty({ 
    description: '实际感受（1=😓太累了, 2=😊刚刚好, 3=💪还能再走）',
    minimum: 1,
    maximum: 3,
  })
  @IsNumber()
  @Min(1)
  @Max(3)
  actualEffortRating!: 1 | 2 | 3;

  @ApiProperty({ description: '是否按计划完成' })
  @IsBoolean()
  completedAsPlanned!: boolean;

  @ApiPropertyOptional({ description: '系统预估的疲劳指数（由后端填充）' })
  @IsOptional()
  @IsNumber()
  plannedFatigueIndex?: number;

  @ApiPropertyOptional({ 
    description: '实际做了哪些调整',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adjustmentsMade?: string[];
}

/**
 * 体能画像响应 DTO
 */
export class FitnessProfileResponseDto {
  @ApiProperty({ description: '总评分（0-100）' })
  overallScore!: number;

  @ApiProperty({ 
    description: '体能等级',
    enum: ['LOW', 'MEDIUM_LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH'],
  })
  fitnessLevel!: string;

  @ApiProperty({ description: '等级描述' })
  levelDescription!: string;

  @ApiProperty({ 
    description: '置信度',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  })
  confidence!: string;

  @ApiProperty({ description: '置信度描述' })
  confidenceDescription!: string;

  @ApiProperty({ 
    description: '各维度评分',
    example: { climbingAbility: 70, endurance: 60, recoverySpeed: 50 },
  })
  dimensions!: {
    climbingAbility: number;
    endurance: number;
    recoverySpeed: number;
  };

  @ApiProperty({ description: '建议的单日爬升（米）' })
  recommendedDailyAscentM!: number;

  @ApiProperty({ description: '建议的单日距离（公里）' })
  recommendedDailyDistanceKm!: number;

  @ApiPropertyOptional({
    description: '问卷最长连续徒步天数档位 0–4（与 GET route-directions/:id?longestHike= 对齐）',
    minimum: 0,
    maximum: 4,
  })
  longestHike?: 0 | 1 | 2 | 3 | 4;

  @ApiProperty({ description: '已完成行程数' })
  completedTripCount!: number;

  @ApiPropertyOptional({ 
    description: '年龄修正信息',
    example: { ageGroup: '30-39', modifier: 0.95, description: '体能良好，略有下降' },
  })
  ageInfo?: {
    ageGroup: string;
    modifier: number;
    description: string;
  };
}

/**
 * 问卷问题响应 DTO
 */
export class FitnessQuestionnaireResponseDto {
  @ApiProperty({ 
    description: '问卷问题列表',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        question: { type: 'string' },
        questionZh: { type: 'string' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'number' },
              label: { type: 'string' },
              labelZh: { type: 'string' },
              emoji: { type: 'string' },
            },
          },
        },
      },
    },
  })
  questions!: Array<{
    id: string;
    question: string;
    questionZh: string;
    options: Array<{
      value: number;
      label: string;
      labelZh: string;
      emoji?: string;
    }>;
  }>;

  @ApiProperty({ description: '年龄问题' })
  ageQuestion!: {
    id: string;
    question: string;
    questionZh: string;
    options: Array<{
      value: number;
      label: string;
      labelZh: string;
      emoji?: string;
    }>;
  };
}

/**
 * 体能反馈统计响应 DTO
 */
export class FitnessFeedbackStatsResponseDto {
  @ApiProperty({ description: '总反馈数' })
  totalFeedbacks!: number;

  @ApiProperty({ description: '平均感受评分（1-3）' })
  avgEffortRating!: number;

  @ApiProperty({ description: '行程完成率（0-1）' })
  completionRate!: number;

  @ApiProperty({ 
    description: '近期趋势',
    enum: ['improving', 'stable', 'declining'],
  })
  recentTrend!: 'improving' | 'stable' | 'declining';
}

/**
 * 创建体能模型请求 DTO
 * 
 * 注意：userId 从 JWT token 中获取，无需在请求体中传递
 */
export class CreateFitnessModelDto extends FitnessQuestionnaireAnswersDto {
  // userId 从 JWT token 中获取
}
