/**
 * Bidirectional sync: DecisionCase writeback ↔ icelandSelfDrive.drivingSettings / constraints.
 * Pure functions — no Nest DI (safe for both modules).
 */

import {
  defaultLabelForVehicleClass,
  findVehicleClassDefaults,
} from '../../../trips/iceland-self-drive/dictionaries/iceland-self-drive-vehicle-catalog';
import type { IcelandSelfDriveVehicleClass } from '../../../trips/iceland-self-drive/dto/iceland-self-drive-enums';
import { deriveVehicleLifecycleStatus } from '../../../trips/iceland-self-drive/services/iceland-self-drive-vehicle.util';

/** Decision writeback vehicleType → driving-settings vehicleClass */
export function mapDecisionVehicleTypeToClass(
  vehicleType: string,
  fRoadCapability?: unknown,
): {
  vehicleClass: IcelandSelfDriveVehicleClass;
  is4wd: boolean;
  vehicleClassLabel: string;
} {
  const t = String(vehicleType).toUpperCase();
  if (t.includes('4') || t === 'SUV' || t === 'FOUR_BY_FOUR') {
    // LARGE capability still maps to suv_4wd (catalog has no separate large code)
    void fRoadCapability;
    return {
      vehicleClass: 'suv_4wd',
      is4wd: true,
      vehicleClassLabel: defaultLabelForVehicleClass('suv_4wd') ?? '四驱 SUV',
    };
  }
  return {
    vehicleClass: 'sedan_2wd',
    is4wd: false,
    vehicleClassLabel: defaultLabelForVehicleClass('sedan_2wd') ?? '两驱轿车',
  };
}

/** driving-settings vehicleClass → Decision constraints.vehicle_type */
export function mapVehicleClassToDecisionType(
  vehicleClass: string | null | undefined,
  is4wd?: boolean | null,
): string | undefined {
  if (!vehicleClass || vehicleClass === 'unknown') {
    if (is4wd === true) return '4WD';
    if (is4wd === false) return '2WD';
    return undefined;
  }
  if (vehicleClass === 'suv_4wd') return '4WD';
  if (vehicleClass === 'sedan_2wd' || vehicleClass === 'crossover') return '2WD';
  if (vehicleClass === 'camper') return is4wd === true ? '4WD' : '2WD';
  return is4wd === true ? '4WD' : '2WD';
}

/**
 * Apply DecisionCase option payload into icelandSelfDrive.drivingSettings (deep merge).
 */
export function mirrorDecisionWritebackIntoDrivingSettings(input: {
  icelandSelfDrive: Record<string, unknown> | null | undefined;
  writebackTargets: string[];
  payload: Record<string, unknown>;
}): Record<string, unknown> | null {
  const isd = {
    ...((input.icelandSelfDrive && typeof input.icelandSelfDrive === 'object'
      ? input.icelandSelfDrive
      : {}) as Record<string, unknown>),
  };
  const driving =
    isd.drivingSettings &&
    typeof isd.drivingSettings === 'object' &&
    !Array.isArray(isd.drivingSettings)
      ? { ...(isd.drivingSettings as Record<string, unknown>) }
      : {};

  let touched = false;

  if (input.writebackTargets.includes('VEHICLE')) {
    const vehicle = {
      ...((driving.vehicle &&
      typeof driving.vehicle === 'object' &&
      !Array.isArray(driving.vehicle)
        ? driving.vehicle
        : {}) as Record<string, unknown>),
    };
    if (typeof input.payload.vehicleType === 'string') {
      const mapped = mapDecisionVehicleTypeToClass(
        input.payload.vehicleType,
        input.payload.fRoadCapability,
      );
      vehicle.vehicleClass = mapped.vehicleClass;
      vehicle.is4wd = mapped.is4wd;
      vehicle.vehicleClassLabel = mapped.vehicleClassLabel;
      const defaults = findVehicleClassDefaults(mapped.vehicleClass);
      if (vehicle.fuelType == null && defaults?.defaultFuelType) {
        vehicle.fuelType = defaults.defaultFuelType;
      }
      if (vehicle.isHighBody == null && defaults?.defaultIsHighBody != null) {
        vehicle.isHighBody = defaults.defaultIsHighBody;
      }
      touched = true;
    }
    if (input.payload.fRoadAllowed === false) {
      const restrictions = Array.isArray(vehicle.rentalRestrictions)
        ? [...(vehicle.rentalRestrictions as string[])]
        : [];
      if (!restrictions.includes('no_f_road')) restrictions.push('no_f_road');
      vehicle.rentalRestrictions = restrictions;
      touched = true;
    } else if (
      input.payload.fRoadAllowed === true ||
      input.payload.fRoadAllowed === 'PARTIAL'
    ) {
      const restrictions = Array.isArray(vehicle.rentalRestrictions)
        ? (vehicle.rentalRestrictions as string[]).filter((r) => r !== 'no_f_road')
        : [];
      vehicle.rentalRestrictions = restrictions;
      touched = true;
    }
    if (touched) {
      vehicle.lifecycleStatus = deriveVehicleLifecycleStatus({
        vehicleClass: (vehicle.vehicleClass as IcelandSelfDriveVehicleClass) ?? null,
        rentalCompanyId:
          typeof vehicle.rentalCompanyId === 'string' ? vehicle.rentalCompanyId : null,
        pickupAt: typeof vehicle.pickupAt === 'string' ? vehicle.pickupAt : null,
        source: (vehicle.source as 'manual' | 'order_ocr' | 'contract_ocr') ?? 'manual',
      });
      vehicle.source = vehicle.source ?? 'manual';
      driving.vehicle = vehicle;
    }
  }

  if (input.writebackTargets.includes('INSURANCE')) {
    const insurance = {
      ...((driving.insurance &&
      typeof driving.insurance === 'object' &&
      !Array.isArray(driving.insurance)
        ? driving.insurance
        : {}) as Record<string, unknown>),
    };
    if (typeof input.payload.coverageTier === 'string') {
      const tier = String(input.payload.coverageTier).toUpperCase();
      const preferred = Array.isArray(insurance.preferredUpgradeCodes)
        ? [...(insurance.preferredUpgradeCodes as string[])]
        : [];
      const code = `tier_${tier.toLowerCase()}`;
      if (!preferred.includes(code)) preferred.push(code);
      insurance.preferredUpgradeCodes = preferred;
      insurance.configured = true;
      const ack = Array.isArray(insurance.userAcknowledgedCodes)
        ? [...(insurance.userAcknowledgedCodes as string[])]
        : [];
      if (input.payload.fordingExcluded === true && !ack.includes('fording_excluded')) {
        ack.push('fording_excluded');
      }
      insurance.userAcknowledgedCodes = ack;
      touched = true;
      driving.insurance = insurance;
    }
  }

  if (input.writebackTargets.includes('ROUTE')) {
    const routePreference = {
      ...((driving.routePreference &&
      typeof driving.routePreference === 'object' &&
      !Array.isArray(driving.routePreference)
        ? driving.routePreference
        : {}) as Record<string, unknown>),
    };
    if (input.payload.keepFRoad === false || input.payload.fRoadAllowed === false) {
      routePreference.fRoadPreference = 'avoid';
      touched = true;
      driving.routePreference = routePreference;
    } else if (
      input.payload.keepFRoad === true ||
      input.payload.fRoadAllowed === true
    ) {
      routePreference.fRoadPreference = 'accept';
      touched = true;
      driving.routePreference = routePreference;
    }
  }

  if (!touched) return input.icelandSelfDrive ?? null;

  isd.drivingSettings = driving;
  if (!isd.productLine) isd.productLine = 'iceland_self_drive';
  return isd;
}

