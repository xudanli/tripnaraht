import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CausalTraceReferenceDto } from './causal-trace-reference.dto';

/**
 * POST .../decision-problems/:problemId/resolutions
 * Fields must use class-validator decorators — global ValidationPipe whitelist strips undecorated properties.
 */
export class SubmitResolutionBodyDto {
  @IsOptional()
  @IsString()
  selectedActionId?: string;

  /** Alias for older clients */
  @IsOptional()
  @IsString()
  actionId?: string;

  @IsOptional()
  @IsString()
  optionId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acknowledgement?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CausalTraceReferenceDto)
  causalTraceRef?: CausalTraceReferenceDto;
}
