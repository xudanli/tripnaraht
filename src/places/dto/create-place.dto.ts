// src/places/dto/create-place.dto.ts
import { IsString, IsNumber, IsOptional, IsEnum, IsObject } from 'class-validator';
import { PlaceCategory } from '@prisma/client';
import { PlaceMetadata } from '../interfaces/place-metadata.interface';

export class CreatePlaceDto {
  @IsString()
  name!: string;

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

