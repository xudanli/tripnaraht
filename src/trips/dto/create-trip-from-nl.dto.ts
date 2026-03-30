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
    description: '会话 ID（用于恢复对话上下文），不提供则创建新会话',
    example: 'nl_user123_abc12345',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description: '是否开始新对话（true时清空旧上下文，创建新会话）',
    example: false,
    default: false,
  })
  @IsOptional()
  isNewConversation?: boolean;

  @ApiPropertyOptional({
    description: 'LLM 提供商',
    enum: LlmProvider,
  })
  @IsEnum(LlmProvider)
  @IsOptional()
  llmProvider?: LlmProvider;
}
