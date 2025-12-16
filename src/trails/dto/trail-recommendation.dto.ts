// src/trails/dto/trail-recommendation.dto.ts
import { IsArray, IsInt, IsOptional, IsNumber, IsBoolean, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecommendTrailsForPlacesDto {
  @ApiProperty({
    description: '景点ID列表（至少2个）',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @IsInt({ each: true })
  placeIds!: number[];

  @ApiPropertyOptional({
    description: '最大距离（公里）',
    example: 20,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDistance?: number;

  @ApiPropertyOptional({
    description: '优先推荐非公路步道',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  preferOffRoad?: boolean;

  @ApiPropertyOptional({
    description: '最大难度等级（EXTREME, HARD, MODERATE, EASY）',
    example: 'MODERATE',
    type: String,
  })
  @IsOptional()
  @IsString()
  maxDifficulty?: string;
}

