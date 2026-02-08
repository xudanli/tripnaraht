// src/agent/assistants/planning-assistant/dto/v2/chat-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RequestContextDto } from '../planning-assistant.dto';

/**
 * 对话选项
 */
export class ChatOptionsDto {
  @ApiPropertyOptional({ description: '自动路由到业务接口', default: true })
  @IsOptional()
  @IsBoolean()
  autoRoute?: boolean;

  @ApiPropertyOptional({ description: '意图不明确时澄清', default: true })
  @IsOptional()
  @IsBoolean()
  clarifyIntent?: boolean;

  @ApiPropertyOptional({ description: '是否流式响应', default: false })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}

/**
 * 对话请求DTO
 */
export class ChatRequestDto {
  @ApiProperty({ description: '会话ID' })
  @IsString()
  sessionId!: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ description: '用户消息（支持自然语言）' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';

  @ApiPropertyOptional({ description: '对话选项' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatOptionsDto)
  options?: ChatOptionsDto;

  @ApiPropertyOptional({ description: '请求上下文' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RequestContextDto)
  context?: RequestContextDto;
}
