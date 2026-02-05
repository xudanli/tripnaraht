// src/route-directions/dto/add-poi-to-template.dto.ts
import { IsInt, IsString, IsOptional, IsBoolean, IsNumber, Min, IsEnum } from 'class-validator';
import { PoiPriority } from '../interfaces/route-direction.interface';

export class AddPoiToTemplateDto {
  /** 第几天（从 1 开始） */
  @IsInt()
  @Min(1)
  day!: number;

  /** POI ID（Place 表的 id） */
  @IsInt()
  poiId!: number;

  /** 是否为必游 POI（默认 false，向后兼容，建议使用 priority 代替） */
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  /**
   * POI 优先级（推荐使用）
   * - MUST_SEE: 必看景点，核心体验，不可跳过
   * - HIGH: 高优先级，强烈推荐，尽量安排
   * - MEDIUM: 中优先级，推荐（默认值）
   * - LOW: 低优先级，可选
   * - OPTIONAL: 备选方案，用于填充空闲时间
   */
  @IsOptional()
  @IsEnum(['MUST_SEE', 'HIGH', 'MEDIUM', 'LOW', 'OPTIONAL'], {
    message: 'priority must be one of: MUST_SEE, HIGH, MEDIUM, LOW, OPTIONAL',
  })
  priority?: PoiPriority;

  /** 🆕 开始时间（ISO 8601 格式或 HH:mm 格式，可选。如果提供，创建行程时将使用此时间） */
  @IsOptional()
  @IsString()
  startTime?: string;

  /** 🆕 结束时间（ISO 8601 格式或 HH:mm 格式，可选。如果提供，创建行程时将使用此时间） */
  @IsOptional()
  @IsString()
  endTime?: string;

  /** 预计停留时间（分钟，可选。如果未提供 startTime/endTime，将使用此字段计算时间） */
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  /** 优先级原因说明（可选，解释为什么设置这个优先级） */
  @IsOptional()
  @IsString()
  priorityReason?: string;
}
