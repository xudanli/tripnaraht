import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  ACTION_REJECT_REASON_CODES,
  ActionRejectReasonCode,
  TRAVEL_ACTION_TYPE_VALUES,
  TravelActionType,
  TRAVEL_ONTOLOGY_MERGE_POLICY,
} from '../constants/action-execution.constants';
import type { DecisionState } from '../../decision/kernel/decision-state.types';

export class ActionExecutionItemDto {
  @ApiProperty({ example: 'act_123' })
  @IsString()
  action_id!: string;

  @ApiProperty({
    enum: [...TRAVEL_ACTION_TYPE_VALUES],
    description:
      'BOOK/CANCEL/ADJUST/NOTIFY/OPTIMIZE 为内核动词；MODIFY、SELECT 等价于 ADJUST；PAY 表示支付/扣款意图（高风险场景需确认）',
  })
  @IsIn([...TRAVEL_ACTION_TYPE_VALUES])
  action_type!: TravelActionType;

  @ApiProperty({ enum: ['FLIGHT', 'HOTEL', 'ACTIVITY', 'TRANSPORT', 'ITINERARY'] })
  @IsEnum(['FLIGHT', 'HOTEL', 'ACTIVITY', 'TRANSPORT', 'ITINERARY'])
  target_type!: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';

  @ApiPropertyOptional({ example: 'flight_CA1234_2026-04-01' })
  @IsOptional()
  @IsString()
  target_ref?: string;

  @ApiPropertyOptional({ description: '可选：显式指定已注册 action name（优先于自动映射）', example: 'execution.remind' })
  @IsOptional()
  @IsString()
  action_name?: string;

  @ApiPropertyOptional({ description: '可选：action execute 的 input 参数' })
  @IsOptional()
  action_input?: Record<string, any>;

  @ApiPropertyOptional({ description: '该动作被拦截时的原因码（仅响应字段）' })
  @IsOptional()
  @IsEnum(ACTION_REJECT_REASON_CODES)
  rejected_reason_code?: ActionRejectReasonCode;

  @ApiPropertyOptional({ description: '该动作被拦截时的可读消息（仅响应字段）' })
  @IsOptional()
  @IsString()
  rejected_message?: string;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  risk_level!: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiProperty({ example: true })
  @IsBoolean()
  requires_confirmation!: boolean;

  @ApiPropertyOptional({
    description:
      'Two-phase lock: context signature returned by preview; commit must echo it back to prevent stale execution.',
    example: 'sha256:...',
  })
  @IsOptional()
  @IsString()
  context_signature?: string;

  @ApiPropertyOptional({
    description:
      'Preview snapshot passthrough for side-by-side comparison on stale preview. Client should echo this back on commit.',
    example: {
      shadow_delta: { resources: { budget: { current: 2000, delta: -500, after: 1500, currency: 'USD' } } },
    },
  })
  @IsOptional()
  preview_snapshot?: {
    shadow_delta?: ActionShadowDeltaViewDto;
    side_effects?: SideEffectPreviewDto[];
  };

  @ApiPropertyOptional({
    description:
      'When commit is blocked due to stale preview, return recomputed assessment to reduce user friction (auto-recompute).',
    example: {
      provided_signature: 'sha256:...',
      recomputed_signature: 'sha256:...',
      recomputed_assessment: {
        status: 'requires_confirmation',
        preconditions: [{ code: 'BUDGET_LIMIT_WARNING', severity: 'WARN', message: '...', path: 'wallet.budget_limit' }],
        shadow_delta: { resources: { budget: { current: 2000, delta: -500, after: 1500, currency: 'USD' } } },
      },
    },
  })
  @IsOptional()
  stale_shadow_context?: {
    provided_signature: string;
    recomputed_signature: string;
    original_shadow_delta?: ActionShadowDeltaViewDto;
    original_side_effects?: SideEffectPreviewDto[];
    recomputed_assessment: {
      status: 'feasible' | 'blocked' | 'requires_confirmation';
      preconditions: ActionPreconditionFindingDto[];
      shadow_delta?: ActionShadowDeltaViewDto;
    };
  };
}

export class ActionPreconditionFindingDto {
  @ApiProperty({ example: 'BUDGET_LIMIT_WARNING' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'WARN', enum: ['INFO', 'WARN', 'BLOCK'] })
  @IsEnum(['INFO', 'WARN', 'BLOCK'])
  severity!: 'INFO' | 'WARN' | 'BLOCK';

  @ApiProperty({ example: 'Booking would drop wallet below budget_limit; requires confirmation.' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ example: 'wallet.budget_limit' })
  @IsOptional()
  @IsString()
  path?: string;
}

