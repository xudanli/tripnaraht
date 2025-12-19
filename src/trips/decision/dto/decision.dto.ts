// src/trips/decision/dto/decision.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TripWorldState,
  TripContextState,
  ActivityCandidate,
} from '../world-model';
import { TripPlan } from '../plan-model';
import { DecisionTrigger } from '../decision-log';

/**
 * 生成计划请求
 */
export class GeneratePlanRequestDto {
  @ApiProperty({
    description: '旅行世界状态',
    example: {
      context: {
        destination: 'IS',
        startDate: '2026-01-02',
        durationDays: 7,
        preferences: {
          intents: { nature: 0.8, culture: 0.4 },
          pace: 'moderate',
          riskTolerance: 'medium',
        },
        budget: {
          amount: 50000,
          currency: 'CNY',
        },
      },
      candidatesByDate: {
        '2026-01-02': [],
      },
      signals: {
        lastUpdatedAt: new Date().toISOString(),
      },
    },
  })
  state!: TripWorldState;
}

/**
 * 生成计划响应
 */
export class GeneratePlanResponseDto {
  @ApiProperty({ description: '生成的计划' })
  plan!: TripPlan;

  @ApiProperty({ description: '决策日志' })
  log!: any;
}

/**
 * 修复计划请求
 */
export class RepairPlanRequestDto {
  @ApiProperty({ description: '旅行世界状态' })
  state!: TripWorldState;

  @ApiProperty({ description: '当前计划' })
  plan!: TripPlan;

  @ApiPropertyOptional({
    description: '触发原因',
    enum: ['initial_generate', 'user_edit', 'signal_update', 'availability_update', 'time_overrun', 'budget_overrun', 'manual_repair'],
    default: 'signal_update',
  })
  trigger?: string;
}

/**
 * 解释计划请求
 */
export class ExplainPlanRequestDto {
  @ApiProperty({ description: '计划' })
  plan!: TripPlan;

  @ApiProperty({ description: '决策日志' })
  log!: any;

  @ApiPropertyOptional({ description: '约束违规列表' })
  violations?: any[];
}

/**
 * 解释计划响应
 */
export class ExplainPlanResponseDto {
  @ApiProperty({ description: '计划解释' })
  explanation!: any;
}

/**
 * 学习请求
 */
export class LearnFromLogsRequestDto {
  @ApiProperty({ description: '决策日志列表' })
  logs!: any[];

  @ApiPropertyOptional({ description: '用户反馈' })
  userFeedback?: Array<{
    logId: string;
    accepted: boolean;
    satisfaction?: number;
  }>;
}

/**
 * 学习响应
 */
export class LearnFromLogsResponseDto {
  @ApiProperty({ description: '学习结果' })
  result!: any;
}

/**
 * 评估计划请求
 */
export class EvaluatePlanRequestDto {
  @ApiProperty({ description: '旅行世界状态' })
  state!: TripWorldState;

  @ApiProperty({ description: '计划' })
  plan!: TripPlan;

  @ApiProperty({ description: '约束检查结果' })
  constraintResult!: any;

  @ApiPropertyOptional({ description: '计划差异' })
  diff?: any;
}

/**
 * 评估计划响应
 */
export class EvaluatePlanResponseDto {
  @ApiProperty({ description: '计划指标' })
  metrics!: any;
}

/**
 * 高级约束请求
 */
export class CheckAdvancedConstraintsRequestDto {
  @ApiProperty({ description: '计划' })
  plan!: TripPlan;

  @ApiProperty({ description: '高级约束配置' })
  constraints!: {
    mutexGroups: Array<{
      groupId: string;
      maxSelect: number;
      description?: string;
    }>;
    dependencies: Array<{
      from: string;
      to: string;
      type: 'before' | 'after' | 'same_day' | 'adjacent';
      minGapMinutes?: number;
    }>;
  };
}

/**
 * 监控指标响应
 */
export class MonitoringMetricsResponseDto {
  @ApiProperty({ description: '监控指标' })
  metrics!: any;

  @ApiProperty({ description: '告警列表' })
  alerts!: any[];
}

