// src/trips/decision/dto/admin-decision.dto.ts
/**
 * 决策日志管理后台接口 DTO
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum, IsDateString } from 'class-validator';

export enum DecisionPersona {
  ABU = 'ABU',
  DR_DRE = 'DR_DRE',
  NEPTUNE = 'NEPTUNE',
}

export enum DecisionSource {
  PHYSICAL = 'PHYSICAL',
  HUMAN = 'HUMAN',
  PHILOSOPHY = 'PHILOSOPHY',
  HEURISTIC = 'HEURISTIC',
}

export enum DecisionAction {
  ALLOW = 'ALLOW',
  REJECT = 'REJECT',
  ADJUST = 'ADJUST',
  REPLACE = 'REPLACE',
}

/**
 * 决策日志内容类型（Admin 筛选用）
 * - all：全部（默认；现网会被 route_and_run 编排步骤淹没）
 * - orchestration：Agent route_and_run 步骤（PLAN_GEN / NARRATE / GATE_EVAL…）
 * - engine：偏决策引擎（非 route_and_run，或 decisionSource=PHYSICAL；如路封/人格裁决）
 */
export enum DecisionLogContentKind {
  ALL = 'all',
  ORCHESTRATION = 'orchestration',
  ENGINE = 'engine',
}

/**
 * 决策日志列表查询参数
 */
export class AdminDecisionLogListQueryDto {
  @ApiPropertyOptional({ description: '页码，从1开始', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量，默认20，最大100', example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '行程ID筛选' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '用户ID筛选' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Persona筛选', enum: DecisionPersona })
  @IsOptional()
  @IsEnum(DecisionPersona)
  persona?: DecisionPersona;

  @ApiPropertyOptional({ description: '决策来源筛选', enum: DecisionSource })
  @IsOptional()
  @IsEnum(DecisionSource)
  decisionSource?: DecisionSource;

  @ApiPropertyOptional({ description: '决策动作筛选', enum: DecisionAction })
  @IsOptional()
  @IsEnum(DecisionAction)
  action?: DecisionAction;

  @ApiPropertyOptional({
    description:
      '内容类型：all=全部；orchestration=route_and_run 编排步骤；engine=决策引擎向（排除 route_and_run，或 PHYSICAL）。看「同日交通偏紧/路封」请用 engine',
    enum: DecisionLogContentKind,
    example: DecisionLogContentKind.ENGINE,
  })
  @IsOptional()
  @IsEnum(DecisionLogContentKind)
  contentKind?: DecisionLogContentKind;

  @ApiPropertyOptional({
    description: '精确匹配 metadata.source（如 route_and_run、intake）；与 contentKind 同时传时取交集',
    example: 'route_and_run',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    description: '排除 metadata.source（如排除 route_and_run）',
    example: 'route_and_run',
  })
  @IsOptional()
  @IsString()
  excludeSource?: string;

  @ApiPropertyOptional({
    description: 'reasonCodes 包含该码（如 REALTIME_ROAD_CLOSED、PERSONA_CLOSURE）',
    example: 'REALTIME_ROAD_CLOSED',
  })
  @IsOptional()
  @IsString()
  reasonCode?: string;

  @ApiPropertyOptional({ description: '开始日期（ISO 8601日期）', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期（ISO 8601日期）', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '排序字段', example: 'timestamp', default: 'timestamp' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'timestamp';

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'], example: 'desc', default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * 决策统计查询参数
 */
export class AdminDecisionStatsQueryDto {
  @ApiPropertyOptional({ description: '统计开始日期（ISO 8601日期）', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '统计结束日期（ISO 8601日期）', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '按国家筛选', example: 'JP' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '按路线方向筛选' })
  @IsOptional()
  @IsString()
  routeDirectionId?: string;
}
