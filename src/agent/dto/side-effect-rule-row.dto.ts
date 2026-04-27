import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, Validate } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FINANCIAL_HOLD_HANDLER_ID } from './financial-hold-side-effect-params.dto';
import { SideEffectParamPatchItemConstraint } from './side-effect-params.validation';

export class SideEffectRuleUpsertBodyDto {
  @ApiProperty({ example: 'trip.apply_user_edit' })
  @IsString()
  action_name!: string;

  @ApiProperty({ example: 'side_effect.financial_hold.book_flight_v1' })
  @IsString()
  handler_id!: string;

  @ApiPropertyOptional({
    description:
      'Full params object for this (action, handler). ' +
      `For \`${FINANCIAL_HOLD_HANDLER_ID}\` only \`ttl_seconds\` and \`hold_ratio\` are allowed (no unknown keys).`,
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  @Validate(SideEffectParamPatchItemConstraint)
  params?: Record<string, unknown>;
}

