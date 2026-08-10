import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 活动/门票项 DTO（飞猪 POI/门票 + 海外目录）
 */
export class ActivityItemDto {
  @ApiProperty({ description: '唯一标识（飞猪 poiId / productId 等）' })
  id!: string;

  @ApiProperty({ description: '数据来源', enum: ['fliggy', 'catalog', 'unknown'] })
  source!: 'fliggy' | 'catalog' | 'unknown';

  @ApiProperty({ description: '名称' })
  name!: string;

  @ApiPropertyOptional({ description: '中文名称' })
  nameZh?: string;

  @ApiPropertyOptional({ description: '英文名称' })
  nameEn?: string;

  @ApiPropertyOptional({
    description: '品类',
    enum: ['ATTRACTION_TICKET', 'SPECIAL_EXPERIENCE'],
  })
  category?: 'ATTRACTION_TICKET' | 'SPECIAL_EXPERIENCE';

  @ApiPropertyOptional({ description: '地址' })
  address?: string;

  @ApiPropertyOptional({ description: '预订/详情 URL（飞猪 H5）' })
  url?: string;

  @ApiPropertyOptional({ description: '参考价文案' })
  priceLabel?: string;

  @ApiPropertyOptional({ description: '关联行程日（1-based）' })
  associatedDayNumber?: number;

  @ApiPropertyOptional({ description: '活动日期 YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({
    description: 'OTA 外键；apply 时按此幂等 upsert Place',
  })
  otaRef?: { provider: 'fliggy' | 'google' | 'unknown'; externalId: string };

  @ApiPropertyOptional({ description: '预订提供方' })
  bookingProvider?: string;

  @ApiPropertyOptional({ description: '列表纬度' })
  listing_lat?: number;

  @ApiPropertyOptional({ description: '列表经度' })
  listing_lng?: number;

  @ApiPropertyOptional({ description: '推荐原因' })
  reasonZh?: string;
}
