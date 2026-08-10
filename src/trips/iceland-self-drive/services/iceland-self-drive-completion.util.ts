import type {
  IcelandSelfDriveCompletion,
  IcelandSelfDriveDrivingSettingsState,
  IcelandSelfDriveSettingsSummaryItem,
  IcelandSelfDriveTripMetadata,
  IcelandSelfDriveWizardInput,
} from '../types/iceland-self-drive.types';
import { normalizeVehicleSettings } from './iceland-self-drive-vehicle.util';
import {
  normalizeDriversSettings,
  normalizeFuelSettings,
  normalizeInsuranceSettings,
  normalizeRoutePreferenceSettings,
} from './iceland-self-drive-driving-settings-extend.util';
import {
  applyUserDrivingDefaults,
  type UserDrivingDefaultsProjection,
} from './iceland-self-drive-user-defaults-projection.util';

export function buildInitialDrivingSettings(
  vehicleAcquisition: IcelandSelfDriveWizardInput['vehicleAcquisition'],
  userDefaults?: UserDrivingDefaultsProjection | null,
): IcelandSelfDriveDrivingSettingsState {
  const base: IcelandSelfDriveDrivingSettingsState = {
    vehicle: normalizeVehicleSettings(
      {
        acquisition: vehicleAcquisition,
        vehicleClass: null,
        is4wd: null,
        rentalRestrictions: [],
        source: 'manual',
        lifecycleStatus: 'not_rented',
      },
      vehicleAcquisition,
    ),
    drivers: normalizeDriversSettings({
      driverCount: null,
      experienceLevel: null,
      dailyDrivingLimitHours: null,
      arrivalDayDriving: null,
      candidates: [],
    }),
    members: {
      hasChildren: false,
      hasElderly: false,
      motionSickness: false,
    },
    routePreference: normalizeRoutePreferenceSettings({
      pacePreference: 'balanced',
      gravelTolerance: 'moderate',
      allowNightDriving: false,
      nightDrivingPreference: 'avoid',
      restFrequency: 'normal',
      useSystemRest: true,
      fRoadPreference: 'avoid',
      waterCrossingPreference: 'avoid',
      highWindPreference: 'avoid',
    }),
    fuel: normalizeFuelSettings({ configured: false }),
    insurance: normalizeInsuranceSettings({ configured: false }),
  };
  return applyUserDrivingDefaults(base, userDefaults);
}

export function normalizeDrivingSettingsState(
  raw: unknown,
  fallbackAcquisition: IcelandSelfDriveWizardInput['vehicleAcquisition'] = 'undecided',
): IcelandSelfDriveDrivingSettingsState {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, any>)
      : {};
  const vehicle = normalizeVehicleSettings(o.vehicle, fallbackAcquisition);
  return {
    vehicle,
    drivers: normalizeDriversSettings(o.drivers),
    members: {
      hasChildren: o.members?.hasChildren === true,
      hasElderly: o.members?.hasElderly === true,
      motionSickness: o.members?.motionSickness === true,
    },
    routePreference: normalizeRoutePreferenceSettings(o.routePreference),
    fuel: normalizeFuelSettings(o.fuel, vehicle.fuelType),
    insurance: normalizeInsuranceSettings(o.insurance),
  };
}

