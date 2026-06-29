/**
 * 单段行驶距离阈值 — 用户硬约束 / 国家默认 / 全局 fallback
 */

import { getCountryPack } from '../../readiness/config/country-pack.config';

export interface SegmentDistanceThresholds {
  maxSegmentDistanceKm: number;
  warnSegmentDistanceKm: number;
  winterWarnSegmentDistanceKm: number;
}

export type SegmentDistanceThresholdSource = 'user' | 'country_default' | 'global_default';

export interface ResolvedSegmentDistanceThresholds extends SegmentDistanceThresholds {
  source: SegmentDistanceThresholdSource;
}

export const GLOBAL_SEGMENT_DISTANCE_THRESHOLDS: SegmentDistanceThresholds = {
  maxSegmentDistanceKm: 300,
  warnSegmentDistanceKm: 200,
  winterWarnSegmentDistanceKm: 150,
};

/** 国家默认（冰岛：路况与日照，单段宜更短） */
export const ICELAND_SEGMENT_DISTANCE_THRESHOLDS: SegmentDistanceThresholds = {
  maxSegmentDistanceKm: 250,
  warnSegmentDistanceKm: 150,
  winterWarnSegmentDistanceKm: 120,
};

function normalizeDestinationCode(destination?: string | null): string {
  const code = (destination ?? '').trim().toUpperCase();
  if (!code) return 'GLOBAL';
  if (code === 'ICELAND') return 'IS';
  return code;
}

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

export function readUserMaxSegmentDistanceKm(metadata: unknown): number | undefined {
  return readPositiveNumber(readConstraints(metadata).maxSegmentDistanceKm);
}

export function readUserWarnSegmentDistanceKm(metadata: unknown): number | undefined {
  return readPositiveNumber(readConstraints(metadata).warnSegmentDistanceKm);
}

export function countrySegmentDistanceThresholds(
  destination?: string | null,
): SegmentDistanceThresholds | undefined {
  const code = normalizeDestinationCode(destination);
  const fromPack = getCountryPack(code).drivingSegmentThresholds;
  if (!fromPack) return undefined;
  return {
    maxSegmentDistanceKm: fromPack.maxSegmentDistanceKm,
    warnSegmentDistanceKm: fromPack.warnSegmentDistanceKm,
    winterWarnSegmentDistanceKm:
      fromPack.winterWarnSegmentDistanceKm ?? GLOBAL_SEGMENT_DISTANCE_THRESHOLDS.winterWarnSegmentDistanceKm,
  };
}

export function resolveSegmentDistanceThresholds(input: {
  destination?: string | null;
  metadata?: unknown;
}): ResolvedSegmentDistanceThresholds {
  const userMax = readUserMaxSegmentDistanceKm(input.metadata);
  const userWarn = readUserWarnSegmentDistanceKm(input.metadata);
  const country = countrySegmentDistanceThresholds(input.destination);
  const globalDefaults = { ...GLOBAL_SEGMENT_DISTANCE_THRESHOLDS };

  const maxSegmentDistanceKm =
    userMax ?? country?.maxSegmentDistanceKm ?? globalDefaults.maxSegmentDistanceKm;
  const warnSegmentDistanceKm = Math.min(
    userWarn ?? country?.warnSegmentDistanceKm ?? globalDefaults.warnSegmentDistanceKm,
    maxSegmentDistanceKm,
  );
  const winterWarnSegmentDistanceKm = Math.min(
    country?.winterWarnSegmentDistanceKm ?? globalDefaults.winterWarnSegmentDistanceKm,
    warnSegmentDistanceKm,
  );

  const source: SegmentDistanceThresholdSource = userMax != null
    ? 'user'
    : country != null
      ? 'country_default'
      : 'global_default';

  return {
    maxSegmentDistanceKm,
    warnSegmentDistanceKm,
    winterWarnSegmentDistanceKm,
    source,
  };
}

export function longDistanceHighMessage(maxKm: number): string {
  return `超长距离行驶(>${maxKm}km)，强烈建议分段或中途住宿`;
}

export function longDistanceWarnMessage(warnKm: number): string {
  return `长距离行驶(>${warnKm}km)，建议中途休息`;
}

