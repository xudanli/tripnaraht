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

export class RouteDirectionCardDto {
  @ApiProperty({ description: '路线方向 ID' })
  id!: number;

  @ApiProperty({ description: '路线方向 UUID' })
  uuid!: string;

  @ApiProperty({ description: '中文标题' })
  titleZh!: string;

  @ApiPropertyOptional({ description: '英文标题' })
  titleEn?: string;

  @ApiPropertyOptional({ description: '路线描述' })
  description?: string;

  @ApiProperty({ description: '最佳月份（1-12）', type: [Number] })
  bestMonths!: number[];

  @ApiProperty({ description: '禁忌月份（1-12）', type: [Number] })
  avoidMonths!: number[];

  @ApiProperty({ 
    description: '适合人群',
    enum: FitForType,
    isArray: true,
    example: [FitForType.PHOTOGRAPHY, FitForType.HIKING]
  })
  fitFor!: FitForType[];

  @ApiProperty({ 
    description: '强度画像',
    enum: IntensityLevel,
    example: IntensityLevel.MODERATE
  })
  intensityProfile!: IntensityLevel;

  @ApiProperty({ 
    description: '风险画像',
    enum: RiskType,
    isArray: true,
    example: [RiskType.HIGH_ALTITUDE, RiskType.WEATHER_WINDOW]
  })
  riskProfile!: RiskType[];

  @ApiProperty({ description: '推荐理由（2-3句话）' })
  whyThis!: string;

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

