/**
 * 将对话决策 Commit 镜像到冰岛自驾 metadata / constraints（可读写链，非行程改排）。
 */

import type { TravelDecisionProblem } from './travel-decision.types';

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? { ...(v as Record<string, unknown>) } : {};
}

/**
 * 在已有 metadata 上叠加车型 / 路线策略 / 节奏等到 icelandSelfDrive + constraints。
 */
export function applyDecisionCommitmentToIcelandMetadata(
  metadata: Record<string, unknown>,
  problem: TravelDecisionProblem,
): Record<string, unknown> {
  const optionId = problem.selection?.optionId;
  if (!optionId) return metadata;

  const next = { ...metadata };
  const isd = asObj(next.icelandSelfDrive);
  const driving = asObj(isd.drivingSettings);
  const vehicle = asObj(driving.vehicle);
  const routePref = asObj(driving.routePreferences);
  const constraints = asObj(next.constraints);

  let touchedIsd = false;
  let touchedConstraints = false;

  if (problem.decisionKey === 'VEHICLE_ROAD_FIT') {
    const is4wd = optionId !== '2WD';
    const isHighBody = optionId === '4WD_PLUS';
    vehicle.is4wd = is4wd;
    vehicle.vehicleClass = isHighBody ? 'suv_4wd_high' : is4wd ? 'suv_4wd' : 'sedan_2wd';
    vehicle.vehicleClassLabel = isHighBody
      ? '高底盘四驱'
      : is4wd
        ? '四驱 / SUV'
        : '两驱轿车';
    vehicle.isHighBody = isHighBody ? true : is4wd ? false : false;
    const restrictions = Array.isArray(vehicle.rentalRestrictions)
      ? [...(vehicle.rentalRestrictions as string[])]
      : [];
    const withoutF = restrictions.filter(
      (r) => r !== 'no_f_road' && r !== 'no_highland',
    );
    if (!is4wd) {
      withoutF.push('no_f_road');
      withoutF.push('no_highland');
      routePref.fRoadPreference = 'avoid';
    } else {
      routePref.fRoadPreference =
        routePref.fRoadPreference === 'avoid' ? 'conditional' : routePref.fRoadPreference;
    }
    vehicle.rentalRestrictions = [...new Set(withoutF)];
    driving.vehicle = vehicle;
    driving.routePreferences = routePref;
    isd.drivingSettings = driving;
    isd.productLine = isd.productLine ?? 'iceland_self_drive';
    isd._decisionVehicleSyncedAt = new Date().toISOString();
    isd._decisionVehicleOption = optionId;
    touchedIsd = true;

    constraints.vehicleType = is4wd ? '4WD' : '2WD';
    constraints.vehicle_type = constraints.vehicleType;
    constraints.fRoadAllowed = is4wd;
    constraints._fromDecisionKey = 'VEHICLE_ROAD_FIT';
    touchedConstraints = true;
  }

  if (problem.decisionKey === 'RENTAL_INSURANCE') {
    const insurance = asObj(driving.insurance);
    insurance.tier = optionId;
    insurance._fromDecision = true;
    driving.insurance = insurance;
    isd.drivingSettings = driving;
    isd._decisionInsuranceOption = optionId;
    touchedIsd = true;
  }

  if (problem.decisionKey === 'TRIP_SCOPE') {
    isd.routeStrategy = optionId;
    isd._decisionTripScope = optionId;
    const wizard = asObj(isd.wizard);
    wizard.routeScopeHint = optionId;
    isd.wizard = wizard;
    touchedIsd = true;
    next.planningPolicy =
      optionId === 'SOUTH_COAST'
        ? 'stability_over_coverage'
        : optionId === 'RING_ROAD'
          ? 'coverage_over_stability'
          : 'balanced_coverage';
  }

  if (problem.decisionKey === 'DAILY_PACE' || problem.decisionKey === 'ARRIVAL_DAY_LOAD') {
    routePref.pacePreference =
      optionId === 'EASY' || optionId === 'LIGHT'
        ? 'easy'
        : optionId === 'RICH' || optionId === 'PUSH'
          ? 'packed'
          : 'balanced';
    if (problem.decisionKey === 'ARRIVAL_DAY_LOAD') {
      routePref.arrivalDayDriving =
        optionId === 'LIGHT' ? 'minimal' : optionId === 'PUSH' ? 'full' : 'moderate';
    }
    driving.routePreferences = routePref;
    isd.drivingSettings = driving;
    isd._decisionPaceOption = optionId;
    touchedIsd = true;
  }

  if (problem.decisionKey === 'ACCOMMODATION_MOVEMENT') {
    isd.accommodationStrategy = optionId;
    isd._decisionAccommodationOption = optionId;
    touchedIsd = true;
  }

  if (problem.decisionKey === 'WINTER_ROUTE_RISK') {
    routePref.winterRoutePolicy = optionId;
    driving.routePreferences = routePref;
    isd.drivingSettings = driving;
    touchedIsd = true;
  }

  if (touchedIsd) {
    next.icelandSelfDrive = isd;
    if (!next.productLine) next.productLine = 'iceland_self_drive';
  }
  if (touchedConstraints) {
    next.constraints = constraints;
  }

  return next;
}
