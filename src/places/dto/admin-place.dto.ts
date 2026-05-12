// src/places/dto/admin-place.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';
import { PlaceCategory } from '@prisma/client';

export class GetPlacesAdminQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量（最大100）', example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '搜索关键词（名称、地址）' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ 
    description: '地点类别', 
    enum: PlaceCategory,
    example: 'ATTRACTION'
  })
  @IsOptional()
  @IsEnum(PlaceCategory)
  category?: PlaceCategory;

  @ApiPropertyOptional({ description: '城市ID', example: 1 })
  @IsOptional()
  @IsInt()
  cityId?: number;

  @ApiPropertyOptional({ description: '国家代码（ISO 3166-1 alpha-2）', example: 'JP' })
  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class PlaceAdminResponseDto {
  @ApiProperty({ description: '地点ID' })
  id!: number;

  @ApiProperty({ description: 'UUID' })
  uuid!: string;

  @ApiProperty({ description: '中文名称' })
  nameCN!: string;

  @ApiPropertyOptional({ description: '英文名称' })
  nameEN?: string | null;

  @ApiProperty({ description: '地点类别', enum: PlaceCategory })
  category!: PlaceCategory;

  @ApiPropertyOptional({ description: '地址' })
  address?: string | null;

  @ApiPropertyOptional({ description: '评分' })
  rating?: number | null;

  @ApiPropertyOptional({ description: 'Google Place ID' })
  googlePlaceId?: string | null;

  @ApiPropertyOptional({ description: '位置坐标', type: Object })
  location?: { lat: number; lng: number } | null;

  @ApiPropertyOptional({ description: '元数据', type: Object })
  metadata?: any;

  @ApiPropertyOptional({ description: '本体规则（JSONB，POI准入/装备/限制等）', type: Object })
  ontologyRules?: any;

  @ApiPropertyOptional({ description: '物理元数据', type: Object })
  physicalMetadata?: any;

  @ApiPropertyOptional({ description: '城市信息', type: Object })
  city?: {
    id: number;
    name: string;
    nameCN?: string | null;
    nameEN?: string | null;
    countryCode: string;
    timezone?: string | null;
  } | null;

  @ApiPropertyOptional({ description: '国家代码（ISO 3166-1 alpha-2）', example: 'JP' })
  countryCode?: string | null;

  @ApiPropertyOptional({ description: '地点介绍' })
  description?: string | null;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export class PlaceListAdminResponseDto {
  @ApiProperty({ description: '地点列表', type: [PlaceAdminResponseDto] })
  places!: PlaceAdminResponseDto[];

  @ApiProperty({ description: '总数' })
  total!: number;

  @ApiProperty({ description: '页码' })
  page!: number;

  @ApiProperty({ description: '每页数量' })
  limit!: number;

  @ApiProperty({ description: '总页数' })
  totalPages!: number;
}
