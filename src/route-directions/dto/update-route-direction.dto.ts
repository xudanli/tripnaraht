// src/route-directions/dto/update-route-direction.dto.ts
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
  FailureProfile,
  RouteNarrative,
} from '../interfaces/route-direction.interface';

export class UpdateRouteDirectionDto {
  @IsOptional()
  @IsString()
  countryCode?: string;

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
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

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

  // PART 1: 世界级 RouteDirection Pack 增强
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  failureProfile?: FailureProfile;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  narrative?: RouteNarrative;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  antiPersona?: string[];
}
