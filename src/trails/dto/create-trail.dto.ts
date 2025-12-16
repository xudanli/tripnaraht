// src/trails/dto/create-trail.dto.ts

import { IsString, IsInt, IsOptional, IsNumber, IsArray, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * GPX轨迹点接口
 */
export interface GPXPoint {
  lat: number;
  lng: number;
  elevation?: number;
  time?: Date;
}

/**
 * 创建徒步路线 DTO
 */
export class CreateTrailDto {
  @ApiProperty({
    description: '路线中文名称',
    example: '武功山：龙山村至东江村'
  })
  @IsString()
  nameCN!: string;

  @ApiPropertyOptional({
    description: '路线英文名称',
    example: 'Wugongshan: Longshan Village to Dongjiang Village'
  })
  @IsString()
  @IsOptional()
  nameEN?: string;

  @ApiPropertyOptional({
    description: '路线描述'
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: '总距离（公里）',
    example: 14.06
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  distanceKm?: number;

  @ApiPropertyOptional({
    description: '累计爬升（米）',
    example: 1718
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  elevationGainM?: number;

  @ApiPropertyOptional({
    description: '累计下降（米）',
    example: 1761
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  elevationLossM?: number;

  @ApiPropertyOptional({
    description: '最高海拔（米）',
    example: 1692
  })
  @IsNumber()
  @IsOptional()
  maxElevationM?: number;

  @ApiPropertyOptional({
    description: '最低海拔（米）',
    example: 509
  })
  @IsNumber()
  @IsOptional()
  minElevationM?: number;

  @ApiPropertyOptional({
    description: '平均坡度（%）',
    example: 12.22
  })
  @IsNumber()
  @IsOptional()
  averageSlope?: number;

  @ApiPropertyOptional({
    description: '难度等级（EXTREME, HARD, MODERATE, EASY）',
    example: 'EXTREME'
  })
  @IsString()
  @IsOptional()
  difficultyLevel?: string;

  @ApiPropertyOptional({
    description: '等效距离（公里）',
    example: 34.69
  })
  @IsNumber()
  @IsOptional()
  equivalentDistanceKm?: number;

  @ApiPropertyOptional({
    description: '疲劳评分',
    example: 34.69
  })
  @IsNumber()
  @IsOptional()
  fatigueScore?: number;

  @ApiPropertyOptional({
    description: 'GPX轨迹数据（坐标点数组）',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        lat: { type: 'number' },
        lng: { type: 'number' },
        elevation: { type: 'number', nullable: true },
        time: { type: 'string', format: 'date-time', nullable: true }
      }
    }
  })
  @IsArray()
  @IsOptional()
  gpxData?: GPXPoint[];

  @ApiPropertyOptional({
    description: 'GPX文件URL',
    example: 'https://example.com/trail.gpx'
  })
  @IsString()
  @IsOptional()
  gpxFileUrl?: string;

  @ApiPropertyOptional({
    description: '边界框',
    example: { minlat: 27.48899, minlon: 114.16694, maxlat: 27.54145, maxlon: 114.19963 }
  })
  @IsObject()
  @IsOptional()
  bounds?: {
    minlat: number;
    minlon: number;
    maxlat: number;
    maxlon: number;
  };

  @ApiPropertyOptional({
    description: '起点Place ID',
    example: 123
  })
  @IsInt()
  @IsOptional()
  startPlaceId?: number;

  @ApiPropertyOptional({
    description: '终点Place ID',
    example: 456
  })
  @IsInt()
  @IsOptional()
  endPlaceId?: number;

  @ApiPropertyOptional({
    description: '途经点Place ID数组（按顺序）',
    type: [Number],
    example: [789, 101]
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  waypointPlaceIds?: number[];

  @ApiPropertyOptional({
    description: '扩展元数据',
    example: { source: 'gpx', rating: 4.5 }
  })
  @IsObject()
  @IsOptional()
  metadata?: any;

  @ApiPropertyOptional({
    description: '数据来源（alltrails, gpx, manual等）',
    example: 'gpx'
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    description: '来源链接',
    example: 'https://www.alltrails.com/trail/...'
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: '评分（0-5）',
    example: 4.5
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    description: '预计耗时（小时）',
    example: 8.5
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  estimatedDurationHours?: number;
}

