/**
 * Normalize / merge extended driving-settings blocks (drivers / route / fuel / insurance).
 */

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
  ICELAND_SELF_DRIVE_REST_FREQUENCIES,
  ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES,
  ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE,
  type IcelandSelfDriveArrivalDayDriving,
  type IcelandSelfDriveNightDrivingPreference,
  type IcelandSelfDriveRoadHazardPreference,
} from '../dto/iceland-self-drive-enums';
import type {
  IcelandSelfDriveDriverCandidateState,
  IcelandSelfDriveDriversSettings,
  IcelandSelfDriveFuelSettings,
  IcelandSelfDriveInsuranceSettings,
  IcelandSelfDriveRoutePreferenceSettings,
  IcelandSelfDriveVehicleSettings,
} from '../types/iceland-self-drive.types';

function isIn<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

const ARRIVAL_STRICTNESS: Record<IcelandSelfDriveArrivalDayDriving, number> = {
  reject: 0,
  short_only: 1,
  normal: 2,
};

export function stricterArrivalDayDriving(
  a: IcelandSelfDriveArrivalDayDriving | null | undefined,
  b: IcelandSelfDriveArrivalDayDriving | null | undefined,
): IcelandSelfDriveArrivalDayDriving | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return ARRIVAL_STRICTNESS[a] <= ARRIVAL_STRICTNESS[b] ? a : b;
}

export function normalizeDriverCandidate(
  raw: unknown,
): IcelandSelfDriveDriverCandidateState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.memberId !== 'string' || !o.memberId.trim()) return null;
  const isSelected = o.isSelected === true;
  let role = isIn(o.role, ICELAND_SELF_DRIVE_DRIVER_ROLES) ? o.role : 'none';
  if (!isSelected) role = 'none';
  return {
    memberId: o.memberId.trim(),
    isSelected,
    role,
    snowExperience: isIn(o.snowExperience, ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE)
      ? o.snowExperience
      : null,
    gravelExperience: isIn(o.gravelExperience, ICELAND_SELF_DRIVE_SURFACE_EXPERIENCE)
      ? o.gravelExperience
      : null,
    nightAcceptance: isIn(o.nightAcceptance, ICELAND_SELF_DRIVE_NIGHT_ACCEPTANCE)
      ? o.nightAcceptance
      : null,
    isAdditionalDriver:
      o.isAdditionalDriver === true || role === 'additional',
  };
}

export function normalizeDriversSettings(raw: unknown): IcelandSelfDriveDriversSettings {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const candidates = Array.isArray(o.candidates)
    ? o.candidates
        .map(normalizeDriverCandidate)
        .filter((c): c is IcelandSelfDriveDriverCandidateState => c != null)
    : [];

  return {
    driverCount:
      typeof o.driverCount === 'number' && Number.isFinite(o.driverCount)
        ? Math.max(0, Math.min(12, Math.round(o.driverCount)))
        : null,
    experienceLevel: isIn(o.experienceLevel, ICELAND_SELF_DRIVE_EXPERIENCE_LEVELS)
      ? o.experienceLevel
      : null,
    dailyDrivingLimitHours:
      typeof o.dailyDrivingLimitHours === 'number' &&
      Number.isFinite(o.dailyDrivingLimitHours)
        ? Math.max(1, Math.min(12, Math.round(o.dailyDrivingLimitHours)))
        : null,
    arrivalDayDriving: isIn(o.arrivalDayDriving, ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING)
      ? o.arrivalDayDriving
      : null,
    candidates,
  };
}

function deriveAllowNight(
  pref: IcelandSelfDriveNightDrivingPreference,
  explicit?: boolean,
): boolean {
  if (explicit != null) return explicit;
  return pref === 'conditional' || pref === 'accept';
}

export function applyRentalRestrictionOverrides(
  route: IcelandSelfDriveRoutePreferenceSettings,
  vehicle: Pick<IcelandSelfDriveVehicleSettings, 'rentalRestrictions'>,
): { route: IcelandSelfDriveRoutePreferenceSettings; warnings: string[] } {
  const warnings: string[] = [];
  const next = { ...route };
  const r = vehicle.rentalRestrictions ?? [];
  if (r.includes('no_f_road') || r.includes('no_highland')) {
    if (next.fRoadPreference !== 'avoid') {
      next.fRoadPreference = 'avoid';
      warnings.push('f_road_forced_by_rental');
    }
  }
  if (r.includes('no_wading')) {
    if (next.waterCrossingPreference !== 'avoid') {
      next.waterCrossingPreference = 'avoid';
      warnings.push('wading_forced_by_rental');
    }
  }
  if (r.includes('no_gravel')) {
    if (next.gravelTolerance !== 'low') {
      next.gravelTolerance = 'low';
      warnings.push('gravel_tolerance_forced_low');
    }
  }
  return { route: next, warnings };
}

