/**
 * Enriched GET payloads for drivers / routePreference / fuel / insurance.
 */

import type {
  IcelandSelfDriveDriversSettings,
  IcelandSelfDriveFuelSettings,
  IcelandSelfDriveInsuranceSettings,
  IcelandSelfDriveRoutePreferenceSettings,
  IcelandSelfDriveRouteSkeleton,
  IcelandSelfDriveVehicleSettings,
} from '../types/iceland-self-drive.types';
import {
  fuelSummaryLabel,
  stricterArrivalDayDriving,
} from './iceland-self-drive-driving-settings-extend.util';

export interface TripMemberProfile {
  memberId: string;
  displayName: string;
  initial: string;
  avatarUrl: string | null;
  licenseVerified?: boolean;
  profileComplete?: boolean;
}

export function buildDriversPayload(opts: {
  drivers: IcelandSelfDriveDriversSettings;
  members: TripMemberProfile[];
  routeArrivalDayDriving?: IcelandSelfDriveRoutePreferenceSettings['arrivalDayDriving'];
}): Record<string, unknown> {
  const stateById = new Map(opts.drivers.candidates.map((c) => [c.memberId, c]));
  const candidates = opts.members.map((m) => {
    const st = stateById.get(m.memberId);
    const isSelected = st?.isSelected === true;
    const role = !isSelected ? 'none' : st?.role === 'main' ? 'main' : st?.role === 'additional' ? 'additional' : 'additional';
    return {
      memberId: m.memberId,
      displayName: m.displayName,
      initial: m.initial,
      avatarUrl: m.avatarUrl,
      isSelected,
      role,
      licenseVerified: m.licenseVerified ?? false,
      profileComplete: m.profileComplete ?? true,
      snowExperience: st?.snowExperience ?? null,
      gravelExperience: st?.gravelExperience ?? null,
      nightAcceptance: st?.nightAcceptance ?? null,
      isAdditionalDriver: role === 'additional',
    };
  });

  const arrivalDayDriving = stricterArrivalDayDriving(
    opts.drivers.arrivalDayDriving,
    opts.routeArrivalDayDriving,
  );

  const selected = candidates.filter((c) => c.isSelected);
  const warnings: string[] = [];
  if (selected.length > 0 && !selected.some((c) => c.role === 'main')) {
    warnings.push('missing_main_driver');
  }

  return {
    driverCount:
      opts.drivers.driverCount ??
      (selected.length > 0 ? selected.length : null),
    experienceLevel: opts.drivers.experienceLevel,
    dailyDrivingLimitHours: opts.drivers.dailyDrivingLimitHours,
    arrivalDayDriving,
    candidates,
    warnings,
  };
}

export function buildRoutePreferencePayload(opts: {
  route: IcelandSelfDriveRoutePreferenceSettings;
  vehicle: IcelandSelfDriveVehicleSettings;
  regionIds: string[];
  routeSkeleton?: IcelandSelfDriveRouteSkeleton | null;
  warnings?: string[];
}): Record<string, unknown> {
  const { route, vehicle, regionIds, routeSkeleton } = opts;
  const affectedSegmentHints: Array<{
    code: string;
    dayIndex: number | null;
    message: string;
  }> = [];

  if (
    route.fRoadPreference === 'avoid' &&
    (regionIds.includes('highlands') ||
      vehicle.rentalRestrictions.includes('no_f_road') === false)
  ) {
    const dayIndex =
      routeSkeleton?.days.findIndex((d) =>
        /F\d+|高地|highland/i.test(`${d.corridorLabel} ${d.overnightHint}`),
      ) ?? -1;
    if (regionIds.includes('highlands')) {
      affectedSegmentHints.push({
        code: 'F208',
        dayIndex: dayIndex >= 0 ? dayIndex + 1 : 4,
        message: 'F208 在「避开 F 路」下需改线',
      });
    }
  }
  if (
    route.waterCrossingPreference === 'avoid' &&
    regionIds.includes('highlands')
  ) {
    affectedSegmentHints.push({
      code: 'FORD',
      dayIndex: null,
      message: '高地涉水路段在「避开涉水」下不可进入',
    });
  }

  let roadCompatibilitySummary = '当前车型与所选道路偏好基本兼容';
  if (
    vehicle.is4wd === false &&
    (route.fRoadPreference === 'accept' || route.fRoadPreference === 'prefer')
  ) {
    roadCompatibilitySummary = '两驱车型与 F 路偏好冲突，建议改偏好或升级车辆';
  } else if (vehicle.rentalRestrictions.includes('no_f_road')) {
    roadCompatibilitySummary = '租车合同禁止 F 路，道路偏好已按合同对齐';
  }

  return {
    ...route,
    roadCompatibilitySummary,
    affectedSegmentHints,
    warnings: opts.warnings ?? [],
  };
}

