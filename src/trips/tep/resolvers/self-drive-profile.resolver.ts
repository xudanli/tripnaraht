/**
 * SelfDriveProfile — 三入口归一（Guide / Exploration / Trip metadata）
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md 附录 D
 */

import type { GuideTravelContext } from '../../../guide-to-plan/types/guide-to-plan.types';
import type { ExplorationInput } from '../../exploration/types/exploration.types';
import { readExplorationArchiveFromTripMetadata } from '../../exploration/utils/exploration-archive.util';
import type {
  DriverProfile,
  DrivingPolicy,
  RentalRestriction,
  SelfDriveProfile,
  VehicleProfile,
  VehicleSource,
} from '../contracts/tep-self-drive.types';
import { readMaxDailyDriveMinutesFromMetadata } from '../utils/tep-constraint-profile-sync.util';

export interface SelfDriveProfileResolverInput {
  tripId?: string;
  explorationInput?: ExplorationInput;
  guideTravelContext?: GuideTravelContext;
  tripPacingConfig?: unknown;
  tripMetadata?: unknown;
  destinationCountry: string;
}

type TepVehicleType = VehicleProfile['vehicleType'];
type ExperienceLevel = DriverProfile['experienceLevel'];

interface PackSelfDriveDefaults {
  vehicleType: TepVehicleType;
  nightDrivingAllowed: boolean;
  rentalRestrictions: RentalRestriction[];
}

const IS_PACK_DEFAULTS: PackSelfDriveDefaults = {
  vehicleType: '2WD',
  nightDrivingAllowed: false,
  rentalRestrictions: [
    {
      code: 'NO_F_ROAD',
      description: '标准租车合同禁止驶入 F-road（高地路）',
      source: 'PACK_DEFAULT',
    },
    {
      code: 'GRAVEL_ROAD_LIMITED',
      description: '碎石路行驶受合同里程/险种限制',
      source: 'PACK_DEFAULT',
    },
  ],
};

const PACK_DEFAULTS_BY_COUNTRY: Record<string, PackSelfDriveDefaults> = {
  IS: IS_PACK_DEFAULTS,
};

