export const ICELAND_SELF_DRIVE_LOCATION_CODES = [
  'keflavik',
  'reykjavik',
  'akureyri',
] as const;
export type IcelandSelfDriveLocationCode =
  (typeof ICELAND_SELF_DRIVE_LOCATION_CODES)[number];

export const ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS = [
  'rent',
  'owned',
  'undecided',
] as const;
export type IcelandSelfDriveVehicleAcquisition =
  (typeof ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS)[number];

export const ICELAND_SELF_DRIVE_REGION_IDS = [
  'golden_circle',
  'south_coast',
  'snaefellsnes',
  'east_fjords',
  'north',
  'ring_road',
  'westfjords',
  'highlands',
  'reykjanes',
] as const;
export type IcelandSelfDriveRegionId =
  (typeof ICELAND_SELF_DRIVE_REGION_IDS)[number];

export const ICELAND_SELF_DRIVE_BOOKING_KINDS = ['lodging', 'activity'] as const;
export type IcelandSelfDriveBookingKind =
  (typeof ICELAND_SELF_DRIVE_BOOKING_KINDS)[number];

export const ICELAND_SELF_DRIVE_SETTINGS_ITEMS = [
  'vehicle',
  'drivers',
  'members',
  'route_preference',
  'fuel',
  'insurance',
] as const;
export type IcelandSelfDriveSettingsItem =
  (typeof ICELAND_SELF_DRIVE_SETTINGS_ITEMS)[number];

export const ICELAND_SELF_DRIVE_SETTINGS_STATUSES = [
  'needs_confirm',
  'pending',
  'completed',
] as const;
export type IcelandSelfDriveSettingsStatus =
  (typeof ICELAND_SELF_DRIVE_SETTINGS_STATUSES)[number];

export const ICELAND_SELF_DRIVE_CANCELLATION_POLICIES = [
  'free_cancellation',
  'partial_non_refundable',
  'unknown',
] as const;
export type IcelandSelfDriveCancellationPolicy =
  (typeof ICELAND_SELF_DRIVE_CANCELLATION_POLICIES)[number];

export const PRODUCT_LINE_ICELAND_SELF_DRIVE = 'iceland_self_drive' as const;

export const ICELAND_SELF_DRIVE_VEHICLE_CLASSES = [
  'sedan_2wd',
  'crossover',
  'suv_4wd',
  'camper',
  'unknown',
] as const;
export type IcelandSelfDriveVehicleClass =
  (typeof ICELAND_SELF_DRIVE_VEHICLE_CLASSES)[number];

/** 自驾设置页车辆三态 */
export const ICELAND_SELF_DRIVE_VEHICLE_LIFECYCLE_STATUSES = [
  'not_rented',
  'booked_unconfirmed',
  'model_confirmed',
] as const;
export type IcelandSelfDriveVehicleLifecycleStatus =
  (typeof ICELAND_SELF_DRIVE_VEHICLE_LIFECYCLE_STATUSES)[number];

export const ICELAND_SELF_DRIVE_FUEL_TYPES = [
  'gasoline',
  'diesel',
  'hybrid',
  'electric',
] as const;
export type IcelandSelfDriveFuelType =
  (typeof ICELAND_SELF_DRIVE_FUEL_TYPES)[number];

export const ICELAND_SELF_DRIVE_VEHICLE_SOURCES = [
  'manual',
  'order_ocr',
  'contract_ocr',
] as const;
export type IcelandSelfDriveVehicleSource =
  (typeof ICELAND_SELF_DRIVE_VEHICLE_SOURCES)[number];

export const ICELAND_SELF_DRIVE_EXPERIENCE_LEVELS = [
  'beginner',
  'intermediate',
  'experienced',
] as const;
export type IcelandSelfDriveExperienceLevel =
  (typeof ICELAND_SELF_DRIVE_EXPERIENCE_LEVELS)[number];

export const ICELAND_SELF_DRIVE_GRAVEL_TOLERANCES = [
  'low',
  'moderate',
  'high',
] as const;
export type IcelandSelfDriveGravelTolerance =
  (typeof ICELAND_SELF_DRIVE_GRAVEL_TOLERANCES)[number];

export const ICELAND_SELF_DRIVE_REST_FREQUENCIES = [
  'frequent',
  'normal',
  'minimal',
] as const;
export type IcelandSelfDriveRestFrequency =
  (typeof ICELAND_SELF_DRIVE_REST_FREQUENCIES)[number];

export const ICELAND_SELF_DRIVE_RENTAL_RESTRICTIONS = [
  'no_f_road',
  'no_highland',
  'no_gravel',
  'no_wading',
] as const;
export type IcelandSelfDriveRentalRestriction =
  (typeof ICELAND_SELF_DRIVE_RENTAL_RESTRICTIONS)[number];

/** 落地日驾驶 */
export const ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING = [
  'reject',
  'short_only',
  'normal',
] as const;
export type IcelandSelfDriveArrivalDayDriving =
  (typeof ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING)[number];

export const ICELAND_SELF_DRIVE_DRIVER_ROLES = [
  'main',
  'additional',
  'none',
] as const;
export type IcelandSelfDriveDriverRole =
  (typeof ICELAND_SELF_DRIVE_DRIVER_ROLES)[number];

export const ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE = [
  'familiar',
  'average',
  'limited',
] as const;
export type IcelandSelfDriveSurfaceExperience =
  (typeof ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE)[number];

export const ICELAND_SELF_DRIVE_NIGHT_ACCEPTANCE = [
  'reject',
  'avoid',
  'accept',
] as const;
export type IcelandSelfDriveNightAcceptance =
  (typeof ICELAND_SELF_DRIVE_NIGHT_ACCEPTANCE)[number];

export const ICELAND_SELF_DRIVE_PACE_PREFERENCES = [
  'safe',
  'balanced',
  'experience',
] as const;
export type IcelandSelfDrivePacePreference =
  (typeof ICELAND_SELF_DRIVE_PACE_PREFERENCES)[number];

export const ICELAND_SELF_DRIVE_NIGHT_DRIVING_PREFERENCES = [
  'reject',
  'avoid',
  'conditional',
  'accept',
] as const;
export type IcelandSelfDriveNightDrivingPreference =
  (typeof ICELAND_SELF_DRIVE_NIGHT_DRIVING_PREFERENCES)[number];

export const ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES = [
  'avoid',
  'conditional',
  'accept',
  'prefer',
] as const;
export type IcelandSelfDriveRoadHazardPreference =
  (typeof ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES)[number];

export const ICELAND_SELF_DRIVE_REFUEL_STRATEGIES = [
  'early',
  'balanced',
  'minimal',
] as const;
export type IcelandSelfDriveRefuelStrategy =
  (typeof ICELAND_SELF_DRIVE_REFUEL_STRATEGIES)[number];

export const ICELAND_SELF_DRIVE_INSURANCE_COVERAGE_STATUSES = [
  'covered',
  'gap',
  'excluded',
  'partial',
  'unknown',
] as const;
export type IcelandSelfDriveInsuranceCoverageStatus =
  (typeof ICELAND_SELF_DRIVE_INSURANCE_COVERAGE_STATUSES)[number];

export const ICELAND_SELF_DRIVE_INSURANCE_OVERALL_STATUSES = [
  'ok',
  'needs_confirm',
  'blocked',
] as const;
export type IcelandSelfDriveInsuranceOverallStatus =
  (typeof ICELAND_SELF_DRIVE_INSURANCE_OVERALL_STATUSES)[number];