/** 按国家默认 max/warn 比例推导 warn（用户只改 max 时同步 warn） */
export function deriveWarnSegmentDistanceKm(
  maxKm: number,
  destination?: string | null,
): number {
  const country = countrySegmentDistanceThresholds(destination);
  const baseMax =
    country?.maxSegmentDistanceKm ?? GLOBAL_SEGMENT_DISTANCE_THRESHOLDS.maxSegmentDistanceKm;
  const baseWarn =
    country?.warnSegmentDistanceKm ?? GLOBAL_SEGMENT_DISTANCE_THRESHOLDS.warnSegmentDistanceKm;
  const ratio = baseWarn / baseMax;
  return Math.min(maxKm, Math.max(1, Math.round(maxKm * ratio)));
}

export function parseMaxSegmentDistancePatchValue(
  value: unknown,
): { maxKm?: number; warnKm?: number } | undefined {
  if (typeof value === 'number') {
    return readPositiveNumber(value) != null ? { maxKm: value } : undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const maxKm = readPositiveNumber(
    record.maxSegmentDistanceKm ?? record.maxKm ?? record.value,
  );
  const warnKm = readPositiveNumber(record.warnSegmentDistanceKm ?? record.warnKm);
  if (maxKm == null && warnKm == null) return undefined;
  return { maxKm, warnKm };
}

/**
 * PATCH c_max_segment_distance：写 max，并按国家比例补 warn（除非 tolerance / value 内显式提供 warn）
 */
export function applyMaxSegmentDistanceConstraintPatch(
  constraints: Record<string, unknown>,
  input: {
    value?: unknown;
    tolerance?: unknown;
    destination?: string | null;
  },
): boolean {
  const parsed = parseMaxSegmentDistancePatchValue(input.value);
  const toleranceWarn = readPositiveNumber(input.tolerance);
  if (!parsed?.maxKm && parsed?.warnKm == null && toleranceWarn == null) {
    return false;
  }

  if (parsed?.maxKm != null) {
    constraints.maxSegmentDistanceKm = parsed.maxKm;
    const explicitWarn = parsed.warnKm ?? toleranceWarn;
    constraints.warnSegmentDistanceKm =
      explicitWarn ?? deriveWarnSegmentDistanceKm(parsed.maxKm, input.destination);
  } else if (parsed?.warnKm != null || toleranceWarn != null) {
    constraints.warnSegmentDistanceKm = parsed.warnKm ?? toleranceWarn!;
  }

  return true;
}

/** 新建冰岛行程时写入 metadata.constraints 的默认值（用户未显式设置时） */
export function seedDefaultTripConstraintsMetadata(
  destination: string,
  existingConstraints?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const code = normalizeDestinationCode(destination);
  if (code !== 'IS') return undefined;
  if (readPositiveNumber(existingConstraints?.maxSegmentDistanceKm) != null) return undefined;

  return {
    maxSegmentDistanceKm: ICELAND_SEGMENT_DISTANCE_THRESHOLDS.maxSegmentDistanceKm,
    warnSegmentDistanceKm: ICELAND_SEGMENT_DISTANCE_THRESHOLDS.warnSegmentDistanceKm,
  };
}

export function mergeSeededTripConstraints(
  destination: string,
  metadata: Record<string, unknown>,
): void {
  const existing = (metadata.constraints as Record<string, unknown> | undefined) ?? {};
  const seed = seedDefaultTripConstraintsMetadata(destination, existing);
  if (!seed) return;
  metadata.constraints = { ...seed, ...existing };
}

/** 补全 seed + 仅有 max 无 warn 的旧数据；返回是否有变更 */
export function ensureSegmentDistanceConstraints(
  destination: string,
  metadata: Record<string, unknown>,
): boolean {
  const before = JSON.stringify(readConstraints(metadata));
  mergeSeededTripConstraints(destination, metadata);
  const constraints = readConstraints(metadata);
  const maxKm = readPositiveNumber(constraints.maxSegmentDistanceKm);
  if (maxKm != null && readPositiveNumber(constraints.warnSegmentDistanceKm) == null) {
    metadata.constraints = {
      ...(metadata.constraints as Record<string, unknown> | undefined),
      ...constraints,
      warnSegmentDistanceKm: deriveWarnSegmentDistanceKm(maxKm, destination),
    };
  }
  return JSON.stringify(readConstraints(metadata)) !== before;
}
