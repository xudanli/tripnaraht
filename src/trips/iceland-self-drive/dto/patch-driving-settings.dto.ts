import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING,
  ICELAND_SELF_DRIVE_DRIVER_ROLES,
  ICELAND_SELF_DRIVE_EXPERIENCE_LEVELS,
  ICELAND_SELF_DRIVE_FUEL_TYPES,
  ICELAND_SELF_DRIVE_GRAVEL_TOLERANCES,
  ICELAND_SELF_DRIVE_NIGHT_ACCEPTANCE,
  ICELAND_SELF_DRIVE_NIGHT_DRIVING_PREFERENCES,
  ICELAND_SELF_DRIVE_PACE_PREFERENCES,
  ICELAND_SELF_DRIVE_REFUEL_STRATEGIES,
  ICELAND_SELF_DRIVE_RENTAL_RESTRICTIONS,
  ICELAND_SELF_DRIVE_REST_FREQUENCIES,
  ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES,
  ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE,
  ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS,
  ICELAND_SELF_DRIVE_VEHICLE_CLASSES,
  ICELAND_SELF_DRIVE_VEHICLE_LIFECYCLE_STATUSES,
  ICELAND_SELF_DRIVE_VEHICLE_SOURCES,
  type IcelandSelfDriveArrivalDayDriving,
  type IcelandSelfDriveDriverRole,
  type IcelandSelfDriveExperienceLevel,
  type IcelandSelfDriveFuelType,
  type IcelandSelfDriveGravelTolerance,
  type IcelandSelfDriveNightAcceptance,
  type IcelandSelfDriveNightDrivingPreference,
  type IcelandSelfDrivePacePreference,
  type IcelandSelfDriveRefuelStrategy,
  type IcelandSelfDriveRentalRestriction,
  type IcelandSelfDriveRestFrequency,
  type IcelandSelfDriveRoadHazardPreference,
  type IcelandSelfDriveSurfaceExperience,
  type IcelandSelfDriveVehicleAcquisition,
  type IcelandSelfDriveVehicleClass,
  type IcelandSelfDriveVehicleLifecycleStatus,
  type IcelandSelfDriveVehicleSource,
} from './iceland-self-drive-enums';

export class PatchDrivingSettingsRecognitionSummaryDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];
}

export class PatchDrivingSettingsVehicleDto {
  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_VEHICLE_LIFECYCLE_STATUSES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_VEHICLE_LIFECYCLE_STATUSES])
  lifecycleStatus?: IcelandSelfDriveVehicleLifecycleStatus;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS])
  acquisition?: IcelandSelfDriveVehicleAcquisition;

  @ApiPropertyOptional({ nullable: true, example: 'blue_car_rental' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  rentalCompanyId?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Blue Car Rental' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  rentalCompanyName?: string | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_VEHICLE_CLASSES, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_VEHICLE_CLASSES])
  vehicleClass?: IcelandSelfDriveVehicleClass | null;

  @ApiPropertyOptional({ nullable: true, example: 'Toyota RAV4 或同级' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  vehicleClassLabel?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  is4wd?: boolean | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_FUEL_TYPES, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_FUEL_TYPES])
  fuelType?: IcelandSelfDriveFuelType | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isHighBody?: boolean | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 2000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  estimatedRangeKm?: number | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-07-16T10:00:00Z' })
  @IsOptional()
  @IsISO8601()
  pickupAt?: string | null;

  @ApiPropertyOptional({
    type: [String],
    enum: ICELAND_SELF_DRIVE_RENTAL_RESTRICTIONS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...ICELAND_SELF_DRIVE_RENTAL_RESTRICTIONS], { each: true })
  rentalRestrictions?: IcelandSelfDriveRentalRestriction[];

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_VEHICLE_SOURCES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_VEHICLE_SOURCES])
  source?: IcelandSelfDriveVehicleSource;

  @ApiPropertyOptional({
    type: PatchDrivingSettingsRecognitionSummaryDto,
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsRecognitionSummaryDto)
  recognitionSummary?: PatchDrivingSettingsRecognitionSummaryDto | null;
}

export class PatchDrivingSettingsDriverCandidateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  memberId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSelected?: boolean;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_DRIVER_ROLES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_DRIVER_ROLES])
  role?: IcelandSelfDriveDriverRole;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE])
  snowExperience?: IcelandSelfDriveSurfaceExperience | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE])
  gravelExperience?: IcelandSelfDriveSurfaceExperience | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_NIGHT_ACCEPTANCE, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_NIGHT_ACCEPTANCE])
  nightAcceptance?: IcelandSelfDriveNightAcceptance | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAdditionalDriver?: boolean;
}

