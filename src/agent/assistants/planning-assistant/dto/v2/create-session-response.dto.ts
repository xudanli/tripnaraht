// src/agent/assistants/planning-assistant/dto/v2/create-session-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 创建会话响应
 */
export class CreateSessionResponseDto {
  @ApiProperty({ description: '会话ID' })
  sessionId!: string;

  @ApiPropertyOptional({ description: '用户ID' })
  userId?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '过期时间' })
  expiresAt!: string;

  @ApiPropertyOptional({ description: '上下文信息' })
  context?: {
    tripId?: string;
    destination?: string;
  };
}
