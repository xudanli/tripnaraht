// src/itinerary-items/dto/search-nearby-poi.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, Min, Max, IsArray, IsString } from 'class-validator';
import { PlaceCategory } from '@prisma/client';

export enum NearbyPoiCategory {
  ATTRACTION = 'ATTRACTION',      // 景点
  RESTAURANT = 'RESTAURANT',      // 餐厅
  HOTEL = 'HOTEL',                // 住宿
  GAS_STATION = 'GAS_STATION',    // 加油站
  REST_AREA = 'REST_AREA',        // 休息点
}

export class SearchNearbyPoiQueryDto {
  @ApiProperty({
    description: '行程项ID（可选，如果提供则使用行程项的坐标）',
    example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
    required: false,
  })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty({
    description: '纬度（如果未提供 itemId，则必须提供）',
    example: 64.2556,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiProperty({
    description: '经度（如果未提供 itemId，则必须提供）',
    example: -21.1294,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiProperty({
    description: '搜索半径（米），默认5000米',
    example: 5000,
    required: false,
    default: 5000,
  })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(50000)
  radius?: number;

  @ApiProperty({
    description: '要搜索的POI类别（可多选）',
    enum: NearbyPoiCategory,
    isArray: true,
    example: [NearbyPoiCategory.ATTRACTION, NearbyPoiCategory.RESTAURANT],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(NearbyPoiCategory, { each: true })
  categories?: NearbyPoiCategory[];

  @ApiProperty({
    description: '最小评分（0-5）',
    example: 4.0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiProperty({
    description: '是否只返回当前营业的地点（仅对餐厅有效）',
    example: true,
    required: false,
  })
  @IsOptional()
  openNow?: boolean;

  @ApiProperty({
    description: '返回结果数量限制',
    example: 20,
    required: false,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class NearbyPoiResultDto {
  @ApiProperty({ description: '地点ID' })
  id: number;

  @ApiProperty({ description: '中文名称' })
  nameCN: string;

  @ApiProperty({ description: '英文名称', required: false })
  nameEN?: string;

  @ApiProperty({ description: '类别', enum: PlaceCategory })
  category: PlaceCategory;

  @ApiProperty({ description: '地址', required: false })
  address?: string;

  @ApiProperty({ description: '评分', required: false })
  rating?: number;

  @ApiProperty({ description: '纬度' })
  lat: number;

  @ApiProperty({ description: '经度' })
  lng: number;

  @ApiProperty({ description: '距离（米）' })
  distanceMeters: number;

  @ApiProperty({ description: '营业时间信息', required: false })
  openingHours?: {
    open?: string;
    close?: string;
    openNow?: boolean;
  };

  @ApiProperty({ description: '其他元数据', required: false })
  metadata?: any;
}
