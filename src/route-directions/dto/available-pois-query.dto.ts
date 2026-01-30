// src/route-directions/dto/available-pois-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';
import { PlaceCategory } from '@prisma/client';

export class AvailablePoisQueryDto {
  @ApiPropertyOptional({ 
    description: 'POI类别筛选', 
    enum: PlaceCategory,
    example: 'ATTRACTION'
  })
  @IsOptional()
  @IsEnum(PlaceCategory)
  category?: PlaceCategory;

  @ApiPropertyOptional({ description: '搜索关键词（名称、地址）' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量（最大100）', example: 50, default: 50, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 50;
}
