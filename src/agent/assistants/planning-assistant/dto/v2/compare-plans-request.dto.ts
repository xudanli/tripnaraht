// src/agent/assistants/planning-assistant/dto/v2/compare-plans-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum, MinLength } from 'class-validator';

/**
 * 对比方案请求DTO
 */
export class ComparePlansRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ 
    description: '方案ID列表（至少2个）',
    type: [String],
    minLength: 2
  })
  @IsArray()
  @MinLength(2, { message: '至少需要2个方案进行对比' })
  planIds!: string[];

  @ApiPropertyOptional({ 
    description: '对比维度',
    type: [String],
    example: ['budget', 'duration', 'pace', 'activities']
  })
  @IsOptional()
  @IsArray()
  compareFields?: string[];

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
