/**
 * Lazy-hydrate icelandSelfDrive metadata for trips created via Initial Plan shell
 * that only set productLine without the full ISD blob.
 */

import type { IcelandSelfDriveTripMetadata } from '../types/iceland-self-drive.types';
import { buildInitialDrivingSettings } from './iceland-self-drive-completion.util';
import { readIcelandSelfDriveMetadata } from './iceland-self-drive-response.util';

/**
 * True when the trip should use iceland-self-drive BFF (driving-settings / bootstrap).
 * Accepts explicit productLine, legacy readiness stamps, and Iceland destination
 * (aligned with DecisionCaseService.isIcelandSelfDrive — IS ⇒ self-drive BFF).
 */
export function isIcelandSelfDriveProductTrip(
  rawMeta: unknown,
  destination?: string | null,
  pacingConfig?: unknown,
): boolean {
  const dest = (destination ?? '').trim().toUpperCase();
  const destLabel = typeof destination === 'string' ? destination : '';
  const isIceland =
    dest === 'IS' || dest === 'ICELAND' || /冰岛/i.test(destLabel);
  if (isIceland) return true;

  if (!rawMeta || typeof rawMeta !== 'object') {
    return isSelfDrivePacing(pacingConfig);
  }
  const meta = rawMeta as Record<string, unknown>;
  if (meta.productLine === 'iceland_self_drive') return true;
  const isd = meta.icelandSelfDrive;
  if (isd && typeof isd === 'object' && !Array.isArray(isd)) {
    const blob = isd as Record<string, unknown>;
    if (blob.productLine === 'iceland_self_drive') return true;
    if (blob.drivingSettings && typeof blob.drivingSettings === 'object') return true;
  }
  // Legacy: readiness / confirm stamps without productLine
  if (meta.selfDriveReadiness && typeof meta.selfDriveReadiness === 'object') {
    return true;
  }
  if (meta.vehicleConfirmedAt || meta.insuranceConfirmedAt) return true;

  if (isSelfDrivePacing(pacingConfig) || isSelfDrivePacing(meta)) return true;

  // Non-Iceland: vehicle constraint alone is not enough for this BFF
  return false;
}

function isSelfDrivePacing(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  const mode = String(o.travelMode ?? o.mobilityMode ?? '').toLowerCase();
  if (mode === 'self_drive' || mode === 'self-drive') return true;
  const transport = String(o.transport ?? '').toLowerCase();
  return transport === 'car' || transport === 'self_drive';
}

function toYmd(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return null;
}

export function bootstrapIcelandSelfDriveMetadata(input: {
  tripId: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  destination?: string | null;
  existingMeta?: unknown;
}): IcelandSelfDriveTripMetadata {
  const existing = readIcelandSelfDriveMetadata(input.existingMeta);
  if (existing?.wizard?.vehicleAcquisition) {
    // Complete enough for driving-settings BFF
    if (existing.drivingSettings) return existing;
  }

  const start =
    toYmd(input.startDate) ??
    new Date().toISOString().slice(0, 10);
  const end = toYmd(input.endDate) ?? start;
  const now = new Date().toISOString();

  const defaults: IcelandSelfDriveTripMetadata = {
    productLine: 'iceland_self_drive',
    idempotencyKey: `hydrate_${input.tripId}`,
    contextVersion: `cv_hydrate_${Date.now()}`,
    wizard: {
      destinationCode: 'IS',
      productLine: 'iceland_self_drive',
      dateRange: { startDate: start, endDate: end },
      arrivalAt: null,
      departureAt: null,
      travelerCount: 2,
      startLocationCode: 'keflavik',
      endLocationCode: 'keflavik',
      endSameAsStart: true,
      vehicleAcquisition: 'rent',
      regionIds: ['south_coast'],
      bookings: [],
      skipBookings: true,
      fillBookingsLater: false,
    },
    drivingSettings: buildInitialDrivingSettings('rent'),
    routeSkeleton: {
      strategyId: 'hydrated-from-product-line',
      regionSummary: input.destination === 'IS' ? '冰岛' : '冰岛自驾',
      days: [],
    },
    hardAnchors: [],
    warnings: [
      {
        code: 'ISD_METADATA_HYDRATED',
        message: '已从 productLine 补齐自驾设置元数据（Initial Plan 行程）',
      },
    ],
    createdAt: now,
    generationStatus: 'READY',
    lastEvents: [
      {
        type: 'trip_context_changed',
        at: now,
        message: 'hydrate_iceland_self_drive_metadata',
      },
    ],
  };

  if (!existing) return defaults;

  // Partial blob（如 decision 只写了 drivingSettings.vehicle）→ 补 wizard / 缺省块，保留已有字段
  const acquisition =
    existing.wizard?.vehicleAcquisition ??
    defaults.wizard.vehicleAcquisition;
  return {
    ...defaults,
    ...existing,
    productLine: existing.productLine ?? defaults.productLine,
    idempotencyKey: existing.idempotencyKey ?? defaults.idempotencyKey,
    contextVersion: existing.contextVersion ?? defaults.contextVersion,
    wizard: existing.wizard?.vehicleAcquisition
      ? existing.wizard
      : { ...defaults.wizard, ...(existing.wizard ?? {}) },
    drivingSettings:
      existing.drivingSettings ??
      buildInitialDrivingSettings(acquisition === 'owned' ? 'owned' : 'rent'),
    routeSkeleton: existing.routeSkeleton ?? defaults.routeSkeleton,
    hardAnchors: existing.hardAnchors ?? defaults.hardAnchors,
    warnings: [
      ...(existing.warnings ?? []),
      {
        code: 'ISD_METADATA_REPAIRED',
        message: '已补齐残缺 icelandSelfDrive（缺 wizard 等）',
      },
    ],
    createdAt: existing.createdAt ?? defaults.createdAt,
    generationStatus: existing.generationStatus ?? defaults.generationStatus,
    lastEvents: [
      ...(existing.lastEvents ?? []),
      {
        type: 'trip_context_changed',
        at: now,
        message: 'repair_iceland_self_drive_metadata',
      },
    ],
  };
}

/** True when ISD blob can serve driving-settings without crashing on wizard. */
export function isCompleteIcelandSelfDriveMetadata(
  isd: IcelandSelfDriveTripMetadata | null | undefined,
): boolean {
  return Boolean(isd?.wizard?.vehicleAcquisition && isd.drivingSettings);
}
