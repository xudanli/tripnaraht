// src/trips/dto/evidence.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 证据类型
 */
export enum EvidenceType {
  OPENING_HOURS = 'opening_hours',
  ROAD_CLOSURE = 'road_closure',
  WEATHER = 'weather',
  BOOKING = 'booking',
  OTHER = 'other',
}

/**
 * 严重程度
 */
export enum EvidenceSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * 证据项 DTO
 */
export class EvidenceItemDto {
  @ApiProperty({ description: '证据项ID', example: 'ev-1' })
  id!: string;

  @ApiProperty({ description: '证据类型', enum: EvidenceType, example: EvidenceType.OPENING_HOURS })
  type!: EvidenceType;

  @ApiProperty({ description: '证据标题', example: '营业时间' })
  title!: string;

  @ApiProperty({ description: '证据描述', example: '景点 A 营业时间：09:00-18:00' })
  description!: string;

  @ApiPropertyOptional({ description: '数据来源', example: 'Google Places API' })
  source?: string;

  @ApiPropertyOptional({ description: '相关链接', example: 'https://maps.google.com/place/...' })
  link?: string;

  @ApiProperty({ description: '时间戳（ISO 8601 格式）', example: '2024-01-15T10:30:00Z' })
  timestamp!: string;

  @ApiPropertyOptional({ description: '关联的POI ID', example: 'poi-123' })
  poiId?: string;

  @ApiPropertyOptional({ description: '关联的行程天数（1-based）', example: 1 })
  day?: number;

  @ApiPropertyOptional({ description: '严重程度', enum: EvidenceSeverity, example: EvidenceSeverity.LOW })
  severity?: EvidenceSeverity;

  @ApiPropertyOptional({ description: '额外元数据', type: Object, additionalProperties: true })
  metadata?: Record<string, any>;
}

/**
 * 证据列表响应 DTO
 */
export class EvidenceListResponseDto {
  @ApiProperty({ description: '证据项列表', type: [EvidenceItemDto] })
  items!: EvidenceItemDto[];

  @ApiProperty({ description: '总数量', example: 3 })
  total!: number;

  @ApiProperty({ description: '返回数量限制', example: 50 })
  limit!: number;

  @ApiProperty({ description: '偏移量', example: 0 })
  offset!: number;
}

/**
 * 获取证据列表查询参数 DTO
 */
export class GetEvidenceQueryDto {
  @ApiPropertyOptional({ description: '返回数量限制', example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: '偏移量', example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ description: '筛选特定天数的证据', example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  day?: number;

  @ApiPropertyOptional({ description: '筛选特定类型的证据', enum: EvidenceType, example: EvidenceType.OPENING_HOURS })
  @IsOptional()
  @IsEnum(EvidenceType)
  type?: EvidenceType;
}

