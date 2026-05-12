import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export const NEGOTIATION_DECISION_EVENTS = [
  'NEGOTIATION_OPENED',
  'NEGOTIATION_VIEWED',
  'NEGOTIATION_CONFIRMED',
  'NEGOTIATION_DISCARDED',
  'NEGOTIATION_REJECTED',
  'NEGOTIATION_TAG_EXPANDED',
] as const;

export type NegotiationDecisionEvent = (typeof NEGOTIATION_DECISION_EVENTS)[number];

export class LogDecisionRequestDto {
  @ApiProperty({ example: 'req-xxx' })
  @IsString()
  @MinLength(3)
  request_id!: string;

  @ApiPropertyOptional({ example: 'trip_456', description: 'Trip id (not necessarily UUID)' })
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiProperty({ example: 'user_123' })
  @IsString()
  @MinLength(2)
  user_id!: string;

  @ApiProperty({ enum: NEGOTIATION_DECISION_EVENTS, example: 'NEGOTIATION_DISCARDED' })
  @IsString()
  @IsIn(NEGOTIATION_DECISION_EVENTS)
  event!: NegotiationDecisionEvent;

  @ApiPropertyOptional({ example: 'sess_xxx' })
  @IsOptional()
  @IsString()
  negotiation_session_id?: string;

  @ApiPropertyOptional({ example: 'hash_xxx' })
  @IsOptional()
  @IsString()
  expected_negotiation_hash?: string;

  @ApiPropertyOptional({ example: 'rev_xxx', description: 'Itinerary revision id (audit only; no revision-chain write)' })
  @IsOptional()
  @IsString()
  revision_id?: string;

  @ApiPropertyOptional({ example: 'UPGRADE_TO_DRIVE' })
  @IsOptional()
  @IsString()
  selected_alternative_id?: string;

  @ApiPropertyOptional({ example: 'REAL_TIME_RISK_WARNING' })
  @IsOptional()
  @IsString()
  reasoning_tag?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { preferred_modes: ['TRANSIT'], forbidden_modes: ['DRIVE'] },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @ApiPropertyOptional({ example: '2026-04-28T09:25:00.000Z' })
  @IsOptional()
  @IsString()
  client_ts?: string;
}

export class LogDecisionResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: { logged: true }, description: 'Whether persisted to Decision Log storage' })
  data!: { logged: boolean };
}

