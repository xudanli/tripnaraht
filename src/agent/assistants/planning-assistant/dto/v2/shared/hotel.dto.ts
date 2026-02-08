// src/agent/assistants/planning-assistant/dto/v2/shared/hotel.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 酒店位置信息
 */
export class HotelLocationDto {
  @ApiProperty({ description: '纬度' })
  lat!: number;

  @ApiProperty({ description: '经度' })
  lng!: number;
}

/**
 * 酒店照片信息
 */
export class HotelPhotoDto {
  @ApiProperty({ description: '照片引用ID' })
  photoReference!: string;

  @ApiProperty({ description: '宽度' })
  width!: number;

  @ApiProperty({ description: '高度' })
  height!: number;
}

/**
 * 酒店评价信息
 */
export class HotelReviewDto {
  @ApiProperty({ description: '评价作者' })
  authorName!: string;

  @ApiProperty({ description: '评分（0-5）' })
  rating!: number;

  @ApiProperty({ description: '评价内容' })
  text!: string;

  @ApiProperty({ description: '评价时间（Unix时间戳）' })
  time!: number;
}

/**
 * 酒店营业时间
 */
export class HotelOpeningHoursDto {
  @ApiProperty({ description: '是否正在营业' })
  openNow!: boolean;

  @ApiPropertyOptional({ description: '营业时间文本', type: [String] })
  weekdayText?: string[];
}

/**
 * 酒店信息DTO
 */
export class HotelDto {
  @ApiProperty({ description: 'Google Places place_id' })
  placeId!: string;

  @ApiProperty({ description: '酒店名称' })
  name!: string;

  @ApiProperty({ description: '地址' })
  address!: string;

  @ApiProperty({ description: '位置信息', type: HotelLocationDto })
  location!: HotelLocationDto;

  @ApiPropertyOptional({ description: '评分（0-5）' })
  rating?: number;

  @ApiPropertyOptional({ description: '评价总数' })
  userRatingsTotal?: number;

  @ApiPropertyOptional({ description: '价格等级（1-4，1=便宜，4=昂贵）' })
  priceLevel?: number;

  @ApiPropertyOptional({ description: '类型列表', type: [String] })
  types?: string[];

  @ApiPropertyOptional({ description: '营业时间', type: HotelOpeningHoursDto })
  openingHours?: HotelOpeningHoursDto;

  @ApiPropertyOptional({ description: '照片列表', type: [HotelPhotoDto] })
  photos?: HotelPhotoDto[];

  @ApiPropertyOptional({ description: '电话号码' })
  phoneNumber?: string;

  @ApiPropertyOptional({ description: '网站URL' })
  website?: string;

  @ApiPropertyOptional({ description: '评价列表', type: [HotelReviewDto] })
  reviews?: HotelReviewDto[];

  @ApiPropertyOptional({ description: '设施列表', type: [String] })
  amenities?: string[];

  @ApiPropertyOptional({ description: '房型列表', type: [String] })
  roomTypes?: string[];
}
