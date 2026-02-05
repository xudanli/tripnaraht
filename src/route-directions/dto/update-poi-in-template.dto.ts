// src/route-directions/dto/update-poi-in-template.dto.ts
import { IsInt, IsString, IsOptional, IsBoolean, IsNumber, Min, IsEnum } from 'class-validator';
import { PoiPriority } from '../interfaces/route-direction.interface';

/**
 * 更新路线模板中的POI
 */
export class UpdatePoiInTemplateDto {
  /** 第几天（从 1 开始） */
  @IsInt()
  @Min(1)
  day!: number;

  /** POI ID（Place 表的 id） */
  @IsInt()
  poiId!: number;

  /** 是否为必游 POI（向后兼容，建议使用 priority 代替） */
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  /**
   * POI 优先级
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

  /** POI 顺序（用于排序） */
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  /** 预计停留时间（分钟） */
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  /** 优先级原因说明 */
  @IsOptional()
  @IsString()
  priorityReason?: string;
}

/**
 * 批量更新POI优先级
 */
export class BulkUpdatePoiPriorityDto {
  /** 要更新的POI列表 */
  updates!: Array<{
    day: number;
    poiId: number;
    priority: PoiPriority;
    priorityReason?: string;
  }>;
}
