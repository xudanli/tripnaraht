// src/places/dto/update-place.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum, IsObject } from 'class-validator';
import { PlaceCategory } from '@prisma/client';

export class UpdatePlaceDto {
  @ApiPropertyOptional({ description: '中文名称' })
  @IsOptional()
  @IsString()
  nameCN?: string;

  @ApiPropertyOptional({ description: '英文名称' })
  @IsOptional()
  @IsString()
  nameEN?: string;

  @ApiPropertyOptional({ description: '地点类别', enum: PlaceCategory })
  @IsOptional()
  @IsEnum(PlaceCategory)
  category?: PlaceCategory;

  @ApiPropertyOptional({ description: '地址' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: '纬度' })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: '经度' })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ description: '城市ID' })
  @IsOptional()
  @IsNumber()
  cityId?: number;

  @ApiPropertyOptional({ description: 'Google Place ID' })
  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @ApiPropertyOptional({ description: '评分（0-5）' })
  @IsOptional()
  @IsNumber()
  rating?: number;

  @ApiPropertyOptional({ description: '扩展元数据（JSONB）', type: Object })
  @IsOptional()
  @IsObject()
  metadata?: any;

  @ApiPropertyOptional({ description: '本体规则（JSONB，POI准入/装备/限制等）', type: Object })
  @IsOptional()
  @IsObject()
  ontologyRules?: any;

  @ApiPropertyOptional({ description: '体力消耗元数据（JSONB）', type: Object })
  @IsOptional()
  @IsObject()
  physicalMetadata?: any;

  @ApiPropertyOptional({ description: '地点介绍' })
  @IsOptional()
  @IsString()
  description?: string;
}
