import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, Validate, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { FINANCIAL_HOLD_HANDLER_ID, FinancialHoldSideEffectParamsDto } from './financial-hold-side-effect-params.dto';
import { SideEffectOverridesTreeConstraint, SideEffectParamPatchItemConstraint } from './side-effect-params.validation';

/** OpenAPI: one cell `params` per handler (used in PATCH item + REPLACE nested map). */
function sideEffectParamsCellOneOf() {
  return {
    oneOf: [
      { $ref: getSchemaPath(FinancialHoldSideEffectParamsDto) },
      {
        type: 'object' as const,
        description:
          'Params for any handler that is not `side_effect.financial_hold.book_flight_v1` (plain object; arbitrary string keys, JSON values).',
        additionalProperties: true,
      },
    ],
  };
}

export class SideEffectParamPatchItemDto {
  @ApiProperty({ example: 'trip.apply_user_edit' })
  @IsString()
  action_name!: string;

  @ApiProperty({ example: 'side_effect.financial_hold.book_flight_v1' })
  @IsString()
  handler_id!: string;

  @ApiPropertyOptional({
    description:
      'Merged over registry / DB base params. `null` removes the override for this (action, handler). ' +
      `For \`${FINANCIAL_HOLD_HANDLER_ID}\` use only \`ttl_seconds\` and \`hold_ratio\` (no unknown keys; see $ref). ` +
      'Other `handler_id` values accept a plain object with arbitrary keys for forward compatibility.',
    nullable: true,
    ...sideEffectParamsCellOneOf(),
    example: { ttl_seconds: 1800, hold_ratio: 0.2 },
  })
  @IsOptional()
  @Validate(SideEffectParamPatchItemConstraint)
  params?: Record<string, unknown> | null;
}

export class SideEffectParamPatchesBodyDto {
  @ApiProperty({ type: [SideEffectParamPatchItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SideEffectParamPatchItemDto)
  patches!: SideEffectParamPatchItemDto[];

  @ApiPropertyOptional({
    description:
      'If true, each patch is merged into DecisionRuleConfig (Prisma upsert) and this node updates the resolver immediately.',
  })
  @IsOptional()
  @IsBoolean()
  persist_to_db?: boolean;
}

export class SideEffectParamReplaceBodyDto {
  @ApiProperty({
    description:
      'Full replacement: `{ [actionName]: { [handlerId]: params } }`. Each `params` is a non-null object. ' +
      `For \`${FINANCIAL_HOLD_HANDLER_ID}\` the shape is exactly that of the \`FinancialHoldSideEffectParamsDto\` component schema (no extra keys). ` +
      'Other `handlerId` keys: any plain object. Matches runtime validation in `SideEffectOverridesTreeConstraint`.',
    type: 'object',
    additionalProperties: {
      type: 'object',
      description: 'Map of `handler_id` → `params` for this action name.',
      additionalProperties: sideEffectParamsCellOneOf(),
    },
    example: {
      'trip.apply_user_edit': {
        'side_effect.financial_hold.book_flight_v1': { ttl_seconds: 3600, hold_ratio: 0.2 },
      },
    },
  })
  @IsObject()
  @Validate(SideEffectOverridesTreeConstraint)
  overrides!: Record<string, Record<string, Record<string, any>>>;

  @ApiPropertyOptional({
    description: 'If true, upsert rows into DecisionRuleConfig (Prisma) then reload resolver from DB.',
  })
  @IsOptional()
  @IsBoolean()
  persist_to_db?: boolean;

  @ApiPropertyOptional({
    description:
      'When persist_to_db is true: set isActive=false on DB rows not present in overrides (empty overrides + true deactivates all active rules).',
  })
  @IsOptional()
  @IsBoolean()
  deactivate_unlisted?: boolean;
}
