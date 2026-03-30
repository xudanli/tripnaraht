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
}
