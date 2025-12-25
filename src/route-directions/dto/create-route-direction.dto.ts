// src/route-directions/dto/create-route-direction.dto.ts
import {
  IsString,
  IsArray,
  IsOptional,
  IsObject,
  IsBoolean,
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
}

