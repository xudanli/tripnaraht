import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class HardTruthRuleUpsertBodyDto {
  @ApiProperty({
    description:
      'Hard-truth rule key (stored as `DecisionRuleConfig.handlerId`). Example: `hard_truth.gate.froad.block_2wd`.',
    example: 'hard_truth.gate.froad.block_2wd',
  })
  @IsString()
  rule_key!: string;

  @ApiPropertyOptional({
    description: 'Params payload. For `hard_truth.gate.froad.block_2wd` use `{ enabled: boolean }`.',
    type: 'object',
    additionalProperties: true,
    example: { enabled: true },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
