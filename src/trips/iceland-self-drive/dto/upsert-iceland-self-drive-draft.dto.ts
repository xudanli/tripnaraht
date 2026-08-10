import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  IcelandSelfDriveBookingDto,
  IcelandSelfDriveDateRangeDto,
} from './create-iceland-self-drive-trip.dto';
import {
  ICELAND_SELF_DRIVE_LOCATION_CODES,
  ICELAND_SELF_DRIVE_REGION_IDS,
  ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS,
  PRODUCT_LINE_ICELAND_SELF_DRIVE,
  type IcelandSelfDriveLocationCode,
  type IcelandSelfDriveRegionId,
  type IcelandSelfDriveVehicleAcquisition,
} from './iceland-self-drive-enums';

/** Partial wizard payload for server-side draft sync (no tripId). */
export class UpsertIcelandSelfDriveDraftDto {
  @ApiPropertyOptional({ example: 'IS' })
  @IsOptional()
  @IsIn(['IS'])
  destinationCode?: 'IS';

  @ApiPropertyOptional({ example: PRODUCT_LINE_ICELAND_SELF_DRIVE })
  @IsOptional()
  @IsIn([PRODUCT_LINE_ICELAND_SELF_DRIVE])
  productLine?: typeof PRODUCT_LINE_ICELAND_SELF_DRIVE;

  @ApiPropertyOptional({ type: IcelandSelfDriveDateRangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IcelandSelfDriveDateRangeDto)
  dateRange?: IcelandSelfDriveDateRangeDto;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsISO8601()
  arrivalAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsISO8601()
  departureAt?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  travelerCount?: number;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_LOCATION_CODES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_LOCATION_CODES])
  startLocationCode?: IcelandSelfDriveLocationCode;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_LOCATION_CODES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_LOCATION_CODES])
  endLocationCode?: IcelandSelfDriveLocationCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  endSameAsStart?: boolean;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS])
  vehicleAcquisition?: IcelandSelfDriveVehicleAcquisition;

  @ApiPropertyOptional({ type: [String], enum: ICELAND_SELF_DRIVE_REGION_IDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsIn([...ICELAND_SELF_DRIVE_REGION_IDS], { each: true })
  regionIds?: IcelandSelfDriveRegionId[];

  @ApiPropertyOptional({ type: [IcelandSelfDriveBookingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IcelandSelfDriveBookingDto)
  bookings?: IcelandSelfDriveBookingDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  skipBookings?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  fillBookingsLater?: boolean;

  @ApiPropertyOptional({ description: 'Current wizard step index (client hint)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  step?: number;
}
