// src/iceland-info/dto/safetravel.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertType {
  WEATHER = 'weather',
  ROAD = 'road',
  TRAVEL = 'travel',
  GENERAL = 'general',
}

export class SafetravelAlertDto {
  @ApiProperty({ description: '警报ID' })
  id!: string;

  @ApiProperty({ description: '警报标题' })
  title!: string;

  @ApiProperty({ description: '警报内容' })
  description!: string;

  @ApiProperty({ description: '警报类型', enum: AlertType })
  type!: AlertType;

  @ApiProperty({ description: '严重程度', enum: AlertSeverity })
  severity!: AlertSeverity;

  @ApiProperty({ description: '生效时间' })
  effectiveTime!: string;

  @ApiPropertyOptional({ description: '过期时间' })
  expiryTime?: string;

  @ApiProperty({ description: '相关区域' })
  regions!: string[];

  @ApiPropertyOptional({ description: '相关F路' })
  fRoads?: string[];
}

export class SafetravelTravelConditionsDto {
  @ApiProperty({ description: '区域名称' })
  region!: string;

  @ApiProperty({ description: '路况状态', enum: ['open', 'closed', 'caution', 'impassable'] })
  roadStatus!: string;

  @ApiProperty({ description: '天气状态', enum: ['good', 'fair', 'poor', 'dangerous'] })
  weatherStatus!: string;

  @ApiProperty({ description: '综合状态', enum: ['green', 'yellow', 'orange', 'red'] })
  overallStatus!: string;

  @ApiProperty({ description: '状态描述' })
  description!: string;

  @ApiProperty({ description: '最后更新时间' })
  lastUpdated!: string;
}

export class SafetravelResponseDto {
  @ApiProperty({ description: '当前警报列表', type: [SafetravelAlertDto] })
  alerts!: SafetravelAlertDto[];

  @ApiProperty({ description: '旅行条件', type: [SafetravelTravelConditionsDto] })
  travelConditions!: SafetravelTravelConditionsDto[];

  @ApiProperty({ description: '最后更新时间' })
  lastUpdated!: string;
}

export class SafetravelQueryDto {
  @ApiPropertyOptional({
    description: '区域过滤',
    example: 'highlands',
  })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({
    description: '警报类型过滤',
    enum: AlertType,
  })
  @IsOptional()
  @IsEnum(AlertType)
  alertType?: AlertType;
}
