// src/flight-prices/dto/estimate-price.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class EstimatePriceDto {
  @ApiProperty({
    description: '目的地国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  @IsString()
  countryCode!: string;

  @ApiPropertyOptional({
    description: '出发城市代码（可选），如 "PEK"（北京）、"PVG"（上海）',
    example: 'PEK',
  })
  @IsString()
  @IsOptional()
  originCity?: string;

  @ApiPropertyOptional({
    description: '是否使用保守估算（旺季价格），默认 true',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  useConservative?: boolean;
}

export class EstimatePriceResponseDto {
  @ApiProperty({ description: '估算总成本（机票 + 签证，单位：元）', example: 6000 })
  totalCost!: number;

  @ApiProperty({ description: '机票价格（单位：元）', example: 6000 })
  flightPrice!: number;

  @ApiProperty({ description: '签证费用（单位：元）', example: 0 })
  visaCost!: number;

  @ApiProperty({ description: '是否使用保守估算', example: true })
  useConservative!: boolean;

  @ApiProperty({ description: '目的地国家代码', example: 'JP' })
  countryCode!: string;

  @ApiPropertyOptional({ description: '出发城市代码', example: 'PEK' })
  originCity?: string;
}

