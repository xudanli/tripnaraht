// src/hotels/dto/predict-price.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsDateString, Min, Max } from 'class-validator';

export class HotelPricePredictionDto {
  @ApiProperty({
    description: '城市名称',
    example: '北京',
  })
  @IsString()
  city!: string;

  @ApiProperty({
    description: '酒店星级 (1-5)',
    example: 4,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  star_level!: number;

  @ApiProperty({
    description: '入住日期 (ISO 8601 date)',
    example: '2024-05-01',
  })
  @IsDateString()
  check_in_date!: string;

  @ApiProperty({
    description: '退房日期 (ISO 8601 date)',
    example: '2024-05-05',
  })
  @IsDateString()
  check_out_date!: string;
}

