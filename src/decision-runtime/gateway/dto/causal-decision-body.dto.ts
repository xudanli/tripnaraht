import { IsOptional, IsString } from 'class-validator';

/** POST .../causal-decisions/:decisionId/select */
export class SelectCausalDecisionBodyDto {
  @IsString()
  optionId!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

/** POST .../causal-decisions/:decisionId/apply */
export class ApplyCausalDecisionBodyDto {
  @IsOptional()
  @IsString()
  optionId?: string;
}
