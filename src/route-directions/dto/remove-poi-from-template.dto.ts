// src/route-directions/dto/remove-poi-from-template.dto.ts
import { IsInt, IsString, IsOptional, Min } from 'class-validator';

export class RemovePoiFromTemplateDto {
  /** 第几天（从 1 开始） */
  @IsInt()
  @Min(1)
  day!: number;

  /** POI ID（Place 表的 id）或 UUID */
  @IsOptional()
  @IsInt()
  poiId?: number;

  /** POI UUID（如果使用 UUID 而不是 ID） */
  @IsOptional()
  @IsString()
  poiUuid?: string;

  /** POI 在 pois 数组中的索引（从 0 开始） */
  @IsOptional()
  @IsInt()
  @Min(0)
  index?: number;
}
