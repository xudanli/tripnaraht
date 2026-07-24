// src/route-directions/dto/query-route-direction.dto.ts
import { IsString, IsOptional, IsBoolean, IsInt, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';

function parseBooleanQuery(value: unknown): boolean | unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return value;
}

export class QueryRouteDirectionDto {
  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseBooleanQuery(value))
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  month?: number; // 用于季节性筛选（1-12）

  /** 逗号分隔，如 `hikingDetail` — 详情接口扩展徒步块 */
  @IsOptional()
  @IsString()
  include?: string;
}
