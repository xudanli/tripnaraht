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
} from 'class-validator';
import { Type } from 'class-transformer';
import { DayPlan } from '../interfaces/route-direction.interface';

export class UpdateRouteTemplateDto {
  @IsOptional()
  @IsInt()
  routeDirectionId?: number;

  @IsOptional()
  @IsInt()
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
  @IsArray()
  // 不使用 ValidateNested，允许灵活的数据结构（包括 pois 字段）
  dayPlans?: DayPlan[] | any[];

  @IsOptional()
  @IsEnum(['RELAX', 'BALANCED', 'CHALLENGE'])
  defaultPacePreference?: 'RELAX' | 'BALANCED' | 'CHALLENGE';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}