/**
 * Mirror drivingSettings vehicle / insurance / routePreference → metadata.constraints.
 */
export function mirrorDrivingSettingsIntoConstraints(input: {
  constraints: Record<string, unknown>;
  drivingSettings: Record<string, unknown> | null | undefined;
}): Record<string, unknown> {
  const constraints = { ...input.constraints };
  const ds = input.drivingSettings;
  if (!ds || typeof ds !== 'object') return constraints;

  const vehicle =
    ds.vehicle && typeof ds.vehicle === 'object' && !Array.isArray(ds.vehicle)
      ? (ds.vehicle as Record<string, unknown>)
      : null;
  if (vehicle) {
    const mapped = mapVehicleClassToDecisionType(
      typeof vehicle.vehicleClass === 'string' ? vehicle.vehicleClass : null,
      typeof vehicle.is4wd === 'boolean' ? vehicle.is4wd : null,
    );
    if (mapped) {
      constraints.vehicle_type = mapped;
      constraints.vehicleType = mapped;
    }
    const restrictions = Array.isArray(vehicle.rentalRestrictions)
      ? (vehicle.rentalRestrictions as string[])
      : [];
    if (restrictions.includes('no_f_road')) {
      constraints.fRoadAllowed = false;
      constraints.excludeFRoad = true;
    } else if (mapped === '4WD') {
      constraints.fRoadAllowed = true;
      if (constraints.excludeFRoad === true) delete constraints.excludeFRoad;
    }
  }

  const insurance =
    ds.insurance && typeof ds.insurance === 'object' && !Array.isArray(ds.insurance)
      ? (ds.insurance as Record<string, unknown>)
      : null;
  if (insurance?.configured === true) {
    constraints.coverage_confirmed = true;
    const preferred = Array.isArray(insurance.preferredUpgradeCodes)
      ? (insurance.preferredUpgradeCodes as string[])
      : [];
    const tierCode = preferred.find((c) => c.startsWith('tier_'));
    if (tierCode) {
      const tier = tierCode.replace(/^tier_/, '').toUpperCase();
      constraints.insurance_coverage_tier = tier;
      constraints.insuranceCoverageTier = tier;
    }
    const ack = Array.isArray(insurance.userAcknowledgedCodes)
      ? (insurance.userAcknowledgedCodes as string[])
      : [];
    if (ack.includes('fording_excluded')) {
      constraints.insurance_fording_excluded = true;
    }
  }

  const route =
    ds.routePreference &&
    typeof ds.routePreference === 'object' &&
    !Array.isArray(ds.routePreference)
      ? (ds.routePreference as Record<string, unknown>)
      : null;
  if (route) {
    const fPref = String(route.fRoadPreference ?? '');
    if (fPref === 'avoid') {
      constraints.fRoadAllowed = false;
      constraints.excludeFRoad = true;
    } else if (fPref === 'accept' || fPref === 'prefer') {
      constraints.fRoadAllowed = true;
      if (constraints.excludeFRoad === true) delete constraints.excludeFRoad;
    }
    if (
      typeof route.dailyDrivingLimitHours === 'number' &&
      Number.isFinite(route.dailyDrivingLimitHours)
    ) {
      constraints.maxDailyDriveHours = route.dailyDrivingLimitHours;
    }
  }

  return constraints;
}
