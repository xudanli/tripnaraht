// src/places/dto/create-place.dto.ts
import { IsString, IsNumber, IsOptional, IsEnum, IsObject } from 'class-validator';
import { PlaceCategory } from '@prisma/client';
import { PlaceMetadata } from '../interfaces/place-metadata.interface';

export class CreatePlaceDto {
  @IsString()
  nameCN!: string; // 中文名称

  @IsOptional()
  @IsString()
  nameEN?: string; // 英文名称（可选）

  @IsEnum(PlaceCategory)
  category!: PlaceCategory;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsNumber()
  cityId!: number;

  @IsOptional()
  @IsObject()
  metadata?: PlaceMetadata;

  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @IsOptional()
  @IsNumber()
  rating?: number;
}

