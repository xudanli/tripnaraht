// src/route-directions/dto/update-route-template.dto.ts
import {
  IsInt,
  IsString,
  IsArray,
  IsOptional,
  IsObject,
  IsEnum,
  IsBoolean,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { DayPlan } from '../interfaces/route-direction.interface';

export class UpdateRouteTemplateDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'routeDirectionId must be an integer' })
  routeDirectionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'durationDays must be an integer' })
  durationDays?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameCN?: string;

  @IsOptional()
  @IsString()
  nameEN?: string;

  @IsOptional()
  @IsArray({ message: 'dayPlans must be an array' })
  @Transform(({ value }) => {
    // 确保数组中的每个对象都被保留，不丢失任何字段
    if (Array.isArray(value)) {
      return value.map((item: any) => {
        if (typeof item === 'object' && item !== null) {
          return { ...item }; // 保留所有字段
        }
        return item;
      });
    }
    return value;
  })
  // 不使用 ValidateNested，允许灵活的数据结构（包括 pois 字段）
  dayPlans?: DayPlan[] | any[];

  @IsOptional()
  @Transform(({ value }) => {
    // 兼容旧值：RELAX -> RELAXED, CHALLENGE -> INTENSE
    if (value === 'RELAX') return 'RELAXED';
    if (value === 'CHALLENGE') return 'INTENSE';
    return value;
  })
  @IsIn(['RELAXED', 'BALANCED', 'INTENSE'], {
    message: 'defaultPacePreference must be one of: RELAXED, BALANCED, INTENSE',
  })
  defaultPacePreference?: 'RELAXED' | 'BALANCED' | 'INTENSE';

  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;
}


