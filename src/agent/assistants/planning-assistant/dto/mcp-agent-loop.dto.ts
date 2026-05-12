import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LlmProvider } from '../../../../llm/dto/llm-request.dto';

export class McpAgentLoopRunDto {
  @ApiProperty({ description: '用户自然语言输入', example: '大阪明天天气怎么样？' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: '可选系统提示（覆盖默认 TripNARA 工具策略）' })
  @IsOptional()
  @IsString()
  system_prompt?: string;

  @ApiPropertyOptional({ description: '最大 Agent 步数', default: 8, maximum: 16 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16)
  max_steps?: number;

  @ApiPropertyOptional({ enum: LlmProvider, description: '须支持 OpenAI 兼容 tools 的 provider' })
  @IsOptional()
  @IsEnum(LlmProvider)
  provider?: LlmProvider;

  @ApiPropertyOptional({ enum: ['weather'], description: '注册的工具包（默认 weather）；与 tool_packs 二选一' })
  @IsOptional()
  @IsIn(['weather'])
  tool_pack?: 'weather';

  @ApiPropertyOptional({
    description: '多工具包：weather / exa / hotel（合并注册）',
    type: [String],
    example: ['weather', 'exa'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['weather', 'exa', 'hotel'], { each: true })
  tool_packs?: Array<'weather' | 'exa' | 'hotel'>;
}
