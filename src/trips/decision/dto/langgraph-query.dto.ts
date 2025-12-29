// src/trips/decision/dto/langgraph-query.dto.ts
/**
 * LangGraph 查询 DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class LangGraphQueryDto {
  @ApiProperty({
    description: '用户查询（自然语言）',
    example: '我想在7月去冰岛，但我膝盖不好，不想太累',
  })
  @IsString()
  query!: string;

  @ApiPropertyOptional({
    description: '上下文信息（可选）',
    example: { userId: 'user-123', sessionId: 'session-456' },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

export class LangGraphQueryResponseDto {
  @ApiProperty({
    description: '最终响应（可读解释）',
  })
  finalResponse!: string;

  @ApiProperty({
    description: '是否允许',
  })
  allowed!: boolean;

  @ApiProperty({
    description: '核心工具输出',
  })
  coreToolOutput!: any;

  @ApiPropertyOptional({
    description: '提取的参数',
  })
  extractedParams?: any;

  @ApiPropertyOptional({
    description: '错误信息',
  })
  error?: string;
}

