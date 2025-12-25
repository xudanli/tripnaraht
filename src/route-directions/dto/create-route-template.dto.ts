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
  @ValidateNested({ each: true })
  @Type(() => Object)
  dayPlans!: DayPlan[];

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

