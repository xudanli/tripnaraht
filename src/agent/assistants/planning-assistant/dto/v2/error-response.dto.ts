// src/agent/assistants/planning-assistant/dto/v2/error-response.dto.ts

/**
 * 错误响应 DTO
 * 
 * 统一的错误响应格式
 * 
 * 参考文档:
 * - API_REDESIGN_ERROR_HANDLING.md - 错误处理规范
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ description: '是否成功', example: false })
  success!: boolean;

  @ApiProperty({ description: '错误码', example: '2001' })
  errorCode!: string;

  @ApiProperty({ description: '错误消息（英文）', example: 'Session not found' })
  message!: string;

  @ApiProperty({ description: '错误消息（中文）', example: '会话不存在' })
  messageCN!: string;

  @ApiPropertyOptional({ description: '错误详情' })
  details?: Record<string, any>;

  @ApiPropertyOptional({ description: '追踪ID' })
  traceId?: string;

  @ApiPropertyOptional({ description: '时间戳' })
  timestamp?: string;
}
