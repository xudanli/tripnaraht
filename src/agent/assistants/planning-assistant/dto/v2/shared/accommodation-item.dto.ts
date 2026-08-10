// src/agent/assistants/planning-assistant/dto/v2/shared/accommodation-item.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccommodationCardActionDto } from './accommodation-card-action.dto';

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

  @ApiProperty({ description: '数据来源', enum: ['hotel', 'airbnb', 'fliggy'] })
  source!: 'hotel' | 'airbnb' | 'fliggy';

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

  @ApiPropertyOptional({
    description: '行程第几晚（1-based）；route_and_run 卡片用于 apply 时对齐 TripDay',
  })
  nightIndex?: number;

  @ApiPropertyOptional({ description: '距当天最近行程点的距离（公里）' })
  distanceKm?: number;

  @ApiPropertyOptional({ description: '最近的行程点名称' })
  nearestPlaceName?: string;

  @ApiPropertyOptional({ description: '距离锚点 POI 名称（与 route_and_run 对齐）' })
  anchor_poi_name_zh?: string;

  @ApiPropertyOptional({ description: '距离说明（如：距「黄金瀑布」约 12.3 km）' })
  distance_label_zh?: string;

  @ApiPropertyOptional({
    description: '选房决策辅助（规则层：距离/价位/人数/评分等信号，供卡片副标题展示）',
  })
  decision_support_zh?: string;

  @ApiPropertyOptional({
    description: '卡片操作（查看 / 加入行程）',
    type: [AccommodationCardActionDto],
  })
  actions?: AccommodationCardActionDto[];

  @ApiPropertyOptional({
    description: 'OTA 外键（飞猪 shId 等）；apply 时按此幂等 upsert Place，不依赖库内同名匹配',
  })
  otaRef?: { provider: 'fliggy' | 'airbnb' | 'google' | 'unknown'; externalId: string };

  @ApiPropertyOptional({ description: '预订提供方（与 source 对齐时可省略）' })
  bookingProvider?: string;

  @ApiPropertyOptional({
    description: '列表坐标（route_and_run 卡片常用；与 location 二选一）',
  })
  listing_lat?: number;

  @ApiPropertyOptional({ description: '列表坐标经度' })
  listing_lng?: number;
}
