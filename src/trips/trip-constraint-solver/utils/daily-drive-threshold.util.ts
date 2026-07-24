/**
 * 每日驾驶时长上限 — metadata.constraints / pacing 默认
 */

import { resolveEffectiveTravelMode } from './constraints-summary.util';

export type MaxDailyDrivingHoursSource = 'user' | 'pacing_default' | 'global_default';

export interface ResolvedMaxDailyDrivingHours {
  maxDailyDrivingHours: number;
  source: MaxDailyDrivingHoursSource;
}

export const GLOBAL_DEFAULT_MAX_DAILY_DRIVING_HOURS = 6;

const PACING_DEFAULT_HOURS: Record<string, number> = {
  relaxed: 4,
  normal: 6,
  balanced: 6,
  intensive: 8,
};

function readConstraints(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  const constraints = (metadata as Record<string, unknown>).constraints;
  if (!constraints || typeof constraints !== 'object') return {};
  return constraints as Record<string, unknown>;
}

function readPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function readUserMaxDailyDrivingHours(metadata: unknown): number | undefined {
  const constraints = readConstraints(metadata);
  const fromHours =
    readPositiveNumber(constraints.maxDailyDrivingHours) ??
    readPositiveNumber(constraints.maxDailyDriveHours);
  if (fromHours != null) {
    return fromHours;
  }
  const fromMinutes =
    readPositiveNumber(constraints.maxDailyDriveMinutes) ??
    readPositiveNumber(constraints.max_daily_drive_minutes);
  if (fromMinutes != null) {
    return fromMinutes / 60;
  }
  return undefined;
}

function pacingDefaultHours(pacingConfig: unknown): number | undefined {
  if (!pacingConfig || typeof pacingConfig !== 'object') return undefined;
  const level = String((pacingConfig as Record<string, unknown>).level ?? '').toLowerCase();
  if (!level) return undefined;
  return PACING_DEFAULT_HOURS[level];
}

export function isSelfDriveTrip(pacingConfig: unknown): boolean {
  const mode = resolveEffectiveTravelMode(pacingConfig);
  if (!mode) return false;
  const upper = mode.toUpperCase();
  return upper === 'DRIVING' || upper === 'SELF_DRIVE' || upper === 'MIXED';
}

/** 解析每日驾驶上限；未配置且无 pacing 默认时返回 undefined（不检测） */
export function resolveMaxDailyDrivingHours(input: {
  metadata?: unknown;
  pacingConfig?: unknown;
  /** true 时 pacing 默认也作为有效上限（约束列表展示） */
  allowPacingDefault?: boolean;
}): ResolvedMaxDailyDrivingHours | undefined {
  const user = readUserMaxDailyDrivingHours(input.metadata);
  if (user != null) {
    return { maxDailyDrivingHours: user, source: 'user' };
  }
  if (!input.allowPacingDefault) return undefined;
  if (!isSelfDriveTrip(input.pacingConfig)) return undefined;
  const fromPacing = pacingDefaultHours(input.pacingConfig);
  if (fromPacing != null) {
    return { maxDailyDrivingHours: fromPacing, source: 'pacing_default' };
  }
  return { maxDailyDrivingHours: GLOBAL_DEFAULT_MAX_DAILY_DRIVING_HOURS, source: 'global_default' };
}

export function formatDriveDurationZh(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function formatDriveDurationZhLong(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours > 0 && mins > 0) return `${hours} 小时 ${mins} 分钟`;
  if (hours > 0) return `${hours} 小时`;
  return `${mins} 分钟`;
}

export function applyMaxDailyDrivingHoursConstraintPatch(
  constraints: Record<string, unknown>,
  value: unknown,
): boolean {
  let hours: number | undefined;
  let minutes: number | undefined;

  if (typeof value === 'number') {
    hours = readPositiveNumber(value);
  } else if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    minutes =
      readPositiveNumber(raw.maxDailyDriveMinutes) ??
      readPositiveNumber(raw.max_daily_drive_minutes);
    hours =
      readPositiveNumber(raw.maxDailyDrivingHours) ??
      readPositiveNumber(raw.maxDailyDriveHours) ??
      readPositiveNumber(raw.maxHours) ??
      readPositiveNumber(raw.hours) ??
      readPositiveNumber(raw.value);
    if (minutes != null && hours == null) {
      hours = minutes / 60;
    }
  }

  if (hours == null) return false;
  if (minutes == null) {
    minutes = Math.round(hours * 60);
  }

  constraints.maxDailyDrivingHours = hours;
  constraints.maxDailyDriveMinutes = minutes;
  delete constraints.maxDailyDriveHours;
  delete constraints.max_daily_drive_minutes;
  return true;
}

export function applyNoNightDriveConstraintPatch(
  constraints: Record<string, unknown>,
  patch: { value?: unknown; status?: string },
): boolean {
  const current =
    constraints.noNightDrive && typeof constraints.noNightDrive === 'object'
      ? (constraints.noNightDrive as Record<string, unknown>)
      : {};
  let next: Record<string, unknown> = { ...current };
  let changed = false;

  if (patch.status === 'DISABLED') {
    next.enabled = false;
    changed = true;
  } else if (patch.status === 'ACTIVE' || patch.status === 'LOCKED') {
    next.enabled = true;
    changed = true;
  }

  if (patch.value != null) {
    const raw = patch.value;
    const mins =
      typeof raw === 'number'
        ? raw
        : Number(
            (raw as Record<string, unknown>).maxMinutesAfterSunset ??
              (raw as Record<string, unknown>).value,
          );
    if (Number.isFinite(mins) && mins >= 0) {
      next.maxMinutesAfterSunset = mins;
      if (next.enabled === undefined) next.enabled = true;
      changed = true;
    }
    if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).scopeBinding) {
      next.scopeBinding = (raw as Record<string, unknown>).scopeBinding;
      changed = true;
    }
  }

  if (!changed) return false;
  constraints.noNightDrive = next;
  return true;
}

export interface NoNightDrivePolicy {
  maxMinutesAfterSunset: number;
}

/** 不夜驾硬约束 — 与 BFF `no_night_drive` 模板同源 */
export function resolveNoNightDrivePolicy(
  metadata: unknown,
  pacingConfig: unknown,
): NoNightDrivePolicy | undefined {
  if (!isSelfDriveTrip(pacingConfig)) return undefined;
  const constraints =
    metadata && typeof metadata === 'object'
      ? ((metadata as Record<string, unknown>).constraints as Record<string, unknown> | undefined)
      : undefined;
  const raw = constraints?.noNightDrive;
  const cfg =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (cfg.enabled === false) return undefined;
  return {
    maxMinutesAfterSunset: Number(cfg.maxMinutesAfterSunset ?? 30),
  };
}
