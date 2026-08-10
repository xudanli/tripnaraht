import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ICELAND_SELF_DRIVE_BOOKING_KINDS,
  ICELAND_SELF_DRIVE_CANCELLATION_POLICIES,
  ICELAND_SELF_DRIVE_LOCATION_CODES,
  ICELAND_SELF_DRIVE_REGION_IDS,
  ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS,
  PRODUCT_LINE_ICELAND_SELF_DRIVE,
  type IcelandSelfDriveBookingKind,
  type IcelandSelfDriveCancellationPolicy,
  type IcelandSelfDriveLocationCode,
  type IcelandSelfDriveRegionId,
  type IcelandSelfDriveVehicleAcquisition,
} from './iceland-self-drive-enums';

export class IcelandSelfDriveDateRangeDto {
  @ApiProperty({ example: '2027-02-10' })
  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ example: '2027-02-18' })
  @IsString()
  @IsNotEmpty()
  endDate!: string;
}

export class IcelandSelfDriveBookingDto {
  @ApiProperty({ example: 'local-uuid-1' })
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @ApiProperty({ enum: ICELAND_SELF_DRIVE_BOOKING_KINDS })
  @IsIn([...ICELAND_SELF_DRIVE_BOOKING_KINDS])
  kind!: IcelandSelfDriveBookingKind;

  @ApiProperty({ example: '雷克雅未克KEX酒店' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: '规划同源 Place.id；有值时作为硬锚点主键',
    example: 12345,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  placeId?: number | null;

  @ApiPropertyOptional({
    enum: ICELAND_SELF_DRIVE_REGION_IDS,
    description: '可选；目录选中时带回的 ISD regionId',
  })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_REGION_IDS])
  regionId?: IcelandSelfDriveRegionId | null;

  @ApiPropertyOptional({ example: 'Reykjavík' })
  @IsOptional()
  @IsString()
  locationText?: string | null;

  @ApiProperty({ example: '2027-02-10' })
  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @ApiPropertyOptional({ example: '2027-02-12' })
  @IsOptional()
  @IsString()
  endDate?: string | null;

  @ApiPropertyOptional({ example: '2027-02-13T10:00:00Z' })
  @IsOptional()
  @IsISO8601()
  startDateTime?: string | null;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_CANCELLATION_POLICIES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_CANCELLATION_POLICIES])
  cancellationPolicy?: IcelandSelfDriveCancellationPolicy | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreateIcelandSelfDriveTripDto {
  @ApiProperty({ example: 'IS' })
  @IsString()
  @IsIn(['IS'])
  destinationCode!: 'IS';

  @ApiProperty({ example: PRODUCT_LINE_ICELAND_SELF_DRIVE })
  @IsString()
  @IsIn([PRODUCT_LINE_ICELAND_SELF_DRIVE])
  productLine!: typeof PRODUCT_LINE_ICELAND_SELF_DRIVE;

  @ApiProperty({ type: IcelandSelfDriveDateRangeDto })
  @ValidateNested()
  @Type(() => IcelandSelfDriveDateRangeDto)
  dateRange!: IcelandSelfDriveDateRangeDto;

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

  @ApiProperty({ example: 4, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  travelerCount!: number;

  @ApiProperty({ enum: ICELAND_SELF_DRIVE_LOCATION_CODES, default: 'keflavik' })
  @IsIn([...ICELAND_SELF_DRIVE_LOCATION_CODES])
  startLocationCode!: IcelandSelfDriveLocationCode;

  @ApiProperty({ enum: ICELAND_SELF_DRIVE_LOCATION_CODES, default: 'keflavik' })
  @IsIn([...ICELAND_SELF_DRIVE_LOCATION_CODES])
  endLocationCode!: IcelandSelfDriveLocationCode;

  @ApiProperty({ example: true })
  @IsBoolean()
  endSameAsStart!: boolean;

  @ApiProperty({ enum: ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS })
  @IsIn([...ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS])
  vehicleAcquisition!: IcelandSelfDriveVehicleAcquisition;

  @ApiPropertyOptional({
    type: [String],
    enum: ICELAND_SELF_DRIVE_REGION_IDS,
    isArray: true,
  })
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

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  skipBookings?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  fillBookingsLater?: boolean;

  @ApiPropertyOptional({
    description: 'Optional server draft to consume on create',
  })
  @IsOptional()
  @IsString()
  draftId?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'If true, return tripId immediately with generationStatus=RUNNING; skeleton completes async',
  })
  @IsOptional()
  @IsBoolean()
  asyncGeneration?: boolean;
}
