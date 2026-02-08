// src/agent/assistants/planning-assistant/dto/v2/refine-trip-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsBoolean, IsNumber, IsEnum } from 'class-validator';

/**
 * 细化行程请求DTO
 */
export class RefineTripRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ description: '行程ID' })
  @IsString()
  tripId!: string;

  @ApiPropertyOptional({ description: '要细化的天数（1-based）', type: [Number] })
  @IsOptional()
  @IsArray()
  days?: number[];

  @ApiPropertyOptional({ description: '包含餐厅', default: true })
  @IsOptional()
  @IsBoolean()
  includeRestaurants?: boolean;

  @ApiPropertyOptional({ description: '包含交通', default: true })
  @IsOptional()
  @IsBoolean()
  includeTransport?: boolean;

  @ApiPropertyOptional({ description: '包含活动', default: true })
  @IsOptional()
  @IsBoolean()
  includeActivities?: boolean;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
