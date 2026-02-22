// src/trips/decision/dto/decision-engine-api.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsNumber, IsArray, Min, Max } from 'class-validator';

/**
 * 决策引擎 API 统一请求/响应 DTO
 */

export class GeneratePlanRequestDto {
  @ApiPropertyOptional({ description: '行程 ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiProperty({ description: '世界状态' })
  @IsObject()
  state!: Record<string, any>;

  @ApiPropertyOptional({ description: '请求 ID（用于追踪）' })
  @IsOptional()
  @IsString()
  requestId?: string;
}

export class RepairPlanRequestDto {
  @ApiPropertyOptional({ description: '行程 ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiProperty({ description: '世界状态' })
  @IsObject()
  state!: Record<string, any>;

  @ApiProperty({ description: '待修复的计划' })
  @IsObject()
  plan!: Record<string, any>;

  @ApiPropertyOptional({
    description: '触发原因',
    enum: ['signal_update', 'weather_update', 'availability_update', 'user_behavior', 'traffic_change'],
  })
  @IsOptional()
  @IsString()
  trigger?: string;
}

export class ValidateSafetyRequestDto {
  @ApiProperty({ description: '行程 ID' })
  @IsString()
  tripId!: string;

  @ApiProperty({ description: '路线计划草案' })
  @IsObject()
  plan!: Record<string, any>;

  @ApiProperty({ description: '世界模型上下文' })
  @IsObject()
  worldContext!: Record<string, any>;
}

export class CheckConstraintsRequestDto {
  @ApiProperty({ description: '世界状态' })
  @IsObject()
  state!: Record<string, any>;

  @ApiProperty({ description: '待检查的计划' })
  @IsObject()
  plan!: Record<string, any>;
}

export class GenerateMultiplePlansRequestDto {
  @ApiProperty({ description: '世界状态' })
  @IsObject()
  state!: Record<string, any>;

  @ApiPropertyOptional({ description: '约束 DSL' })
  @IsOptional()
  @IsObject()
  constraints?: Record<string, any>;

  @ApiPropertyOptional({ description: '生成方案数量', default: 3 })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(5)
  count?: number;

  @ApiPropertyOptional({ description: '请求 ID（用于追踪）' })
  @IsOptional()
  @IsString()
  requestId?: string;
}

export class ExplainPlanRequestDto {
  @ApiProperty({ description: '计划' })
  @IsObject()
  plan!: Record<string, any>;

  @ApiProperty({ description: '决策日志' })
  @IsObject()
  log!: Record<string, any>;

  @ApiPropertyOptional({ description: '违规列表' })
  @IsOptional()
  @IsArray()
  violations?: Array<Record<string, any>>;
}

export class AdjustPacingRequestDto {
  @ApiProperty({ description: '行程 ID' })
  @IsString()
  tripId!: string;

  @ApiProperty({ description: '路线计划草案' })
  @IsObject()
  plan!: Record<string, any>;

  @ApiProperty({ description: '世界模型上下文' })
  @IsObject()
  worldContext!: Record<string, any>;
}

export class ReplaceNodesRequestDto {
  @ApiProperty({ description: '行程 ID' })
  @IsString()
  tripId!: string;

  @ApiProperty({ description: '路线计划草案' })
  @IsObject()
  plan!: Record<string, any>;

  @ApiProperty({ description: '世界模型上下文' })
  @IsObject()
  worldContext!: Record<string, any>;

  @ApiProperty({
    description: '不可用节点列表',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  })
  @IsArray()
  unavailableNodes!: Array<{ nodeId: string; reason: string }>;
}