const COVERAGE_CATALOG = [
  {
    code: 'gravel_body_glass',
    titleZh: '碎石（车身/玻璃）',
    subtitleZh: '含车身、玻璃与外观损伤',
    detailZh: '覆盖碎石飞溅导致的损伤；请对照租车合同确认免赔额。',
    defaultStatus: 'covered' as const,
  },
  {
    code: 'sand_wind',
    titleZh: '沙尘（风损）',
    subtitleZh: '强风导致的漆面、玻璃等损伤',
    detailZh: '冰岛高风走廊常见风沙损伤，基础档可能不足。',
    defaultStatus: 'covered' as const,
  },
  {
    code: 'theft_fire',
    titleZh: '盗抢与火灾',
    subtitleZh: '车辆盗抢、火灾及相关损失',
    detailZh: '通常包含在综合保障内。',
    defaultStatus: 'covered' as const,
  },
  {
    code: 'tires_chassis',
    titleZh: '轮胎与底盘',
    subtitleZh: '轮胎、轮毂、底盘与悬挂损伤',
    detailZh: '是否覆盖仍待确认，建议与租车公司核实。',
    defaultStatus: 'unknown' as const,
    badgeLabel: '待确认',
  },
  {
    code: 'wading',
    titleZh: '涉水损伤',
    subtitleZh: '涉水过河、深坑积水导致的损伤',
    detailZh: '通常属于免责项；矩阵规则：涉水恒排除。',
    defaultStatus: 'excluded' as const,
    badgeLabel: '免责',
  },
] as const;

export function buildInsurancePayload(opts: {
  insurance: IcelandSelfDriveInsuranceSettings;
  vehicle: IcelandSelfDriveVehicleSettings;
  regionIds: string[];
  tripId: string;
}): Record<string, unknown> {
  const { insurance, vehicle, regionIds, tripId } = opts;
  const routeExposures: Array<Record<string, unknown>> = [];
  if (
    regionIds.includes('highlands') ||
    regionIds.includes('ring_road') ||
    vehicle.rentalRestrictions.includes('no_gravel')
  ) {
    routeExposures.push({
      code: 'gravel',
      titleZh: '碎石支路',
      subtitleZh: regionIds.includes('highlands') ? '多段 F-road' : '环岛碎石段',
      detailZh: '当前路线存在碎石/F 路暴露，请结合保障评估。',
    });
  }
  if (regionIds.includes('north') || regionIds.includes('westfjords')) {
    routeExposures.push({
      code: 'high_wind',
      titleZh: '高风暴露',
      subtitleZh: '海边/峡湾走廊',
      detailZh: null,
    });
  }
  routeExposures.push({
    code: 'gravel_parking',
    titleZh: '非铺装停车场',
    subtitleZh: '多处景点停车场',
    detailZh: null,
  });

  const coverages = COVERAGE_CATALOG.map((c) => {
    let status = c.defaultStatus as string;
    if (c.code === 'wading') status = 'excluded';
    if (
      c.code === 'tires_chassis' &&
      insurance.userAcknowledgedCodes.includes('tires_chassis')
    ) {
      status = 'partial';
    }
    return {
      code: c.code,
      titleZh: c.titleZh,
      subtitleZh: c.subtitleZh,
      detailZh: c.detailZh,
      status,
      badgeLabel: 'badgeLabel' in c ? c.badgeLabel : null,
    };
  });

  const unknownOrGap = coverages.filter(
    (c) => c.status === 'unknown' || c.status === 'gap',
  );
  const unacked = unknownOrGap.filter(
    (c) => !insurance.userAcknowledgedCodes.includes(c.code),
  );
  const overallStatus =
    coverages.some((c) => c.status === 'gap') && unacked.length > 0
      ? 'blocked'
      : unacked.length > 0
        ? 'needs_confirm'
        : 'ok';

  const summaryParts = coverages.map((c) => {
    const st =
      c.status === 'covered'
        ? '已覆盖'
        : c.status === 'excluded'
          ? '免责'
          : c.status === 'unknown'
            ? '待确认'
            : c.status;
    return `${c.titleZh.split('（')[0]}：${st}`;
  });

  const impactPreview =
    vehicle.vehicleClass === 'sedan_2wd' || vehicle.is4wd === false
      ? {
          hypothesisLabel: '如果把四驱 SUV 改为两驱小型车',
          severity: 'high',
          bullets: [
            {
              code: 'SEGMENT_BLOCKED',
              messageZh: 'Day 4 的 F208 路段不可执行',
            },
            {
              code: 'ACTIVITY_REPLACE',
              messageZh: '1 个活动需要替换',
            },
            {
              code: 'DRIVE_TIME_DELTA',
              messageZh: '总驾驶时间预计增加 45-70 分钟',
            },
          ],
        }
      : {
          hypothesisLabel: '当前车型保持不变时的保险影响',
          severity: 'medium',
          bullets: [
            {
              code: 'CONFIRM_EXCLUSIONS',
              messageZh: '请确认涉水与轮胎/底盘免责项',
            },
          ],
        };

  return {
    coverageTierLabel: '综合保障',
    overallStatus,
    summaryLine: summaryParts.slice(0, 3).join(' · '),
    routeExposures,
    coverages,
    userAcknowledgedCodes: [...insurance.userAcknowledgedCodes],
    preferredUpgradeCodes: [...insurance.preferredUpgradeCodes],
    decisionProblemIdHint: `dc_insurance_${tripId}`,
    impactPreview,
    fordAlwaysExcluded: true,
  };
}

export function buildFuelPayload(
  fuel: IcelandSelfDriveFuelSettings,
  vehicleFuelType: IcelandSelfDriveVehicleSettings['fuelType'],
): Record<string, unknown> {
  const resolved = {
    ...fuel,
    fuelType: fuel.fuelType ?? vehicleFuelType,
  };
  return {
    fuelType: resolved.fuelType,
    refuelStrategy: resolved.refuelStrategy,
    useDynamicSafetyMargin: resolved.useDynamicSafetyMargin,
    safetyMarginPercent: resolved.safetyMarginPercent,
    summaryLabel: fuelSummaryLabel(resolved),
  };
}
