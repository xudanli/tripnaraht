import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IcelandPreviewVehicleProfileDto {
  @ApiPropertyOptional({ example: '2WD' })
  @IsOptional()
  @IsString()
  driveType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  riverCrossingQualified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is4wd?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsFRoad?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsRiverCrossing?: boolean;
}

export class IcelandPreviewPreferencesDto {
  @ApiPropertyOptional({ example: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  dailyDrivingLimitMin?: number;

  @ApiPropertyOptional({ enum: ['relaxed', 'standard', 'intensive'] })
  @IsOptional()
  @IsIn(['relaxed', 'standard', 'intensive'])
  pace?: 'relaxed' | 'standard' | 'intensive';
}

export class CreateIcelandTripShellDto {
  @ApiProperty({ example: 'IS' })
  @IsIn(['IS'])
  destinationCode!: 'IS';

  @ApiProperty({ example: '2027-02-10' })
  @IsString()
  startDate!: string;

  @ApiProperty({ example: '2027-02-18' })
  @IsString()
  endDate!: string;

  @ApiPropertyOptional({ example: 'SELF_DRIVE' })
  @IsOptional()
  @IsIn(['SELF_DRIVE'])
  travelMode?: 'SELF_DRIVE';

  @ApiPropertyOptional({ type: IcelandPreviewVehicleProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IcelandPreviewVehicleProfileDto)
  vehicleProfile?: IcelandPreviewVehicleProfileDto;

  @ApiPropertyOptional({ type: [String], example: ['381037', '381084'] })
  @IsOptional()
  @IsArray()
  requestedPlaceIds?: Array<string | number>;

  @ApiPropertyOptional({ type: [String], example: ['381083'] })
  @IsOptional()
  @IsArray()
  excludedPlaceIds?: Array<string | number>;

  @ApiPropertyOptional({
    description: 'Confirmed lodging overnight anchors (placeId + optional nightDate)',
    example: [{ placeId: 381045, label: 'Vík Hostel', nightDate: '2026-07-23' }],
  })
  @IsOptional()
  @IsArray()
  confirmedLodgings?: Array<{
    placeId?: number | string;
    label?: string;
    nightDate?: string;
  }>;

  @ApiPropertyOptional({ type: IcelandPreviewPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IcelandPreviewPreferencesDto)
  preferences?: IcelandPreviewPreferencesDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startLocationCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endLocationCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  endSameAsStart?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  travelerCount?: number;
}
