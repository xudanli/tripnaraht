import type {
  IcelandSelfDriveSettingsItem,
  IcelandSelfDriveSettingsStatus,
} from '../dto/iceland-self-drive-enums';
import type {
  IcelandSelfDriveDrivingSettingsState,
  IcelandSelfDriveRouteSkeleton,
} from '../types/iceland-self-drive.types';
import {
  computeDrivingSettingsSummary,
  normalizeDrivingSettingsState,
} from './iceland-self-drive-completion.util';
import {
  applyRentalRestrictionOverrides,
  deriveDriverCountFromCandidates,
  mergeDriverCandidates,
  normalizeDriverCandidate,
  normalizeDriversSettings,
  normalizeFuelSettings,
  normalizeInsuranceSettings,
  normalizeRoutePreferenceSettings,
  stricterArrivalDayDriving,
} from './iceland-self-drive-driving-settings-extend.util';
import {
  buildDriversPayload,
  buildFuelPayload,
  buildInsurancePayload,
  buildRoutePreferencePayload,
  type TripMemberProfile,
} from './iceland-self-drive-driving-settings-view.util';
import {
  applyVehiclePatch,
  normalizeVehicleSettings,
  type IcelandSelfDriveVehicleSettingsPatch,
} from './iceland-self-drive-vehicle.util';

export interface IcelandSelfDriveRouteHint {
  code: string;
  message: string;
  gravelKm: number;
}

export interface IcelandSelfDriveDrivingSettingsItemView {
  code: IcelandSelfDriveSettingsItem;
  title: string;
  subtitle: string;
  status: IcelandSelfDriveSettingsStatus;
  pendingCount: number | null;
  payload: Record<string, unknown>;
}

export interface IcelandSelfDriveDrivingSettingsResponse {
  tripId: string;
  intro: string;
  privacyNote: string;
  routeHint: IcelandSelfDriveRouteHint | null;
  items: IcelandSelfDriveDrivingSettingsItemView[];
  contextVersion: string;
}

export interface IcelandSelfDriveVehicleImpactPreview {
  impactSummary: string;
  severity?: 'low' | 'medium' | 'high';
  routeHint: IcelandSelfDriveRouteHint | null;
  blockedCapabilities: string[];
  bullets?: Array<{ code: string; messageZh: string }>;
  warnings: string[];
}

const ITEM_COPY: Record<
  IcelandSelfDriveSettingsItem,
  { title: string; subtitle: string }
> = {
  vehicle: {
    title: '车辆信息',
    subtitle: '车型、四驱能力、租车合同限制等会直接影响可行路线',
  },
  drivers: {
    title: '驾驶者信息',
    subtitle: '驾驶人数、经验、每日驾驶上限等会影响行程节奏与安全边界',
  },
  members: {
    title: '成员状态',
    subtitle: '儿童/老人、体能、晕车等信息用于调整行程节奏',
  },
  route_preference: {
    title: '路线偏好',
    subtitle: '道路容忍度、夜间驾驶、休息频率等决定路线风格与风险控制',
  },
  fuel: {
    title: '燃油与补给',
    subtitle: '油品、补给策略与安全余量会影响补给节奏',
  },
  insurance: {
    title: '保险与租赁限制',
    subtitle: '路线暴露与保障覆盖确认，避免合同免责踩坑',
  },
};

export function estimateGravelKm(regionIds: string[]): number {
  let km = 0;
  if (regionIds.includes('highlands')) km += 60;
  if (regionIds.includes('ring_road')) km += 42;
  if (regionIds.includes('east_fjords')) km += 25;
  if (regionIds.includes('westfjords')) km += 35;
  if (regionIds.includes('south_coast')) km += 12;
  if (regionIds.includes('snaefellsnes')) km += 8;
  return km;
}

export function buildRouteHint(
  regionIds: string[],
  vehicle?: IcelandSelfDriveDrivingSettingsState['vehicle'] | null,
): IcelandSelfDriveRouteHint | null {
  const gravelKm = estimateGravelKm(regionIds);
  if (gravelKm <= 0) return null;

  const restrictions = vehicle?.rentalRestrictions ?? [];
  if (restrictions.includes('no_gravel') || restrictions.includes('no_f_road')) {
    return {
      code: 'GRAVEL_RESTRICTED',
      message: `当前路线约含 ${gravelKm} 公里碎石/高地相关路段，租车合同限制可能要求改线`,
      gravelKm,
    };
  }

  const needs4wd =
    regionIds.includes('highlands') || regionIds.includes('westfjords');
  if (needs4wd && vehicle?.is4wd === false) {
    return {
      code: 'FOURWD_RECOMMENDED',
      message: `当前路线约含 ${gravelKm} 公里碎石路，且途经高地/西峡湾走廊，建议确认四驱能力`,
      gravelKm,
    };
  }

  return {
    code: 'GRAVEL_EXPOSURE',
    message: `当前路线包含 ${gravelKm} 公里碎石路，请先确认车辆级别和驾驶经验`,
    gravelKm,
  };
}

