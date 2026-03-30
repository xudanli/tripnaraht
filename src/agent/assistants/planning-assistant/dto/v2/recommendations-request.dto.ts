// src/agent/assistants/planning-assistant/dto/v2/recommendations-request.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsNumber, IsEnum, ValidateNested, IsObject, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 偏好DTO
 */
export class PreferencesDto {
  @ApiPropertyOptional({ description: '预算' })
  @IsOptional()
  @IsObject()
  budget?: { total: number; currency: string };

  @ApiPropertyOptional({ description: '出行人数' })
  @IsOptional()
  @IsObject()
  travelers?: { adults: number; children?: number };

  @ApiPropertyOptional({ description: '活动偏好', type: [String] })
  @IsOptional()
  @IsArray()
  activities?: string[];

  @ApiPropertyOptional({ description: '旅行风格' })
  @IsOptional()
  @IsString()
  travelStyle?: string;
}

/**
 * 推荐过滤条件
 */
export class RecommendationFiltersDto {
  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '地区' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: '排除国家', type: [String] })
  @IsOptional()
  @IsArray()
  excludeCountries?: string[];
}

/**
 * 推荐请求DTO
 * 
 * 支持三种方式:
 * 1. GET with query parameters: ?preferences[budget][total]=5000&filters[countryCode]=IS
 * 2. GET with natural language: ?q=我想去一个不太热的地方，预算5000左右
 * 3. POST with complex parameters: { naturalLanguageDescription, preferences, implicitSignals }
 */
export class RecommendationsRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '自然语言描述（AI增强）' })
  @IsOptional()
  @IsString()
  naturalLanguageDescription?: string;

  @ApiPropertyOptional({ description: '偏好' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;

  @ApiPropertyOptional({ description: '过滤条件' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationFiltersDto)
  filters?: RecommendationFiltersDto;

  @ApiPropertyOptional({ description: '隐式信号（AI增强）' })
  @IsOptional()
  @IsObject()
  implicitSignals?: {
    browsedDestinations?: string[];
    clickedPlans?: string[];
    currentLocation?: { lat: number; lng: number };
    timeContext?: {
      season?: string;
      isHoliday?: boolean;
    };
  };

  @ApiPropertyOptional({ description: '返回数量', default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
