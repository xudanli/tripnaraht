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
  return (
    readPositiveNumber(constraints.maxDailyDrivingHours) ??
    readPositiveNumber(constraints.maxDailyDriveHours)
  );
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
  const parsed =
    typeof value === 'number'
      ? readPositiveNumber(value)
      : value && typeof value === 'object'
        ? readPositiveNumber(
            (value as Record<string, unknown>).maxDailyDrivingHours ??
              (value as Record<string, unknown>).maxDailyDriveHours ??
              (value as Record<string, unknown>).value,
          )
        : undefined;
  if (parsed == null) return false;
  constraints.maxDailyDrivingHours = parsed;
  delete constraints.maxDailyDriveHours;
  return true;
}
