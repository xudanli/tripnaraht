// src/flight-prices/dto/create-flight-price.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateFlightPriceDto {
  @ApiProperty({
    description: '目的地国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  @IsString()
  countryCode!: string;

  @ApiPropertyOptional({
    description: '出发城市代码（可选），如 "PEK"（北京）、"PVG"（上海）。如果为空则表示任意出发城市',
    example: 'PEK',
  })
  @IsString()
  @IsOptional()
  originCity?: string;

  @ApiProperty({
    description: '淡季价格（人民币，元）',
    example: 2500,
  })
  @IsInt()
  @Min(0)
  lowSeasonPrice!: number;

  @ApiProperty({
    description: '旺季价格（人民币，元）',
    example: 6000,
  })
  @IsInt()
  @Min(0)
  highSeasonPrice!: number;

  @ApiProperty({
    description: '签证费用（人民币，元），0 表示免签或落地签',
    example: 0,
    default: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  visaCost?: number;

  @ApiPropertyOptional({
    description: '数据来源说明',
    example: '手动估算',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    description: '备注信息',
    example: '价格包含税费，不含行李费',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

