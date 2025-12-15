// src/llm/dto/llm-request.dto.ts
import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LlmProvider {
  OPENAI = 'openai',
  GEMINI = 'gemini',
  DEEPSEEK = 'deepseek',
  ANTHROPIC = 'anthropic',
}

export class NaturalLanguageToParamsDto {
  @ApiProperty({
    description: '自然语言输入',
    example: '帮我规划带娃去东京5天的行程，预算2万',
  })
  @IsString()
  text!: string;

  @ApiPropertyOptional({
    description: 'LLM 提供商',
    enum: LlmProvider,
    default: LlmProvider.OPENAI,
  })
  @IsEnum(LlmProvider)
  @IsOptional()
  provider?: LlmProvider;
}

export class TripCreationParams {
  @ApiProperty({ description: '目的地国家代码', example: 'JP' })
  destination!: string;

  @ApiProperty({ description: '开始日期（ISO 格式）', example: '2024-05-01T00:00:00.000Z' })
  startDate!: string;

  @ApiProperty({ description: '结束日期（ISO 格式）', example: '2024-05-05T00:00:00.000Z' })
  endDate!: string;

  @ApiProperty({ description: '总预算（元）', example: 20000 })
  totalBudget!: number;

  @ApiPropertyOptional({ description: '是否有小孩', example: true })
  hasChildren?: boolean;

  @ApiPropertyOptional({ description: '是否有老人', example: false })
  hasElderly?: boolean;

  @ApiPropertyOptional({ description: '旅行偏好', type: Object })
  preferences?: Record<string, any>;
}

export class HumanizeResultDto {
  @ApiProperty({
    description: '结构化数据（如行程优化结果、What-If评估结果等）',
    type: Object,
  })
  @IsObject()
  data!: Record<string, any>;

  @ApiProperty({
    description: '数据类型',
    example: 'itinerary_optimization',
    enum: ['itinerary_optimization', 'what_if_evaluation', 'trip_schedule', 'transport_plan'],
  })
  @IsString()
  dataType!: string;

  @ApiPropertyOptional({
    description: 'LLM 提供商',
    enum: LlmProvider,
  })
  @IsEnum(LlmProvider)
  @IsOptional()
  provider?: LlmProvider;
}

export class DecisionSupportDto {
  @ApiProperty({
    description: '决策场景描述',
    example: '评估当前行程的稳健度，并提供优化建议',
  })
  @IsString()
  scenario!: string;

  @ApiProperty({
    description: '相关接口数据（如行程Schedule、风险指标等）',
    type: Object,
  })
  @IsObject()
  contextData!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'LLM 提供商',
    enum: LlmProvider,
  })
  @IsEnum(LlmProvider)
  @IsOptional()
  provider?: LlmProvider;
}
