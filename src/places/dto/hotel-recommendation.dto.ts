// src/places/dto/hotel-recommendation.dto.ts
import { IsString, IsEnum, IsNumber, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HotelRecommendationStrategy } from '../interfaces/hotel-strategy.interface';

/**
 * 酒店推荐请求 DTO
 */
export class HotelRecommendationDto {
  @ApiPropertyOptional({
    description: '行程 ID（用于获取景点列表）',
    example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
  })
  @IsString()
  @IsOptional()
  tripId?: string;

  @ApiPropertyOptional({
    description: '景点 ID 列表（如果直接提供，将忽略 tripId）',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  attractionIds?: number[];

  @ApiProperty({
    description: '推荐策略',
    enum: HotelRecommendationStrategy,
    example: HotelRecommendationStrategy.HUB,
  })
  @IsEnum(HotelRecommendationStrategy)
  strategy!: HotelRecommendationStrategy;

  @ApiPropertyOptional({
    description: '预算上限（每晚，元）',
    example: 2000,
    minimum: 0,
  })
  @IsNumber()
  @IsOptional()
  maxBudget?: number;

  @ApiPropertyOptional({
    description: '最低星级要求',
    example: 3,
    minimum: 1,
    maximum: 5,
  })
  @IsNumber()
  @IsOptional()
  minTier?: number;

  @ApiPropertyOptional({
    description: '时间价值（元/小时），默认 50',
    example: 50,
    minimum: 0,
    default: 50,
  })
  @IsNumber()
  @IsOptional()
  timeValuePerHour?: number;

  @ApiPropertyOptional({
    description: '是否考虑隐形成本（交通费 + 时间成本）',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  includeHiddenCost?: boolean;
}

