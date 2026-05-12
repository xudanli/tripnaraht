// src/trips/decision/dto/decision-engine-api.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsNumber, IsArray, Min, Max } from 'class-validator';

/**
 * 决策引擎 API 统一请求/响应 DTO
 */

export class GeneratePlanRequestDto {
  @ApiPropertyOptional({
    description:
      '行程 ID；写入 state.signals.ecoLedgerTripId，便于后续 repair 与账本 DB 对齐（可选）',
  })
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
  @ApiPropertyOptional({
    description:
      '行程 ID（Prisma Trip.id）；写入 state.signals.ecoLedgerTripId，用于 ECO 身份账本 hydrate/persist',
  })
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
  @ApiPropertyOptional({
    description: 'Prisma Trip.id；写入 context / signals 以供 ECO 账本上下文对齐（可选）',
  })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiProperty({ description: '世界状态' })
  @IsObject()
  state!: Record<string, any>;

  @ApiProperty({ description: '待检查的计划' })
  @IsObject()
  plan!: Record<string, any>;
}

export class GenerateMultiplePlansRequestDto {
  @ApiPropertyOptional({
    description:
      'Prisma Trip.id；写入 context / signals 以供 ECO 身份账本 hydrate/persist（可选）',
  })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiProperty({ description: '世界状态' })
  @IsObject()
  state!: Record<string, any>;

  @ApiPropertyOptional({ description: '约束 DSL（若 state.policies.constraintDSL 未设置则合并写入）' })
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

/** P-OPS-2：回填实况 execution / 观测 outcome，与预测快照 join 做 replay */
export class RecordRealityOutcomeDto {
  @ApiProperty({
    description:
      'Outcome JSON（建议含 schema=p-ops-2-outcome/v1、recordedAtIso、summary；可附 delta/extensions）',
  })
  @IsObject()
  outcome!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '来源：telemetry | manual | replay_job | …' })
  @IsOptional()
  @IsString()
  source?: string;

  /** 写入 `outcome.extensions.trip_run_id`（若尚未设置）；也可用请求头 `x-trip-run-id`。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trip_run_id?: string;

  /** 写入 `outcome.extensions.execution_trace_id`（若尚未设置）；也可用 `x-execution-trace-id` / `x-request-id`。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  execution_trace_id?: string;

  /** 写入 `outcome.extensions.decision_causality_id`，与 `TripWorldState.signals.decisionCausalityChain` join */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  causality_id?: string;

  /**
   * 若提供且服务可用：在快照写入成功后追加一行 `decision_outcomes`（`decision_causality_id` 取自 `causality_id`），承载 OPS outcome 与因果链、决策日志的 Prisma join。
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decision_log_id?: string;

  /** L6：结构化失败本体；合并进 `outcome.extensions.failure_ontology`（与 outcome 同请求）。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  failure_ontology?: Record<string, unknown>;
}
