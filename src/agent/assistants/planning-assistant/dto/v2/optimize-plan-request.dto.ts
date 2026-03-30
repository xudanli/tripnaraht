// src/agent/assistants/planning-assistant/dto/v2/optimize-plan-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 优化要求DTO
 */
export class OptimizationRequirementsDto {
  @ApiPropertyOptional({ description: '放慢节奏' })
  @IsOptional()
  @IsBoolean()
  slowerPace?: boolean;

  @ApiPropertyOptional({ description: '减少预算（金额）' })
  @IsOptional()
  @IsNumber()
  reduceBudget?: number;

  @ApiPropertyOptional({ description: '添加活动', type: [String] })
  @IsOptional()
  @IsArray()
  addActivities?: string[];

  @ApiPropertyOptional({ description: '移除活动', type: [String] })
  @IsOptional()
  @IsArray()
  removeActivities?: string[];
}

/**
 * 优化方案请求DTO
 */
export class OptimizePlanRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ description: '方案ID' })
  @IsString()
  planId!: string;

  @ApiPropertyOptional({ 
    description: '优化类型',
    enum: ['pace', 'budget', 'route', 'activities']
  })
  @IsOptional()
  @IsEnum(['pace', 'budget', 'route', 'activities'])
  optimizationType?: 'pace' | 'budget' | 'route' | 'activities';

  @ApiPropertyOptional({ description: '优化要求' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OptimizationRequirementsDto)
  requirements?: OptimizationRequirementsDto;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
