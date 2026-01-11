// src/countries/dto/get-countries-query.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 国家列表查询参数
 */
export class GetCountriesQueryDto {
  @ApiPropertyOptional({
    description: '搜索关键词（支持中文名、英文名、国家代码）',
    example: '日本',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: '返回数量限制（最大1000，不指定则返回所有）',
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description: '偏移量（用于分页）',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
