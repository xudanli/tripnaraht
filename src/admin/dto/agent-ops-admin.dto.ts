import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Filter by whether evidence_requirement_context exists. true = only rows with context; false = only rows without context.',
  })
  @IsOptional()
  @Type(() => Boolean)
  hasEvidenceRequirementContext?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by whether realized_state.side_effects_ledger contains APPLY_FAILED entry. true = only rows with apply-failed entries; false = only rows without apply-failed entries.',
  })
  @IsOptional()
  @Type(() => Boolean)
  hasApplyFailed?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by whether realized_state.side_effects_ledger contains COMPENSATION_FAILED entry. true = only rows with compensation failures; false = only rows without compensation failures.',
  })
  @IsOptional()
  @Type(() => Boolean)
  hasCompensationFailed?: boolean;

  @ApiPropertyOptional({ description: 'Filter by minimum retry_count in realized_state.side_effects_ledger', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minRetryCount?: number;

  @ApiPropertyOptional({
    description:
      'Filter by whether realized_state.side_effects_ledger contains MANUAL_INTERVENTION_REQUIRED entry. true = only rows requiring manual intervention; false = only rows without manual-intervention entries.',
  })
  @IsOptional()
  @Type(() => Boolean)
  hasManualInterventionRequired?: boolean;
}

export class AdminSagaLogsMetricsQueryDto {
  @ApiPropertyOptional({ description: 'Exact status match (e.g. COMMITTED, FAILED)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: 'Start timestamp (ISO-8601), inclusive' })
  @IsOptional()
  @IsString()
  since?: string;

  @ApiPropertyOptional({ description: 'End timestamp (ISO-8601), inclusive' })
  @IsOptional()
  @IsString()
  until?: string;

  @ApiPropertyOptional({ description: 'Sample size used for metrics aggregation', default: 500, minimum: 1, maximum: 5000 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  take?: number;

  @ApiPropertyOptional({
    description: 'Filter by resolved retry strategy for side effect entries.',
    enum: ['none', 'fixed_interval', 'exponential_backoff'],
  })
  @IsOptional()
  @IsIn(['none', 'fixed_interval', 'exponential_backoff'])
  retryStrategy?: 'none' | 'fixed_interval' | 'exponential_backoff';

  @ApiPropertyOptional({
    description:
      'Filter by whether evidence_requirement_context exists. true = only rows with context; false = only rows without context.',
  })
  @IsOptional()
  @Type(() => Boolean)
  hasEvidenceRequirementContext?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by whether realized_state.side_effects_ledger contains APPLY_FAILED entry. true = only rows with apply-failed entries; false = only rows without apply-failed entries.',
  })
  @IsOptional()
  @Type(() => Boolean)
  hasApplyFailed?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by whether realized_state.side_effects_ledger contains COMPENSATION_FAILED entry. true = only rows with compensation failures; false = only rows without compensation failures.',
  })
  @IsOptional()
  @Type(() => Boolean)
  hasCompensationFailed?: boolean;

  @ApiPropertyOptional({ description: 'Filter by minimum retry_count in realized_state.side_effects_ledger', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minRetryCount?: number;

  @ApiPropertyOptional({
    description:
      'Filter by whether realized_state.side_effects_ledger contains MANUAL_INTERVENTION_REQUIRED entry. true = only rows requiring manual intervention; false = only rows without manual-intervention entries.',
  })
  @IsOptional()
  @Type(() => Boolean)
  hasManualInterventionRequired?: boolean;
}