const FALLBACK_PACK_DEFAULTS: PackSelfDriveDefaults = {
  vehicleType: '2WD',
  nightDrivingAllowed: true,
  rentalRestrictions: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeGuideVehicleType(raw?: string): TepVehicleType | null {
  const vt = raw?.trim().toLowerCase();
  if (!vt) return null;
  if (vt === '4x4' || vt === '4wd' || vt === 'four_by_four') return '4WD';
  if (vt === '2wd' || vt === 'sedan') return '2WD';
  if (vt === 'suv') return '4WD';
  if (vt === 'campervan' || vt === 'camper') return 'CAMPERVAN';
  if (vt === 'awd') return 'AWD';
  return null;
}

function normalizeExplorationVehicleType(raw?: string): TepVehicleType | null {
  const v = String(raw ?? '').toUpperCase();
  if (!v) return null;
  if (v.includes('4WD') || v.includes('AWD') || v.includes('4X4')) return '4WD';
  if (v.includes('CAMPER')) return 'CAMPERVAN';
  if (v.includes('2WD')) return '2WD';
  return null;
}

function normalizeTripMetadataVehicleType(metadata: Record<string, unknown>): TepVehicleType | null {
  const constraints = asRecord(metadata.constraints);
  const fromConstraints = constraints?.vehicle_type ?? constraints?.vehicleType;
  const direct = metadata.vehicle_type ?? metadata.vehicleType;
  const raw = fromConstraints ?? direct;
  if (raw == null) return null;

  const normalized = String(raw).toUpperCase();
  if (normalized === '4WD' || normalized === 'AWD' || normalized === '4X4') return '4WD';
  if (normalized === 'CAMPERVAN' || normalized === 'CAMPER') return 'CAMPERVAN';
  if (normalized === '2WD') return '2WD';
  return null;
}

function resolveVehicle(input: SelfDriveProfileResolverInput): VehicleProfile {
  const guideType = normalizeGuideVehicleType(input.guideTravelContext?.vehicleType);
  if (guideType) {
    return { vehicleType: guideType, vehicleSource: 'GUIDE' };
  }

  const explorationType = normalizeExplorationVehicleType(
    input.explorationInput?.mobilityContext?.vehicleType,
  );
  if (explorationType) {
    return { vehicleType: explorationType, vehicleSource: 'EXPLORATION' };
  }

  const metadata = asRecord(input.tripMetadata);
  if (metadata) {
    const tripType = normalizeTripMetadataVehicleType(metadata);
    if (tripType) {
      const declared =
        metadata.vehicleDeclaredByUser === true ||
        metadata.vehicleSource === 'USER_DECLARED';
      return {
        vehicleType: tripType,
        vehicleSource: declared ? 'USER_DECLARED' : 'TRIP_METADATA',
      };
    }
  }

  const country = input.destinationCountry.toUpperCase();
  const vehicleType =
    (PACK_DEFAULTS_BY_COUNTRY[country] ?? FALLBACK_PACK_DEFAULTS).vehicleType;
  return { vehicleType, vehicleSource: 'PACK_DEFAULT' };
}

function hasNoNightDrivingPrinciple(input: SelfDriveProfileResolverInput): boolean {
  const metadata = asRecord(input.tripMetadata);
  if (metadata) {
    const archive = readExplorationArchiveFromTripMetadata(metadata);
    if (archive?.principles?.includes('NO_NIGHT_DRIVING')) return true;

    const contract = asRecord(metadata.travelDecisionContract);
    const hints = contract?.constraintHints;
    if (
      Array.isArray(hints) &&
      hints.some(
        (hint) =>
          asRecord(hint)?.templateId === 'no_night_drive' ||
          asRecord(asRecord(hint)?.paramPatch)?.enabled === true,
      )
    ) {
      return true;
    }

    const constraints = asRecord(metadata.constraints);
    const noNight = asRecord(constraints?.noNightDrive);
    if (noNight?.enabled === true || noNight?.status === 'ACTIVE') return true;
  }

  const pacing = asRecord(input.tripPacingConfig);
  if (pacing?.noNightDriving === true || pacing?.avoidNightDriving === true) return true;

  return false;
}

function readMaxMinutesAfterSunset(input: SelfDriveProfileResolverInput): number | undefined {
  const metadata = asRecord(input.tripMetadata);
  const constraints = metadata ? asRecord(metadata.constraints) : null;
  const noNight = constraints ? asRecord(constraints.noNightDrive) : null;
  const raw = noNight?.maxMinutesAfterSunset;
  if (typeof raw === 'number' && raw >= 0) return raw;
  if (hasNoNightDrivingPrinciple(input)) return 30;
  return undefined;
}

function resolveDrivingPolicy(
  input: SelfDriveProfileResolverInput,
  packDefaults: PackSelfDriveDefaults,
): DrivingPolicy {
  const avoidNight = hasNoNightDrivingPrinciple(input);
  const nightDrivingAllowed = avoidNight ? false : packDefaults.nightDrivingAllowed;

  return {
    nightDrivingAllowed,
    nightDrivingPreference: avoidNight
      ? 'AVOID'
      : nightDrivingAllowed
        ? 'ALLOW_WITH_CAUTION'
        : 'AVOID',
    maxDailyDriveMinutes: readMaxDailyDriveMinutes(input),
    maxConsecutiveHighLoadDays: readMaxConsecutiveHighLoadDays(input),
    maxMinutesAfterSunset: readMaxMinutesAfterSunset(input),
  };
}

function readMaxDailyDriveMinutes(input: SelfDriveProfileResolverInput): number | undefined {
  const pacing = asRecord(input.tripPacingConfig);
  const fromPacing = pacing?.maxDailyDriveMinutes ?? pacing?.max_daily_drive_minutes;
  if (typeof fromPacing === 'number' && fromPacing > 0) return fromPacing;

  const fromMeta = readMaxDailyDriveMinutesFromMetadata(input.tripMetadata);
  if (fromMeta != null) return fromMeta;

  return undefined;
}

function readMaxConsecutiveHighLoadDays(input: SelfDriveProfileResolverInput): number | undefined {
  const pacing = asRecord(input.tripPacingConfig);
  const fromPacing = pacing?.maxConsecutiveHighLoadDays;
  if (typeof fromPacing === 'number' && fromPacing > 0) return fromPacing;
  return undefined;
}

function resolveExperienceLevel(metadata: Record<string, unknown> | null): ExperienceLevel {
  if (!metadata) return 'NOVICE_ABROAD';

  const direct = metadata.driverExperienceLevel ?? metadata.experienceLevel;
  if (typeof direct === 'string') {
    const level = direct.toUpperCase();
    if (level === 'EXPERIENCED') return 'EXPERIENCED';
    if (level === 'INTERMEDIATE') return 'INTERMEDIATE';
    if (level === 'NOVICE_ABROAD' || level === 'NOVICE') return 'NOVICE_ABROAD';
  }

  const driver = asRecord(metadata.driverProfile);
  const nested = driver?.experienceLevel;
  if (typeof nested === 'string') {
    const level = nested.toUpperCase();
    if (level === 'EXPERIENCED') return 'EXPERIENCED';
    if (level === 'INTERMEDIATE') return 'INTERMEDIATE';
  }

  return 'NOVICE_ABROAD';
}

function readUserDeclaredRentalRestrictions(
  metadata: Record<string, unknown> | null,
): RentalRestriction[] | undefined {
  if (!metadata) return undefined;

  const direct = metadata.rentalRestrictions ?? metadata.rental_restrictions;
  if (!Array.isArray(direct)) return undefined;

  const parsed = direct
    .map((entry): RentalRestriction | null => {
      const row = asRecord(entry);
      if (!row?.code || typeof row.code !== 'string') return null;
      return {
        code: row.code,
        description: String(row.description ?? row.code),
        source: 'USER_DECLARED',
      };
    })
    .filter((row): row is RentalRestriction => row !== null);

  return parsed.length > 0 ? parsed : undefined;
}

function resolveRentalRestrictions(
  metadata: Record<string, unknown> | null,
  packDefaults: PackSelfDriveDefaults,
): RentalRestriction[] | undefined {
  const userDeclared = readUserDeclaredRentalRestrictions(metadata);
  if (userDeclared?.length) return userDeclared;
  if (packDefaults.rentalRestrictions.length > 0) return packDefaults.rentalRestrictions;
  return undefined;
}

function resolvePackDefaults(destinationCountry: string): PackSelfDriveDefaults {
  return PACK_DEFAULTS_BY_COUNTRY[destinationCountry.toUpperCase()] ?? FALLBACK_PACK_DEFAULTS;
}

/** 归一 Guide / Exploration / Trip 三入口为 TEP SelfDriveProfile */
export function resolveSelfDriveProfile(input: SelfDriveProfileResolverInput): SelfDriveProfile {
  const packDefaults = resolvePackDefaults(input.destinationCountry);
  const metadata = asRecord(input.tripMetadata);
  const vehicle = resolveVehicle(input);
  const driverId = input.tripId ?? 'primary';

  return {
    vehicle,
    drivers: [
      {
        driverId,
        experienceLevel: resolveExperienceLevel(metadata),
        maxContinuousDriveMinutes: readMaxContinuousDriveMinutes(metadata),
      },
    ],
    drivingPolicy: resolveDrivingPolicy(input, packDefaults),
    rentalRestrictions: resolveRentalRestrictions(metadata, packDefaults),
  };
}

function readMaxContinuousDriveMinutes(
  metadata: Record<string, unknown> | null,
): number | undefined {
  if (!metadata) return undefined;
  const driver = asRecord(metadata.driverProfile);
  const value = driver?.maxContinuousDriveMinutes ?? metadata.maxContinuousDriveMinutes;
  return typeof value === 'number' && value > 0 ? value : undefined;
}
