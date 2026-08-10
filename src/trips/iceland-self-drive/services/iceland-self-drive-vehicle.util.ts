import {
  ICELAND_SELF_DRIVE_FUEL_TYPES,
  ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS,
  ICELAND_SELF_DRIVE_VEHICLE_CLASSES,
  ICELAND_SELF_DRIVE_VEHICLE_SOURCES,
  type IcelandSelfDriveVehicleAcquisition,
  type IcelandSelfDriveVehicleLifecycleStatus,
} from '../dto/iceland-self-drive-enums';
import type {
  IcelandSelfDriveVehicleRecognitionSummary,
  IcelandSelfDriveVehicleSettings,
} from '../types/iceland-self-drive.types';
import { defaultLabelForVehicleClass } from '../dictionaries/iceland-self-drive-vehicle-catalog';

function isIn<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export function deriveVehicleLifecycleStatus(
  vehicle: Pick<
    IcelandSelfDriveVehicleSettings,
    'vehicleClass' | 'rentalCompanyId' | 'pickupAt' | 'source'
  >,
): IcelandSelfDriveVehicleLifecycleStatus {
  if (
    vehicle.vehicleClass != null &&
    vehicle.vehicleClass !== 'unknown'
  ) {
    return 'model_confirmed';
  }
  if (
    (vehicle.rentalCompanyId != null && vehicle.rentalCompanyId.length > 0) ||
    (vehicle.pickupAt != null && vehicle.pickupAt.length > 0) ||
    vehicle.source === 'order_ocr' ||
    vehicle.source === 'contract_ocr'
  ) {
    return 'booked_unconfirmed';
  }
  return 'not_rented';
}

export function normalizeRecognitionSummary(
  raw: unknown,
): IcelandSelfDriveVehicleRecognitionSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const fields = Array.isArray(obj.fields)
    ? obj.fields.filter((f): f is string => typeof f === 'string')
    : [];
  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  if (fields.length === 0 && warnings.length === 0) return null;
  return { fields, warnings };
}

/**
 * 兼容旧 metadata（仅 acquisition/vehicleClass/is4wd/rentalRestrictions）。
 */
export function normalizeVehicleSettings(
  raw: unknown,
  fallbackAcquisition: IcelandSelfDriveVehicleAcquisition = 'undecided',
): IcelandSelfDriveVehicleSettings {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const acquisition = isIn(obj.acquisition, ICELAND_SELF_DRIVE_VEHICLE_ACQUISITIONS)
    ? obj.acquisition
    : fallbackAcquisition;

  const vehicleClass =
    obj.vehicleClass === null
      ? null
      : isIn(obj.vehicleClass, ICELAND_SELF_DRIVE_VEHICLE_CLASSES)
        ? obj.vehicleClass
        : null;

  const fuelType =
    obj.fuelType === null
      ? null
      : isIn(obj.fuelType, ICELAND_SELF_DRIVE_FUEL_TYPES)
        ? obj.fuelType
        : null;

  const source = isIn(obj.source, ICELAND_SELF_DRIVE_VEHICLE_SOURCES)
    ? obj.source
    : 'manual';

  const rentalCompanyId =
    typeof obj.rentalCompanyId === 'string'
      ? obj.rentalCompanyId
      : obj.rentalCompanyId === null
        ? null
        : null;

  const rentalCompanyName =
    typeof obj.rentalCompanyName === 'string' ? obj.rentalCompanyName : null;

  const vehicleClassLabel =
    typeof obj.vehicleClassLabel === 'string'
      ? obj.vehicleClassLabel
      : vehicleClass
        ? defaultLabelForVehicleClass(vehicleClass)
        : null;

  const is4wd =
    typeof obj.is4wd === 'boolean' ? obj.is4wd : obj.is4wd === null ? null : null;
  const isHighBody =
    typeof obj.isHighBody === 'boolean'
      ? obj.isHighBody
      : obj.isHighBody === null
        ? null
        : null;
  const estimatedRangeKm =
    typeof obj.estimatedRangeKm === 'number' && Number.isFinite(obj.estimatedRangeKm)
      ? Math.max(0, Math.min(2000, Math.round(obj.estimatedRangeKm)))
      : null;
  const pickupAt = typeof obj.pickupAt === 'string' ? obj.pickupAt : null;

  const rentalRestrictions = Array.isArray(obj.rentalRestrictions)
    ? obj.rentalRestrictions.filter((r): r is string => typeof r === 'string')
    : [];

  const recognitionSummary = normalizeRecognitionSummary(obj.recognitionSummary);

  const base: IcelandSelfDriveVehicleSettings = {
    lifecycleStatus: 'not_rented',
    acquisition,
    rentalCompanyId,
    rentalCompanyName,
    vehicleClass,
    vehicleClassLabel,
    is4wd,
    fuelType,
    isHighBody,
    estimatedRangeKm,
    pickupAt,
    rentalRestrictions,
    source,
    recognitionSummary,
  };

  // 读路径始终按事实推导三态，避免旧 lifecycleStatus 与 vehicleClass 脱节
  return {
    ...base,
    lifecycleStatus: deriveVehicleLifecycleStatus(base),
  };
}

/** PATCH / preview 入参：recognitionSummary 字段可缺省 */
export type IcelandSelfDriveVehicleSettingsPatch = Omit<
  Partial<IcelandSelfDriveVehicleSettings>,
  'recognitionSummary'
> & {
  recognitionSummary?: {
    fields?: string[];
    warnings?: string[];
  } | null;
};

export function applyVehiclePatch(
  current: IcelandSelfDriveVehicleSettings,
  patch: IcelandSelfDriveVehicleSettingsPatch | undefined,
): IcelandSelfDriveVehicleSettings {
  if (!patch) return current;

  const { recognitionSummary: patchSummary, ...rest } = patch;
  const merged: IcelandSelfDriveVehicleSettings = {
    ...current,
    ...rest,
    recognitionSummary:
      patchSummary === undefined
        ? current.recognitionSummary
        : patchSummary === null
          ? null
          : {
              fields: patchSummary.fields ?? [],
              warnings: patchSummary.warnings ?? [],
            },
  };

  if (
    merged.vehicleClassLabel == null &&
    merged.vehicleClass != null &&
    merged.vehicleClass !== 'unknown'
  ) {
    merged.vehicleClassLabel = defaultLabelForVehicleClass(merged.vehicleClass);
  }

  if (patch.lifecycleStatus == null) {
    merged.lifecycleStatus = deriveVehicleLifecycleStatus(merged);
  }

  return merged;
}
