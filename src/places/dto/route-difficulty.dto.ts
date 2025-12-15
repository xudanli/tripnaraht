// src/places/dto/route-difficulty.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, IsIn, Min, Max } from 'class-validator';

export enum RouteProvider {
  GOOGLE = 'google',
  MAPBOX = 'mapbox',
}

export enum RouteProfile {
  WALKING = 'walking',
  DRIVING = 'driving',
  BICYCLING = 'bicycling',
  CYCLING = 'cycling',
  TRANSIT = 'transit',
}

export class RouteDifficultyRequestDto {
  @ApiProperty({
    description: '数据源提供商',
    enum: RouteProvider,
    example: 'google',
  })
  @IsEnum(RouteProvider)
  provider: RouteProvider;

  @ApiProperty({
    description: '起点坐标（格式：lat,lon 或 lon,lat，Mapbox使用后者）',
    example: '39.9042,116.4074',
  })
  @IsString()
  origin: string;

  @ApiProperty({
    description: '终点坐标（格式：lat,lon 或 lon,lat，Mapbox使用后者）',
    example: '39.914,116.403',
  })
  @IsString()
  destination: string;

  @ApiPropertyOptional({
    description: '路线模式',
    enum: RouteProfile,
    default: 'walking',
  })
  @IsOptional()
  @IsEnum(RouteProfile)
  profile?: RouteProfile = RouteProfile.WALKING;

  @ApiPropertyOptional({
    description: '采样间隔（米）',
    default: 30,
    minimum: 10,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(100)
  sampleM?: number = 30;

  @ApiPropertyOptional({
    description: '类别（如 ATTRACTION, RESTAURANT）',
    example: 'ATTRACTION',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: '访问方式（如 HIKING, VEHICLE, CABLE_CAR）',
    example: 'HIKING',
  })
  @IsOptional()
  @IsString()
  accessType?: string;

  @ApiPropertyOptional({
    description: '访问时长（如 "半天", "2小时", "1天"）',
    example: '半天',
  })
  @IsOptional()
  @IsString()
  visitDuration?: string;

  @ApiPropertyOptional({
    description: '典型停留时间',
    example: '2小时',
  })
  @IsOptional()
  @IsString()
  typicalStay?: string;

  @ApiPropertyOptional({
    description: '海拔（米）',
    example: 2300,
  })
  @IsOptional()
  @IsNumber()
  elevationMeters?: number;

  @ApiPropertyOptional({
    description: '纬度（用于高海拔地区判断，范围-90到90）',
    example: 39.9042,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: '子类别（如 glacier, volcano）',
    example: 'volcano',
  })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional({
    description: '官方难度评级（最高优先级）',
    enum: ['EASY', 'MODERATE', 'HARD', 'EXTREME'],
    example: 'HARD',
  })
  @IsOptional()
  @IsIn(['EASY', 'MODERATE', 'HARD', 'EXTREME'])
  trailDifficulty?: string;

  @ApiPropertyOptional({
    description: 'Mapbox缩放级别（仅Mapbox使用，默认14）',
    default: 14,
    minimum: 10,
    maximum: 16,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(16)
  z?: number = 14;

  @ApiPropertyOptional({
    description: 'Mapbox并发下载线程数（仅Mapbox使用，默认8）',
    default: 8,
    minimum: 1,
    maximum: 16,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(16)
  workers?: number = 8;

  @ApiPropertyOptional({
    description: '是否返回GeoJSON',
    default: false,
  })
  @IsOptional()
  includeGeoJson?: boolean = false;
}

export class RouteDifficultyResponseDto {
  @ApiProperty({ description: '距离（公里）', example: 10.8 })
  distance_km: number;

  @ApiProperty({ description: '累计爬升（米）', example: 720 })
  elevation_gain_m: number;

  @ApiProperty({ description: '平均坡度（0-1之间）', example: 0.067 })
  slope_avg: number;

  @ApiProperty({ description: '难度等级', enum: ['EASY', 'MODERATE', 'HARD', 'EXTREME'], example: 'HARD' })
  label: string;

  @ApiProperty({ description: '等效强度距离（公里）', example: 18.0 })
  S_km: number;

  @ApiProperty({ description: '说明列表', example: ['altitude: ×1.3', 'slope: bump one level (≥15%)'] })
  notes: string[];

  @ApiPropertyOptional({ description: 'GeoJSON（如果请求时includeGeoJson=true）' })
  geojson?: any;
}