export function computeCompletion(
  meta: Pick<
    IcelandSelfDriveTripMetadata,
    'wizard' | 'drivingSettings' | 'routeSkeleton'
  >,
): IcelandSelfDriveCompletion {
  const doneItems: IcelandSelfDriveCompletion['doneItems'] = [];
  const pendingItems: IcelandSelfDriveCompletion['pendingItems'] = [];

  doneItems.push({ code: 'check_date_range', label: '检查基础时间范围' });

  if (meta.routeSkeleton?.days?.length) {
    doneItems.push({ code: 'route_skeleton', label: '建立路线骨架' });
  }

  const bookings = meta.wizard.bookings ?? [];
  if (bookings.length > 0 || meta.wizard.skipBookings) {
    doneItems.push({
      code: 'fix_bookings',
      label: bookings.length > 0 ? '固定已预订住宿' : '确认暂无预订',
    });
  }

  const settings = normalizeDrivingSettingsState(
    meta.drivingSettings,
    meta.wizard.vehicleAcquisition,
  );
  const vehicle = settings.vehicle;
  if (
    vehicle.lifecycleStatus !== 'model_confirmed' &&
    (vehicle.vehicleClass == null || vehicle.vehicleClass === 'unknown')
  ) {
    pendingItems.push({
      code: 'confirm_vehicle_class',
      label: '确认车辆级别',
      settingsItem: 'vehicle',
    });
  }

  const drivers = settings.drivers;
  const selected = drivers.candidates.filter((c) => c.isSelected);
  if (drivers.driverCount == null && selected.length === 0) {
    pendingItems.push({
      code: 'set_driver_count',
      label: '设置驾驶人数',
      settingsItem: 'drivers',
    });
  }

  if (
    drivers.dailyDrivingLimitHours == null &&
    settings.routePreference.dailyDrivingLimitHours == null
  ) {
    pendingItems.push({
      code: 'confirm_daily_drive_limit',
      label: '确认每日驾驶上限',
      settingsItem: 'drivers',
    });
  }

  const total = doneItems.length + pendingItems.length;
  const progress =
    total === 0 ? 0 : Number((doneItems.length / total).toFixed(2));

  return {
    progress,
    headline: '你已完成基础信息录入',
    subheadline:
      pendingItems.length > 0
        ? '还需要关键的自驾信息以完成路线确认'
        : '自驾关键信息已齐全，可以进入规划空间',
    doneItems,
    pendingItems,
  };
}

export function computeDrivingSettingsSummary(
  settings: IcelandSelfDriveDrivingSettingsState,
): IcelandSelfDriveSettingsSummaryItem[] {
  const normalized = normalizeDrivingSettingsState(settings);
  const vehicle = normalized.vehicle;
  const vehiclePending =
    vehicle.lifecycleStatus === 'model_confirmed' ||
    (vehicle.vehicleClass != null && vehicle.vehicleClass !== 'unknown')
      ? 0
      : 1;

  const selected = normalized.drivers.candidates.filter((c) => c.isSelected);
  const hasMain = selected.some((c) => c.role === 'main');
  const experienceMissing = selected.some(
    (c) => c.snowExperience == null || c.gravelExperience == null,
  );

  let driversStatus: IcelandSelfDriveSettingsSummaryItem['status'] = 'completed';
  let driversPending: number | null = 0;

  if (selected.length === 0 && normalized.drivers.driverCount == null) {
    driversStatus = 'needs_confirm';
    driversPending = null;
  } else if (selected.length > 0 && !hasMain) {
    driversStatus = 'needs_confirm';
    driversPending = null;
  } else if (
    experienceMissing ||
    normalized.drivers.dailyDrivingLimitHours == null
  ) {
    driversStatus = 'pending';
    driversPending =
      (experienceMissing ? 1 : 0) +
      (normalized.drivers.dailyDrivingLimitHours == null ? 1 : 0);
  }

  const routeNeedsConfirm =
    normalized.routePreference.fRoadPreference === 'avoid' &&
    normalized.vehicle.rentalRestrictions.includes('no_f_road') === false &&
    (normalized.vehicle.vehicleClass === 'sedan_2wd' ||
      normalized.vehicle.is4wd === false);

  const fuelStatus = normalized.fuel.configured ? 'completed' : 'pending';
  const insuranceOverall =
    normalized.insurance.userAcknowledgedCodes.includes('wading') &&
    normalized.insurance.configured
      ? 'completed'
      : 'needs_confirm';

  return [
    {
      code: 'vehicle',
      status: vehiclePending > 0 ? 'needs_confirm' : 'completed',
      pendingCount: vehiclePending > 0 ? null : 0,
    },
    {
      code: 'drivers',
      status: driversStatus,
      pendingCount: driversPending,
    },
    {
      code: 'members',
      status: 'completed',
      pendingCount: 0,
    },
    {
      code: 'route_preference',
      status: routeNeedsConfirm ? 'needs_confirm' : 'completed',
      pendingCount: routeNeedsConfirm ? null : 0,
    },
    {
      code: 'fuel',
      status: fuelStatus,
      pendingCount: fuelStatus === 'pending' ? null : 0,
    },
    {
      code: 'insurance',
      status: insuranceOverall,
      pendingCount: insuranceOverall === 'needs_confirm' ? null : 0,
    },
  ];
}
