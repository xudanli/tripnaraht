// src/route-directions/dto/create-route-template.dto.ts
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

export class CreateRouteTemplateDto {
  @IsInt()
  routeDirectionId!: number;

  @IsInt()
  durationDays!: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameCN?: string;

  @IsOptional()
  @IsString()
  nameEN?: string;

  @IsArray()
  // 不使用 ValidateNested，允许灵活的数据结构（包括 pois 字段）
  // 因为 DayPlan 是接口，且需要支持扩展字段（如 pois）
  dayPlans!: DayPlan[] | any[];

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

