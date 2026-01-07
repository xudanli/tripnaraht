// src/route-directions/dto/create-trip-from-template.dto.ts
import {
  IsString,
  IsNumber,
  IsDateString,
  IsArray,
  IsOptional,
  IsEnum,
  IsBoolean,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TravelerFromTemplateDto {
  @ApiProperty({
    enum: ['ADULT', 'ELDERLY', 'CHILD'],
    description: '旅行者类型',
    example: 'ADULT',
  })
  @IsEnum(['ADULT', 'ELDERLY', 'CHILD'])
  type!: 'ADULT' | 'ELDERLY' | 'CHILD';

  @ApiProperty({
    enum: ['IRON_LEGS', 'ACTIVE_SENIOR', 'CITY_POTATO', 'LIMITED'],
    description: '行动能力标签',
    example: 'CITY_POTATO',
  })
  @IsEnum(['IRON_LEGS', 'ACTIVE_SENIOR', 'CITY_POTATO', 'LIMITED'])
  mobilityTag!: 'IRON_LEGS' | 'ACTIVE_SENIOR' | 'CITY_POTATO' | 'LIMITED';
}

export class ConstraintsFromTemplateDto {
  @ApiPropertyOptional({ description: '是否有儿童', example: false })
  @IsOptional()
  @IsBoolean()
  withChildren?: boolean;

  @ApiPropertyOptional({ description: '是否有老人', example: false })
  @IsOptional()
  @IsBoolean()
  withElderly?: boolean;

  @ApiPropertyOptional({ description: '是否早起', example: false })
  @IsOptional()
  @IsBoolean()
  earlyRiser?: boolean;

  @ApiPropertyOptional({ description: '饮食限制', type: [String], example: ['vegetarian'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryRestrictions?: string[];

  @ApiPropertyOptional({ description: '避免的类别', type: [String], example: ['nightlife'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidCategories?: string[];
}

export class CreateTripFromRouteTemplateDto {
  @ApiProperty({ description: '目的地国家代码', example: 'IS' })
  @IsString()
  destination!: string;

  @ApiProperty({ description: '开始日期（ISO 8601）', example: '2024-06-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: '结束日期（ISO 8601）', example: '2024-06-07' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ description: '总预算（元）', example: 50000 })
  @IsOptional()
  @IsNumber()
  totalBudget?: number;

  @ApiPropertyOptional({
    enum: ['RELAXED', 'BALANCED', 'CHALLENGE'],
    description: '节奏偏好（覆盖模板默认值）',
    example: 'BALANCED',
  })
  @IsOptional()
  @IsEnum(['RELAXED', 'BALANCED', 'CHALLENGE'])
  pacePreference?: 'RELAXED' | 'BALANCED' | 'CHALLENGE';

  @ApiPropertyOptional({
    enum: ['relaxed', 'balanced', 'intense'],
    description: '强度偏好',
    example: 'balanced',
  })
  @IsOptional()
  @IsEnum(['relaxed', 'balanced', 'intense'])
  intensity?: 'relaxed' | 'balanced' | 'intense';

  @ApiPropertyOptional({
    enum: ['walk', 'transit', 'car'],
    description: '交通方式',
    example: 'car',
  })
  @IsOptional()
  @IsEnum(['walk', 'transit', 'car'])
  transport?: 'walk' | 'transit' | 'car';

  @ApiPropertyOptional({
    description: '旅行者列表',
    type: [TravelerFromTemplateDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelerFromTemplateDto)
  travelers?: TravelerFromTemplateDto[];

  @ApiPropertyOptional({
    description: '约束条件',
    type: ConstraintsFromTemplateDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConstraintsFromTemplateDto)
  constraints?: ConstraintsFromTemplateDto;
}

