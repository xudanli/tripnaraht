// src/itinerary-optimization/dto/optimize-route.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsNumber,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 地点节点 DTO
 */
export class PlaceNodeDto {
  @ApiProperty({ description: '地点 ID', example: 1 })
  @IsNumber()
  id!: number;

  @ApiProperty({ description: '地点名称', example: '浅草寺' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '强度等级', enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsString()
  @IsOptional()
  intensity?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({ description: '预估游玩时长（分钟）', example: 90 })
  @IsNumber()
  @IsOptional()
  estimatedDuration?: number;

  @ApiPropertyOptional({
    description: 'VRPTW 时间窗约束 [最早到达时间, 最晚到达时间] (ISO 8601 datetime)',
    example: {
      earliest: '2024-05-01T09:00:00+09:00',
      latest: '2024-05-01T22:00:00+09:00',
    },
  })
  @IsOptional()
  timeWindow?: {
    earliest: string;
    latest: string;
  };

  @ApiPropertyOptional({
    description: 'VRPTW 服务时长（分钟）- 在地点必须停留的时间',
    example: 120,
  })
  @IsNumber()
  @IsOptional()
  serviceTime?: number;

  @ApiPropertyOptional({ description: '是否为餐厅', example: false })
  @IsBoolean()
  @IsOptional()
  isRestaurant?: boolean;
}

/**
 * 优化配置 DTO
 */
export class OptimizationConfigDto {
  @ApiProperty({ description: '行程日期（ISO 8601 date）', example: '2024-05-01' })
  @IsString()
  date!: string;

  @ApiProperty({
    description: '开始时间（ISO 8601 datetime）',
    example: '2024-05-01T09:00:00.000Z',
  })
  @IsString()
  startTime!: string;

  @ApiProperty({
    description: '结束时间（ISO 8601 datetime）',
    example: '2024-05-01T18:00:00.000Z',
  })
  @IsString()
  endTime!: string;

  @ApiPropertyOptional({
    description: '节奏因子（1.0 = 标准, 1.5 = 慢节奏, 0.7 = 快节奏）',
    example: 1.0,
    default: 1.0,
  })
  @IsNumber()
  @IsOptional()
  pacingFactor?: number;

  @ApiPropertyOptional({ description: '是否带小孩', example: false })
  @IsBoolean()
  @IsOptional()
  hasChildren?: boolean;

  @ApiPropertyOptional({ description: '是否带老人', example: false })
  @IsBoolean()
  @IsOptional()
  hasElderly?: boolean;

  @ApiPropertyOptional({
    description: '午餐时间窗',
    example: { start: '12:00', end: '13:30' },
  })
  @IsOptional()
  lunchWindow?: { start: string; end: string };

  @ApiPropertyOptional({
    description: '晚餐时间窗',
    example: { start: '18:00', end: '20:00' },
  })
  @IsOptional()
  dinnerWindow?: { start: string; end: string };

  @ApiPropertyOptional({
    description: '是否启用 VRPTW 算法（带时间窗约束）',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  useVRPTW?: boolean;
}

/**
 * 路线优化请求 DTO
 */
export class OptimizeRouteDto {
  @ApiProperty({
    description: '地点 ID 列表',
    type: [Number],
    example: [1, 2, 3, 4, 5],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  placeIds!: number[];

  @ApiProperty({
    description: '优化配置',
    type: OptimizationConfigDto,
  })
  @ValidateNested()
  @Type(() => OptimizationConfigDto)
  config!: OptimizationConfigDto;
}

