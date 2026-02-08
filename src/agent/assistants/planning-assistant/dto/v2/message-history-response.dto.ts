// src/agent/assistants/planning-assistant/dto/v2/message-history-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 消息DTO
 */
export class MessageDto {
  @ApiProperty({ description: '消息ID' })
  id!: string;

  @ApiProperty({ description: '角色', enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @ApiProperty({ description: '消息内容' })
  content!: string;

  @ApiProperty({ description: '时间戳' })
  timestamp!: string;

  @ApiPropertyOptional({ description: '意图' })
  intent?: string;

  @ApiPropertyOptional({ description: '关联数据' })
  data?: Record<string, any>;
}

/**
 * 消息历史响应DTO
 */
export class MessageHistoryResponseDto {
  @ApiProperty({ description: '消息列表', type: [MessageDto] })
  messages!: MessageDto[];

  @ApiProperty({ description: '总数量' })
  total!: number;

  @ApiProperty({ description: '限制数量' })
  limit!: number;

  @ApiProperty({ description: '偏移量' })
  offset!: number;
}
