// src/route-directions/dto/add-poi-to-template.dto.ts
import { IsInt, IsString, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';

export class AddPoiToTemplateDto {
  /** 第几天（从 1 开始） */
  @IsInt()
  @Min(1)
  day: number;

  /** POI ID（Place 表的 id） */
  @IsInt()
  poiId: number;

  /** 是否为必游 POI（默认 false） */
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  /** POI 顺序（用于排序，可选） */
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  /** 预计停留时间（分钟，可选） */
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;
}
