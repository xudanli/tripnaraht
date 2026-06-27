import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OptionComparisonScoresDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  executability?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  cost?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  fatigue?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  risk?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  experienceDensity?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  freedom?: number;
}

export class OptionComparisonOptionDto {
  @ApiProperty({ description: '稳定 optionId，跨轮次不变' })
  optionId!: string;

  @ApiPropertyOptional({ description: '列头人话标签' })
  label?: string;

  @ApiProperty({ type: OptionComparisonScoresDto })
  scores!: OptionComparisonScoresDto;

  @ApiPropertyOptional({ description: '一行 caveat / summary' })
  summary?: string;
}

export class OptionComparisonRecommendationDto {
  @ApiProperty()
  optionId!: string;

  @ApiProperty({ description: 'C 端可展示推荐理由' })
  reason!: string;
}

export class OptionComparisonGateDeltaDto {
  @ApiProperty()
  optionId!: string;

  @ApiProperty({ enum: ['ALLOW', 'NEED_CONFIRM', 'REJECT', 'BLOCK'] })
  gateStatus!: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT' | 'BLOCK';

  @ApiProperty()
  violationCount!: number;

  @ApiProperty({ type: [String] })
  violationTypes!: string[];
}

export class OptionComparisonKernelGateEvalDto {
  @ApiProperty({ type: [OptionComparisonGateDeltaDto] })
  optionDeltas!: OptionComparisonGateDeltaDto[];

  @ApiPropertyOptional()
  divergesFromLlmRecommendation?: boolean;

  @ApiPropertyOptional()
  llmRecommendedOptionId?: string;

  @ApiPropertyOptional()
  recommendedByGate?: string;
}

export class OptionComparisonDisplayDto {
  @ApiProperty({ description: '矩阵默认可见列数（Plan Studio 主区）', example: 3 })
  visibleColumnCount!: number;

  @ApiProperty({ description: '超出可见列的方案数', example: 1 })
  overflowCount!: number;

  @ApiProperty({ type: [String], description: '折叠区 optionId 列表（保持顺序）' })
  overflowOptionIds!: string[];
}

/** Plan Studio 方案矩阵主读模型（schema tripnara.option_comparison@v1） */
export class OptionComparisonBffDto {
  @ApiProperty({ example: 'tripnara.option_comparison@v1' })
  schema!: 'tripnara.option_comparison@v1';

  @ApiProperty({ type: [OptionComparisonOptionDto] })
  options!: OptionComparisonOptionDto[];

  @ApiPropertyOptional({ type: OptionComparisonRecommendationDto })
  recommendation?: OptionComparisonRecommendationDto;

  @ApiPropertyOptional({ type: OptionComparisonKernelGateEvalDto })
  kernelGateEval?: OptionComparisonKernelGateEvalDto;

  @ApiPropertyOptional({
    type: OptionComparisonDisplayDto,
    description: 'options.length > visibleColumnCount 时下发，供前端 overflow UI',
  })
  display?: OptionComparisonDisplayDto;
}

/** explain.alternatives[] BFF 投影（与矩阵同源） */
export class ExplainAlternativeBffDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: '列头人话' })
  label!: string;

  @ApiProperty({ type: OptionComparisonScoresDto })
  dimension_scores!: OptionComparisonScoresDto;

  @ApiProperty()
  is_recommended!: boolean;

  @ApiPropertyOptional()
  caveat?: string;
}
