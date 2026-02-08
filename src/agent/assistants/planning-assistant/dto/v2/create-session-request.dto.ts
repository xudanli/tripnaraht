// src/agent/assistants/planning-assistant/dto/v2/create-session-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 会话上下文
 */
export class SessionContextDto {
  @ApiPropertyOptional({ description: '关联已创建行程ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '初始目的地' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: '初始偏好' })
  @IsOptional()
  @IsObject()
  preferences?: {
    budget?: { total: number; currency: string };
    travelers?: { adults: number; children?: number };
    dateRange?: { startDate: string; endDate: string };
    activities?: string[];
    travelStyle?: string;
  };
}

/**
 * 创建会话请求
 */
export class CreateSessionRequestDto {
  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '初始上下文' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionContextDto)
  context?: SessionContextDto;
}