export class ActionShadowDeltaBudgetDto {
  @ApiProperty({ example: 2000 })
  current!: number;
  @ApiProperty({ example: -500 })
  delta!: number;
  @ApiProperty({ example: 1500 })
  after!: number;
  @ApiProperty({ example: 'USD' })
  currency!: string;
}

export class ActionShadowDeltaResourcesDto {
  @ApiPropertyOptional({ type: ActionShadowDeltaBudgetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActionShadowDeltaBudgetDto)
  budget?: ActionShadowDeltaBudgetDto;
}

export class ActionShadowDeltaViewDto {
  @ApiPropertyOptional({ type: ActionShadowDeltaResourcesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActionShadowDeltaResourcesDto)
  resources?: ActionShadowDeltaResourcesDto;
}

/** SideEffect preview DTO (discriminator by `kind`). v1 keeps it permissive but strongly shaped. */
export class SideEffectPreviewDto {
  @ApiProperty({
    enum: ['RESOURCE_LOCK', 'FINANCIAL_HOLD', 'CREDIT_IMPACT', 'ENERGY_PREALLOCATION', 'RISK_DRIFT', 'FATIGUE_ACCRUAL', 'IRREVERSIBILITY_COST'],
  })
  kind!:
    | 'RESOURCE_LOCK'
    | 'FINANCIAL_HOLD'
    | 'CREDIT_IMPACT'
    | 'ENERGY_PREALLOCATION'
    | 'RISK_DRIFT'
    | 'FATIGUE_ACCRUAL'
    | 'IRREVERSIBILITY_COST';

  @ApiProperty({ enum: ['RESOURCE_AVAILABILITY', 'FINANCIAL_FLOW', 'RISK_DISTRIBUTION', 'REVERSIBILITY'] })
  deltaType!: 'RESOURCE_AVAILABILITY' | 'FINANCIAL_FLOW' | 'RISK_DISTRIBUTION' | 'REVERSIBILITY';

  @ApiProperty({ example: 0.9 })
  confidence!: number;

  @ApiPropertyOptional({ description: 'ISO timestamp when effect expires (if time-bound)' })
  @IsOptional()
  @IsString()
  expiresAt?: string;

  @ApiPropertyOptional({ type: ActionShadowDeltaViewDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActionShadowDeltaViewDto)
  shadow_delta?: ActionShadowDeltaViewDto;

  @ApiPropertyOptional({ description: 'Optional evidence bundle for audit', type: 'object', additionalProperties: true })
  @IsOptional()
  evidenceBundle?: any;
}

export class ActionPreviewAssessmentDto {
  @ApiProperty({ example: 'act_123' })
  @IsString()
  action_id!: string;

  @ApiProperty({ enum: ['feasible', 'blocked', 'requires_confirmation'] })
  @IsEnum(['feasible', 'blocked', 'requires_confirmation'])
  status!: 'feasible' | 'blocked' | 'requires_confirmation';

