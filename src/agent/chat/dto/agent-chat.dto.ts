import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { resolveAgentChatMessageText } from '../resolve-agent-chat-message.util';

export const AGENT_CHAT_SCOPES = ['TRIP_SHARED', 'PERSONAL'] as const;
export type AgentChatScope = (typeof AGENT_CHAT_SCOPES)[number];

export class CreateAgentConversationDto {
  @ApiProperty({ enum: AGENT_CHAT_SCOPES })
  @IsIn(AGENT_CHAT_SCOPES)
  scope!: AgentChatScope;

  @ApiPropertyOptional({
    description: 'Required when scope=TRIP_SHARED; optional PERSONAL anchor',
  })
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ description: 'Cursor = message id (exclusive, older)' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class PostAgentChatMessageDto {
  @ApiProperty({
    description:
      'User utterance. Preferred: `message`. Also: text|content|body|prompt|query|user_message|userMessage (and nested under data/payload).',
    example: '第三天太赶了，帮我松一点',
  })
  @Transform(({ obj }) => {
    const resolved = resolveAgentChatMessageText(obj);
    return resolved || undefined;
  })
  @IsOptional()
  @IsString()
  @MinLength(1, {
    message:
      'message is required (also accepts text/content/body/prompt/query/user_message)',
  })
  @MaxLength(8000)
  message?: string;

  /** Client aliases — folded into `message` by Transform / service */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  user_message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userMessage?: string;

  @ApiPropertyOptional({ description: 'Display name for team thread' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string;

  @ApiPropertyOptional({
    description: 'Client request id; server generates if omitted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  request_id?: string;

  @ApiPropertyOptional({
    enum: ['OFF', 'AUTO', 'FORCE'],
    description:
      'Forwarded to route_and_run.options.async_mode。绑定 trip 的会话若省略，服务端默认 FORCE（秒回 task_id，避免同步长请求被客户端判为网络不可用）。',
  })
  @IsOptional()
  @IsIn(['OFF', 'AUTO', 'FORCE'])
  async_mode?: 'OFF' | 'AUTO' | 'FORCE';
}

export class ConfirmAgentChatDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  session_id!: string;

  @ApiProperty({ enum: ['UPGRADE_TO_DRIVE', 'POSTPONE_SCHEDULE'] })
  @IsIn(['UPGRADE_TO_DRIVE', 'POSTPONE_SCHEDULE'])
  alternative_id!: 'UPGRADE_TO_DRIVE' | 'POSTPONE_SCHEDULE';

  @ApiProperty()
  @IsString()
  @MinLength(8)
  expected_negotiation_hash!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string;
}

/**
 * 确认写入改排草案（非 Abu confirm / 非 decision_consent）。
 * 内部：route_and_run + apply_itinerary_adjust_draft。
 */
export class ApplyItineraryDraftDto {
  @ApiPropertyOptional({
    description: '草案消息 id（ASSISTANT）；省略则用会话内最近一条带 itinerary_adjust_result 的消息',
  })
  @IsOptional()
  @IsUUID()
  message_id?: string;

  @ApiPropertyOptional({ description: '与卡片 draft_id / primary_action.params.idempotency_key 对齐' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  draft_id?: string;

  @ApiPropertyOptional({ description: '目标日 YYYY-MM-DD；优先于消息内 draft' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  target_date_iso?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  durable_trip_run_id?: string;

  @ApiPropertyOptional({
    description: '可选：覆盖消息内 apply_snapshot（须与当轮 timeline 目标日一致）',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  apply_snapshot?: {
    target_date_iso?: string;
    target_day_number?: number;
    apply_mode?: 'replace_day' | 'append_sparse_days';
    items?: Array<Record<string, unknown>>;
    days?: Array<Record<string, unknown>>;
  };

  @ApiPropertyOptional({
    description: '幂等键；默认用 draft_id。同一键重复确认返回已写入结果，不二次改库',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotency_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string;
}