export class PatchDrivingSettingsDriversDto {
  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  driverCount?: number | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_EXPERIENCE_LEVELS, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_EXPERIENCE_LEVELS])
  experienceLevel?: IcelandSelfDriveExperienceLevel | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  dailyDrivingLimitHours?: number | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING])
  arrivalDayDriving?: IcelandSelfDriveArrivalDayDriving | null;

  @ApiPropertyOptional({ type: [PatchDrivingSettingsDriverCandidateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchDrivingSettingsDriverCandidateDto)
  candidates?: PatchDrivingSettingsDriverCandidateDto[];
}

export class PatchDrivingSettingsMembersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasChildren?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasElderly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  motionSickness?: boolean;
}

export class PatchDrivingSettingsRoutePreferenceDto {
  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_PACE_PREFERENCES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_PACE_PREFERENCES])
  pacePreference?: IcelandSelfDrivePacePreference;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  dailyDrivingLimitHours?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  useSystemRest?: boolean;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_REST_FREQUENCIES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_REST_FREQUENCIES])
  restFrequency?: IcelandSelfDriveRestFrequency;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING])
  arrivalDayDriving?: IcelandSelfDriveArrivalDayDriving | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_GRAVEL_TOLERANCES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_GRAVEL_TOLERANCES])
  gravelTolerance?: IcelandSelfDriveGravelTolerance;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowNightDriving?: boolean;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_NIGHT_DRIVING_PREFERENCES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_NIGHT_DRIVING_PREFERENCES])
  nightDrivingPreference?: IcelandSelfDriveNightDrivingPreference;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES])
  fRoadPreference?: IcelandSelfDriveRoadHazardPreference;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES])
  waterCrossingPreference?: IcelandSelfDriveRoadHazardPreference;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES])
  highWindPreference?: IcelandSelfDriveRoadHazardPreference;
}

export class PatchDrivingSettingsFuelDto {
  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_FUEL_TYPES, nullable: true })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_FUEL_TYPES])
  fuelType?: IcelandSelfDriveFuelType | null;

  @ApiPropertyOptional({ enum: ICELAND_SELF_DRIVE_REFUEL_STRATEGIES })
  @IsOptional()
  @IsIn([...ICELAND_SELF_DRIVE_REFUEL_STRATEGIES])
  refuelStrategy?: IcelandSelfDriveRefuelStrategy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  useDynamicSafetyMargin?: boolean;

  @ApiPropertyOptional({ nullable: true, minimum: 10, maximum: 40 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(40)
  safetyMarginPercent?: number | null;
}

export class PatchDrivingSettingsInsuranceDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userAcknowledgedCodes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredUpgradeCodes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  syncRentalRestrictions?: boolean;
}

export class PatchIcelandSelfDriveDrivingSettingsDto {
  @ApiPropertyOptional({ type: PatchDrivingSettingsVehicleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsVehicleDto)
  vehicle?: PatchDrivingSettingsVehicleDto;

  @ApiPropertyOptional({ type: PatchDrivingSettingsDriversDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsDriversDto)
  drivers?: PatchDrivingSettingsDriversDto;

  @ApiPropertyOptional({ type: PatchDrivingSettingsMembersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsMembersDto)
  members?: PatchDrivingSettingsMembersDto;

  @ApiPropertyOptional({ type: PatchDrivingSettingsRoutePreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsRoutePreferenceDto)
  routePreference?: PatchDrivingSettingsRoutePreferenceDto;

  @ApiPropertyOptional({ type: PatchDrivingSettingsFuelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsFuelDto)
  fuel?: PatchDrivingSettingsFuelDto;

  @ApiPropertyOptional({ type: PatchDrivingSettingsInsuranceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsInsuranceDto)
  insurance?: PatchDrivingSettingsInsuranceDto;

  @ApiPropertyOptional({ description: 'true 时落库后触发路线重评' })
  @IsOptional()
  @IsBoolean()
  reevaluate?: boolean;
}

/** POST .../preview-impact：可传多块草稿 */
export class PreviewDrivingSettingsImpactDto {
  @ApiPropertyOptional({ type: PatchDrivingSettingsVehicleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsVehicleDto)
  vehicle?: PatchDrivingSettingsVehicleDto;

  @ApiPropertyOptional({ type: PatchDrivingSettingsRoutePreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsRoutePreferenceDto)
  routePreference?: PatchDrivingSettingsRoutePreferenceDto;

  @ApiPropertyOptional({ type: PatchDrivingSettingsInsuranceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsInsuranceDto)
  insurance?: PatchDrivingSettingsInsuranceDto;

  @ApiPropertyOptional({ type: PatchDrivingSettingsFuelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchDrivingSettingsFuelDto)
  fuel?: PatchDrivingSettingsFuelDto;
}

/** @deprecated alias — 保留车辆专用路径 */
export class PreviewVehicleImpactDto extends PreviewDrivingSettingsImpactDto {}

export class ReevaluateDrivingSettingsDto {
  @ApiPropertyOptional({ example: 'insurance_constraints' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: 'insurance_settings' })
  @IsOptional()
  @IsString()
  source?: string;
}
