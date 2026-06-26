/**
 * Travel Runtime / 级联影响 — 前后端共享 API 契约（Readiness + route-and-run explain）。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/** 级联影响 UI 卡片（Readiness cascadeUiHints / route-and-run explain.cascade_ui_hints） */
export class CascadeUiHintDto {
  @ApiProperty({ example: 'cascade_road_0' })
  @IsString()
  id!: string;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], example: 'HIGH' })
  @IsString()
  riskLevel!: string;

  @ApiProperty({ example: '上游路段受阻，POI「Landmannalaugar」可能无法按计划抵达' })
  @IsString()
  message!: string;

  @ApiProperty({
    enum: ['AVOID', 'ADJUST', 'DELAY', 'REPLACE', 'ASK_USER'],
    example: 'ASK_USER',
  })
  @IsString()
  recommendation!: string;

  @ApiPropertyOptional({ example: 'POI' })
  @IsOptional()
  @IsString()
  entityKind?: string;

  @ApiPropertyOptional({ example: 'Landmannalaugar' })
  @IsOptional()
  @IsString()
  entityLabel?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '需用户自行确认的预订/改签事项（产品不代执行）',
    example: ['请自行查询 road.is 最新状态'],
  })
  @IsOptional()
  @IsArray()
  userConfirmationRequired?: string[];

  @ApiPropertyOptional({
    description: 'Impact Algebra：净时间影响（分钟）；0 或省略表示被 buffer 完全吸收',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  netImpactMinutes?: number;

  @ApiPropertyOptional({
    description: '被 buffer 吸收的时间（分钟）',
    example: 45,
  })
  @IsOptional()
  @IsNumber()
  absorbedMinutes?: number;

  @ApiPropertyOptional({
    description: '级联传播置信度（0..1）',
    example: 0.76,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  cascadeConfidence?: number;

  @ApiPropertyOptional({
    description: '级联传播跳数（0=根因实体）',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  propagationHop?: number;

  @ApiPropertyOptional({
    description: '触发事实类型',
    enum: ['WEATHER', 'ROAD', 'OPENING_HOURS', 'SAFETY_ALERT', 'TRANSPORT_TIME', 'FLIGHT_STATUS'],
    example: 'ROAD',
  })
  @IsOptional()
  @IsString()
  triggerFactType?: string;

  @ApiPropertyOptional({ description: '触发数据源', example: 'physical_validator' })
  @IsOptional()
  @IsString()
  triggerSource?: string;
}

export class TravelEntityRefDto {
  @ApiProperty({ example: 'POI' })
  @IsString()
  kind!: string;

  @ApiProperty({ example: 'p1' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ example: 'Hallgrimskirkja' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class TravelRuntimeEdgeDto {
  @ApiProperty({ type: TravelEntityRefDto })
  from!: TravelEntityRefDto;

  @ApiProperty({ type: TravelEntityRefDto })
  to!: TravelEntityRefDto;

  @ApiProperty({
    enum: ['depends_on', 'time_buffer', 'location_coupling', 'blocks', 'delays'],
    example: 'depends_on',
  })
  @IsString()
  relation!: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  bufferMinutes?: number;
}

export class TravelRuntimeNodeDto {
  @ApiProperty({ type: TravelEntityRefDto })
  entity!: TravelEntityRefDto;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  netImpactMinutes?: number;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional({ example: 0.76 })
  @IsOptional()
  @IsNumber()
  cascadeConfidence?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  propagationHop?: number;
}

/** L3 Travel Runtime Graph（执行态图，非知识图谱） */
export class TravelRuntimeGraphDto {
  @ApiProperty({ example: 'tripnara/travel-runtime-graph/v1' })
  @IsString()
  version!: string;

  @ApiPropertyOptional({ example: 'ed69d9c5-660f-4549-bf03-85654e972403' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiProperty({ type: [TravelRuntimeNodeDto] })
  @IsArray()
  nodes!: TravelRuntimeNodeDto[];

  @ApiProperty({ type: [TravelRuntimeEdgeDto] })
  @IsArray()
  edges!: TravelRuntimeEdgeDto[];

  @ApiProperty({ description: '根因证据包（摘要）' })
  trigger!: Record<string, unknown>;

  @ApiProperty({ description: '级联影响摘要' })
  impact!: Record<string, unknown>;

  @ApiProperty({ example: '2026-06-15T10:01:00.000Z' })
  @IsString()
  analyzedAt!: string;
}

export class SchemaOrgDiscoveryEntityDto {
  @ApiProperty({ example: 'schema:Flight' })
  @IsString()
  '@type'!: string;

  @ApiPropertyOptional({ example: 'tripnara:flight:f1' })
  @IsOptional()
  @IsString()
  '@id'?: string;

  @ApiPropertyOptional({ example: 'FI123' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'f1' })
  @IsOptional()
  @IsString()
  identifier?: string;
}

/** Schema.org 发现层（SEO / 外部摄入；非 Runtime 语义） */
export class SchemaOrgDiscoveryPayloadDto {
  @ApiProperty({ example: 'https://schema.org' })
  @IsString()
  '@context'!: string;

  @ApiProperty({ type: [SchemaOrgDiscoveryEntityDto] })
  @IsArray()
  '@graph'!: SchemaOrgDiscoveryEntityDto[];
}

/** OpenAPI 内联 schema：Readiness / route-and-run 级联 UI 卡片 */
export const CASCADE_UI_HINT_OPENAPI_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'cascade_road_0' },
    riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], example: 'HIGH' },
    message: { type: 'string', example: '上游路段受阻，POI「Landmannalaugar」可能无法按计划抵达' },
    recommendation: {
      type: 'string',
      enum: ['AVOID', 'ADJUST', 'DELAY', 'REPLACE', 'ASK_USER'],
      example: 'ASK_USER',
    },
    entityKind: { type: 'string', example: 'POI' },
    entityLabel: { type: 'string', example: 'Landmannalaugar' },
    userConfirmationRequired: {
      type: 'array',
      items: { type: 'string' },
      example: ['请自行查询 road.is 最新状态'],
    },
    netImpactMinutes: { type: 'number', example: 30, description: '净时间影响（分钟）' },
    absorbedMinutes: { type: 'number', example: 45, description: '被 buffer 吸收的时间（分钟）' },
    cascadeConfidence: { type: 'number', example: 0.76, description: '级联传播置信度 0..1' },
    propagationHop: { type: 'number', example: 2, description: '级联传播跳数（0=根因实体）' },
    triggerFactType: {
      type: 'string',
      enum: ['WEATHER', 'ROAD', 'OPENING_HOURS', 'SAFETY_ALERT', 'TRANSPORT_TIME', 'FLIGHT_STATUS'],
      example: 'ROAD',
    },
    triggerSource: { type: 'string', example: 'physical_validator' },
  },
} as const;

export const CASCADE_UI_HINTS_OPENAPI_PROPERTY = {
  type: 'array',
  items: CASCADE_UI_HINT_OPENAPI_ITEM,
} as const;
