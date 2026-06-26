import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertPlacePlanningProfileDto {
  @ApiPropertyOptional({ example: ['nature', 'photo', 'family_friendly'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  experienceTags?: string[];

  @ApiPropertyOptional({ example: 'viewpoint' })
  @IsOptional()
  @IsString()
  canonicalType?: string;

  @ApiPropertyOptional({ enum: ['anchor', 'meal', 'flex', 'backup'] })
  @IsOptional()
  @IsIn(['anchor', 'meal', 'flex', 'backup'])
  visitRole?: 'anchor' | 'meal' | 'flex' | 'backup';

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsNumber()
  dwellMinutes?: number;

  @ApiPropertyOptional({ example: ['morning', 'sunset'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bestTimeOfDay?: string[];

  @ApiPropertyOptional({ example: ['spring', 'summer', 'autumn'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seasonality?: string[];

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  physicalLoad?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  crowdLevel?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  weatherSensitive?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  childFriendly?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  elderlyFriendly?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  reservationRequired?: boolean;

  @ApiPropertyOptional({ example: 'tokyo-shibuya' })
  @IsOptional()
  @IsString()
  nearbyClusterId?: string;

  @ApiPropertyOptional({ description: '扩展字段，会与 planningProfile 合并' })
  @IsOptional()
  @IsObject()
  extra?: Record<string, any>;
}
