import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

function parseBooleanQuery(value: unknown): boolean | unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return value;
}

export class QueryRoutePackingChecklistDto {
  @ApiPropertyOptional({ description: '按路线模板 ID 筛选', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  routeTemplateId?: number;

  @ApiPropertyOptional({ description: '国家码', example: 'CN' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '是否激活', type: Boolean })
  @IsOptional()
  @Transform(({ value }) => parseBooleanQuery(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '页码（从 1 开始）', type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', type: Number, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
