// src/itinerary-optimization/dto/optimize-route.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  ValidateNested,
  IsIn,
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
    description: '默认交通方式。未指定时：带老人→TRANSIT+少步行，带小孩→DRIVING，否则→TRANSIT',
    enum: ['TRANSIT', 'WALKING', 'DRIVING'],
  })
  @IsIn(['TRANSIT', 'WALKING', 'DRIVING'])
  @IsOptional()
  defaultTravelMode?: 'TRANSIT' | 'WALKING' | 'DRIVING';

  @ApiPropertyOptional({
    description: '交通偏好（透传给地图 API）',
    example: { lessWalking: true, avoidHighways: false, avoidTolls: false },
  })
  @IsOptional()
  transportPreferences?: {
    lessWalking?: boolean;
    avoidHighways?: boolean;
    avoidTolls?: boolean;
  };

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

  @ApiPropertyOptional({
    description: '快乐值权重（可配置，预留从用户反馈学习）',
    example: { distancePenalty: 1.2, clusteringBonus: 1.5 },
  })
  @IsOptional()
  happinessWeights?: {
    interest?: number;
    distancePenalty?: number;
    tiredPenalty?: number;
    boredPenalty?: number;
    starvePenalty?: number;
    clusteringBonus?: number;
    bufferBonus?: number;
  };

  @ApiPropertyOptional({
    description: '随机种子（可复现优化结果）',
    example: 42,
  })
  @IsNumber()
  @IsOptional()
  seed?: number;

  @ApiPropertyOptional({
    description: '多起点试验次数（>1 时多次运行 SA 取最优，默认 1，最大 5）',
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  multiStartTrials?: number;

  @ApiPropertyOptional({
    description: '使用 OR-Tools TSP 作为初始解（需安装 node_or_tools，否则自动降级为 SA）',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  useORTools?: boolean;
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

  @ApiProperty({
    description: '行程 ID。优化结果将自动应用到该行程，冲突数据会随之更新',
  })
  @IsNotEmpty({ message: 'tripId 不能为空' })
  @IsString()
  tripId!: string;

  @ApiProperty({
    description: '行程日 ID（TripDay.id）。指定要优化的那一天',
  })
  @IsNotEmpty({ message: 'dayId 不能为空' })
  @IsString()
  dayId!: string;
}

/**
 * 优化接口响应中的冲突摘要（供 Swagger 文档）
 */
export class OptimizeConflictSummaryDto {
  @ApiProperty({ description: '优化前冲突数' })
  before!: number;

  @ApiProperty({ description: '优化后冲突数' })
  after!: number;

  @ApiProperty({ description: '已解决的冲突数' })
  resolved!: number;

  @ApiProperty({ description: '是否出现新冲突（优化后冲突数增加）' })
  hasNew!: boolean;
}

