import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Registered handler id for `FinancialHoldSideEffect` (FINANCIAL_HOLD v1). */
export const FINANCIAL_HOLD_HANDLER_ID = 'side_effect.financial_hold.book_flight_v1' as const;

/**
 * JSON params for {@link FINANCIAL_HOLD_HANDLER_ID} (layer-2 override / `side_effect_configs` merge).
 * Matches `financial-hold.side-effect.ts` consumption (`ttl_seconds`, `hold_ratio`).
 */
export class FinancialHoldSideEffectParamsDto {
  @ApiPropertyOptional({
    description: 'Hold TTL in seconds (positive; typical default in handler is 900).',
    minimum: 1,
    maximum: 7 * 24 * 60 * 60,
    example: 900,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(7 * 24 * 60 * 60)
  ttl_seconds?: number;

  @ApiPropertyOptional({
    description: 'Portion of assessed amount to hold (0–1].',
    minimum: 0.0001,
    maximum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  @Max(1)
  hold_ratio?: number;
}
