import type { GuideRouteAvailability } from '../../types/guide-spatial.types';

const DEFAULT_MAX_DRIVING_MINUTES = 360;

export function buildBaseRouteAvailability(input: {
  routeExists?: boolean;
  drivingMinutes?: number;
  maxDrivingMinutes?: number;
  warnings?: string[];
  blockedReasons?: string[];
  legallyAllowed?: boolean;
  operationallyAvailable?: boolean;
}): GuideRouteAvailability {
  const warnings = [...(input.warnings ?? [])];
  const blockedReasons = [...(input.blockedReasons ?? [])];
  const routeExists = input.routeExists !== false;
  const maxDrive = input.maxDrivingMinutes ?? DEFAULT_MAX_DRIVING_MINUTES;
  const drivingMinutes = input.drivingMinutes ?? 0;

  let legallyAllowed = input.legallyAllowed ?? true;
  let operationallyAvailable = input.operationallyAvailable ?? legallyAllowed;

  if (!routeExists) {
    blockedReasons.push('NO_ROUTE');
  }

  let recommended = operationallyAvailable && drivingMinutes <= maxDrive;
  if (drivingMinutes > maxDrive) {
    recommended = false;
    warnings.push(
      `当日预计驾驶约 ${Math.round(drivingMinutes / 60)} 小时，超出推荐上限（${Math.round(maxDrive / 60)} 小时）`,
    );
  }

  let level: GuideRouteAvailability['level'] = 'route_blocked';
  if (!routeExists) {
    level = 'route_blocked';
  } else if (recommended) {
    level = 'route_recommended';
  } else if (operationallyAvailable) {
    level = 'route_operationally_available';
  } else if (legallyAllowed) {
    level = 'route_legally_allowed';
  } else {
    level = 'route_exists';
  }

  return {
    routeExists,
    legallyAllowed,
    operationallyAvailable,
    recommended,
    level,
    warnings,
    blockedReasons: Array.from(new Set(blockedReasons)),
  };
}
