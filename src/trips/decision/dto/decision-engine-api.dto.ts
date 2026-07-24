// src/trips/decision/dto/decision-engine-api.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

/**
 * Task D / staging — prebuilt candidate with full plan (ValidationPipe whitelist-safe).
 */
export class PrebuiltDecisionCandidateDto {
  @ApiProperty()
  @IsString()
  candidateId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({ description: 'Full TripPlan JSON' })
  @IsObject()
  plan!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  utilityHint?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdAt?: string;
}

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

export class EvaluateClosedLoopRequestDto {
  @ApiProperty({ description: '待评估的行程计划 TripPlan' })
  @IsObject()
  plan!: Record<string, any>;

  @ApiPropertyOptional({
    description: '可选：要先模拟的 TripAction，例如 MOVE_SLOT / REMOVE_SLOT / CHANGE_PACE',
  })
  @IsOptional()
  @IsObject()
  action?: Record<string, any>;

  @ApiPropertyOptional({
    description: '可选：覆盖评估约束，例如 maxDailySlots、maxDailyTravelMinutes、minRobustnessScore',
  })
  @IsOptional()
  @IsObject()
  constraints?: Record<string, any>;

  @ApiPropertyOptional({ description: '可选：已接受的风险 issue id，评估时不再阻断' })
  @IsOptional()
  @IsArray()
  acceptedRiskIssueIds?: string[];
}

export class RecordClosedLoopFailureEventDto {
  @ApiPropertyOptional({ description: 'Prisma Trip.id，可选；无效 UUID 会按现有日志策略降级为空' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '关联的 TripAction.id，可选' })
  @IsOptional()
  @IsString()
  actionId?: string;

  @ApiProperty({
    description: '失败事件类型',
    enum: [
      'USER_REJECTED_REPAIR',
      'USER_REMOVED_SLOT',
      'USER_REPORTED_TOO_TIRING',
      'EXECUTION_FAILED',
      'EVIDENCE_INVALIDATED',
      'RISK_ACCEPTED',
    ],
  })
  @IsString()
  eventType!: string;

  @ApiPropertyOptional({ description: '失败原因或用户反馈' })
  @IsOptional()
  @IsString()
  failedReason?: string;

  @ApiPropertyOptional({ description: '受影响 issue id 列表' })
  @IsOptional()
  @IsArray()
  affectedIssueIds?: string[];

  @ApiPropertyOptional({ description: '受影响 slot id 列表' })
  @IsOptional()
  @IsArray()
  affectedSlotIds?: string[];

  @ApiPropertyOptional({ description: '可选：当前 TripPlan，用于生成 failure stateSnapshot' })
  @IsOptional()
  @IsObject()
  plan?: Record<string, any>;

  @ApiPropertyOptional({ description: '可选：评估约束快照' })
  @IsOptional()
  @IsObject()
  constraints?: Record<string, any>;
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

  @ApiPropertyOptional({
    description:
      'Task D / staging：预置候选（跳过 Legacy 生成，可选配合 constraintReportsByCandidateId）',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrebuiltDecisionCandidateDto)
  prebuiltCandidates?: PrebuiltDecisionCandidateDto[];

  @ApiPropertyOptional({
    description: 'Task D / staging：预置约束报告（提供时跳过 Gateway 重评估）',
  })
  @IsOptional()
  @IsObject()
  constraintReportsByCandidateId?: Record<string, Record<string, unknown>>;

  @ApiPropertyOptional({
    description: '显式 problemId / decisionRunId 关联（默认取 experimentContext.runId）',
  })
  @IsOptional()
  @IsString()
  problemId?: string;

  @ApiPropertyOptional({ description: 'Staging E2E 实验上下文（与 X-Decision-* Header 合并）' })
  @IsOptional()
  @IsObject()
  experimentContext?: {
    experimentId?: string;
    scenarioId?: string;
    runId?: string;
    source?: string;
  };

  @ApiPropertyOptional({
    description: 'DECISION_LAB_ENABLED=1 时生效：Shadow 故障注入（仅 staging）',
  })
  @IsOptional()
  @IsObject()
  stagingShadowOptions?: {
    shadowError?: string;
    shadowTimeLimitMs?: number;
    inputMismatch?: boolean;
  };
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

  /**
   * P5：回填 outcome 后自动关闭反事实环（需与 generate-plan 时的 TripWorldState 同会话）。
   * 须同时提供 `causality_id`。
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  state?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Trip id — 写入 travel event 与 state.context' })
  @IsOptional()
  @IsString()
  tripId?: string;
}

/** P5 — Record observed outcome against a causality_id (counterfactual closure). */
export class RecordCausalOutcomeDto {
  @ApiProperty({ description: 'TripWorldState — must include decisionCausalityChain row' })
  @IsObject()
  state!: Record<string, unknown>;

  @ApiProperty({ description: 'Join key from generate-plan / causality_recorded event' })
  @IsString()
  causality_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiProperty({
    description: 'Observed metrics, e.g. iceland_miss_prob, iceland_p90_minutes',
    example: { iceland_miss_prob: 1, iceland_p90_minutes: 168 },
  })
  @IsObject()
  metrics!: Record<string, number>;

  @ApiPropertyOptional({ description: 'Hard label: core appointment missed?' })
  @IsOptional()
  missed_appointment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  narrative?: string;
}
