// src/agent/assistants/planning-assistant/dto/v2/generate-plan-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, ValidateNested, IsObject, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PreferencesDto } from './recommendations-request.dto';

/**
 * 方案约束条件
 */
export class PlanConstraintsDto {
  @ApiPropertyOptional({ description: '最大天数' })
  @IsOptional()
  @IsNumber()
  maxDays?: number;

  @ApiPropertyOptional({ description: '必须包含的地点', type: [String] })
  @IsOptional()
  @IsArray()
  mustInclude?: string[];

  @ApiPropertyOptional({ description: '排除的地点', type: [String] })
  @IsOptional()
  @IsArray()
  exclude?: string[];
}

/**
 * 方案生成选项
 */
export class PlanOptionsDto {
  @ApiPropertyOptional({ description: '生成方案数量', default: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  count?: number;

  @ApiPropertyOptional({ description: '是否包含预算估算', default: true })
  @IsOptional()
  @IsBoolean()
  includeBudget?: boolean;

  @ApiPropertyOptional({ description: '是否包含三人格评价', default: true })
  @IsOptional()
  @IsBoolean()
  includePersonas?: boolean;

  @ApiPropertyOptional({ description: '是否包含AI解释（AI增强）', default: true })
  @IsOptional()
  @IsBoolean()
  includeExplanation?: boolean;

  @ApiPropertyOptional({ description: '是否包含优化建议（AI增强）', default: true })
  @IsOptional()
  @IsBoolean()
  includeOptimizationTips?: boolean;
}

/**
 * 生成方案请求DTO
 */
export class GeneratePlanRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '目的地（如果提供naturalLanguageDescription则可选）' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: '自然语言描述（AI增强）' })
  @IsOptional()
  @IsString()
  naturalLanguageDescription?: string;

  @ApiPropertyOptional({ description: '偏好' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;

  @ApiPropertyOptional({ description: '约束条件' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanConstraintsDto)
  constraints?: PlanConstraintsDto;

  @ApiPropertyOptional({ description: '生成选项' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanOptionsDto)
  options?: PlanOptionsDto;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
