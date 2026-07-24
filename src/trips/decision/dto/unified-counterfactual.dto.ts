import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UnifiedExplainabilityEnvelopeV1 } from '../explainability/unified-explainability.types';

export class UnifiedCounterfactualRequestDto {
  @ApiProperty({ description: 'unified-explainability@v1 信封（与 explain.unified 同构）' })
  unified!: UnifiedExplainabilityEnvelopeV1;

  @ApiPropertyOptional({ description: '仅返回指定备选方案的反事实；缺省返回全部 rejected/infeasible' })
  alt_plan_id?: string;
}