  @ApiProperty({ type: [ActionPreconditionFindingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionPreconditionFindingDto)
  preconditions!: ActionPreconditionFindingDto[];

  @ApiPropertyOptional({ type: ActionShadowDeltaViewDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActionShadowDeltaViewDto)
  shadow_delta?: ActionShadowDeltaViewDto;

  @ApiProperty({
    description: 'Two-phase lock signature computed from (preconditions + shadow_delta + action input).',
    example: 'sha256:...',
  })
  @IsString()
  context_signature!: string;

  @ApiPropertyOptional({
    description: 'Side effect previews (resource lock / financial hold / risk drift, etc.)',
    type: [SideEffectPreviewDto],
  })
  @IsOptional()
  side_effects?: SideEffectPreviewDto[];
}

export class ActionPreviewRequestDto {
  @ApiProperty({ example: 'req_001' })
  @IsString()
  request_id!: string;

  @ApiProperty({ example: 'trip_001' })
  @IsString()
  trip_id!: string;

  @ApiPropertyOptional({ enum: ['ADVICE_ONLY', 'SEMI_AUTO', 'AUTO'], default: 'ADVICE_ONLY' })
  @IsOptional()
  @IsEnum(['ADVICE_ONLY', 'SEMI_AUTO', 'AUTO'])
  execution_mode?: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO';

  @ApiPropertyOptional({ type: [ActionExecutionItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionExecutionItemDto)
  actions?: ActionExecutionItemDto[];

  @ApiPropertyOptional({
    description: '可直接传 route_and_run 返回的 itinerary.action_plan（与 actions 二选一，actions 优先）',
    type: [ActionExecutionItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionExecutionItemDto)
  action_plan?: ActionExecutionItemDto[];
}

export class ActionCommitRequestDto {
  @ApiProperty({ example: 'req_001' })
  @IsString()
  request_id!: string;

  @ApiProperty({ example: 'trip_001' })
  @IsString()
  trip_id!: string;

  @ApiProperty({ type: [ActionExecutionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionExecutionItemDto)
  actions!: ActionExecutionItemDto[];

  @ApiPropertyOptional({ description: '高风险动作提交确认令牌' })
  @IsOptional()
  @IsString()
  confirmation_token?: string;

  @ApiPropertyOptional({ description: '幂等键（优先于 request_id 参与去重）' })
  @IsOptional()
  @IsString()
  idempotency_key?: string;

  @ApiPropertyOptional({
    description:
      'When true, if post-commit settlement mismatches DecisionContract, server returns diagnosis + recomputed preview to help auto-heal.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  auto_heal?: boolean;
}

/** commit 响应中与 DSO.travelOntologyState 对齐的增量 patch（通常仅 verbs.committed） */
export class TravelOntologyCommitEnvelopeDto {
  @ApiProperty({ description: '与请求 trip_id 一致，便于校验' })
  trip_id!: string;

  @ApiProperty({
    description: '增量；与 DecisionState.travelOntologyState 同构子集，客户端按 merge_policy 合并',
    type: 'object',
    additionalProperties: true,
    example: {
      tripId: 'trip_001',
      verbs: { committed: ['act_1', 'act_2'] },
    },
  })
  patch!: Partial<NonNullable<DecisionState['travelOntologyState']>>;

  @ApiProperty({
    enum: [TRAVEL_ONTOLOGY_MERGE_POLICY],
    description: 'committed 与本地已有数组并集去重；不写 pending 则不改本地 pending',
  })
  merge_policy!: typeof TRAVEL_ONTOLOGY_MERGE_POLICY;
}

export class ActionRollbackRequestDto {
  @ApiProperty({ example: 'req_001' })
  @IsString()
  request_id!: string;

  @ApiProperty({ example: 'trip_001' })
  @IsString()
  trip_id!: string;

  @ApiProperty({ type: [String], example: ['act_123'] })
  @IsArray()
  @IsString({ each: true })
  action_ids!: string[];
}

export class ActionExecutionResponseDto {
  @ApiProperty({ enum: ['OK', 'FAILED', 'PARTIAL'] })
  @IsEnum(['OK', 'FAILED', 'PARTIAL'])
  status!: 'OK' | 'FAILED' | 'PARTIAL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ type: [ActionExecutionItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionExecutionItemDto)
  accepted_actions?: ActionExecutionItemDto[];

  @ApiPropertyOptional({ type: [ActionExecutionItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionExecutionItemDto)
  blocked_actions?: ActionExecutionItemDto[];

  @ApiPropertyOptional({ description: '被拦截动作的标准化原因码', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsEnum(ACTION_REJECT_REASON_CODES, { each: true })
  rejected_reason_codes?: ActionRejectReasonCode[];

  @ApiPropertyOptional({ description: '需要确认的动作数量' })
  @IsOptional()
  requires_confirmation_count?: number;

  @ApiPropertyOptional({ description: '高风险动作数量' })
  @IsOptional()
  high_risk_count?: number;

  @ApiPropertyOptional({
    type: TravelOntologyCommitEnvelopeDto,
    description: 'commit 成功后供客户端合并进 payload.travelOntologyState（仅含本批已执行 action_id）',
  })
  @IsOptional()
  travel_ontology?: TravelOntologyCommitEnvelopeDto;

  @ApiPropertyOptional({
    description: 'Preview 的结构化评估（前置条件 + Shadow Delta）。',
    type: [ActionPreviewAssessmentDto],
    example: [
      {
        action_id: 'act_123',
        status: 'feasible',
        preconditions: [{ code: 'BUDGET_LIMIT_WARNING', severity: 'WARN', message: '...', path: 'wallet.budget_limit' }],
        shadow_delta: { resources: { budget: { current: 2000, delta: -500, after: 1500, currency: 'USD' } } },
      },
    ],
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ActionPreviewAssessmentDto)
  action_previews?: ActionPreviewAssessmentDto[];

  @ApiPropertyOptional({
    description: 'Best-effort resilient execution response when auto_heal is enabled.',
    type: 'object',
    additionalProperties: true,
    example: {
      triggered: true,
      diagnoses: [
        {
          action_id: 'act_123',
          metric: 'budget.hold_amount',
          expected_amount: 500,
          realized_amount: 0,
          tolerance: 1,
          status: 'DRIFT',
        },
      ],
      recomputed_previews: [
        {
          action_id: 'act_123',
          status: 'blocked',
          preconditions: [{ code: 'BUDGET_LIMIT_WARNING', severity: 'WARN', message: '...', path: 'wallet.budget_limit' }],
        },
      ],
    },
  })
  @IsOptional()
  healing?: any;
}
