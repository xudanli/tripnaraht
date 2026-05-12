import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class AirbnbSearchDto {
  @ApiProperty({
    description: '搜索位置，例如 "Reykjavik, Iceland"',
    example: 'Reykjavik, Iceland',
  })
  @IsString()
  location!: string;

  @ApiPropertyOptional({
    description: '成人数',
    example: 2,
    default: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  adults?: number;

  @ApiPropertyOptional({
    description: '儿童数',
    example: 0,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  children?: number;

  @ApiPropertyOptional({
    description: '婴儿数',
    example: 0,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  infants?: number;

  @ApiPropertyOptional({
    description: '宠物数',
    example: 0,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  pets?: number;

  @ApiPropertyOptional({
    description: '入住日期，格式 YYYY-MM-DD',
    example: '2026-02-07',
  })
  @IsString()
  @IsOptional()
  checkin?: string;

  @ApiPropertyOptional({
    description: '退房日期，格式 YYYY-MM-DD',
    example: '2026-02-12',
  })
  @IsString()
  @IsOptional()
  checkout?: string;

  @ApiPropertyOptional({
    description: '页码',
    example: 1,
    default: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: '是否忽略 robots.txt（仅用于测试）',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  ignoreRobotsText?: boolean;
}

export class AirbnbListingDetailsDto {
  @ApiProperty({
    description: '房源 ID',
    example: '1573970428683000922',
  })
  @IsString()
  listingId!: string;

  @ApiPropertyOptional({
    description: '入住日期，格式 YYYY-MM-DD',
    example: '2026-02-07',
  })
  @IsString()
  @IsOptional()
  checkin?: string;

  @ApiPropertyOptional({
    description: '退房日期，格式 YYYY-MM-DD',
    example: '2026-02-12',
  })
  @IsString()
  @IsOptional()
  checkout?: string;

  @ApiPropertyOptional({
    description: '成人数',
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  adults?: number;

  @ApiPropertyOptional({
    description: '儿童数',
    example: 0,
  })
  @IsNumber()
  @IsOptional()
  children?: number;

  @ApiPropertyOptional({
    description: '婴儿数',
    example: 0,
  })
  @IsNumber()
  @IsOptional()
  infants?: number;

  @ApiPropertyOptional({
    description: '宠物数',
    example: 0,
  })
  @IsNumber()
  @IsOptional()
  pets?: number;

  @ApiPropertyOptional({
    description: '是否忽略 robots.txt（仅用于测试）',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  ignoreRobotsText?: boolean;
}