export function previewVehicleImpact(opts: {
  regionIds: string[];
  vehicle: IcelandSelfDriveDrivingSettingsState['vehicle'];
  routePreference?: IcelandSelfDriveDrivingSettingsState['routePreference'];
}): IcelandSelfDriveVehicleImpactPreview {
  const { regionIds, vehicle, routePreference } = opts;
  const routeHint = buildRouteHint(regionIds, vehicle);
  const blockedCapabilities: string[] = [];
  const warnings: string[] = [];
  const bullets: Array<{ code: string; messageZh: string }> = [];

  if (vehicle.rentalRestrictions.includes('no_f_road')) {
    blockedCapabilities.push('f_road');
  }
  if (vehicle.rentalRestrictions.includes('no_highland')) {
    blockedCapabilities.push('highland');
  }
  if (vehicle.rentalRestrictions.includes('no_gravel')) {
    blockedCapabilities.push('gravel');
  }
  if (vehicle.rentalRestrictions.includes('no_wading')) {
    blockedCapabilities.push('wading');
  }
  if (routePreference?.fRoadPreference === 'avoid') {
    blockedCapabilities.push('f_road');
    if (regionIds.includes('highlands')) {
      bullets.push({
        code: 'SEGMENT_BLOCKED',
        messageZh: '高地 F 路段在「避开 F 路」下需改线',
      });
    }
  }
  if (routePreference?.waterCrossingPreference === 'avoid') {
    blockedCapabilities.push('wading');
  }

  if (vehicle.is4wd === false && regionIds.includes('highlands')) {
    warnings.push('highlands_4wd_recommended');
  }
  if (
    vehicle.fuelType === 'electric' &&
    (regionIds.includes('east_fjords') || regionIds.includes('westfjords'))
  ) {
    warnings.push('ev_range_sparse_corridors');
  }
  if (vehicle.recognitionSummary?.warnings?.length) {
    warnings.push(...vehicle.recognitionSummary.warnings);
  }

  const parts: string[] = [];
  const uniqueBlocked = [...new Set(blockedCapabilities)];
  if (uniqueBlocked.length > 0) {
    parts.push(`合同/偏好限制：暂不可行 ${uniqueBlocked.join(' / ')}`);
  }
  if (routeHint) {
    parts.push(routeHint.message);
  }
  if (parts.length === 0) {
    parts.push('当前草稿对既定走廊无明显额外限制');
  }

  return {
    impactSummary: parts.join('；'),
    severity: uniqueBlocked.length >= 2 ? 'high' : uniqueBlocked.length ? 'medium' : 'low',
    routeHint,
    blockedCapabilities: uniqueBlocked,
    bullets,
    warnings: [...new Set(warnings)],
  };
}

export function buildDrivingSettingsResponse(opts: {
  tripId: string;
  contextVersion: string;
  settings: IcelandSelfDriveDrivingSettingsState;
  regionIds: string[];
  members?: TripMemberProfile[];
  routeSkeleton?: IcelandSelfDriveRouteSkeleton | null;
}): IcelandSelfDriveDrivingSettingsResponse {
  const settings = normalizeDrivingSettingsState(opts.settings);
  const { route, warnings: routeWarnings } = applyRentalRestrictionOverrides(
    settings.routePreference,
    settings.vehicle,
  );
  settings.routePreference = route;

  const summary = computeDrivingSettingsSummary(settings);
  const byCode = new Map(summary.map((s) => [s.code, s]));
  const members = opts.members ?? [];

  const items: IcelandSelfDriveDrivingSettingsItemView[] = [
    {
      code: 'vehicle',
      ...ITEM_COPY.vehicle,
      status: byCode.get('vehicle')!.status,
      pendingCount: byCode.get('vehicle')!.pendingCount,
      payload: { ...settings.vehicle },
    },
    {
      code: 'drivers',
      ...ITEM_COPY.drivers,
      status: byCode.get('drivers')!.status,
      pendingCount: byCode.get('drivers')!.pendingCount,
      payload: buildDriversPayload({
        drivers: settings.drivers,
        members,
        routeArrivalDayDriving: settings.routePreference.arrivalDayDriving,
      }),
    },
    {
      code: 'members',
      ...ITEM_COPY.members,
      status: byCode.get('members')!.status,
      pendingCount: byCode.get('members')!.pendingCount,
      payload: { ...settings.members },
    },
    {
      code: 'route_preference',
      ...ITEM_COPY.route_preference,
      status: byCode.get('route_preference')!.status,
      pendingCount: byCode.get('route_preference')!.pendingCount,
      payload: buildRoutePreferencePayload({
        route: settings.routePreference,
        vehicle: settings.vehicle,
        regionIds: opts.regionIds,
        routeSkeleton: opts.routeSkeleton,
        warnings: routeWarnings,
      }),
    },
    {
      code: 'fuel',
      ...ITEM_COPY.fuel,
      status: byCode.get('fuel')!.status,
      pendingCount: byCode.get('fuel')!.pendingCount,
      payload: buildFuelPayload(settings.fuel, settings.vehicle.fuelType),
    },
    {
      code: 'insurance',
      ...ITEM_COPY.insurance,
      status: byCode.get('insurance')!.status,
      pendingCount: byCode.get('insurance')!.pendingCount,
      payload: buildInsurancePayload({
        insurance: settings.insurance,
        vehicle: settings.vehicle,
        regionIds: opts.regionIds,
        tripId: opts.tripId,
      }),
    },
  ];

  return {
    tripId: opts.tripId,
    intro: '完善自驾设置，让 NARA 帮你生成更安全、更合适的冰岛路线。',
    privacyNote: '所有设置仅用于生成和优化路线，不会对外分享',
    routeHint: buildRouteHint(opts.regionIds, settings.vehicle),
    items,
    contextVersion: opts.contextVersion,
  };
}

