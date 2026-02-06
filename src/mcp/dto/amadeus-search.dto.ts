import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class AmadeusSearchFlightOffersDto {
  @ApiProperty({
    description: '出发地 IATA 代码（例如：SYD 表示悉尼）',
    example: 'SYD',
  })
  @IsString()
  originLocationCode: string;

  @ApiProperty({
    description: '目的地 IATA 代码（例如：BKK 表示曼谷）',
    example: 'BKK',
  })
  @IsString()
  destinationLocationCode: string;

  @ApiProperty({
    description: '出发日期（ISO 8601 格式：YYYY-MM-DD）',
    example: '2026-05-02',
  })
  @IsString()
  departureDate: string;

  @ApiProperty({
    description: '成人数（12岁以上，1-9）',
    example: 1,
    minimum: 1,
    maximum: 9,
  })
  @IsNumber()
  @Min(1)
  @Max(9)
  adults: number;

  @ApiPropertyOptional({
    description: '返程日期（ISO 8601 格式：YYYY-MM-DD，往返航班）',
    example: '2026-05-10',
  })
  @IsString()
  @IsOptional()
  returnDate?: string;

  @ApiPropertyOptional({
    description: '儿童数（2-11岁）',
    example: 0,
    minimum: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  children?: number;

  @ApiPropertyOptional({
    description: '婴儿数（2岁以下）',
    example: 0,
    minimum: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  infants?: number;

  @ApiPropertyOptional({
    description: '舱位等级（ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST）',
    example: 'ECONOMY',
    enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
  })
  @IsString()
  @IsOptional()
  travelClass?: string;

  @ApiPropertyOptional({
    description: '包含的航空公司代码（逗号分隔，例如：6X,7X）',
    example: '6X,7X',
  })
  @IsString()
  @IsOptional()
  includedAirlineCodes?: string;

  @ApiPropertyOptional({
    description: '排除的航空公司代码（逗号分隔，例如：6X,7X）',
    example: '6X,7X',
  })
  @IsString()
  @IsOptional()
  excludedAirlineCodes?: string;

  @ApiPropertyOptional({
    description: '是否仅返回直飞航班',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  nonStop?: boolean;

  @ApiPropertyOptional({
    description: '货币代码（ISO 4217，例如：EUR 表示欧元）',
    example: 'EUR',
  })
  @IsString()
  @IsOptional()
  currencyCode?: string;

  @ApiPropertyOptional({
    description: '每人最高价格（正整数，无小数）',
    example: 1000,
    minimum: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: '返回的最大航班数量',
    example: 10,
    minimum: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  max?: number;
}
