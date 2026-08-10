import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/** 添加活动页附近 Chip / 单类别（与 attraction-explore recommendations 无关） */
export enum AddActivityNearbyCategory {
  ATTRACTION = 'ATTRACTION',
  RESTAURANT = 'RESTAURANT',
  HOTEL = 'HOTEL',
  GAS_STATION = 'GAS_STATION',
  SUPERMARKET = 'SUPERMARKET',
  INDOOR = 'INDOOR',
  REST_AREA = 'REST_AREA',
}

export enum AddActivityNearbyChip {
  nearby = 'nearby',
  hotel = 'hotel',
  gas = 'gas',
  supermarket = 'supermarket',
  indoor = 'indoor',
  rest = 'rest',
}

export class AddActivityNearbyQueryDto {
  @ApiPropertyOptional({ description: '行程项 ID（优先用其坐标）' })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiPropertyOptional({ description: '纬度（无 itemId 时必填）' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: '经度（无 itemId 时必填）' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    description: '单类别（推荐每次只传一个，保证结果准确）',
    enum: AddActivityNearbyCategory,
  })
  @IsOptional()
  @IsEnum(AddActivityNearbyCategory)
  category?: AddActivityNearbyCategory;

  @ApiPropertyOptional({
    description: 'Chip 快捷映射（与 category 二选一；同时传时以 category 为准）',
    enum: AddActivityNearbyChip,
  })
  @IsOptional()
  @IsEnum(AddActivityNearbyChip)
  chip?: AddActivityNearbyChip;

  @ApiPropertyOptional({ description: '半径米；不传则按类别默认（油站/超市 20km，室内/住宿/休息 15km，景点 10km）' })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(50000)
  radius?: number;

  @ApiPropertyOptional({ description: '返回条数，默认 30，最大 50' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: '可选：排除该行程已排程 Place' })
  @IsOptional()
  @IsString()
  tripId?: string;
}

export class AddActivityNearbyItemDto {
  @ApiProperty({ description: '稳定展示 id：place 用数字；编目油站/休息点为派生数字' })
  id!: number;

  @ApiPropertyOptional({ description: '本地 Place.id；有值时可加入行程' })
  placeId?: number;

  @ApiProperty({ enum: AddActivityNearbyCategory, description: '添加活动 Chip 类别（一等字段）' })
  nearbyCategory!: AddActivityNearbyCategory;

  @ApiProperty()
  nameCN!: string;

  @ApiPropertyOptional()
  nameEN?: string;

  @ApiPropertyOptional({ description: '封面图 URL；无图为 null' })
  imageUrl?: string | null;

  @ApiProperty({ description: '是否有封面图（排序已按有图优先）' })
  hasImage!: boolean;

  @ApiPropertyOptional()
  rating?: number;

  @ApiPropertyOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'OSM opening_hours 原文，如 Mo-Fr 09:00-18:00；无则 null' })
  openingHoursText?: string | null;

  @ApiPropertyOptional({
    description: '营业状态粗判；无法判断为 unknown',
    enum: ['open', 'closed', 'unknown'],
  })
  openStatus?: 'open' | 'closed' | 'unknown';

  @ApiPropertyOptional({ description: '电话；无则 null' })
  phone?: string | null;

  @ApiPropertyOptional({ description: '官网；无则 null' })
  website?: string | null;

  @ApiPropertyOptional({ description: '是否通常需要预订；未知为 null' })
  requiresReservation?: boolean | null;

  @ApiPropertyOptional({ description: '费用说明（免费/收费/金额字符串）；非人均消费；无则 null' })
  feeLabel?: string | null;

  @ApiPropertyOptional({
    description: '费用档提示（非人均 ISK）',
    example: { kind: 'free', label: '免费' },
  })
  priceHint?: { kind: 'free' | 'fee' | 'unknown'; label: string } | null;

  @ApiProperty()
  lat!: number;

  @ApiProperty()
  lng!: number;

  @ApiProperty()
  distanceMeters!: number;

  @ApiProperty({ description: 'place | safe_stop' })
  source!: 'place' | 'safe_stop';

  @ApiProperty({ description: '是否可直接用 placeId 加入行程' })
  addable!: boolean;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;
}
