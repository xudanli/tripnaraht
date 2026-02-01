// src/trips/dto/nl-conversation-context.dto.ts
import { IsString, IsOptional, IsEnum, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { LlmProvider } from '../../llm/dto/llm-request.dto';

/**
 * 创建/更新自然语言行程请求 DTO（支持会话上下文）
 */
export class CreateTripFromNLDto {
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
    description: 'LLM 提供商',
    enum: LlmProvider,
  })
  @IsEnum(LlmProvider)
  @IsOptional()
  llmProvider?: LlmProvider;
}

/**
 * 获取会话上下文请求 DTO
 */
export class GetConversationContextDto {
  @ApiProperty({
    description: '会话 ID',
    example: 'nl_user123_abc12345',
  })
  @IsString()
  sessionId!: string;
}

/**
 * 更新会话上下文请求 DTO
 */
export class UpdateConversationContextDto {
  @ApiProperty({
    description: '会话 ID',
    example: 'nl_user123_abc12345',
  })
  @IsString()
  sessionId!: string;

  @ApiPropertyOptional({
    description: '对话上下文数据',
    example: { destination: 'JP', preferences: { style: 'relaxed' } },
  })
  @IsObject()
  @IsOptional()
  conversationContext?: Record<string, any>;

  @ApiPropertyOptional({
    description: '部分解析的参数',
    example: { destination: 'JP', startDate: '2025-02-01' },
  })
  @IsObject()
  @IsOptional()
  partialParams?: Record<string, any>;
}

/**
 * 删除会话请求 DTO
 */
export class DeleteConversationDto {
  @ApiProperty({
    description: '会话 ID',
    example: 'nl_user123_abc12345',
  })
  @IsString()
  sessionId!: string;
}
