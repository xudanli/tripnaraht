// src/trips/dto/create-trip.dto.ts
import { IsString, IsNumber, IsDateString, IsArray, ValidateNested, IsEnum, IsOptional, IsInt, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from './trip-status.dto';

/**
 * 旅行节奏枚举
 * 
 * 用于描述旅行的整体节奏偏好
 */
export enum TripPace {
  RELAXED = 'relaxed',   // 轻松：每天 3 个活动
  STANDARD = 'standard', // 标准：每天 5 个活动
  TIGHT = 'tight',       // 紧凑：每天 7 个活动
}

/**
 * 行动能力标签枚举
 * 
 * 用于标识旅行者的体力和行动能力水平
 */
export enum MobilityTag {
  IRON_LEGS = 'IRON_LEGS',         // 特种兵：体力充沛，可以高强度活动
  ACTIVE_SENIOR = 'ACTIVE_SENIOR', // 银发徒步：老年人但体力尚可，但地形受限
  CITY_POTATO = 'CITY_POTATO',     // 城市脆皮：年轻人但体力一般，需要频繁休息
  LIMITED = 'LIMITED'              // 行动不便：需要轮椅或特殊设施
}

/**
 * 旅行者信息 DTO（双轴模型）
 * 
 * 双轴模型：
 * - X轴（兴趣维度）：由年龄/身份决定（type）-> 影响"去哪儿"
 * - Y轴（体能维度）：由用户画像决定（mobilityTag）-> 影响"怎么走"
 * 
 * 系统会根据所有成员的配置，使用"木桶效应"算法找出最短的那块板
 */
export class TravelerDto {
  @ApiProperty({
    enum: ['ADULT', 'ELDERLY', 'CHILD'],
    description: '旅行者类型（兴趣维度：年龄/身份）',
    example: 'ADULT',
    enumName: 'InterestProfile'
  })
  @IsEnum(['ADULT', 'ELDERLY', 'CHILD'], { message: 'type 必须是 ADULT、ELDERLY 或 CHILD' })
  type!: 'ADULT' | 'ELDERLY' | 'CHILD';

  @ApiProperty({
    enum: MobilityTag,
    description: '行动能力标签（体能维度：用户画像）',
    example: MobilityTag.CITY_POTATO,
    enumName: 'MobilityTag'
  })
  @IsEnum(MobilityTag, { message: 'mobilityTag 必须是有效的行动能力标签' })
  mobilityTag!: MobilityTag;
}

/**
 * 创建行程 DTO
 * 
 * 接收用户关于"钱、人、时间"的输入
 */
export class CreateTripDto {
  @ApiProperty({
    description: '目的地国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
    enum: ['JP', 'IS', 'US', 'CN'],
    default: 'JP'
  })
  @IsString({ message: 'destination 必须是字符串' })
  destination!: string;

  @ApiProperty({
    description: '行程开始日期（ISO 8601 格式）',
    example: '2024-05-01',
    type: String,
    format: 'date'
  })
  @IsDateString({}, { message: 'startDate 必须是有效的日期字符串 (ISO 8601)' })
  startDate!: string;

  @ApiProperty({
    description: '行程结束日期（ISO 8601 格式）',
    example: '2024-05-05',
    type: String,
    format: 'date'
  })
  @IsDateString({}, { message: 'endDate 必须是有效的日期字符串 (ISO 8601)' })
  endDate!: string;

  @ApiProperty({
    description: '总预算（单位：人民币 CNY）',
    example: 20000,
    minimum: 0,
    type: Number
  })
  @IsNumber({}, { message: 'totalBudget 必须是数字' })
  totalBudget!: number;

  @ApiProperty({
    description: '旅行者列表',
    type: [TravelerDto],
    example: [
      { type: 'ADULT', mobilityTag: 'CITY_POTATO' },
      { type: 'ADULT', mobilityTag: 'CITY_POTATO' },
      { type: 'ELDERLY', mobilityTag: 'ACTIVE_SENIOR' }
    ]
  })
  @IsArray({ message: 'travelers 必须是数组' })
  @ValidateNested({ each: true, message: 'travelers 数组中的每个元素必须符合 TravelerDto 格式' })
  @Type(() => TravelerDto)
  travelers!: TravelerDto[];

  @ApiPropertyOptional({
    description: '行程状态',
    enum: TripStatus,
    example: TripStatus.PLANNING,
    default: TripStatus.PLANNING
  })
  @IsOptional()
  @IsEnum(TripStatus, { message: 'status 必须是有效的行程状态' })
  status?: TripStatus;

  // ========== 新增可选字段 ==========

  @ApiPropertyOptional({
    description: '旅行节奏',
    enum: TripPace,
    example: TripPace.STANDARD,
    enumName: 'TripPace'
  })
  @IsOptional()
  @IsEnum(TripPace, { message: 'pace 必须是 relaxed、standard 或 tight' })
  pace?: TripPace;

  @ApiPropertyOptional({
    description: '兴趣偏好标签数组',
    type: [String],
    example: ['food', 'history', 'photography']
  })
  @IsOptional()
  @IsArray({ message: 'preferences 必须是数组' })
  @IsString({ each: true, message: 'preferences 数组中的每个元素必须是字符串' })
  preferences?: string[];

  @ApiPropertyOptional({
    description: '必须去的地点 POI IDs',
    type: [Number],
    example: [12345, 67890]
  })
  @IsOptional()
  @IsArray({ message: 'mustPlaces 必须是数组' })
  @IsInt({ each: true, message: 'mustPlaces 数组中的每个元素必须是整数' })
  mustPlaces?: number[];

  @ApiPropertyOptional({
    description: '不想去的地点 POI IDs',
    type: [Number],
    example: [11111]
  })
  @IsOptional()
  @IsArray({ message: 'avoidPlaces 必须是数组' })
  @IsInt({ each: true, message: 'avoidPlaces 数组中的每个元素必须是整数' })
  avoidPlaces?: number[];

  @ApiPropertyOptional({
    description: '行程名称（1-200 字符，可选。如不提供，系统将自动生成默认名称）',
    example: '冰岛环岛游',
    maxLength: 200,
    minLength: 1,
  })
  @IsOptional()
  @IsString({ message: 'name 必须是字符串' })
  @Length(1, 200, { message: '行程名称长度必须在 1-200 字符之间' })
  name?: string;
}
