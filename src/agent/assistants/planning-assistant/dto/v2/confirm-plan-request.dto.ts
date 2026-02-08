// src/agent/assistants/planning-assistant/dto/v2/confirm-plan-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

/**
 * 确认方案请求DTO
 */
export class ConfirmPlanRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ description: '方案ID' })
  @IsString()
  planId!: string;

  @ApiPropertyOptional({ description: '保存到日历', default: false })
  @IsOptional()
  @IsBoolean()
  saveToCalendar?: boolean;

  @ApiPropertyOptional({ description: '发送提醒', default: false })
  @IsOptional()
  @IsBoolean()
  sendReminders?: boolean;
}
