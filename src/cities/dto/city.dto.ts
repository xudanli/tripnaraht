// src/cities/dto/city.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 城市 DTO
 */
export class CityDto {
  @ApiProperty({
    description: '城市 ID',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: '城市名称',
    example: 'Tokyo',
  })
  name!: string;

  @ApiProperty({
    description: '国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  countryCode!: string;

  @ApiPropertyOptional({
    description: '中文名称',
    example: '东京',
  })
  nameCN?: string;

  @ApiPropertyOptional({
    description: '英文名称',
    example: 'Tokyo',
  })
  nameEN?: string;

  @ApiPropertyOptional({
    description: '行政区划代码',
    example: '131000',
  })
  adcode?: string;

  @ApiPropertyOptional({
    description: '时区',
    example: 'Asia/Tokyo',
  })
  timezone?: string;

  @ApiPropertyOptional({
    description: '纬度',
    example: 35.6762,
  })
  lat?: number;

  @ApiPropertyOptional({
    description: '经度',
    example: 139.6503,
  })
  lng?: number;

  @ApiPropertyOptional({
    description: '扩展元数据',
    example: {},
  })
  metadata?: any;
}

/**
 * 城市列表查询参数
 */
export class GetCitiesQueryDto {
  @ApiPropertyOptional({
    description: '国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  countryCode?: string;

  @ApiPropertyOptional({
    description: '搜索关键词（支持中文名、英文名、名称）',
    example: '东京',
  })
  q?: string;

  @ApiPropertyOptional({
    description: '返回数量限制',
    example: 50,
    default: 50,
  })
  limit?: number;

  @ApiPropertyOptional({
    description: '偏移量（用于分页）',
    example: 0,
    default: 0,
  })
  offset?: number;
}