export function bumpContextVersion(current: string): string {
  const m = /^cv_(\d+)$/.exec(current);
  if (!m) return 'cv_2';
  return `cv_${Number(m[1]) + 1}`;
}

export function mergeDrivingSettings(
  current: IcelandSelfDriveDrivingSettingsState,
  patch: {
    vehicle?: IcelandSelfDriveVehicleSettingsPatch;
    drivers?: {
      driverCount?: number | null;
      experienceLevel?: IcelandSelfDriveDrivingSettingsState['drivers']['experienceLevel'];
      dailyDrivingLimitHours?: number | null;
      arrivalDayDriving?: IcelandSelfDriveDrivingSettingsState['drivers']['arrivalDayDriving'];
      /** PATCH 入参：字段可缺省，merge 时 normalize */
      candidates?: unknown[];
    };
    members?: Partial<IcelandSelfDriveDrivingSettingsState['members']>;
    routePreference?: Partial<IcelandSelfDriveDrivingSettingsState['routePreference']>;
    fuel?: Partial<IcelandSelfDriveDrivingSettingsState['fuel']>;
    insurance?: Partial<IcelandSelfDriveDrivingSettingsState['insurance']> & {
      syncRentalRestrictions?: boolean;
    };
  },
): IcelandSelfDriveDrivingSettingsState {
  const normalized = normalizeDrivingSettingsState(current);

  let vehicle = applyVehiclePatch(normalized.vehicle, patch.vehicle);

  const driverPatchCandidates = Array.isArray(patch.drivers?.candidates)
    ? patch.drivers!.candidates!
        .map(normalizeDriverCandidate)
        .filter((c): c is NonNullable<typeof c> => c != null)
    : undefined;

  let drivers = normalizeDriversSettings({
    ...normalized.drivers,
    ...(patch.drivers ?? {}),
    candidates: mergeDriverCandidates(
      normalized.drivers.candidates,
      driverPatchCandidates,
    ),
  });

  if (driverPatchCandidates) {
    const derived = deriveDriverCountFromCandidates(drivers.candidates);
    if (patch.drivers?.driverCount == null && derived > 0) {
      drivers = { ...drivers, driverCount: derived };
    }
  }

  let routePreference = normalizeRoutePreferenceSettings({
    ...normalized.routePreference,
    ...(patch.routePreference ?? {}),
  });

  // 日驾上限：routePreference 为源，同步到 drivers
  if (patch.routePreference?.dailyDrivingLimitHours != null) {
    drivers = {
      ...drivers,
      dailyDrivingLimitHours: patch.routePreference.dailyDrivingLimitHours,
    };
    routePreference = {
      ...routePreference,
      dailyDrivingLimitHours: patch.routePreference.dailyDrivingLimitHours,
    };
  } else if (patch.drivers?.dailyDrivingLimitHours != null) {
    routePreference = {
      ...routePreference,
      dailyDrivingLimitHours: patch.drivers.dailyDrivingLimitHours,
    };
  }

  const arrival = stricterArrivalDayDriving(
    patch.drivers?.arrivalDayDriving ?? drivers.arrivalDayDriving,
    patch.routePreference?.arrivalDayDriving ?? routePreference.arrivalDayDriving,
  );
  drivers = { ...drivers, arrivalDayDriving: arrival };
  routePreference = { ...routePreference, arrivalDayDriving: arrival };

  const overridden = applyRentalRestrictionOverrides(routePreference, vehicle);
  routePreference = overridden.route;

  let fuel = normalizeFuelSettings(
    {
      ...normalized.fuel,
      ...(patch.fuel ?? {}),
      configured: patch.fuel != null ? true : normalized.fuel.configured,
    },
    vehicle.fuelType,
  );

  let insurance = normalizeInsuranceSettings({
    ...normalized.insurance,
    ...(patch.insurance ?? {}),
    configured: patch.insurance != null ? true : normalized.insurance.configured,
  });

  if (patch.insurance?.syncRentalRestrictions === true) {
    const restrictions = new Set(vehicle.rentalRestrictions);
    if (insurance.userAcknowledgedCodes.includes('wading')) {
      restrictions.add('no_wading');
    }
    vehicle = applyVehiclePatch(vehicle, {
      rentalRestrictions: [...restrictions],
    });
  }

  return {
    vehicle,
    drivers,
    members: { ...normalized.members, ...(patch.members ?? {}) },
    routePreference,
    fuel,
    insurance,
  };
}
