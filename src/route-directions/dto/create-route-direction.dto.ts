// src/route-directions/dto/create-route-direction.dto.ts
import {
  IsString,
  IsArray,
  IsOptional,
  IsObject,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RouteConstraints,
  RiskProfile,
  Seasonality,
  SignaturePois,
  ItinerarySkeleton,
} from '../interfaces/route-direction.interface';

export class CreateRouteDirectionDto {
  @IsString()
  countryCode!: string;

  @IsString()
  name!: string;

  @IsString()
  nameCN!: string;

  @IsOptional()
  @IsString()
  nameEN?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entryHubs?: string[];

  @IsOptional()
  @IsObject()
  seasonality?: Seasonality;

  @IsOptional()
  @IsObject()
  constraints?: RouteConstraints;

  @IsOptional()
  @IsObject()
  riskProfile?: RiskProfile;

  @IsOptional()
  @IsObject()
  signaturePois?: SignaturePois;

  @IsOptional()
  @IsObject()
  itinerarySkeleton?: ItinerarySkeleton;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // 灰度与开关字段
  @IsOptional()
  @IsString()
  status?: 'draft' | 'active' | 'deprecated';

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsNumber()
  rolloutPercent?: number;

  @IsOptional()
  @IsObject()
  audienceFilter?: {
    persona?: string[];
    locale?: string[];
    [key: string]: any;
  };
}

