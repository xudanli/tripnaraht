// src/places/dto/place-image.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 图片搜索支持的所有 category 值
 * - 包括 Prisma PlaceCategory (大写): ATTRACTION, RESTAURANT, SHOPPING, HOTEL, TRANSIT_HUB
 * - 包括图片搜索关键词 (小写): landmark, nature, restaurant, hotel, etc.
 */
export const VALID_CATEGORIES = [
  // Prisma PlaceCategory (大写)
  'ATTRACTION',
  'RESTAURANT', 
  'SHOPPING',
  'HOTEL',
  'TRANSIT_HUB',
  // 图片搜索关键词 (小写)
  'landmark',
  'nature',
  'restaurant',
  'hotel',
  'temple',
  'museum',
  'park',
  'beach',
  'mountain',
] as const;

export type ValidCategory = typeof VALID_CATEGORIES[number];

/**
 * Prisma category 到图片搜索 category 的映射
 */
export const CATEGORY_MAP: Record<string, string> = {
  // Prisma 大写 -> 图片搜索小写
  'ATTRACTION': 'landmark',
  'RESTAURANT': 'restaurant',
  'SHOPPING': 'landmark',
  'HOTEL': 'hotel',
  'TRANSIT_HUB': 'landmark',
  // 小写格式保持不变
  'landmark': 'landmark',
  'nature': 'nature',
  'restaurant': 'restaurant',
  'hotel': 'hotel',
  'temple': 'temple',
  'museum': 'museum',
  'park': 'park',
  'beach': 'beach',
  'mountain': 'mountain',
};

/**
 * 单个地点图片请求
 */
export class PlaceImageRequestDto {
  @ApiPropertyOptional({
    description: '地点 ID（用于关联和缓存）',
    example: 'place_123',
  })
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiProperty({
    description: '地点名称（中文或英文）',
    example: '富士山',
  })
  @IsString()
  placeName: string;

  @ApiPropertyOptional({
    description: '地点英文名称（优先用于搜索，提高匹配度）',
    example: 'Mount Fuji',
  })
  @IsOptional()
  @IsString()
  placeNameEn?: string;

  @ApiPropertyOptional({
    description: '国家名称（辅助搜索定位）',
    example: 'Japan',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: '地点类别（影响搜索关键词），支持 Prisma 格式 (ATTRACTION) 或小写格式 (landmark)',
    enum: VALID_CATEGORIES,
    example: 'landmark',
  })
  @IsOptional()
  @IsIn([...VALID_CATEGORIES])
  category?: ValidCategory;
}

/**
 * 批量获取图片请求
 */
export class BatchPlaceImageRequestDto {
  @ApiProperty({
    description: '地点列表（最少1个，最多20个）',
    type: [PlaceImageRequestDto],
    example: [
      { placeName: '富士山', placeNameEn: 'Mount Fuji', country: 'Japan', category: 'mountain' },
      { placeName: '浅草寺', placeNameEn: 'Sensoji Temple', country: 'Japan', category: 'temple' },
      { placeName: '东京塔', placeNameEn: 'Tokyo Tower', country: 'Japan', category: 'landmark' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaceImageRequestDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  places: PlaceImageRequestDto[];
}

/**
 * Unsplash 图片 URL 集合
 */
export class UnsplashUrlsDto {
  @ApiProperty({ description: '原始图片 URL（最高质量）' })
  raw: string;

  @ApiProperty({ description: '全尺寸图片 URL' })
  full: string;

  @ApiProperty({ description: '常规尺寸（1080px 宽）', example: 'https://images.unsplash.com/photo-xxx?w=1080' })
  regular: string;

  @ApiProperty({ description: '小尺寸（400px 宽）' })
  small: string;

  @ApiProperty({ description: '缩略图（200px 宽）' })
  thumb: string;
}

/**
 * Unsplash 归属信息（必须展示）
 */
export class UnsplashAttributionDto {
  @ApiProperty({ description: '摄影师名称', example: 'John Doe' })
  photographerName: string;

  @ApiProperty({ description: '摄影师主页', example: 'https://unsplash.com/@johndoe' })
  photographerUrl: string;

  @ApiProperty({ description: 'Unsplash 图片页面', example: 'https://unsplash.com/photos/xxx' })
  unsplashUrl: string;
}

/**
 * Unsplash 摄影师信息
 */
export class UnsplashUserDto {
  @ApiProperty({ description: '摄影师名称' })
  name: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '主页链接' })
  link: string;
}

/**
 * Unsplash 图片数据
 */
export class UnsplashPhotoDto {
  @ApiProperty({ description: '图片 ID', example: 'abc123' })
  id: string;

  @ApiProperty({ description: '图片宽度', example: 4000 })
  width: number;

  @ApiProperty({ description: '图片高度', example: 3000 })
  height: number;

  @ApiProperty({ description: '主色调（HEX）', example: '#4A90D9' })
  color: string;

  @ApiProperty({ description: 'BlurHash（用于占位符）', example: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' })
  blurHash: string;

  @ApiPropertyOptional({ description: '图片描述' })
  description: string | null;

  @ApiPropertyOptional({ description: '替代描述' })
  altDescription: string | null;

  @ApiProperty({ description: '图片 URL 集合', type: UnsplashUrlsDto })
  urls: UnsplashUrlsDto;

  @ApiProperty({ description: '摄影师信息', type: UnsplashUserDto })
  user: UnsplashUserDto;

  @ApiProperty({
    description: '归属信息（Unsplash API 要求必须展示）',
    type: UnsplashAttributionDto,
  })
  attribution: UnsplashAttributionDto;
}

/**
 * 单个地点图片响应
 */
export class PlaceImageResultDto {
  @ApiPropertyOptional({ description: '地点 ID' })
  placeId?: string;

  @ApiProperty({ description: '地点名称' })
  placeName: string;

  @ApiPropertyOptional({ description: '图片数据（如果找到）', type: UnsplashPhotoDto })
  photo: UnsplashPhotoDto | null;

  @ApiProperty({ description: '是否来自缓存' })
  cached: boolean;

  @ApiPropertyOptional({ description: '错误信息（如果失败）' })
  error?: string;
}

/**
 * 批量统计
 */
export class BatchStatsDto {
  @ApiProperty({ description: '请求总数', example: 10 })
  total: number;

  @ApiProperty({ description: '成功获取数', example: 8 })
  found: number;

  @ApiProperty({ description: '缓存命中数', example: 3 })
  cached: number;

  @ApiProperty({ description: '失败数', example: 2 })
  failed: number;
}

/**
 * 批量获取图片响应
 */
export class BatchPlaceImageResponseDto {
  @ApiProperty({ description: '是否整体成功' })
  success: boolean;

  @ApiProperty({ description: '结果列表', type: [PlaceImageResultDto] })
  results: PlaceImageResultDto[];

  @ApiProperty({ description: '统计信息', type: BatchStatsDto })
  stats: BatchStatsDto;

  @ApiProperty({ description: '处理耗时（毫秒）', example: 1234 })
  processingTimeMs: number;
}