export function normalizeRoutePreferenceSettings(
  raw: unknown,
): IcelandSelfDriveRoutePreferenceSettings {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const nightDrivingPreference = isIn(
    o.nightDrivingPreference,
    ICELAND_SELF_DRIVE_NIGHT_DRIVING_PREFERENCES,
  )
    ? o.nightDrivingPreference
    : o.allowNightDriving === true
      ? 'accept'
      : 'avoid';

  const allowNightDriving = deriveAllowNight(
    nightDrivingPreference,
    typeof o.allowNightDriving === 'boolean' ? o.allowNightDriving : undefined,
  );

  const useSystemRest = o.useSystemRest !== false;
  const restFrequency = useSystemRest
    ? 'normal'
    : isIn(o.restFrequency, ICELAND_SELF_DRIVE_REST_FREQUENCIES)
      ? o.restFrequency
      : 'normal';

  const hazard = (
    v: unknown,
    fallback: IcelandSelfDriveRoadHazardPreference = 'avoid',
  ): IcelandSelfDriveRoadHazardPreference =>
    isIn(v, ICELAND_SELF_DRIVE_ROAD_HAZARD_PREFERENCES) ? v : fallback;

  return {
    pacePreference: isIn(o.pacePreference, ICELAND_SELF_DRIVE_PACE_PREFERENCES)
      ? o.pacePreference
      : 'balanced',
    dailyDrivingLimitHours:
      typeof o.dailyDrivingLimitHours === 'number' &&
      Number.isFinite(o.dailyDrivingLimitHours)
        ? Math.max(1, Math.min(12, Math.round(o.dailyDrivingLimitHours)))
        : null,
    useSystemRest,
    restFrequency,
    arrivalDayDriving: isIn(o.arrivalDayDriving, ICELAND_SELF_DRIVE_ARRIVAL_DAY_DRIVING)
      ? o.arrivalDayDriving
      : null,
    gravelTolerance: isIn(o.gravelTolerance, ICELAND_SELF_DRIVE_GRAVEL_TOLERANCES)
      ? o.gravelTolerance
      : 'moderate',
    allowNightDriving,
    nightDrivingPreference,
    fRoadPreference: hazard(o.fRoadPreference, 'avoid'),
    waterCrossingPreference: hazard(o.waterCrossingPreference, 'avoid'),
    highWindPreference: hazard(o.highWindPreference, 'avoid'),
  };
}

export function normalizeFuelSettings(
  raw: unknown,
  fallbackFuelType: IcelandSelfDriveFuelSettings['fuelType'] = null,
): IcelandSelfDriveFuelSettings {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const useDynamic = o.useDynamicSafetyMargin !== false;
  let safetyMarginPercent: number | null = null;
  if (!useDynamic && typeof o.safetyMarginPercent === 'number') {
    const rounded = Math.round(o.safetyMarginPercent / 5) * 5;
    safetyMarginPercent = Math.max(10, Math.min(40, rounded));
  }
  return {
    fuelType: isIn(o.fuelType, ICELAND_SELF_DRIVE_FUEL_TYPES)
      ? o.fuelType
      : fallbackFuelType,
    refuelStrategy: isIn(o.refuelStrategy, ICELAND_SELF_DRIVE_REFUEL_STRATEGIES)
      ? o.refuelStrategy
      : 'early',
    useDynamicSafetyMargin: useDynamic,
    safetyMarginPercent: useDynamic ? null : safetyMarginPercent,
    configured: o.configured === true,
  };
}

export function normalizeInsuranceSettings(
  raw: unknown,
): IcelandSelfDriveInsuranceSettings {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const codes = (v: unknown) =>
    Array.isArray(v)
      ? [...new Set(v.filter((c): c is string => typeof c === 'string'))]
      : [];
  return {
    userAcknowledgedCodes: codes(o.userAcknowledgedCodes),
    preferredUpgradeCodes: codes(o.preferredUpgradeCodes),
    configured: o.configured === true,
  };
}

export function mergeDriverCandidates(
  current: IcelandSelfDriveDriverCandidateState[],
  patch: IcelandSelfDriveDriverCandidateState[] | undefined,
): IcelandSelfDriveDriverCandidateState[] {
  if (!patch) return current;
  const byId = new Map(current.map((c) => [c.memberId, c]));
  for (const p of patch) {
    byId.set(p.memberId, { ...byId.get(p.memberId), ...p });
  }
  return [...byId.values()];
}

export function deriveDriverCountFromCandidates(
  candidates: IcelandSelfDriveDriverCandidateState[],
): number {
  return candidates.filter((c) => c.isSelected).length;
}

export function fuelSummaryLabel(fuel: IcelandSelfDriveFuelSettings): string {
  const typeLabel: Record<string, string> = {
    gasoline: '汽油车',
    diesel: '柴油车',
    hybrid: '混动车',
    electric: '电动车',
  };
  const stratLabel: Record<string, string> = {
    early: '提前补给',
    balanced: '均衡补给',
    minimal: '尽量少停',
  };
  const type =
    fuel.fuelType != null ? typeLabel[fuel.fuelType] ?? fuel.fuelType : '油品待定';
  const strat = stratLabel[fuel.refuelStrategy] ?? fuel.refuelStrategy;
  const margin = fuel.useDynamicSafetyMargin
    ? '动态安全余量已开启'
    : `安全余量 ${fuel.safetyMarginPercent ?? 20}%`;
  return `${type} · ${strat} · ${margin}`;
}
