import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TravelerDto, TripPace } from './create-trip.dto';

export class InitializeTripPlanningDto {
  @ApiPropertyOptional({ description: '目的地国家代码；Draft Trip 中已识别时可省略', example: 'IS' })
  @IsOptional()
  @IsString()
  destinationCountryCode?: string;

  @ApiPropertyOptional({ description: '真实出发日期；用于创建 TripDay', example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '真实结束日期；用于创建 TripDay', example: '2026-07-08' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '总预算；可后续补充', example: 30000 })
  @IsOptional()
  @IsNumber()
  totalBudget?: number;

  @ApiPropertyOptional({ description: '货币', example: 'CNY' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: '旅行节奏', enum: TripPace, example: TripPace.RELAXED })
  @IsOptional()
  @IsString()
  pace?: TripPace | string;

  @ApiPropertyOptional({ description: '旅行者；省略时使用保守默认成人', type: [TravelerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelerDto)
  travelers?: TravelerDto[];
}
