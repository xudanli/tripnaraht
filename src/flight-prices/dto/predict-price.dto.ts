// src/flight-prices/dto/predict-price.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString } from 'class-validator';

export class FlightPricePredictionDto {
  @ApiProperty({
    description: '出发城市',
    example: '北京',
  })
  @IsString()
  from_city!: string;

  @ApiProperty({
    description: '目的地城市',
    example: '上海',
  })
  @IsString()
  to_city!: string;

  @ApiProperty({
    description: '出发日期 (ISO 8601 date)',
    example: '2024-05-01',
  })
  @IsDateString()
  departure_date!: string;

  @ApiProperty({
    description: '返程日期 (ISO 8601 date, 可选)',
    example: '2024-05-05',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  return_date?: string;
}

