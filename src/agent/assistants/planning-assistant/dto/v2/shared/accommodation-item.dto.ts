// src/agent/assistants/planning-assistant/dto/v2/shared/accommodation-item.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 住宿项位置信息
 */
export class AccommodationLocationDto {
  @ApiProperty({ description: '纬度' })
  lat!: number;

  @ApiProperty({ description: '经度' })
  lng!: number;
}

/**
 * 统一住宿项 DTO（酒店 + Airbnb）
 * 无论数据来自 HotelDirectService 或 Airbnb MCP，前端均收到此结构
 */
export class AccommodationItemDto {
  @ApiProperty({ description: '唯一标识（酒店 placeId / Airbnb listingId）' })
  id!: string;

  @ApiProperty({ description: '数据来源', enum: ['hotel', 'airbnb'] })
  source!: 'hotel' | 'airbnb';

  @ApiProperty({ description: '名称（中文或英文，视语言偏好）' })
  name!: string;

  @ApiPropertyOptional({ description: '中文名称' })
  nameCN?: string;

  @ApiPropertyOptional({ description: '英文名称' })
  nameEN?: string;

  @ApiPropertyOptional({ description: '地址' })
  address?: string;

  @ApiPropertyOptional({ description: '房型描述（如 "1 bedroom, 1 queen bed"）' })
  roomSpecs?: string;

  @ApiPropertyOptional({ description: '坐标', type: AccommodationLocationDto })
  location?: AccommodationLocationDto;

  @ApiPropertyOptional({ description: '评分（0-5）' })
  rating?: number;

  @ApiPropertyOptional({ description: '评价数量' })
  ratingCount?: number;

  @ApiPropertyOptional({ description: '价格展示文本（如 "¥800/晚"）' })
  price?: string;

  @ApiPropertyOptional({ description: '价格等级（1=便宜，4=昂贵）' })
  priceLevel?: 1 | 2 | 3 | 4;

  @ApiPropertyOptional({ description: '详情/预订链接' })
  url?: string;

  @ApiPropertyOptional({ description: '主图 URL' })
  photoUrl?: string;

  @ApiPropertyOptional({ description: '图片 URL 列表', type: [String] })
  photos?: string[];

  @ApiPropertyOptional({ description: '入住日期（YYYY-MM-DD）' })
  checkIn?: string;

  @ApiPropertyOptional({ description: '退房日期（YYYY-MM-DD）' })
  checkOut?: string;
}
