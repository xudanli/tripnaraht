// src/agent/assistants/planning-assistant/dto/v2/shared/suggested-action.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 建议操作DTO（共享类型）
 */
export class SuggestedActionDto {
  @ApiProperty({ description: '操作标识' })
  action!: string;

  @ApiProperty({ description: '标签（英文）' })
  label!: string;

  @ApiProperty({ description: '标签（中文）' })
  labelCN!: string;

  @ApiPropertyOptional({ description: '参数' })
  params?: Record<string, any>;
}
