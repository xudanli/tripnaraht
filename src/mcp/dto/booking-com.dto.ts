/**
 * Booking.com DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, IsDateString, Matches } from 'class-validator';

export class SearchCarRentalsDto {
  @ApiProperty({ description: '取车地点纬度', example: 40.6397 })
  @IsNumber()
  pick_up_latitude!: number;

  @ApiProperty({ description: '取车地点经度', example: -73.7792 })
  @IsNumber()
  pick_up_longitude!: number;

  @ApiProperty({ description: '还车地点纬度', example: 40.6397 })
  @IsNumber()
  drop_off_latitude!: number;

  @ApiProperty({ description: '还车地点经度', example: -73.7792 })
  @IsNumber()
  drop_off_longitude!: number;

  @ApiProperty({ description: '取车时间 (HH:mm)', example: '10:00' })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'pick_up_time must be in HH:mm format' })
  pick_up_time!: string;

  @ApiProperty({ description: '还车时间 (HH:mm)', example: '10:00' })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'drop_off_time must be in HH:mm format' })
  drop_off_time!: string;

  @ApiProperty({ description: '司机年龄', example: 30 })
  @IsNumber()
  driver_age!: number;

  @ApiPropertyOptional({ description: '货币代码', example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  currency_code?: string;

  @ApiPropertyOptional({ description: '位置代码', example: 'US', default: 'US' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: '取车日期 (YYYY-MM-DD)', example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  pick_up_date?: string;

  @ApiPropertyOptional({ description: '还车日期 (YYYY-MM-DD)', example: '2026-06-05' })
  @IsOptional()
  @IsDateString()
  drop_off_date?: string;
}
