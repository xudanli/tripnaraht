// src/trips/dto/place-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { resolvePlaceDisplayName } from '../../places/utils/place-display-name.util';

/**
 * Place 元数据响应 DTO
 * 
 * 用于行程项中 Place 的 metadata 字段
 */
export class PlaceMetadataResponseDto {
  @ApiPropertyOptional({
    description: '营业时间（按星期或文本格式）',
    example: {
      mon: '09:00 - 18:00',
      tue: '09:00 - 18:00',
      wed: '09:00 - 18:00',
      thu: '09:00 - 18:00',
      fri: '09:00 - 18:00',
      sat: '10:00 - 17:00',
      sun: 'Closed',
      text: '08:30-17:00（周一闭馆）', // 如果是字符串格式
    },
    additionalProperties: { type: 'string' },
  })
  openingHours?: Record<string, string>;

  @ApiPropertyOptional({
    description: '参考价格（CNY）',
    example: 150,
  })
  price?: number;

  @ApiPropertyOptional({
    description: '价格等级（1-4，Google 标准）',
    example: 2,
    minimum: 1,
    maximum: 4,
  })
  priceLevel?: number;

  @ApiPropertyOptional({
    description: '标签数组',
    type: [String],
    example: ['博物馆', '历史', '艺术'],
  })
  tags?: string[];

  @ApiPropertyOptional({
    description: '联系电话',
    example: '+81-3-1234-5678',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: '官方网站',
    example: 'https://example.com',
  })
  website?: string;

  @ApiPropertyOptional({
    description: '营业状态',
    enum: ['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY', 'UNKNOWN'],
    example: 'OPERATIONAL',
  })
  business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'UNKNOWN';
}

/**
 * Place 响应 DTO
 * 
 * 用于行程项中的 Place 字段
 * 优先级说明：
 * - P0（必须返回）：id, nameCN, nameEN, category, address, rating, metadata.openingHours
 * - P1（推荐返回）：metadata.price, metadata.priceLevel, metadata.tags
 * - P2（可选返回）：metadata.phone, metadata.website
 */
export class PlaceResponseDto {
  @ApiProperty({
    description: '地点 ID',
    example: 12345,
  })
  id!: number;

  @ApiProperty({
    description: '中文名称',
    example: '东京国立博物馆',
  })
  nameCN!: string;

  @ApiPropertyOptional({
    description: '英文名称',
    example: 'Tokyo National Museum',
    nullable: true,
  })
  nameEN!: string | null;

  @ApiProperty({
    description: '展示用名称（中文 UI 优先 nameCN，无则 nameEN）',
    example: '东京国立博物馆',
  })
  displayName!: string;

  @ApiProperty({
    description: '地点类别',
    example: 'MUSEUM',
    enum: [
      'RESTAURANT',
      'CAFE',
      'BAR',
      'HOTEL',
      'ATTRACTION',
      'MUSEUM',
      'PARK',
      'SHOPPING',
      'TRANSPORT',
      'OTHER',
    ],
  })
  category!: string;

  @ApiProperty({
    description: '地址',
    example: '东京都台东区上野公园13-9',
  })
  address!: string;

  @ApiPropertyOptional({
    description: '评分（0-5）',
    example: 4.5,
    nullable: true,
    minimum: 0,
    maximum: 5,
  })
  rating!: number | null;

  @ApiPropertyOptional({
    description: '元数据（包含营业时间、价格、标签等）',
    type: PlaceMetadataResponseDto,
  })
  metadata?: PlaceMetadataResponseDto;

  @ApiPropertyOptional({
    description: '地点介绍',
    example: '东京国立博物馆是日本最大的博物馆...',
    nullable: true,
  })
  description?: string | null;
}

/**
 * 从 Prisma Place 对象转换为 PlaceResponseDto
 * 
 * @param place Prisma Place 对象
 * @returns PlaceResponseDto
 */
export function toPlaceResponseDto(place: any): PlaceResponseDto | null {
  if (!place) return null;

  const metadata = place.metadata as any;

  // 提取并规范化 metadata 中的字段
  const normalizedMetadata: PlaceMetadataResponseDto = {};

  if (metadata) {
    // P0: 营业时间
    if (metadata.openingHours) {
      // 如果是字符串格式，放入 text 字段
      if (typeof metadata.openingHours === 'string') {
        normalizedMetadata.openingHours = {
          text: metadata.openingHours,
        };
      } else {
        // 结构化格式
        normalizedMetadata.openingHours = {
          mon: metadata.openingHours.mon,
          tue: metadata.openingHours.tue,
          wed: metadata.openingHours.wed,
          thu: metadata.openingHours.thu,
          fri: metadata.openingHours.fri,
          sat: metadata.openingHours.sat,
          sun: metadata.openingHours.sun,
          weekday: metadata.openingHours.weekday,
          weekend: metadata.openingHours.weekend,
        };
        // 移除 undefined 值
        Object.keys(normalizedMetadata.openingHours).forEach((key) => {
          if (normalizedMetadata.openingHours![key] === undefined) {
            delete normalizedMetadata.openingHours![key];
          }
        });
      }
    }

    // P1: 价格相关
    if (metadata.price !== undefined) {
      normalizedMetadata.price = metadata.price;
    }
    if (metadata.priceLevel !== undefined) {
      normalizedMetadata.priceLevel = metadata.priceLevel;
    }
    // tags 可能在 rawTags 或直接在 tags 字段
    if (metadata.rawTags && metadata.rawTags.length > 0) {
      normalizedMetadata.tags = metadata.rawTags;
    } else if (metadata.tags && metadata.tags.length > 0) {
      normalizedMetadata.tags = metadata.tags;
    }

    // P2: 联系方式（可能在 contact 对象中或直接在 metadata 根级）
    if (metadata.contact) {
      if (metadata.contact.phone) {
        normalizedMetadata.phone = metadata.contact.phone;
      }
      if (metadata.contact.website) {
        normalizedMetadata.website = metadata.contact.website;
      }
    }
    // 兼容：phone/website 直接在 metadata 根级
    if (metadata.phone && !normalizedMetadata.phone) {
      normalizedMetadata.phone = metadata.phone;
    }
    if (metadata.website && !normalizedMetadata.website) {
      normalizedMetadata.website = metadata.website;
    }

    // 营业状态
    if (metadata.business_status) {
      normalizedMetadata.business_status = metadata.business_status;
    }
  }

  return {
    id: place.id,
    nameCN: place.nameCN,
    nameEN: place.nameEN || null,
    displayName: resolvePlaceDisplayName(place, { fallback: place.nameCN || '行程点' }),
    category: place.category,
    address: place.address || '',
    rating: place.rating || null,
    metadata: Object.keys(normalizedMetadata).length > 0 ? normalizedMetadata : undefined,
    description: place.description || null,
  };
}
