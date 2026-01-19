// src/places/dto/place-list-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PlaceCategory } from '@prisma/client';

export enum PaginationDirection {
  NEXT = 'next',
  PREV = 'prev',
}

export class PlaceListQueryDto {
  @ApiPropertyOptional({
    description: '页码（从 1 开始）',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: '每页数量',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: '地点类型筛选',
    enum: PlaceCategory,
    example: 'RESTAURANT',
  })
  @IsOptional()
  @IsEnum(PlaceCategory)
  category?: PlaceCategory;

  @ApiPropertyOptional({
    description: '城市ID筛选',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @ApiPropertyOptional({
    description: '排序字段',
    enum: ['id', 'rating', 'createdAt', 'updatedAt'],
    example: 'id',
    default: 'id',
  })
  @IsOptional()
  @IsEnum(['id', 'rating', 'createdAt', 'updatedAt'])
  orderBy?: 'id' | 'rating' | 'createdAt' | 'updatedAt' = 'id';

  @ApiPropertyOptional({
    description: '排序方向',
    enum: ['asc', 'desc'],
    example: 'asc',
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  orderDirection?: 'asc' | 'desc' = 'desc';
}

export class PlaceListResponseDto {
  @ApiPropertyOptional({ description: '地点列表' })
  places: any[];

  @ApiPropertyOptional({ description: '当前页码' })
  page: number;

  @ApiPropertyOptional({ description: '每页数量' })
  limit: number;

  @ApiPropertyOptional({ description: '总记录数' })
  total: number;

  @ApiPropertyOptional({ description: '总页数' })
  totalPages: number;

  @ApiPropertyOptional({ description: '是否有上一页' })
  hasPrev: boolean;

  @ApiPropertyOptional({ description: '是否有下一页' })
  hasNext: boolean;
}
