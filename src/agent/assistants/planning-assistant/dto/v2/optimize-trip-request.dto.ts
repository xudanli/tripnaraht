// src/agent/assistants/planning-assistant/dto/v2/optimize-trip-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OptimizationRequirementsDto } from './optimize-plan-request.dto';

/**
 * 优化行程请求DTO
 */
export class OptimizeTripRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ description: '行程ID' })
  @IsString()
  tripId!: string;

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
