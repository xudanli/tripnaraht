import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class AdminRulePatchDto {
  @ApiProperty()
  @IsString()
  action_name!: string;

  @ApiProperty()
  @IsString()
  handler_id!: string;

  @ApiPropertyOptional({ description: 'Merge into existing params; omit to only toggle is_active' })
  @IsOptional()
  @IsObject()
  params?: Record<string, any> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class AdminRulesBatchReplaceDto {
  @ApiProperty({
    description: 'Nested map: actionName → handlerId → params object',
    example: { 'trip.apply_user_edit': { 'side_effect.financial_hold': { hold_ratio: 0.2 } } },
  })
  @IsObject()
  pack!: Record<string, Record<string, Record<string, any>>>;

  @ApiPropertyOptional({
    description: 'When true, deactivates side-effect DecisionRuleConfig rows not present in pack (hard-truth rows untouched).',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  deactivate_unlisted?: boolean;
}

export class AdminSagaRetryDto {
  @ApiPropertyOptional({ description: 'Optional client idempotency key (stored on replay ledger row)' })
  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

export const ADMIN_RULE_ACTIVE_FILTER = ['all', 'active', 'inactive'] as const;
export type AdminRuleActiveFilter = (typeof ADMIN_RULE_ACTIVE_FILTER)[number];

export class AdminRulesListQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive contains filter on action_name' })
  @IsOptional()
  @IsString()
  actionName?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive contains filter on handler_id' })
  @IsOptional()
  @IsString()
  handlerId?: string;

  @ApiPropertyOptional({ enum: ADMIN_RULE_ACTIVE_FILTER, default: 'all' })
  @IsOptional()
  @IsIn([...ADMIN_RULE_ACTIVE_FILTER])
  active?: AdminRuleActiveFilter;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  skip?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  take?: number;
}

export class AdminSagaLogsQueryDto {
  @ApiPropertyOptional({ description: 'Exact status match (e.g. COMMITTED, FAILED)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  skip?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  take?: number;
}
