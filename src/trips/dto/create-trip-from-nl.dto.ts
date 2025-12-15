// src/trips/dto/create-trip-from-nl.dto.ts
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LlmProvider } from '../../llm/dto/llm-request.dto';

export class CreateTripFromNaturalLanguageDto {
  @ApiProperty({
    description: '自然语言输入',
    example: '帮我规划带娃去东京5天的行程，预算2万',
  })
  @IsString()
  text!: string;

  @ApiPropertyOptional({
    description: 'LLM 提供商',
    enum: LlmProvider,
  })
  @IsEnum(LlmProvider)
  @IsOptional()
  llmProvider?: LlmProvider;
}
