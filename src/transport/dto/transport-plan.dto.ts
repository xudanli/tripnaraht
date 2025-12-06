// src/transport/dto/transport-plan.dto.ts
import { IsNumber, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 交通规划请求 DTO
 */
export class TransportPlanDto {
  @ApiProperty({
    description: '起点纬度',
    example: 35.6762,
    type: Number,
  })
  @IsNumber()
  fromLat!: number;

  @ApiProperty({
    description: '起点经度',
    example: 139.6503,
    type: Number,
  })
  @IsNumber()
  fromLng!: number;

  @ApiProperty({
    description: '终点纬度',
    example: 34.6937,
    type: Number,
  })
  @IsNumber()
  toLat!: number;

  @ApiProperty({
    description: '终点经度',
    example: 135.5023,
    type: Number,
  })
  @IsNumber()
  toLng!: number;

  @ApiPropertyOptional({
    description: '是否带着行李移动（如：换酒店日）',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  hasLuggage?: boolean;

  @ApiPropertyOptional({
    description: '是否有老人同行',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  hasElderly?: boolean;

  @ApiPropertyOptional({
    description: '是否正在下雨',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isRaining?: boolean;

  @ApiPropertyOptional({
    description: '预算敏感度',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    example: 'MEDIUM',
    default: 'MEDIUM',
  })
  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  @IsOptional()
  budgetSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({
    description: '时间敏感度',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    example: 'MEDIUM',
    default: 'MEDIUM',
  })
  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  @IsOptional()
  timeSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({
    description: '是否有行动不便成员',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  hasLimitedMobility?: boolean;

  @ApiPropertyOptional({
    description: '当前城市代码（用于判断是否换酒店日）',
    example: 'JP',
  })
  @IsString()
  @IsOptional()
  currentCity?: string;

  @ApiPropertyOptional({
    description: '目标城市代码（用于判断是否换酒店日）',
    example: 'JP',
  })
  @IsString()
  @IsOptional()
  targetCity?: string;

  @ApiPropertyOptional({
    description: '是否为换酒店日',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isMovingDay?: boolean;
}

