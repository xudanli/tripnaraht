// src/iceland-info/dto/road-conditions.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray } from 'class-validator';

export enum RoadStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  CAUTION = 'caution',
  IMPASSABLE = 'impassable',
}

export enum RoadCondition {
  DRY = 'dry',
  WET = 'wet',
  ICY = 'icy',
  SNOW = 'snow',
  SLUSHY = 'slushy',
  MUDDY = 'muddy',
}

export class RoadSegmentDto {
  @ApiProperty({ description: '路段ID' })
  id!: string;

  @ApiProperty({ description: '路段名称' })
  name!: string;

  @ApiProperty({ description: 'F路编号', example: 'F208' })
  fRoadNumber!: string;

  @ApiProperty({ description: '起点坐标' })
  startPoint!: {
    lat: number;
    lng: number;
  };

  @ApiProperty({ description: '终点坐标' })
  endPoint!: {
    lat: number;
    lng: number;
  };

  @ApiProperty({ description: '路况状态', enum: RoadStatus })
  status!: RoadStatus;

  @ApiProperty({ description: '路面条件', enum: RoadCondition })
  condition!: RoadCondition;

  @ApiProperty({ description: '是否开放' })
  isOpen!: boolean;

  @ApiProperty({ description: '状态描述' })
  description!: string;

  @ApiProperty({ description: '最后更新时间' })
  lastUpdated!: string;

  @ApiPropertyOptional({ description: '预计开放时间' })
  expectedOpenTime?: string;

  @ApiPropertyOptional({ description: '预计关闭时间' })
  expectedCloseTime?: string;
}

export class RoadConditionsResponseDto {
  @ApiProperty({ description: 'F路列表', type: [RoadSegmentDto] })
  fRoads!: RoadSegmentDto[];

  @ApiProperty({ description: '最后更新时间' })
  lastUpdated!: string;

  @ApiProperty({ description: '数据源' })
  source!: string;
}

export class RoadConditionsQueryDto {
  @ApiPropertyOptional({
    description: 'F路编号过滤（多个用逗号分隔）',
    example: 'F208,F26,F910',
  })
  @IsOptional()
  @IsString()
  fRoads?: string;

  @ApiPropertyOptional({
    description: '状态过滤',
    enum: RoadStatus,
  })
  @IsOptional()
  status?: RoadStatus;
}
