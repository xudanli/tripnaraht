// src/route-directions/dto/route-direction-card.dto.ts
/**
 * RouteDirection Card DTO
 * 
 * 面向前端/LLM 的输出格式，用于在生成行程前展示路线方向信息
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsEnum, IsObject } from 'class-validator';

export enum FitForType {
  PHOTOGRAPHY = 'photography', // 摄影
  HIKING = 'hiking', // 徒步
  SEA = 'sea', // 出海
  FAMILY = 'family', // 亲子
  CHALLENGE = 'challenge', // 挑战
}

export enum IntensityLevel {
  RELAX = 'relax', // 轻松
  MODERATE = 'moderate', // 中等
  CHALLENGE = 'challenge', // 挑战
}

export enum RiskType {
  HIGH_ALTITUDE = 'high_altitude', // 高海拔
  WEATHER_WINDOW = 'weather_window', // 天气窗口
  ROAD_CLOSURE = 'road_closure', // 封路
  FERRY = 'ferry', // 渡轮
}

/**
 * 地形特征签名
 */
export class TerrainSignatureDto {
  @ApiPropertyOptional({ description: '平均海拔（米）' })
  avgElevationM?: number;

  @ApiPropertyOptional({ description: '海拔范围（米）', example: [2000, 4500] })
  elevationRangeM?: [number, number];

  @ApiPropertyOptional({ description: '最大坡度（%）' })
  maxSlope?: number;
}

/**
 * 风险画像详情
 */
export class RiskProfileDetailDto {
  @ApiPropertyOptional({ description: '高海拔风险等级（0-3）' })
  altitude?: number;

  @ApiPropertyOptional({ description: '天气风险等级（0-3）' })
  weather?: number;

  @ApiPropertyOptional({ description: '隔离度风险等级（0-3）' })
  isolation?: number;
}

export class RouteDirectionCardDto {
  @ApiProperty({ description: '路线方向 ID' })
  id!: number;

  @ApiProperty({ description: '路线方向 UUID' })
  uuid!: string;

  @ApiProperty({ description: '中文标题' })
  name!: string;

  @ApiProperty({ description: '中文名称' })
  nameCN!: string;

  @ApiPropertyOptional({ description: '英文名称' })
  nameEN?: string;

  @ApiProperty({ 
    description: '标语（UI & 分享用）',
    example: '把每天交给山脊与湖泊'
  })
  tagline!: string;

  @ApiProperty({ 
    description: '详细描述（200~300字）',
    example: '这条路线将带你深入探索...'
  })
  longDescription!: string;

  @ApiProperty({ 
    description: '适合人群',
    type: [String],
    example: ['自然党', '摄影党', '轻徒步']
  })
  suitableFor!: string[];

  @ApiProperty({ 
    description: '不适合人群',
    type: [String],
    example: ['城市控', '赶时间型用户']
  })
  notSuitableFor!: string[];

  @ApiProperty({ description: '最佳月份（1-12）', type: [Number] })
  bestMonths!: number[];

  @ApiPropertyOptional({ description: '禁忌月份（1-12）', type: [Number] })
  avoidMonths?: number[];

  @ApiProperty({ 
    description: '典型行程天数',
    example: 7
  })
  typicalDurationDays!: number;

  @ApiProperty({ 
    description: '地形特征签名',
    type: TerrainSignatureDto
  })
  terrainSignature!: TerrainSignatureDto;

  @ApiProperty({ 
    description: '体验标签（情绪 & 体验层）',
    type: [String],
    example: ['震撼', '宁静', '挑战', '文化']
  })
  experienceTags!: string[];

  @ApiProperty({ 
    description: '风险画像',
    type: RiskProfileDetailDto
  })
  riskProfile!: RiskProfileDetailDto;

  // 兼容旧字段
  @ApiPropertyOptional({ description: '路线描述（兼容字段）' })
  description?: string;

  @ApiPropertyOptional({ description: '推荐理由（2-3句话）' })
  whyThis?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  countryCode?: string;

  @ApiPropertyOptional({ description: '版本号' })
  version?: string;

  @ApiPropertyOptional({ description: '标签', type: [String] })
  tags?: string[];

  @ApiPropertyOptional({ description: '入口枢纽', type: [String] })
  entryHubs?: string[];

  @ApiPropertyOptional({ description: '区域列表', type: [String] })
  regions?: string[];
}

