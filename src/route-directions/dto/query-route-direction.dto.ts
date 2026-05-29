// src/route-directions/dto/query-route-direction.dto.ts
import { IsString, IsOptional, IsBoolean, IsInt, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

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
  @Type(() => Boolean)
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

