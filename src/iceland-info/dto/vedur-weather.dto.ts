// src/iceland-info/dto/vedur-weather.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, IsEnum } from 'class-validator';

export enum HighlandRegion {
  CENTRAL_HIGHLANDS = 'centralhighlands',
  SOUTH_HIGHLANDS = 'southhighlands',
  NORTH_HIGHLANDS = 'northhighlands',
}

export class VedurWeatherQueryDto {
  @ApiPropertyOptional({
    description: '高地区域',
    enum: HighlandRegion,
    example: HighlandRegion.CENTRAL_HIGHLANDS,
  })
  @IsOptional()
  @IsEnum(HighlandRegion)
  region?: HighlandRegion;

  @ApiPropertyOptional({
    description: '纬度',
    example: 64.5,
  })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({
    description: '经度',
    example: -18.5,
  })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({
    description: '是否包含详细风速信息',
    example: true,
  })
  @IsOptional()
  includeWindDetails?: boolean;
}

export class VedurWeatherStationDto {
  @ApiProperty({ description: '气象站ID' })
  id!: string;

  @ApiProperty({ description: '气象站名称' })
  name!: string;

  @ApiProperty({ description: '纬度' })
  lat!: number;

  @ApiProperty({ description: '经度' })
  lng!: number;

  @ApiProperty({ description: '海拔（米）' })
  elevation!: number;
}

export class VedurWeatherForecastDto {
  @ApiProperty({ description: '日期时间' })
  datetime!: string;

  @ApiProperty({ description: '温度（摄氏度）' })
  temperature!: number;

  @ApiProperty({ description: '风速（米/秒）' })
  windSpeed!: number;

  @ApiProperty({ description: '风向（度）' })
  windDirection!: number;

  @ApiProperty({ description: '风速（公里/小时）' })
  windSpeedKmh!: number;

  @ApiProperty({ description: '降水概率（%）' })
  precipitation!: number;

  @ApiProperty({ description: '天气状况描述' })
  condition!: string;

  @ApiPropertyOptional({ description: '能见度（米）' })
  visibility?: number;
}

export class VedurWeatherResponseDto {
  @ApiProperty({ description: '气象站信息' })
  station!: VedurWeatherStationDto;

  @ApiProperty({ description: '当前天气' })
  current!: VedurWeatherForecastDto;

  @ApiProperty({ description: '预报列表（6天）', type: [VedurWeatherForecastDto] })
  forecast!: VedurWeatherForecastDto[];

  @ApiProperty({ description: '最后更新时间' })
  lastUpdated!: string;

  @ApiProperty({ description: '数据源' })
  source!: string;
}
